// 지식 지도 한 장면을 그린다(react-native-svg). 지식 탭, 해금 화면, 홈 띠 조각이 같이 쓴다.
//
// 정해진 카메라(cam) 하나로 화면 자리에 그린다. 끌기와 확대 중에는 다시 그리지 않고, 이 장면을 담은 상자만
// 옮기고 늘린다(GraphStage). 선은 부모와 자식 사이의 머리카락 선뿐이고, 개념끼리 잇는 선과 가운데 표식은 없다.
// 나타나기, 고리 퍼짐, 이름 나타나기는 웹에서 브라우저 움직임(Element.animate)으로, 앱에서는 Animated 로 건다.
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { CSS_EASE, NATIVE_DRIVER, WEB, motionOff } from '../motion';
import { FONT_SANS, useTheme } from '../theme';
import { Cam, Mem, PNode, baseK, lerpN, project, ringR } from './camera';
import { LABEL_FONT, Label, Measure, Rect, Slot, placeLabels, textWidth } from './labels';
import { GKind, GNode, GraphModel } from './layout';

export type RevealStep = { t: number; d: number; mode: 'fade' | 'grow' };
export type Reveal = { order: Map<string, RevealStep>; t0Delay: number };
export type Pulse = { id: string; delay: number; r: number; key?: string | number; d?: number };

export type GraphViewProps = {
  model: GraphModel;
  width: number;
  height: number;
  cam: Cam;
  /** 기준 배율(이름이 나오는 배율의 기준). 없으면 지도 전체가 들어오는 배율 */
  K0?: number;
  mem?: (id: string) => Mem | undefined;
  labels?: boolean;
  dotScale?: number;
  /** 진하게 남길 점. 나머지는 dimTo 로 물러난다 */
  focus?: Set<string> | null;
  dimTo?: number;
  /** focus 의 이름을 배율과 관계없이 보이고, focus 사이 선을 짙게 */
  forceLabels?: boolean;
  chainEdges?: boolean;
  /** 그리지 않는 점(해금: 나타나기 전) */
  hidden?: Set<string> | null;
  reveal?: Reveal | null;
  pulses?: Pulse[];
  selected?: string | null;
  /** 위에 겹친 단추 자리. 이름이 피해 간다 */
  chrome?: Rect[];
  /** 지금 들어가 있는 소우주. 그 소우주에서 바깥 부모로 가는 선은 지운다 */
  focusC?: string | null;
  /** 미리 계산한 화면 자리(같은 cam). 없으면 여기서 계산한다 */
  proj?: Map<string, PNode>;
  onLabels?: (labels: Label[]) => void;
};

const ORANGE = '#fe9800';

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// 시험과 성능 확인용: 이 장면을 몇 번 그렸는지
let renderCount = 0;
let lastMs = 0;
let maxMs = 0;
export function graphRenders(): number {
  return renderCount;
}
/** 그리기 횟수와 마지막, 가장 긴 그리기 시간(ms, 그리기 시작부터 화면에 붙기까지) */
export function graphStats(): { renders: number; lastMs: number; maxMs: number } {
  return { renders: renderCount, lastMs, maxMs };
}

/** 웹: 글자 폭을 실제로 잰다(캔버스). 앱은 어림값 */
const widthCache = new Map<string, number>();
let canvasCtx: CanvasRenderingContext2D | null | undefined;
const measureWeb: Measure = (s, kind) => {
  const f = LABEL_FONT[kind];
  const key = `${kind}|${s}`;
  const hit = widthCache.get(key);
  if (hit != null) return hit;
  let w = textWidth(s, f.size, f.weight);
  if (Platform.OS === 'web') {
    try {
      if (canvasCtx === undefined) canvasCtx = document.createElement('canvas').getContext('2d');
      if (canvasCtx) {
        canvasCtx.font = `${f.weight} ${f.size}px ${FONT_SANS}`;
        w = canvasCtx.measureText(s).width;
      }
    } catch {
      // 어림값을 쓴다
    }
  }
  widthCache.set(key, w);
  return w;
};

/** 글자 폭(px). 웹은 캔버스로 재고, 앱은 어림값 */
export function measureText(s: string, size: number, weight: '400' | '500' | '600' | '700' = '400'): number {
  const key = `${size}/${weight}|${s}`;
  const hit = widthCache.get(key);
  if (hit != null) return hit;
  let w = textWidth(s, size, weight);
  if (Platform.OS === 'web') {
    try {
      if (canvasCtx === undefined) canvasCtx = document.createElement('canvas').getContext('2d');
      if (canvasCtx) {
        canvasCtx.font = `${weight} ${size}px ${FONT_SANS}`;
        w = canvasCtx.measureText(s).width;
      }
    } catch {
      // 어림값을 쓴다
    }
  }
  widthCache.set(key, w);
  return w;
}

function GraphViewImpl(props: GraphViewProps) {
  renderCount++;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const t = useTheme();
  const { model: M, width: W, height: H, cam, dotScale = 1, focus = null, dimTo = 0.22, hidden = null, selected = null, chrome, focusC = null } = props;
  const K0 = props.K0 ?? baseK(M, W, H);
  const dark = t.mode === 'dark';
  const P = useMemo(() => props.proj ?? project(M, cam, W, H, K0, dotScale, props.mem), [props.proj, M, cam, W, H, K0, dotScale, props.mem]);
  const em = (n: GNode) => (!focus || focus.has(n.id) ? 1 : dimTo);
  const prevSlots = useRef(new Map<string, Slot>());
  const labels = useMemo(() => {
    if (props.labels === false || W < 2) return [] as Label[];
    const ringPad = (id: string) => {
      const due = !!props.mem?.(id)?.due;
      return selected === id ? (due ? 5.4 : 4) : due ? 3 : 0;
    };
    const out = placeLabels({ P, M, W, H, chrome, prev: prevSlots.current, focus, forceLabels: props.forceLabels, em, hidden, measure: measureWeb, ringPad });
    prevSlots.current = new Map(out.map((l) => [l.id, l.slot]));
    return out;
  }, [P, M, W, H, chrome, focus, props.forceLabels, props.labels, hidden, dimTo, selected, props.mem]);

  const rgba = (c: string, a: number) => {
    const [r, g, b] = hex(c);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  };
  const hair = rgba(t.p.grey400, dark ? 0.55 : 0.42);
  const hot = rgba(t.p.grey500, dark ? 0.8 : 0.6);
  const lw = Platform.OS === 'web' && typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1 ? 0.75 : 1;
  // 화면에서 한 화면 넘게 떨어진 것은 그리지 않는다(끌거나 줄일 때 드러날 만큼은 남긴다)
  const mx = Math.max(W, H);
  const off = (x: number, y: number, r = 0) => x < -mx - r || x > W + mx + r || y < -mx - r || y > H + mx + r;
  const tag = (k: string, v: string) => (Platform.OS === 'web' ? ({ dataSet: { [k]: v } } as any) : null);

  // 1. 부모와 자식을 잇는 선(유일한 선)
  const edges: React.ReactNode[] = [];
  for (const n of M.list) {
    const par = n.parent;
    if (!par || hidden?.has(n.id) || hidden?.has(par.id)) continue;
    const p = P.get(n.id)!;
    const q = P.get(par.id)!;
    const a = p.v * Math.min(em(n), em(par)) * (focusC === n.id ? 1 - p.open : 1);
    if (a < 0.01) continue;
    if ((p.x < -mx && q.x < -mx) || (p.x > W + mx && q.x > W + mx) || (p.y < -mx && q.y < -mx) || (p.y > H + mx && q.y > H + mx)) continue;
    const isHot = !!(props.chainEdges && focus && focus.has(n.id) && focus.has(par.id));
    edges.push(
      <Line
        key={n.id}
        {...tag('e', n.id)}
        x1={q.x}
        y1={q.y}
        x2={p.x}
        y2={p.y}
        stroke={isHot ? hot : hair}
        strokeOpacity={a}
        strokeWidth={isHot ? 1 : lw}
        strokeLinecap="round"
      />,
    );
  }

  // 2. 닫힌 소우주: 가는 고리 안에 축소판 점
  const rings: React.ReactNode[] = [];
  for (const C of M.cols) {
    if (hidden?.has(C.id)) continue;
    const pc = P.get(C.id)!;
    const g = pc.v * (1 - pc.open);
    if (g < 0.01) continue;
    const Ru = 12 * pc.ks;
    const R = ringR(pc);
    if (off(pc.x, pc.y, R)) continue;
    const f = R / Ru;
    const hole = (pc.r + 2.5) * (1 - pc.open);
    const e = em(C);
    const minis = C.members!.map((m) => {
      const pm = P.get(m.id)!;
      const vx = (pm.x - pc.x) * f;
      const vy = (pm.y - pc.y) * f;
      const vl = Math.hypot(vx, vy) || 1;
      const sl = (hole + (vl * (R - hole - 2.5)) / R) / vl;
      const r = lerpN(1.15, pm.r, pc.open);
      const mm = props.mem?.(m.id);
      const due = m.kind === 'concept' ? !!mm?.due : !!(m.collapsed && m.members!.some((x) => props.mem?.(x.id)?.due));
      return <Circle key={m.id} cx={pc.x + vx * sl} cy={pc.y + vy * sl} r={m.kind === 'concept' ? r : r * 1.25} fill={due ? rgba(ORANGE, 0.95 * g * e) : rgba(C.color, (m.kind === 'concept' ? 0.6 : 0.9) * g * e)} />;
    });
    rings.push(
      <G key={C.id} {...tag('n', C.id)}>
        <Circle cx={pc.x} cy={pc.y} r={R} fill="none" stroke={rgba(C.color, 0.5 * g * e)} strokeWidth={1} />
        {minis}
      </G>,
    );
  }

  // 3. 점
  const dots: React.ReactNode[] = [];
  for (const n of M.list) {
    if (hidden?.has(n.id)) continue;
    const p = P.get(n.id)!;
    const a = p.v;
    if (a < 0.01 || off(p.x, p.y)) continue;
    const e = em(n);
    const r = p.r;
    const d = tag('n', n.id);
    const id = n.id;
    if (n.kind === 'concept') {
      const mm = props.mem?.(id);
      const studied = mm ? mm.studied : true;
      const strength = mm?.strength ?? 0.5;
      dots.push(
        studied ? (
          <Circle key={id} {...d} cx={p.x} cy={p.y} r={r} fill={rgba(n.color, (0.45 + 0.55 * strength) * a * e)} />
        ) : (
          <Circle key={id} {...d} cx={p.x} cy={p.y} r={Math.max(1, r - 0.6)} fill="none" stroke={rgba(n.color, 0.75 * a * e)} strokeWidth={1.2} />
        ),
      );
      if (mm?.due) dots.push(<Circle key={`${id}:due`} {...d} cx={p.x} cy={p.y} r={r + 2.2} fill="none" stroke={rgba(ORANGE, 0.9 * a * Math.max(e, 0.35))} strokeWidth={1.2} />);
      if (selected === id) dots.push(<Circle key={`${id}:sel`} {...d} cx={p.x} cy={p.y} r={r + (mm?.due ? 4.6 : 3.2)} fill="none" stroke={rgba(t.ink, 0.85 * a)} strokeWidth={1.5} />);
    } else {
      if (n.kind === 'disc') dots.push(<Circle key={`${id}:halo`} {...d} cx={p.x} cy={p.y} r={r + 1.5} fill={t.card} fillOpacity={a} />);
      dots.push(<Circle key={id} {...d} cx={p.x} cy={p.y} r={r} fill={rgba(n.color, a * e)} />);
      if (selected === id) dots.push(<Circle key={`${id}:sel`} {...d} cx={p.x} cy={p.y} r={r + 3.2} fill="none" stroke={rgba(t.ink, 0.85 * a)} strokeWidth={1.5} />);
    }
  }

  // 4. 한 번 퍼지는 고리(해금, 날아간 뒤, 새로 생긴 점)
  const pulses = (props.pulses ?? []).map((pu, i) => {
    const p = P.get(pu.id);
    if (!p) return null;
    const k = String(pu.key ?? `${pu.id}:${i}`);
    return <PulseRing key={k} pkey={k} x={p.x} y={p.y} r0={p.r + 3} r1={p.r + 3 + pu.r} color={p.n.color} delay={pu.delay} d={pu.d ?? 1000} />;
  });

  // 5. 이름
  const labelNodes = labels.map((l) => {
    const n = M.N.get(l.id)!;
    const p = P.get(l.id)!;
    const f = LABEL_FONT[l.kind];
    const a = p.v * (n.kind === 'disc' ? Math.max(em(n), 0.4) : em(n));
    const col = l.force ? t.ink : n.kind === 'disc' ? t.p.grey800 : n.kind === 'concept' ? t.p.grey600 : t.p.grey700;
    const anchor = l.slot === 'r' ? 'start' : l.slot === 'l' ? 'end' : 'middle';
    const x = l.slot === 'r' ? l.rc[0] : l.slot === 'l' ? l.rc[2] : (l.rc[0] + l.rc[2]) / 2;
    const y = (l.rc[1] + l.rc[3]) / 2 + f.size * 0.36;
    const common = { x, y, fontSize: f.size, fontWeight: f.weight, fontFamily: FONT_SANS, textAnchor: anchor as any };
    return (
      <G key={l.id} {...tag('l', l.id)} opacity={a}>
        <SvgText {...common} fill="none" stroke={t.card} strokeOpacity={0.92} strokeWidth={3.5} strokeLinejoin="round">
          {l.text}
        </SvgText>
        <SvgText {...common} fill={col}>
          {l.text}
        </SvgText>
      </G>
    );
  });

  // 웹: 나타나기와 이름 나타나기를 브라우저에 맡긴다(그리기 전에 걸어 첫 장면부터 맞는 모습)
  const root = useRef<any>(null);
  const shownLabels = useRef<Set<string> | null>(null);
  const revealing = useRef(0);
  useLayoutEffect(() => {
    if (!WEB || !props.reveal || motionOff()) return;
    const el = root.current as HTMLElement | null;
    if (!el?.querySelectorAll) return;
    const anims: Animation[] = [];
    const { order, t0Delay } = props.reveal;
    let end = 0;
    for (const [id, st] of order) {
      const delay = t0Delay + st.t;
      end = Math.max(end, delay + st.d);
      const sel = (k: string) => el.querySelectorAll(`[data-${k}="${CSS.escape(id)}"]`);
      if (st.mode === 'fade') {
        for (const k of ['n', 'e', 'l']) sel(k).forEach((x) => anims.push(x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: st.d, delay, easing: CSS_EASE.out, fill: 'backwards' })));
      } else {
        // 실이 부모에서 뻗어 나온 뒤 점이 달린다
        sel('e').forEach((x) => {
          const ln = x as SVGLineElement;
          const len = Math.hypot(+(ln.getAttribute('x2') ?? 0) - +(ln.getAttribute('x1') ?? 0), +(ln.getAttribute('y2') ?? 0) - +(ln.getAttribute('y1') ?? 0)) + 1;
          anims.push(ln.animate([{ strokeDasharray: `${len} ${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: '0' }], { duration: st.d * 0.6, delay, easing: CSS_EASE.out, fill: 'backwards' }));
        });
        sel('n').forEach((x) => {
          (x as any).style.transformBox = 'fill-box';
          (x as any).style.transformOrigin = 'center';
          anims.push(x.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: st.d * 0.6, delay: delay + st.d * 0.4, easing: CSS_EASE.out, fill: 'backwards' }));
        });
        sel('l').forEach((x) => anims.push(x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: st.d * 0.6, delay: delay + st.d * 0.4, easing: CSS_EASE.out, fill: 'backwards' })));
      }
    }
    revealing.current = performance.now() + end;
    return () => anims.forEach((a) => a.cancel());
  }, [props.reveal]);

  useLayoutEffect(() => {
    const ids = new Set(labels.map((l) => l.id));
    const before = shownLabels.current;
    shownLabels.current = ids;
    if (!WEB || !before || motionOff() || performance.now() < revealing.current) return;
    const el = root.current as HTMLElement | null;
    if (!el?.querySelectorAll) return;
    for (const id of ids) {
      if (before.has(id)) continue;
      el.querySelectorAll(`[data-l="${CSS.escape(id)}"]`).forEach((x) => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease', fill: 'backwards' }));
    }
  }, [labels]);

  useEffect(() => {
    props.onLabels?.(labels);
  }, [labels]);
  useLayoutEffect(() => {
    if (!t0) return;
    lastMs = performance.now() - t0;
    maxMs = Math.max(maxMs, lastMs);
  });

  return (
    <View ref={root} pointerEvents="none" style={{ width: W, height: H, overflow: 'visible' }}>
      <Svg width={W} height={H} style={{ overflow: 'visible' } as any}>
        <G>{edges}</G>
        <G>{rings}</G>
        <G>{dots}</G>
        <G>{pulses}</G>
        <G>{labelNodes}</G>
      </Svg>
    </View>
  );
}

export const GraphView = memo(GraphViewImpl);

/** 한 번 퍼지는 고리 하나. 웹은 브라우저 움직임(크기와 투명도), 앱은 Animated */
function PulseRingWeb({ pkey, x, y, r0, r1, color, delay, d }: { pkey: string; x: number; y: number; r0: number; r1: number; color: string; delay: number; d: number }) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (motionOff()) return;
    const el: SVGElement | null = ref.current?.elementRef?.current ?? null;
    if (!el || typeof el.animate !== 'function') return;
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
    const a = el.animate(
      [
        { opacity: 0.55, transform: `scale(${(r0 / r1).toFixed(4)})` },
        { opacity: 0, transform: 'scale(1)' },
      ],
      { duration: d, delay, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'none' },
    );
    return () => a.cancel();
  }, [pkey]);
  return <Circle ref={ref} cx={x} cy={y} r={r1} fill="none" stroke={color} strokeWidth={1.2} opacity={0} vectorEffect="non-scaling-stroke" />;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function PulseRingNative({ pkey, x, y, r0, r1, color, delay, d }: { pkey: string; x: number; y: number; r0: number; r1: number; color: string; delay: number; d: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (motionOff()) return;
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: d, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [pkey]);
  void NATIVE_DRIVER;
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      r={v.interpolate({ inputRange: [0, 1], outputRange: [r0, r1] }) as any}
      fill="none"
      stroke={color}
      strokeWidth={1.2}
      strokeOpacity={v.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.55, 0] }) as any}
    />
  );
}

const PulseRing = WEB ? PulseRingWeb : PulseRingNative;

/** 화면 자리 계산을 다시 내보낸다(해금 화면 등에서 같이 쓰도록) */
export type { Label, Rect, GKind };
