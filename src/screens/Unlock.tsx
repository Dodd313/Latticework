// 해금 전체 화면(시작 화면 바로 다음). 시안 motion-lab/v8/unlock.html 의 차례를 motion-lab/v9/graph-a.html 의 점 지도로 옮겼다.
//
// 카드 차례(knowledge.ts 의 unlockPlan): 놓친 해금 한 장, 학문 카드 최대 3장, 나머지 학문은 "외 N개" 한 장.
// 학문 카드: 지난 지도가 흐리게 깔리고 카메라가 새 학문 쪽으로 조금 다가간다. 학문 점이 켜지며 고리 하나가 퍼지고,
// 실이 뻗어 분과와 개념이 달린다. 아래에 "{학문} 부문을 해금했어요!" 와 그 학문을 연 개념, 점 옆 흰 말풍선에 Latti 한 줄.
// 움직임은 웹에서 브라우저(Element.animate, webTween)가 맡고 React 는 카드가 바뀔 때만 다시 그린다.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { Cam, clamp, fitBox, lerpN, project } from '../graph/camera';
import { GraphView, Pulse, Reveal, RevealStep, measureText } from '../graph/GraphView';
import { Rect } from '../graph/labels';
import { GNode, GraphModel, getModel, subtree } from '../graph/layout';
import type { LearnedTree, UnlockCard, UnlockEvent, UnlockPlan } from '../knowledge';
import { useLattiLine } from '../latti';
import { sentences } from '../lattiLines';
import { CSS_EASE, NATIVE_DRIVER, Rise, WEB, motionOff, webAnimate, webTween } from '../motion';
import { BOTTOM_PAD } from '../nav';
import { dayDiff } from '../dates';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { T, Tap } from '../ui';

const ORD = ['', '첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
export const ordinal = (n: number) => (n < ORD.length ? `${ORD[n]} 번째` : `${n}번째`);
/** '2026-11-20' 을 '11월 20일' 로 */
export const mdKo = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
export function rgbaOf(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
/** 학문 색의 글자색: 밝은 화면은 20% 어둡게(시안 ink), 어두운 화면은 그대로 */
export function inkOf(c: string, dark: boolean): string {
  if (dark) return c;
  const [r, g, b] = hex(c);
  return `rgb(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)})`;
}

/** 카드 한 장이 새로 보여 주는 점들(학문 카드는 그 학문 아래 전부, 놓친 해금과 외 N개는 그 마디들 아래) */
function ownOf(M: GraphModel, card: UnlockCard): Set<string> {
  const items = card.type === 'major' ? [card.item] : card.items;
  const out = new Set<string>();
  for (const u of items) {
    const n = M.N.get(u.nodeId);
    if (n) subtree(n).forEach((x) => out.add(x.id));
  }
  return out;
}

/** 그 해금을 연 개념들(그 마디 아래에서 같은 날 배운 개념) */
function openersOf(M: GraphModel, u: UnlockEvent): string[] {
  const n = M.N.get(u.nodeId);
  if (!n) return u.byName ? [u.byName] : [];
  return subtree(n)
    .filter((x) => x.kind === 'concept' && x.at === u.at)
    .map((x) => x.ko);
}

// ─────────────────────────────────────────────────────────────
// 말풍선 자리: 새 점 옆, 다른 점과 이름을 가장 덜 가리는 쪽(graph-a runMajor)
// ─────────────────────────────────────────────────────────────

type Side = 'top' | 'right' | 'left' | 'bottom';
type BubblePlace = { side: Side; rc: Rect; w: number; h: number; tx: number; lines: string[] };
const BUB = { font: 14, lh: 20, px: 12, py: 7 };

/** 말풍선 크기: 한 줄로 들어가면 한 줄, 아니면 문장마다 한 줄(두 줄까지). */
function bubbleSize(text: string, maxW: number): { w: number; h: number; lines: string[] } {
  const one = measureText(text, BUB.font, '600');
  const pad = BUB.px * 2 + 2;
  if (one + pad <= Math.min(maxW, 260)) return { w: Math.ceil(one + pad), h: BUB.lh + BUB.py * 2, lines: [text] };
  const parts = sentences(text);
  const lines = parts.length >= 2 ? [parts[0], parts.slice(1).join(' ')] : [text];
  const widest = Math.max(...lines.map((l) => measureText(l, BUB.font, '600')));
  const w = Math.min(maxW, Math.ceil(widest + pad));
  // 한 문장이 폭을 넘으면 줄이 늘어난다
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil((measureText(l, BUB.font, '600') + pad) / w)), 0);
  return { w, h: rows * BUB.lh + BUB.py * 2, lines };
}

function placeBubble(text: string, M: GraphModel, cam: Cam, W: number, H: number, K0: number, target: GNode, hidden: Set<string>): BubblePlace {
  const P = project(M, cam, W, H, K0);
  const { w: bw, h: bh, lines } = bubbleSize(text, W - 40);
  const d = P.get(target.id)!;
  const DX = d.x;
  const DY = d.y;
  const rects: Rect[] = [];
  for (const n of M.list) {
    if (n.scope || hidden.has(n.id)) continue;
    const p = P.get(n.id)!;
    rects.push([p.x - 8, p.y - 8, p.x + 8, p.y + 8]);
  }
  // 학문 이름 자리(점 아래)도 비워 둔다
  rects.push([DX - 30, DY + 8, DX + 30, DY + 26]);
  let best: { side: Side; rc: Rect; v: number } | null = null;
  for (const side of ['top', 'right', 'left', 'bottom'] as Side[]) {
    const gap = 16;
    const bx = clamp(DX - bw / 2, 12, W - 12 - bw);
    const rc: Rect =
      side === 'top'
        ? [bx, DY - gap - bh, bx + bw, DY - gap]
        : side === 'bottom'
          ? [bx, DY + gap + 18, bx + bw, DY + gap + 18 + bh]
          : side === 'right'
            ? [DX + gap, DY - bh / 2, DX + gap + bw, DY + bh / 2]
            : [DX - gap - bw, DY - bh / 2, DX - gap, DY + bh / 2];
    let v = { top: 0, right: 8, left: 8, bottom: 12 }[side];
    if (rc[0] < 10 || rc[2] > W - 10 || rc[1] < 10 || rc[3] > H - 10) v += 1e6;
    for (const r of rects) {
      const ox = Math.max(0, Math.min(rc[2], r[2]) - Math.max(rc[0], r[0]));
      const oy = Math.max(0, Math.min(rc[3], r[3]) - Math.max(rc[1], r[1]));
      v += ox * oy;
    }
    if (!best || v < best.v) best = { side, rc, v };
  }
  const b = best!;
  const tx = b.side === 'top' || b.side === 'bottom' ? clamp(DX - b.rc[0], 14, bw - 14) : bw / 2;
  return { side: b.side, rc: b.rc, w: bw, h: bh, tx, lines };
}

/** 지도 위의 흰 말풍선. 꼬리는 새 점을 가리킨다. 0.3초 동안 0.9배에서 커지며 나타난다. */
function MapBubble({ place, delay }: { place: BubblePlace; delay: number }) {
  const t = useTheme();
  const ref = useRef<any>(null);
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  const origin = { top: `${place.tx}px 100%`, bottom: `${place.tx}px 0%`, right: '0% 50%', left: '100% 50%' }[place.side];
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) return;
    if (WEB) {
      const el = ref.current as HTMLElement | null;
      if (el) el.style.transformOrigin = origin;
      const tw = webTween(ref, { duration: 300, easing: Easing.bezier(0.23, 1, 0.32, 1) }, (x) => ({ opacity: x, transform: `scale(${0.9 + 0.1 * x})` }), { delay });
      return () => tw?.anim.cancel();
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 300, delay, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, []);
  const half = 4.5;
  const tail: any =
    place.side === 'top'
      ? { bottom: -3, left: place.tx - half }
      : place.side === 'bottom'
        ? { top: -3, left: place.tx - half }
        : place.side === 'right'
          ? { left: -3, top: place.h / 2 - half }
          : { right: -3, top: place.h / 2 - half };
  const bg = t.mode === 'dark' ? t.p.grey100 : t.card;
  const shadow: any = t.mode === 'dark' ? null : WEB ? { filter: 'drop-shadow(0 1px 1px rgba(0,23,51,0.05)) drop-shadow(0 4px 12px rgba(0,23,51,0.10))' } : { shadowColor: '#001733', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
  const motion: any = WEB ? null : { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] };
  const Box: any = WEB ? View : Animated.View;
  const text = place.lines.join(' ');
  return (
    <Box
      ref={ref}
      testID="unlock-bubble"
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[{ position: 'absolute', left: place.rc[0], top: place.rc[1], width: place.w, minHeight: place.h, borderRadius: 14, paddingHorizontal: BUB.px, paddingVertical: BUB.py, backgroundColor: bg }, shadow, motion]}
    >
      <View aria-hidden style={[{ position: 'absolute', width: 9, height: 9, borderRadius: 2, backgroundColor: bg, transform: [{ rotate: '45deg' }] }, tail]} />
      {place.lines.map((l, i) => (
        <T key={i} s={BUB.font} w="600" lh={BUB.lh / BUB.font} c={t.body} style={{ letterSpacing: -0.2 }}>
          {l}
        </T>
      ))}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// 지도 조각: 정해진 카메라로 한 번 그리고, 상자만 움직여 다가간다
// ─────────────────────────────────────────────────────────────

/** from 카메라에서 to 카메라로 다가가는 움직임. 장면은 to 로 한 번만 그리고 상자의 transform 만 옮긴다. */
function useFlight(ref: React.RefObject<any>, from: Cam, to: Cam, W: number, H: number, ms: number, delay: number) {
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  // to 로 그린 장면이 from 처럼 보이는 transform(왼쪽 위 기준)
  const s0 = from.k / to.k;
  const tx0 = (W / 2) * (1 - s0) + (to.x - from.x) * from.k;
  const ty0 = (H / 2) * (1 - s0) + (to.y - from.y) * from.k;
  const same = Math.abs(s0 - 1) < 1e-4 && Math.abs(tx0) < 0.5 && Math.abs(ty0) < 0.5;
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (same || motionOff()) return;
    if (WEB) {
      const el = ref.current as HTMLElement | null;
      if (el) el.style.transformOrigin = '0px 0px';
      const tw = webTween(ref, { duration: ms, easing: Easing.inOut(Easing.cubic) }, (x) => ({ transform: `translate(${lerpN(tx0, 0, x)}px, ${lerpN(ty0, 0, x)}px) scale(${lerpN(s0, 1, x)})` }), { delay });
      return () => tw?.anim.cancel();
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: ms, delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, []);
  if (WEB || same) return null;
  // 앱: 가운데 기준 transform 으로 바꾼다(p*s + t 를 가운데 기준으로)
  const cx = (W / 2) * (s0 - 1);
  const cy = (H / 2) * (s0 - 1);
  return {
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [tx0 + cx, 0] }) },
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [ty0 + cy, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [s0, 1] }) },
    ],
  };
}

type Scene = {
  cam: Cam;
  from: Cam;
  K0: number;
  focus: Set<string>;
  hidden: Set<string>;
  reveal: Reveal | null;
  pulses: Pulse[];
  target: GNode | null;
  /** 글이 나오기 시작하는 때(ms) */
  copyAt: number;
};

/** 카드 한 장의 지도 장면: 카메라, 숨길 점, 나타나는 차례 */
function sceneOf(M: GraphModel, cards: UnlockCard[], i: number, bandIds: Set<string>, W: number, H: number, prev: Cam | null): Scene {
  const card = cards[i];
  const own = ownOf(M, card);
  const later = new Set<string>(bandIds);
  for (let j = i + 1; j < cards.length; j++) ownOf(M, cards[j]).forEach((id) => later.add(id));
  own.forEach((id) => later.delete(id));
  const fit = fitBox(M.box, W, H, { x: 60, y: 110 });
  const K0 = fit.k;
  if (card.type === 'major') {
    const d = M.N.get(card.item.nodeId)!;
    const sub = subtree(d);
    let tk = fit.k * 1.04;
    const tx = lerpN(fit.x, d.wx, 0.08);
    const ty = lerpN(fit.y, d.wy, 0.08);
    const inside = (k: number) => sub.every((x) => {
      const X = (x.wx - tx) * k + W / 2;
      const Y = (x.wy - ty) * k + H / 2;
      return X > 70 && X < W - 70 && Y > 70 && Y < H - 90;
    });
    for (let g = 0; g < 30 && tk > fit.k * 0.5 && !inside(tk); g++) tk *= 0.96;
    const cam = { x: tx, y: ty, k: tk };
    const order = new Map<string, RevealStep>();
    const steps = [d, ...sub.filter((x) => x !== d).sort((a, b) => a.depth - b.depth)];
    steps.forEach((x, k) => order.set(x.id, x === d ? { t: 0, d: 620, mode: 'fade' } : { t: 520 + (x.depth - 1) * 300 + k * 40, d: 520, mode: 'grow' }));
    const end = Math.max(...[...order.values()].map((s) => s.t + s.d));
    return {
      cam,
      from: prev ?? { x: fit.x, y: fit.y, k: fit.k * 0.94 },
      K0,
      focus: own,
      hidden: later,
      reveal: { order, t0Delay: 1000 },
      pulses: [{ id: d.id, delay: 1120, r: 34, d: 1100, key: `unlock:${d.id}` }],
      target: d,
      copyAt: Math.max(1700, Math.min(2400, 1000 + end - 500)),
    };
  }
  // 놓친 해금, 외 N개: 지도 전체에서 그동안 생긴 점이 생긴 날 순서로 돋는다(1.5초 안에)
  const cam = { x: fit.x, y: fit.y, k: fit.k * 0.97 };
  const ns = [...own].map((id) => M.N.get(id)!).filter(Boolean).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.depth - b.depth));
  const t0 = ns.length ? ns[0].at : '';
  const span = ns.length ? Math.max(1, dayDiff(t0, ns[ns.length - 1].at)) : 1;
  const order = new Map<string, RevealStep>();
  ns.forEach((x, k) => {
    const tt = (dayDiff(t0, x.at) / span) * 1500 + k * 8;
    order.set(x.id, { t: tt, d: x.kind === 'disc' ? 520 : 420, mode: x.kind === 'disc' ? 'fade' : 'grow' });
  });
  const items = card.items.slice().sort((a, b) => (a.at < b.at ? -1 : 1));
  const first = M.N.get(items[0]?.nodeId ?? '') ?? null;
  const discs = ns.filter((x) => x.kind === 'disc');
  return {
    cam,
    from: prev ?? { x: fit.x, y: fit.y, k: fit.k * 0.92 },
    K0,
    focus: own,
    hidden: later,
    reveal: { order, t0Delay: 900 },
    pulses: discs.map((x) => ({ id: x.id, delay: 900 + (order.get(x.id)?.t ?? 0) + 120, r: 30, d: 1000, key: `unlock:${x.id}` })),
    target: first,
    copyAt: 2000,
  };
}

// ─────────────────────────────────────────────────────────────
// 전체 화면
// ─────────────────────────────────────────────────────────────

export function UnlockFlow({ cards, band, tree, go, onDone }: { cards: UnlockCard[]; band: UnlockPlan['band']; tree: LearnedTree; go: boolean; onDone: (to?: string | null) => void }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const W = Math.min(width, 560);
  const mapH = Math.round(clamp(height - 360, 240, 480));
  const M = useMemo(() => getModel(tree), [tree]);
  const bandIds = useMemo(() => {
    const out = new Set<string>();
    for (const u of band?.all ?? []) {
      const n = M.N.get(u.nodeId);
      if (n) subtree(n).forEach((x) => out.add(x.id));
    }
    return out;
  }, [M, band]);
  const [i, setI] = useState(0);
  const cams = useRef<Cam[]>([]);
  const scene = useMemo(() => {
    const s = sceneOf(M, cards, i, bandIds, W, mapH, i > 0 ? (cams.current[i - 1] ?? null) : null);
    cams.current[i] = s.cam;
    return s;
  }, [M, cards, i, bandIds, W, mapH]);
  const { markSeen } = useStore();
  const card = cards[i];
  // 보여 준 카드는 본 것으로 적는다(학문 카드는 같은 묶음의 분과까지).
  useEffect(() => {
    if (!go || !card) return;
    const ids = card.type === 'major' ? [card.item, ...card.lights] : card.type === 'more' ? [...card.items, ...(card.lights ?? [])] : card.items;
    markSeen(
      'unlock',
      ids.map((u) => u.id),
    );
  }, [go, i]);

  const copyRef = useRef<any>(null);
  const btnRef = useRef<any>(null);
  const leaving = useRef(false);
  const next = () => {
    if (leaving.current) return;
    const last = i >= cards.length - 1;
    leaving.current = true;
    // 마지막 장도 글과 단추를 먼저 걷어 누른 것이 바로 보이게 한다(그다음 차례를 그리는 동안 화면이 멈춰 보이지 않게).
    const done = last
      ? () => onDone()
      : () => {
          leaving.current = false;
          setI((x) => x + 1);
        };
    if (!WEB || motionOff()) return done();
    webAnimate(copyRef, [{ opacity: 1, transform: 'translateX(0px)' }, { opacity: 0, transform: 'translateX(-16px)' }], { duration: 200, easing: 'cubic-bezier(0.32, 0, 0.67, 0)', fill: 'forwards' });
    const a = webAnimate(btnRef, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    if (a) a.onfinish = done;
    else done();
  };
  if (!go || !card) return <View style={{ flex: 1, backgroundColor: t.card }} />;
  const d = card.type === 'major' ? M.N.get(card.item.nodeId) : null;
  return (
    <View testID="unlock" style={{ flex: 1, backgroundColor: t.card }}>
      <UnlockCardView key={i} M={M} card={card} index={i} count={cards.length} scene={scene} W={W} mapH={mapH} namesH={height - mapH - 8 - 22 - 6 - 80 - 14 - 120} copyRef={copyRef} btnRef={btnRef} onNext={next} onGo={() => onDone(d ? d.id : null)} />
    </View>
  );
}

function UnlockCardView({
  M,
  card,
  index,
  count,
  scene,
  W,
  mapH,
  namesH,
  copyRef,
  btnRef,
  onNext,
  onGo,
}: {
  M: GraphModel;
  card: UnlockCard;
  index: number;
  count: number;
  scene: Scene;
  W: number;
  mapH: number;
  /** 흐린 이름 목록에 쓸 수 있는 높이 */
  namesH: number;
  copyRef: React.RefObject<any>;
  btnRef: React.RefObject<any>;
  onNext: () => void;
  onGo: () => void;
}) {
  const t = useTheme();
  const dark = t.mode === 'dark';
  const items = card.type === 'major' ? [card.item] : card.items.slice().sort((a, b) => (a.at < b.at ? -1 : 1));
  const ids = items.map((u) => u.id).join('+');
  const d = card.type === 'major' ? M.N.get(card.item.nodeId)! : null;
  // Latti 한 줄(같은 해금은 같은 말)
  const ctx = useMemo(() => {
    if (card.type !== 'major' || !d) return { n: items.length };
    const prevAt = M.discs
      .filter((x) => x.at < d.at)
      .map((x) => x.at)
      .sort()
      .pop();
    return { rank: 'discipline', field: d.ko, n: card.item.nth ?? 1, gap: prevAt ? dayDiff(prevAt, d.at) : 0, first: card.item.byName };
  }, [card, M]);
  const sit = card.type === 'major' ? 'unlock' : card.type === 'missed' ? 'unlock.missed' : 'unlock.more';
  const line = useLattiLine(sit, ctx, `unlock:${card.type}:${ids}`);
  const place = useMemo(() => (line && scene.target ? placeBubble(line, M, scene.cam, W, mapH, scene.K0, scene.target, scene.hidden) : null), [line, scene, M, W, mapH]);
  const chrome = useMemo<Rect[] | undefined>(() => (place ? [[place.rc[0] - 4, place.rc[1] - 4, place.rc[2] + 4, place.rc[3] + 4]] : undefined), [place]);

  const flyRef = useRef<any>(null);
  const flight = useFlight(flyRef, scene.from, scene.cam, W, mapH, 1100, 150);
  const MV: any = WEB ? View : Animated.View;

  // 글
  const when = (() => {
    const d0 = mdKo(items[0].at);
    const d1 = mdKo(items[items.length - 1].at);
    return d0 === d1 ? d0 : `${d0}부터`;
  })();
  let kicker: string;
  let title: string;
  let names: { text: string; strong?: boolean }[];
  let kickerColor = t.mute;
  if (card.type === 'major' && d) {
    kicker = `${ordinal(card.item.nth ?? 1)} 학문`;
    kickerColor = inkOf(d.color, dark);
    title = `${d.ko} 부문을\n해금했어요!`;
    names = openersOf(M, card.item).map((text) => ({ text }));
  } else if (card.type === 'more') {
    kicker = when;
    title = items.length === 1 ? `${M.N.get(items[0].nodeId)?.ko ?? ''} 부문도\n해금했어요!` : `학문 ${items.length}개를\n더 해금했어요!`;
    names = items.length === 1 ? openersOf(M, items[0]).map((text) => ({ text })) : items.map((u) => ({ text: M.N.get(u.nodeId)?.ko ?? u.byName }));
  } else {
    kicker = when;
    title = `놓친 해금\n${items.length}개`;
    names = items.map((u) => ({ text: M.N.get(u.nodeId)?.ko ?? u.byName, strong: u.kind === 'major' }));
  }
  // 이름이 많으면 남는 줄만큼만 적고 나머지는 "+n"
  const fit = useMemo(() => {
    const lines = Math.max(1, Math.floor(namesH / 23));
    const lineW = W - 48;
    let row = 1;
    let x = 0;
    let n = 0;
    for (const nm of names) {
      const w = measureText(nm.text, 14, nm.strong ? '600' : '500');
      const more = names.length - n - 1 > 0 ? measureText(`+${names.length - n - 1}`, 14, '600') + 10 : 0;
      const nx = x ? x + 10 + w : w;
      if (nx > lineW || (row === lines && nx + more > lineW)) {
        if (row === lines) break;
        row += 1;
        x = w;
      } else x = nx;
      n += 1;
    }
    return n;
  }, [names.map((x) => x.text).join('|'), namesH, W]);
  const at = motionOff() ? 0 : scene.copyAt;
  const btnColor = d ? inkOf(d.color, dark) : t.blue;

  return (
    <>
      <View style={{ width: W, height: mapH, overflow: 'hidden', alignSelf: 'center' }}>
        <MV ref={flyRef} style={[{ width: W, height: mapH }, flight]}>
          <GraphView model={M} width={W} height={mapH} cam={scene.cam} K0={scene.K0} focus={scene.focus} dimTo={0.4} forceLabels hidden={scene.hidden} reveal={motionOff() ? null : scene.reveal} pulses={scene.pulses} chrome={chrome} />
        </MV>
        {place ? <MapBubble place={place} delay={at + 380} /> : null}
      </View>
      {count > 1 ? (
        <View aria-hidden style={{ position: 'absolute', top: mapH - 8, left: 24, flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: count }, (_, k) => (
            <View key={k} style={{ width: k === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === index ? t.p.grey700 : t.p.grey200 }} />
          ))}
        </View>
      ) : null}
      <View ref={copyRef} style={{ position: 'absolute', left: 24, right: 24, top: mapH + 8 }}>
        <Rise delay={at} y={10}>
          <T s={15} w="700" lh={22 / 15} c={kickerColor} style={{ letterSpacing: -0.2 }}>
            {kicker}
          </T>
        </Rise>
        <Rise delay={at + 70} y={10}>
          <T s={30} w="700" lh={40 / 30} c={t.ink} role="heading" level={1} style={{ marginTop: 6, letterSpacing: -0.8 }}>
            {title}
          </T>
        </Rise>
        {names.length ? (
          <Rise delay={at + 260} y={0}>
            <View testID="unlock-names" style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
              {names.slice(0, fit).map((n, k) => (
                <T key={k} s={14} w={n.strong ? '600' : '500'} lh={21 / 14} c={n.strong ? t.sub : t.mute}>
                  {n.text}
                </T>
              ))}
              {names.length > fit ? (
                <T s={14} w="600" lh={21 / 14} c={t.faint} mono>
                  {`+${names.length - fit}`}
                </T>
              ) : null}
            </View>
          </Rise>
        ) : null}
      </View>
      <View ref={btnRef} style={{ position: 'absolute', left: 20, right: 20, bottom: 0, paddingBottom: BOTTOM_PAD === 6 ? 24 : `calc(24px + env(safe-area-inset-bottom, 0px))` as any }}>
        <Rise delay={at + 580} y={10} style={{ flexDirection: 'row', gap: 8 }}>
          <Tap onPress={onNext} label="계속" style={{ flex: 1, height: 56, borderRadius: 16, backgroundColor: t.p.grey100, alignItems: 'center', justifyContent: 'center' }}>
            <T s={17} w="600" c={t.p.grey700} lh={1.5}>
              계속
            </T>
          </Tap>
          <Tap onPress={onGo} label="보러 가기" style={{ flex: 1.25, height: 56, borderRadius: 16, backgroundColor: btnColor, alignItems: 'center', justifyContent: 'center' }}>
            <T s={17} w="600" c="rgba(255,255,255,0.95)" lh={1.5}>
              보러 가기
            </T>
          </Tap>
        </Rise>
      </View>
    </>
  );
}

