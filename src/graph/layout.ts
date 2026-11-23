// 지식 지도(Latticework)의 배치. 화면 없이 계산만 한다(React, react-native 를 쓰지 않는다).
//
// 시안 motion-lab/v9/graph-a.html 의 build/layoutScope/simulate 를 옮겼다(옵시디언 점, 학문마다 한 무리).
// 화면에서 시뮬레이션을 돌리지 않는다. 같은 나무(LearnedTree.key)면 한 번만 계산하고, 늘 같은 자리가 나온다
// (Math.random 을 쓰지 않고 id 씨앗만 쓴다). 개념끼리 잇는 선은 없다. 선은 부모와 자식 사이뿐이다.
import { LearnedTree, LNode } from '../knowledge';

export type GKind = 'disc' | 'branch' | 'topic' | 'concept';

/** 지도 위 점 하나. lx, ly 는 제 범위(맨 위 또는 소우주) 안 자리, wx, wy 는 세계 자리, sc 는 소우주 안에서 줄어든 비율. */
export type GNode = {
  id: string;
  kind: GKind;
  ko: string;
  short: string;
  en?: string;
  at: string;
  parent: GNode | null;
  kids: GNode[];
  disc: GNode;
  color: string;
  domain?: string;
  depth: number;
  /** 보이는 자식이 7개를 넘어 고리(소우주)로 접힌 마디 */
  collapsed: boolean;
  /** 가장 가까운 접힌 조상. 없으면 맨 위 */
  scope: GNode | null;
  /** 접힌 조상의 수 */
  nest: number;
  /** 아래 배운 개념 수(개념은 1) */
  count: number;
  /** 기본 배율의 점 반지름(px). 개념은 푼 양에 따라 화면에서 다시 정한다 */
  rb: number;
  lx: number;
  ly: number;
  wx: number;
  wy: number;
  sc: number;
  /** 소우주: 안에 든 점들, 안쪽 배치의 반지름, 고리 안으로 줄이는 비율 */
  members?: GNode[];
  subR?: number;
  inS?: number;
};

export type GBox = { x0: number; x1: number; y0: number; y1: number };

export type GraphModel = {
  N: Map<string, GNode>;
  /** 그리는 순서(바깥 범위부터, 얕은 계급부터) */
  list: GNode[];
  /** 접힌 소우주(바깥부터) */
  cols: GNode[];
  discs: GNode[];
  box: GBox;
  minSc: number;
  key: string;
};

export const LV: Record<GKind, number> = { disc: 0, branch: 1, topic: 2, concept: 3 };
/** 소우주 고리의 세계 반지름 */
export const GR = 12;
/** 보이는 자식이 이 수를 넘으면 소우주로 접는다 */
export const COLLAPSE_OVER = 7;

const RANK: Record<LNode['rank'], GKind> = { discipline: 'disc', branch: 'branch', topic: 'topic', concept: 'concept' };

/** FNV 해시를 0~1 로. 시안과 같은 식이다. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// 숨은 참조: 학문이 처음 놓이는 방위(도). 화면에는 그리지 않는다.
const REF: Record<string, { ang: number; list: string[] }> = {
  formal: { ang: 0, list: ['stat', 'math', 'logic', 'cs'] },
  social: { ang: 90, list: ['fin', 'econ', 'acct', 'mgmt', 'psy'] },
  natural: { ang: 180, list: ['phys', 'chem', 'bio', 'earth'] },
  humanities: { ang: 225, list: ['phil'] },
};

function bearing(n: GNode): number {
  const d = REF[n.disc.domain ?? ''] ?? REF.formal;
  let i = d.list.indexOf(n.disc.id.slice(2));
  const m = Math.max(d.list.length, 1);
  if (i < 0) i = (m - 1) / 2;
  const off = m > 1 ? (i - (m - 1) / 2) * (64 / (m - 1)) : 0;
  return ((d.ang + off) * Math.PI) / 180;
}

/** 기본 배율의 점 반지름. 배운 양의 제곱근으로 조금만 커진다. amount 는 개념의 푼 양 */
export function baseR(kind: GKind, count: number, amount = 0): number {
  switch (kind) {
    case 'disc':
      return Math.min(9, 6 + 0.45 * Math.sqrt(count));
    case 'branch':
      return Math.min(6, 4 + 0.3 * Math.sqrt(count));
    case 'topic':
      return Math.min(5, 3.5 + 0.22 * Math.sqrt(count));
    default:
      return Math.min(4, 2.5 + 0.22 * Math.sqrt(amount));
  }
}

const CHARGE: Record<GKind, number> = { disc: 3, branch: 2, topic: 1.5, concept: 1 };
export const COLL: Record<GKind, number> = { disc: 11, branch: 8, topic: 7, concept: 5 };
function restLen(p: GNode, c: GNode): number {
  if (c.kind === 'concept') return p.kind === 'topic' ? 19 : p.kind === 'branch' ? 24 : 30;
  if (c.kind === 'topic') return 36;
  if (c.kind === 'branch') return p.kind === 'disc' ? 52 : 40;
  return 40;
}

/** 시뮬레이션의 점 하나 */
export type SimP = { x: number; y: number; vx: number; vy: number; q: number; cr: number; fix: boolean; g: number; ax: number; ay: number; ak: number };
export type SimE = { a: number; b: number; L: number; s: number; bias: number };
type SimO = { str: number; gx: number; gy: number; it: number; dmax: number; alpha?: number; groups?: number; sepMul?: number; sepD?: number; gap?: number; coh?: number };

/**
 * 힘 배치를 정해진 횟수만큼 한 번에 계산한다(d3-force 와 같은 식).
 * groups 가 있으면 학문마다 한 무리로 모은다: 다른 학문끼리는 더 멀리서 더 세게 밀고 사이에 틈을 두며,
 * 같은 학문은 제 무게중심과 느슨한 닻 쪽으로 당긴다.
 */
function simulate(P: SimP[], Ed: SimE[], o: SimO) {
  const n = P.length;
  const IT = o.it || 300;
  let alpha = o.alpha || 1;
  const decay = 1 - Math.pow(0.001 / alpha, 1 / IT);
  const NG = o.groups || 0;
  const gx = new Float64Array(NG);
  const gy = new Float64Array(NG);
  const gn = new Float64Array(NG);
  for (let it = 0; it < IT; it++) {
    for (const e of Ed) {
      const a = P[e.a];
      const b = P[e.b];
      let dx = b.x + b.vx - a.x - a.vx;
      let dy = b.y + b.vy - a.y - a.vy;
      const l = Math.hypot(dx, dy) || 1e-3;
      const k = ((l - e.L) / l) * alpha * e.s;
      dx *= k;
      dy *= k;
      b.vx -= dx * e.bias;
      b.vy -= dy * e.bias;
      a.vx += dx * (1 - e.bias);
      a.vy += dy * (1 - e.bias);
    }
    for (let i = 0; i < n; i++) {
      const a = P[i];
      for (let j = i + 1; j < n; j++) {
        const b = P[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-4) {
          dx = 0.01 * (i - j);
          dy = 0.013;
          d2 = dx * dx + dy * dy;
        }
        const other = NG > 0 && a.g !== b.g;
        const dm = other ? o.sepD! : o.dmax;
        if (d2 < dm * dm) {
          const f = (o.str * (other ? o.sepMul! : 1) * alpha) / d2;
          a.vx -= dx * f * b.q;
          a.vy -= dy * f * b.q;
          b.vx += dx * f * a.q;
          b.vy += dy * f * a.q;
        }
        const rr = a.cr + b.cr + (other ? o.gap! : 0);
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const m = ((rr - d) / d) * 0.35;
          a.vx -= dx * m;
          a.vy -= dy * m;
          b.vx += dx * m;
          b.vy += dy * m;
        }
      }
    }
    if (NG) {
      gx.fill(0);
      gy.fill(0);
      gn.fill(0);
      for (const a of P) {
        gx[a.g] += a.x;
        gy[a.g] += a.y;
        gn[a.g]++;
      }
      for (const a of P) {
        const mx = gx[a.g] / gn[a.g];
        const my = gy[a.g] / gn[a.g];
        a.vx += ((mx - a.x) * o.coh! + (a.ax - a.x) * a.ak) * alpha;
        a.vy += ((my - a.y) * o.coh! + (a.ay - a.y) * a.ak) * alpha;
      }
    }
    for (const a of P) {
      a.vx -= a.x * o.gx * alpha;
      a.vy -= a.y * o.gy * alpha;
    }
    for (const a of P) {
      if (a.fix) {
        a.vx = a.vy = 0;
        a.x = 0;
        a.y = 0;
        continue;
      }
      a.vx *= 0.6;
      a.vy *= 0.6;
      a.x += a.vx;
      a.y += a.vy;
    }
    alpha -= alpha * decay;
  }
}

/** 서로 다른 무리(g)의 선끼리 엇갈리는 횟수 */
export function crossings(P: { x: number; y: number; g: number }[], Ed: { a: number; b: number }[]): number {
  const o = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  let c = 0;
  for (let i = 0; i < Ed.length; i++) {
    const p = P[Ed[i].a];
    const q = P[Ed[i].b];
    for (let j = i + 1; j < Ed.length; j++) {
      const r = P[Ed[j].a];
      const s = P[Ed[j].b];
      if (q.g === s.g) continue;
      if (o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0) c++;
    }
  }
  return c;
}

const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/**
 * 학문마다 느슨한 닻. 숨은 방위 순서대로 가운데를 둘러앉고, 둘레는 배운 양만큼 나눠 가지며,
 * 큰 학문일수록 조금 안쪽에. 각도와 거리는 학문 id 씨앗으로 조금씩 흔든다(처음 놓는 경우만 옮겼다).
 */
function anchorsOf(members: GNode[]): { A: Map<GNode, { x: number; y: number }>; order: GNode[] } {
  const discs = [...new Set(members.map((n) => n.disc))];
  const w = new Map<GNode, number>(discs.map((d) => [d, 0]));
  members.forEach((n) => w.set(n.disc, w.get(n.disc)! + (n.collapsed ? 4 : 1)));
  const W = [...w.values()].reduce((s, v) => s + v, 0);
  const rho = (d: GNode) => 16 + 12 * Math.sqrt(w.get(d)!);
  const order = discs.slice().sort((a, b) => wrap(bearing(a)) - wrap(bearing(b)) || (a.id < b.id ? -1 : 1));
  const tot = order.reduce((s, d) => s + rho(d), 0);
  const R = order.length > 1 ? (0.8 * tot) / Math.PI : 0;
  const ang = new Map<GNode, number>();
  let acc = 0;
  order.forEach((d) => {
    const span = (rho(d) / tot) * Math.PI * 2;
    ang.set(d, acc + span / 2 + (hash(d.id + ':a') - 0.5) * span * 0.35);
    acc += span;
  });
  const A = new Map<GNode, { x: number; y: number }>();
  const rOf = (d: GNode) => R * (0.8 + 0.3 * hash(d.id + ':r')) * (1 - 0.45 * (w.get(d)! / W));
  // 전체를 돌려 숨은 방위에 가장 가깝게
  let ss = 0;
  let scs = 0;
  for (const d of order) {
    ss += rho(d) * Math.sin(bearing(d) - ang.get(d)!);
    scs += rho(d) * Math.cos(bearing(d) - ang.get(d)!);
  }
  const rot = Math.atan2(ss, scs);
  for (const d of order) {
    const a = ang.get(d)! + rot;
    const r = rOf(d);
    A.set(d, { x: Math.cos(a) * r * 0.92, y: Math.sin(a) * r * 1.12 });
  }
  return { A, order };
}

/** 한 범위(맨 위, 또는 소우주 하나)의 배치. center 가 있으면 그 노드를 (0,0)에 고정한다. 맨 위 범위의 엇갈림 수를 돌려준다. */
function layoutScope(members: GNode[], center: GNode | null): number {
  const all = center ? [center, ...members] : members.slice();
  const idx = new Map(all.map((n, i) => [n.id, i]));
  const deg = new Map<string, number>();
  const Ed: SimE[] = [];
  for (const n of members) {
    if (!n.parent || !idx.has(n.parent.id)) continue;
    Ed.push({ a: idx.get(n.parent.id)!, b: idx.get(n.id)!, L: restLen(n.parent, n), s: 1, bias: 0.5 });
    deg.set(n.id, (deg.get(n.id) || 0) + 1);
    deg.set(n.parent.id, (deg.get(n.parent.id) || 0) + 1);
  }
  Ed.forEach((e) => {
    const da = deg.get(all[e.a].id)!;
    const db = deg.get(all[e.b].id)!;
    e.s = 1 / Math.min(da, db);
    e.bias = da / (da + db);
  });
  const anc = center ? null : anchorsOf(members);
  // 처음 자리: 학문은 닻에, 나머지는 부모 바깥쪽 부채꼴에
  const pos = new Map<string, { x: number; y: number; dir: number }>();
  if (center) pos.set(center.id, { x: 0, y: 0, dir: 0 });
  const order = all.slice().sort((a, b) => a.depth - b.depth);
  for (const n of order) {
    if (pos.has(n.id)) continue;
    const p = n.parent && pos.get(n.parent.id);
    if (!p) {
      if (anc) {
        const a = anc.A.get(n.disc)!;
        pos.set(n.id, { x: a.x, y: a.y, dir: Math.atan2(a.y, a.x) });
        continue;
      }
      const b = bearing(n);
      pos.set(n.id, { x: Math.cos(b) * 70, y: Math.sin(b) * 70, dir: b });
      continue;
    }
    const par = n.parent!;
    const sib = par.kids.filter((k) => idx.has(k.id));
    const i = sib.indexOf(n);
    const m = sib.length;
    const ring = !!center && par === center;
    const spread = ring ? (Math.PI * 2) / m : Math.min(0.55, 2.6 / m);
    const base = ring ? -Math.PI / 2 : p.dir;
    const a = base + (i - (ring ? 0 : (m - 1) / 2)) * spread + (hash(n.id) - 0.5) * 0.25;
    const L = restLen(par, n);
    pos.set(n.id, { x: p.x + Math.cos(a) * L, y: p.y + Math.sin(a) * L, dir: a });
  }
  const gi = anc ? new Map(anc.order.map((d, i) => [d, i])) : null;
  const AK: Record<GKind, number> = { disc: 0.05, branch: 0.012, topic: 0.006, concept: 0.004 };
  const P: SimP[] = all.map((n) => {
    const p = pos.get(n.id)!;
    const q = CHARGE[n.kind] + (n.collapsed ? 1 : 0);
    const cr = n.collapsed && n !== center ? GR + 3 : COLL[n.kind];
    const a = anc ? anc.A.get(n.disc)! : { x: 0, y: 0 };
    return { x: p.x, y: p.y, vx: 0, vy: 0, q, cr, fix: n === center, g: gi ? gi.get(n.disc)! : 0, ax: a.x, ay: a.y, ak: anc ? AK[n.kind] : 0 };
  });
  let cross = 0;
  if (center) simulate(P, Ed, { str: 26, gx: 0.035, gy: 0.035, it: 260, dmax: 400 });
  else {
    const o: SimO = { str: 30, gx: 0.075, gy: 0.045, it: 300, dmax: 130, groups: anc!.order.length, sepMul: 1.3, sepD: 120, gap: 6, coh: 0.012 };
    simulate(P, Ed, o);
    // 다른 학문의 선이 엇갈리면 무리 사이를 조금 더 벌려 몇 번 다시 식힌다
    cross = crossings(P, Ed);
    for (let k = 0; k < 6 && cross > 0; k++) {
      o.sepMul = Math.max(o.sepMul! * 1.6, 1.5);
      o.gap! += 6;
      o.coh = Math.max(o.coh! * 1.5, 0.015);
      P.forEach((p) => (p.ak = Math.max(p.ak * 1.6, 0.01)));
      simulate(P, Ed, { ...o, alpha: 0.5, it: 160 });
      cross = crossings(P, Ed);
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    P.forEach((p) => {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    });
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    P.forEach((p) => {
      p.x -= cx;
      p.y -= cy;
    });
  }
  all.forEach((n, i) => {
    if (n !== center) {
      n.lx = P[i].x;
      n.ly = P[i].y;
    }
  });
  if (center) {
    let R = 1;
    members.forEach((n) => (R = Math.max(R, Math.hypot(n.lx, n.ly) + COLL[n.kind] * 0.6)));
    center.subR = R;
    center.inS = (0.8 * GR) / R;
  }
  return cross;
}

export function isUnder(n: GNode, a: GNode): boolean {
  for (let p = n.parent; p; p = p.parent) if (p === a) return true;
  return false;
}
export const subtree = (n: GNode): GNode[] => [n, ...n.kids.flatMap(subtree)];
/** 그 점부터 학문까지(위로) */
export const chainOf = (n: GNode): string[] => {
  const s: string[] = [];
  for (let p: GNode | null = n; p; p = p.parent) s.push(p.id);
  return s;
};

/**
 * 지도에는 약어의 풀네임을 적지 않는다(2026-11-23 소유자 결정). "CAPM (Capital Asset Pricing Model)" 은 "CAPM",
 * "CAPM(Capital Asset Pricing Model)의 확장" 은 "CAPM의 확장". 영어로 시작하는 괄호만 지우고 한국어 괄호(예: 건류(코킹))는 둔다.
 */
export const graphName = (s: string): string => s.replace(/\s*\((?=[A-Za-z])[^()]*\)/g, '').trim() || s;

/** 배운 나무로 지도 배치를 만든다. 같은 나무면 늘 같은 결과다. */
export function build(tree: LearnedTree): GraphModel & { crossings: number } {
  const N = new Map<string, GNode>();
  for (const x of tree.nodes.values()) {
    N.set(x.id, {
      id: x.id,
      kind: RANK[x.rank],
      ko: graphName(x.ko),
      short: graphName(x.short || x.ko),
      en: x.en,
      at: x.at,
      parent: null,
      kids: [],
      disc: null as unknown as GNode,
      color: x.color,
      domain: x.domain,
      depth: 0,
      collapsed: false,
      scope: null,
      nest: 0,
      count: x.count,
      rb: 0,
      lx: 0,
      ly: 0,
      wx: 0,
      wy: 0,
      sc: 1,
    });
  }
  const list = [...N.values()];
  for (const n of list) {
    const raw = tree.nodes.get(n.id)!;
    n.parent = raw.parent ? (N.get(raw.parent) ?? null) : null;
    if (n.parent) n.parent.kids.push(n);
  }
  const born = (a: GNode, b: GNode) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  list.forEach((n) => n.kids.sort(born));
  for (const n of list) {
    let d = n;
    let depth = 0;
    while (d.parent) {
      d = d.parent;
      depth++;
    }
    n.disc = d;
    n.depth = depth;
    n.color = d.color || n.color;
    n.domain = d.domain;
    n.collapsed = n.kind !== 'concept' && n.kids.length > COLLAPSE_OVER;
    n.rb = baseR(n.kind, n.count);
  }
  // 범위: 가장 가까운 접힌 조상. 없으면 맨 위.
  for (const n of list) {
    let s = n.parent;
    while (s && !s.collapsed) s = s.parent;
    n.scope = s || null;
  }
  for (const n of list) {
    let k = 0;
    for (let s = n.scope; s; s = s.scope) k++;
    n.nest = k;
  }
  const cols = list.filter((n) => n.collapsed).sort((a, b) => a.nest - b.nest || a.depth - b.depth || born(a, b));
  cols.forEach((C) => (C.members = list.filter((n) => n.scope === C)));
  const top = list.filter((n) => !n.scope).sort(born);
  const cross = top.length ? layoutScope(top, null) : 0;
  cols.forEach((C) => layoutScope(C.members!, C));
  // 세계 좌표: 맨 위는 그대로, 소우주 안은 고리 안쪽 0.8 에 들어가게 줄여서
  for (const n of top) {
    n.wx = n.lx;
    n.wy = n.ly;
    n.sc = 1;
  }
  for (const C of cols) {
    const s = C.sc * C.inS!;
    C.members!.forEach((m) => {
      m.wx = C.wx + m.lx * s;
      m.wy = C.wy + m.ly * s;
      m.sc = s;
    });
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  top.forEach((n) => {
    const r = n.collapsed ? GR : 6;
    x0 = Math.min(x0, n.wx - r);
    x1 = Math.max(x1, n.wx + r);
    y0 = Math.min(y0, n.wy - r);
    y1 = Math.max(y1, n.wy + r);
  });
  if (!top.length) x0 = x1 = y0 = y1 = 0;
  const ordered = list.slice().sort((a, b) => a.nest - b.nest || a.depth - b.depth || born(a, b));
  const minSc = list.length ? Math.min(...list.map((n) => n.sc)) : 1;
  const discs = list.filter((n) => n.kind === 'disc').sort(born);
  return { N, list: ordered, cols, discs, box: { x0, x1, y0, y1 }, minSc, key: tree.key, crossings: cross };
}

// 같은 모양의 나무는 다시 계산하지 않는다(최근 넷).
const cache = new Map<string, GraphModel>();

/** 나무의 지도 배치. 모양(tree.key)이 같으면 저장해 둔 것을 돌려준다. */
export function getModel(tree: LearnedTree): GraphModel {
  const hit = cache.get(tree.key);
  if (hit) {
    cache.delete(tree.key);
    cache.set(tree.key, hit);
    return hit;
  }
  const m = build(tree);
  cache.set(tree.key, m);
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
  return m;
}

/** 미리 계산해 둔다(시작 화면이 떠 있는 동안 등). 이미 있으면 아무것도 하지 않는다. */
export function warmModel(tree: LearnedTree | null): void {
  if (tree && !cache.has(tree.key)) getModel(tree);
}

/** 맨 위 범위에서 서로 다른 학문의 선이 엇갈리는 수(시험용) */
export function modelCrossings(M: GraphModel): number {
  const top = M.list.filter((n) => !n.scope);
  const idx = new Map(top.map((n, i) => [n.id, i]));
  const discs = new Map<GNode, number>();
  const P = top.map((n) => {
    if (!discs.has(n.disc)) discs.set(n.disc, discs.size);
    return { x: n.wx, y: n.wy, g: discs.get(n.disc)! };
  });
  const Ed = top.filter((n) => n.parent && idx.has(n.parent.id)).map((n) => ({ a: idx.get(n.parent!.id)!, b: idx.get(n.id)! }));
  return crossings(P, Ed);
}
