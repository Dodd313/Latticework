// 지도 카메라와 화면 자리 계산. 화면 없이 계산만 한다.
// 카메라 cam = { x, y, k }: 화면 가운데에 오는 세계 자리와 배율. 시안 graph-a.html 의 View 에서 옮겼다.
import { GBox, GNode, GR, GraphModel, LV, baseR, subtree } from './layout';

export type Cam = { x: number; y: number; k: number };

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 상자 b 가 화면(W×H)에 들어오는 카메라. pad 는 좌우, 위아래 여백의 합 */
export function fitBox(b: GBox, W: number, H: number, pad: { x?: number; y?: number; dy?: number } = {}): Cam {
  const px = pad.x ?? 44;
  const py = pad.y ?? 84;
  const k = Math.min(2.2, (W - px) / Math.max(40, b.x1 - b.x0), (H - py) / Math.max(40, b.y1 - b.y0));
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 + (pad.dy || 0) / k, k };
}

/** 지도 전체가 들어오는 카메라 */
export function rootFit(M: GraphModel, W: number, H: number): Cam {
  return fitBox(M.box, W, H);
}

/** 기준 배율(지도 전체가 들어오는 배율). 이름이 보이는 배율은 이것에 대해 정한다 */
export function baseK(M: GraphModel, W: number, H: number): number {
  return rootFit(M, W, H).k;
}

export function kLim(M: GraphModel, K0: number): [number, number] {
  return [K0 * 0.5, (K0 * 7) / M.minSc];
}

/** 배율과 자리를 지도 둘레 안으로 */
export function bound(c: Cam, M: GraphModel, W: number, H: number, K0: number): Cam {
  const [k0, k1] = kLim(M, K0);
  const k = clamp(c.k, k0, k1);
  const b = M.box;
  const mx = (W / 2 / k) * 0.7;
  const my = (H / 2 / k) * 0.7;
  return { x: clamp(c.x, b.x0 - mx, b.x1 + mx), y: clamp(c.y, b.y0 - my, b.y1 + my), k };
}

export function toWorld(c: Cam, px: number, py: number, W: number, H: number): { x: number; y: number } {
  return { x: c.x + (px - W / 2) / c.k, y: c.y + (py - H / 2) / c.k };
}

/** 화면 (px, py) 를 그대로 둔 채 f 배 */
export function zoomAt(c: Cam, px: number, py: number, f: number, M: GraphModel, W: number, H: number, K0: number): Cam {
  const w = toWorld(c, px, py, W, H);
  const [k0, k1] = kLim(M, K0);
  const k = clamp(c.k * f, k0, k1);
  return bound({ x: w.x - (px - W / 2) / k, y: w.y - (py - H / 2) / k, k }, M, W, H, K0);
}

/** 소우주가 열린 정도(0 닫힘 ~ 1 열림). 접히지 않은 마디는 1 */
export function openOf(C: GNode, k: number): number {
  return C.collapsed ? smooth(30, 72, GR * k * C.sc) : 1;
}

/** 그 마디로 다가가는 카메라. 소우주면 고리가 화면을 채우게, 아니면 그 무리가 들어오게 */
export function nodeFit(n: GNode, W: number, H0: number, K0: number, o: { bottom?: number } = {}): Cam {
  const bottom = o.bottom || 0;
  const H = H0 - bottom;
  if (n.collapsed) {
    const Rt = Math.min(W / 2 - 26, H / 2 - 66) / 0.8;
    const k = Rt / (GR * n.sc);
    return { x: n.wx, y: n.wy + bottom / 2 / k + 6 / k, k };
  }
  const ids = subtree(n).filter((x) => x.scope === n.scope || x === n);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  ids.forEach((x) => {
    const r = (x.collapsed ? GR : 5) * x.sc;
    x0 = Math.min(x0, x.wx - r);
    x1 = Math.max(x1, x.wx + r);
    y0 = Math.min(y0, x.wy - r);
    y1 = Math.max(y1, x.wy + r);
  });
  let k = Math.min((W - 80) / Math.max(1, x1 - x0), (H - 120) / Math.max(1, y1 - y0));
  // 작은 노드로 날아갈 때 점이 지나치게 커지지 않게: 개념 이름이 보이는 배율에서 멈춘다.
  k = Math.min(k, (3.1 * K0) / n.sc);
  // 안에 든 소우주는 닫힌 채로 둔다
  ids.filter((x) => x.collapsed && x !== n).forEach((C) => (k = Math.min(k, 26 / (GR * C.sc))));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + bottom / 2 / k, k: Math.max(k, K0 * 0.9) };
}

/** 소우주 밖으로: 부모 무리가 보이고 이 고리가 다시 닫히는 배율로 */
export function outOf(C: GNode, M: GraphModel, W: number, H: number, K0: number): Cam {
  if (!C.parent) return rootFit(M, W, H);
  const f = nodeFit(C.parent, W, H, K0);
  f.k = Math.min(f.k, 24 / (GR * C.sc));
  return f;
}

/** 마디와 그 아래(그리고 윗마디)가 들어오는 카메라. 해금 뒤 "보러 가기"에 쓴다 */
export function subtreeFit(n: GNode, M: GraphModel, W: number, H: number, K0: number): Cam {
  const pts = subtree(n).concat(n.parent ? [n.parent] : []);
  const bx = { x0: Math.min(...pts.map((p) => p.wx)) - 20, x1: Math.max(...pts.map((p) => p.wx)) + 20, y0: Math.min(...pts.map((p) => p.wy)) - 20, y1: Math.max(...pts.map((p) => p.wy)) + 20 };
  const f = fitBox(bx, W, H, { x: 120, y: 200 });
  f.k = clamp(Math.min(f.k, 2.3 * K0), K0, kLim(M, K0)[1]);
  return f;
}

/** 카메라가 지도 전체 구도에서 벗어났는지(전체 보기 단추를 보일지) */
export function awayFromRoot(c: Cam, M: GraphModel, W: number, H: number): boolean {
  const fit = rootFit(M, W, H);
  return Math.abs(Math.log(c.k / fit.k)) > 0.12 || Math.hypot(c.x - fit.x, c.y - fit.y) * c.k > 30;
}

/** van Wijk & Nuij 부드러운 확대 경로(d3-interpolate 의 interpolateZoom 과 같은 식). p = [x, y, 화면 폭에 든 세계 폭] */
export function zoomPath(p0: [number, number, number], p1: [number, number, number]): ((t: number) => [number, number, number]) & { ms: number } {
  const rho = Math.SQRT2;
  const rho2 = 2;
  const rho4 = 4;
  const [ux0, uy0, w0] = p0;
  const [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;
  let i: (t: number) => [number, number, number];
  let S: number;
  if (d2 < 1e-12) {
    S = Math.log(w1 / w0) / rho;
    i = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / rho;
    i = (t) => {
      const s = t * S;
      const c0 = Math.cosh(r0);
      const u = (w0 / (rho2 * d1)) * (c0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, (w0 * c0) / Math.cosh(rho * s + r0)];
    };
  }
  const f = i as typeof i & { ms: number };
  f.ms = Math.abs(S) * 1000;
  return f;
}

/** 한 비행: 0~1 에서의 카메라와 걸리는 시간(ms). lin 이면 곧게(해금 화면처럼 살짝 다가갈 때) */
export function flightOf(a: Cam, b: Cam, W: number, H: number, o: { ms?: number; min?: number; lin?: boolean } = {}): { at: (t: number) => Cam; ms: number } {
  const VM = Math.min(W, H);
  const p = zoomPath([a.x, a.y, VM / a.k], [b.x, b.y, VM / b.k]);
  const ms = o.ms || clamp(p.ms * 0.62, o.min || 460, 1100);
  if (o.lin) {
    return {
      ms,
      at: (t) => {
        const e = easeIO(t);
        return { x: lerpN(a.x, b.x, e), y: lerpN(a.y, b.y, e), k: a.k * Math.pow(b.k / a.k, e) };
      },
    };
  }
  return {
    ms,
    at: (t) => {
      if (t >= 1) return { ...b };
      const [x, y, w] = p(easeIO(t));
      return { x, y, k: VM / w };
    },
  };
}

/**
 * 그려 둔 장면(카메라 from)을 다른 카메라(to)로 보이게 하는 화면 변환(왼쪽 위 기준).
 * 장면을 다시 그리지 않고 상자만 옮기고 늘린다: 화면 자리 p 가 p*s + (tx, ty) 로 간다.
 */
export function camTransform(from: Cam, to: Cam, W: number, H: number): { s: number; tx: number; ty: number } {
  const s = to.k / from.k;
  return { s, tx: (W / 2) * (1 - s) + (from.x - to.x) * to.k, ty: (H / 2) * (1 - s) + (from.y - to.y) * to.k };
}

// ─────────────────────────────────────────────────────────────
// 화면 자리
// ─────────────────────────────────────────────────────────────

/** 점 하나의 화면 상태. v 보이는 정도(소우주 안이면 열린 만큼), open 소우주가 열린 정도, z 기준 배율에 대한 배율, r 반지름(px) */
export type PNode = { n: GNode; x: number; y: number; r: number; v: number; open: number; z: number; ks: number };

/** 개념 점의 기억(진하기와 오늘 복습). amount 는 푼 양(점 크기) */
export type Mem = { studied: boolean; strength: number; due: boolean; amount?: number };

/** 모든 점의 화면 자리(카메라 c, 화면 W×H). 바깥 범위부터 계산하므로 소우주가 먼저 온다. */
export function project(M: GraphModel, c: Cam, W: number, H: number, K0: number, dotScale = 1, mem?: (id: string) => Mem | undefined): Map<string, PNode> {
  const out = new Map<string, PNode>();
  for (const n of M.list) {
    const S = n.scope ? out.get(n.scope.id) : undefined;
    const open = openOf(n, c.k);
    const v = S ? S.v * S.open : 1;
    const x = (n.wx - c.x) * c.k + W / 2;
    const y = (n.wy - c.y) * c.k + H / 2;
    const z = (c.k * n.sc) / K0;
    const rb = n.kind === 'concept' ? baseR('concept', 1, mem?.(n.id)?.amount ?? 0) : n.rb;
    const r = rb * Math.min(n.kind === 'concept' ? 1.55 : 1.3, Math.pow(clamp(z, 0.45, 3), 0.4)) * dotScale;
    out.set(n.id, { n, x, y, r, v, open, z, ks: c.k * n.sc });
  }
  return out;
}

/** 누를 수 있는 점과 소우주 고리 */
export type HitDot = { n: GNode; x: number; y: number; r: number; glyph: boolean };

/** 화면 자리에서 누를 수 있는 것들. 소우주 고리(glyph)는 닫혀 있을 때만 */
export function hitDots(P: Map<string, PNode>, M: GraphModel): HitDot[] {
  const out: HitDot[] = [];
  for (const C of M.cols) {
    const p = P.get(C.id)!;
    const g = p.v * (1 - p.open);
    if (g < 0.4) continue;
    out.push({ n: C, x: p.x, y: p.y, r: ringR(p), glyph: true });
  }
  for (const n of M.list) {
    const p = P.get(n.id)!;
    if (p.v < 0.4) continue;
    out.push({ n, x: p.x, y: p.y, r: p.r, glyph: false });
  }
  return out;
}

/** 닫힌 소우주 고리의 화면 반지름 */
export function ringR(p: PNode): number {
  return Math.max(10, GR * p.ks, p.r + 8);
}

/** 시안의 hit(): 가장 가까운 점(누르는 범위는 최소 14~18px) */
export function hit(dots: HitDot[], px: number, py: number): HitDot | null {
  let best: HitDot | null = null;
  let bs = Infinity;
  for (const d of dots) {
    const dd = Math.hypot(d.x - px, d.y - py);
    const lim = d.glyph ? Math.max(d.r + 6, 18) : Math.max(d.r + 7, d.n.kind === 'concept' ? 14 : 16);
    if (dd < lim) {
      const s = dd / lim + (d.glyph ? 0.25 : 0);
      if (s < bs) {
        bs = s;
        best = d;
      }
    }
  }
  return best;
}

/** 화면 가운데를 품은, 열린 소우주 가운데 가장 깊은 것(위치 표시용) */
export function focusScope(P: Map<string, PNode>, M: GraphModel, c: Cam, W: number, H: number): GNode | null {
  let best: GNode | null = null;
  for (const C of M.cols) {
    const p = P.get(C.id)!;
    if (p.v * p.open < 0.6) continue;
    const R = GR * c.k * C.sc;
    if (Math.hypot(p.x - W / 2, p.y - H / 2) < R * 1.1 + 24 && (!best || C.nest > best.nest)) best = C;
  }
  return best;
}

export { LV };
