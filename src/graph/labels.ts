// 지도 이름 자리. 화면 없이 계산만 한다(시안 graph-a.html 의 drawLabels 에서 자리 찾기만 옮겼다).
// 학문은 늘, 분과 1.15배, 주제 1.5배, 개념 2.4배(지도 전체 배율 기준)부터 이름이 나온다.
// 높은 계급과 많이 배운 것부터 자리를 잡고, 겹치면 낮은 것이 숨는다. 아래, 위, 오른쪽, 왼쪽 순으로 보고,
// 직전 자리를 먼저 보아 확대할 때 이름이 이리저리 튀지 않게 한다.
import { GNode, GKind, GR, GraphModel, LV } from './layout';
import { PNode, ringR } from './camera';

export const LBL: Record<GKind, number> = { disc: 0, branch: 1.15, topic: 1.5, concept: 2.4 };
export const LABEL_FONT: Record<GKind, { size: number; weight: '400' | '500' | '600' }> = {
  disc: { size: 13, weight: '600' },
  branch: { size: 12, weight: '500' },
  topic: { size: 12, weight: '500' },
  concept: { size: 12, weight: '400' },
};
export type Slot = 'b' | 't' | 'r' | 'l';
const SLOTS: Slot[] = ['b', 't', 'r', 'l'];
export const LABEL_H = 16;
const MAX_W = 150;

export type Rect = [number, number, number, number];

/** 글자 폭 어림(한글 1em, 라틴 0.56em, 숫자 0.6em, 띄어쓰기 0.28em). 웹은 실제로 잰 값으로 바꿀 수 있다 */
export function textWidth(s: string, size: number, weight: string = '400'): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) w += 0.94;
    else if (c >= 0x3130 && c <= 0x318f) w += 0.8;
    else if (ch === ' ') w += 0.26;
    else if (ch >= '0' && ch <= '9') w += 0.58;
    else if (ch >= 'A' && ch <= 'Z') w += 0.66;
    else if (ch >= 'a' && ch <= 'z') w += 0.52;
    else if (ch === '…') w += 0.9;
    else w += 0.36;
  }
  return w * size * (weight >= '600' ? 1.03 : 1);
}

export type Measure = (s: string, kind: GKind) => number;
const defaultMeasure: Measure = (s, kind) => textWidth(s, LABEL_FONT[kind].size, LABEL_FONT[kind].weight);

/** 자리 잡은 이름 하나. rc 는 화면 사각형 [왼, 위, 오른, 아래] */
export type Label = { id: string; kind: GKind; text: string; rc: Rect; slot: Slot; force: boolean };

const ov = (a: Rect, b: Rect, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;

/**
 * 이름 자리를 정한다.
 * em(n) 은 강조 정도(1 이면 보통, 흐려진 점은 dimTo). focus 에 든 점은 forceLabels 면 배율과 관계없이 이름이 나온다.
 * chrome 은 위에 겹친 단추 같은 사각형, prev 는 직전 자리.
 */
export function placeLabels(o: {
  P: Map<string, PNode>;
  M: GraphModel;
  W: number;
  H: number;
  chrome?: Rect[];
  prev?: Map<string, Slot>;
  focus?: Set<string> | null;
  forceLabels?: boolean;
  em?: (n: GNode) => number;
  hidden?: Set<string> | null;
  measure?: Measure;
  /** 점 둘레에 더 그린 고리(오늘 복습, 고른 점)만큼 이름을 띄운다 */
  ringPad?: (id: string) => number;
}): Label[] {
  const { P, M, W, H } = o;
  const chrome = o.chrome ?? [];
  const measure = o.measure ?? defaultMeasure;
  const em = o.em ?? (() => 1);
  // 피해 갈 점: 개념이 아닌 점과 소우주 고리는 덮지 않는다. 개념 점은 덮으면 벌점만.
  const obstacles: { n: GNode; x: number; y: number; r: number; glyph: boolean }[] = [];
  for (const C of M.cols) {
    const p = P.get(C.id)!;
    if (p.v * (1 - p.open) < 0.3 || o.hidden?.has(C.id)) continue;
    obstacles.push({ n: C, x: p.x, y: p.y, r: ringR(p), glyph: true });
  }
  const items: { n: GNode; x: number; y: number; r: number; pri: number; force: boolean }[] = [];
  for (const n of M.list) {
    const p = P.get(n.id)!;
    if (p.v < 0.3 || o.hidden?.has(n.id)) continue;
    obstacles.push({ n, x: p.x, y: p.y, r: p.r, glyph: false });
    if (p.v < 0.5) continue;
    const force = !!(o.forceLabels && o.focus && o.focus.has(n.id));
    const closed = n.collapsed && p.open < 0.5;
    const thr = closed ? Math.min(LBL[n.kind], LBL.branch) : LBL[n.kind];
    if (!force && p.z < thr) continue;
    if (!force && n.kind !== 'disc' && em(n) < 0.6) continue;
    if (p.x < -60 || p.x > W + 60 || p.y < -30 || p.y > H + 30) continue;
    const pri = (force ? 1000 : 0) + (3 - LV[n.kind]) * 100 + Math.min(90, n.count || 0);
    const R = closed ? Math.max(10, GR * p.ks) : p.r + (o.ringPad?.(n.id) ?? 0);
    items.push({ n, x: p.x, y: p.y, r: R, pri, force });
  }
  items.sort((a, b) => b.pri - a.pri || (a.n.id < b.n.id ? -1 : 1));
  const placed: Rect[] = [];
  const out: Label[] = [];
  for (const it of items) {
    const n = it.n;
    let text = n.ko;
    let w = measure(text, n.kind);
    if (w > MAX_W) {
      while (text.length > 2 && measure(text + '…', n.kind) > MAX_W - 4) text = text.slice(0, -1);
      text += '…';
      w = measure(text, n.kind);
    }
    const h = LABEL_H;
    const g = 3;
    const last = o.prev?.get(n.id);
    const order = last ? [last, ...SLOTS.filter((s) => s !== last)] : SLOTS;
    let best: { s: Slot; rc: Rect; pen: number } | null = null;
    for (const s of order) {
      const rc: Rect =
        s === 'b'
          ? [it.x - w / 2, it.y + it.r + g, it.x + w / 2, it.y + it.r + g + h]
          : s === 't'
            ? [it.x - w / 2, it.y - it.r - g - h, it.x + w / 2, it.y - it.r - g]
            : s === 'r'
              ? [it.x + it.r + 5, it.y - h / 2, it.x + it.r + 5 + w, it.y + h / 2]
              : [it.x - it.r - 5 - w, it.y - h / 2, it.x - it.r - 5, it.y + h / 2];
      if (rc[0] < 4 || rc[2] > W - 4 || rc[1] < 4 || rc[3] > H - 4) continue;
      if (placed.some((p) => ov(rc, p, 3))) continue;
      if (chrome.some((c) => ov(rc, c, 2))) continue;
      let pen = SLOTS.indexOf(s) * 0.3 + (last === s ? -1 : 0);
      let bad = false;
      for (const d of obstacles) {
        if (d.n === n) continue;
        const dr: Rect = [d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r];
        if (!ov(rc, dr, 1)) continue;
        if (d.glyph || d.n.kind !== 'concept') {
          bad = true;
          break;
        }
        pen += 0.6;
      }
      if (bad) continue;
      if (!best || pen < best.pen) best = { s, rc, pen };
      if (pen <= -1) break;
    }
    if (!best) continue;
    placed.push(best.rc);
    out.push({ id: n.id, kind: n.kind, text, rc: best.rc, slot: best.s, force: it.force });
  }
  return out;
}

/** 이름 사각형끼리 겹치는 쌍의 수(시험용) */
export function labelOverlaps(labels: Label[]): number {
  let c = 0;
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (ov(labels[i].rc, labels[j].rc)) c++;
  return c;
}
