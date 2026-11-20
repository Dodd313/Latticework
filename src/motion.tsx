// 화면 전체가 같이 쓰는 움직임. 빠르게 시작해 부드럽게 멎는 한 가지 곡선만 쓴다.
// 기기에서 "동작 줄이기"를 켜 두면 모든 움직임을 건너뛰고 바로 끝 상태를 보여 준다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleProp, Text, View, ViewStyle } from 'react-native';

export const NATIVE_DRIVER = Platform.OS !== 'web';
/** 웹 빌드인지. 웹에서는 움직임을 브라우저(Web Animations)에 맡겨, 프레임마다 React 를 다시 그리지 않는다. */
export const WEB = Platform.OS === 'web';
/**
 * 움직이는 상자. 앱에서는 Animated.View, 웹에서는 그냥 View 다(웹의 움직임은 ref 로 브라우저에 건다).
 * 웹에서 쓸 때는 style 에 Animated 값을 넣지 않는다.
 */
export const MView: typeof Animated.View = (WEB ? View : Animated.View) as any;
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** 시안(motion-lab v5)의 나가는 곡선 cubic-bezier(0.23, 1, 0.32, 1) */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** 시트와 안쪽 화면이 들어오는 곡선 cubic-bezier(0.32, 0.72, 0, 1) */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
/** 위 세 곡선의 CSS 표기(웹에서 브라우저에 직접 맡기는 움직임용) */
export const CSS_EASE = { ease: 'cubic-bezier(0.22, 1, 0.36, 1)', out: 'cubic-bezier(0.23, 1, 0.32, 1)', sheet: 'cubic-bezier(0.32, 0.72, 0, 1)' } as const;

/**
 * 웹 전용: 화면 요소에 브라우저 움직임(Web Animations)을 건다. 웹이 아니거나 걸 수 없으면 null.
 * Animated 와 달리 프레임마다 React 를 다시 그리지 않고, 시작 시각을 실제로 처음 그려지는 프레임에 맞춘다.
 * 그래서 화면을 붙이는 데 시간이 걸려도 움직임 앞부분이 잘려 나가지 않는다.
 * ref 는 react-native-web View 의 ref(DOM 요소)다.
 */
export function webAnimate(ref: React.RefObject<unknown>, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (Platform.OS !== 'web') return null;
  const el = ref.current as HTMLElement | null;
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(keyframes, opts);
}

/** 웹 전용: 브라우저 움직임 a 를 멈추고, 멈춘 순간 요소의 transform 을 돌려준다(이어서 다른 움직임을 걸 때). */
export function webStop(ref: React.RefObject<unknown>, a: Animation | null, rest: string): string {
  if (Platform.OS !== 'web' || !a) return rest;
  const el = ref.current as HTMLElement | null;
  const now = a.playState === 'running' && el ? getComputedStyle(el).transform : rest;
  a.cancel();
  return now && now !== 'none' ? now : rest;
}

/** Toss 디자인 시스템(@toss/tds-mobile)의 스프링 값. 질량 1. */
export const SPRING = {
  quick: { stiffness: 800, damping: 55, mass: 1 }, // 패널, 눌림
  medium: { stiffness: 270, damping: 25, mass: 1 }, // 막대
  bounce: { stiffness: 300, damping: 15, mass: 1 }, // 체크, 메달
} as const;
export type SpringName = keyof typeof SPRING;
type SpringCfg = { stiffness: number; damping: number; mass: number };

// ─────────────────────────────────────────────────────────────
// 웹: Animated 와 같은 곡선을 브라우저 움직임으로 옮기는 도구
// ─────────────────────────────────────────────────────────────

/** Animated 의 interpolate 와 같은 계산(기본은 양 끝 구간을 그대로 늘림, clamp 면 끝 값에서 멈춤). */
export function lerp(x: number, inR: readonly number[], outR: readonly number[], clamp = false): number {
  const n = inR.length;
  let i = 1;
  while (i < n - 1 && x > inR[i]) i++;
  if (clamp) {
    if (x <= inR[0]) return outR[0];
    if (x >= inR[n - 1]) return outR[n - 1];
  }
  const a = inR[i - 1];
  const b = inR[i];
  const k = b === a ? 0 : (x - a) / (b - a);
  return outR[i - 1] + (outR[i] - outR[i - 1]) * k;
}

const FRAME = 1000 / 60;
const springCache = new Map<string, number[]>();

/**
 * 스프링이 from 에서 to 로 가는 자리를 1/60초마다 적은 값들. Animated.spring(초기 속도 0)과 같은 식과
 * 같은 멈춤 기준(속도와 거리 모두 0.001 이하)을 쓴다. 마지막 값은 정확히 to.
 */
function springSamples(c: SpringCfg, from: number, to: number): number[] {
  const key = `${c.stiffness}/${c.damping}/${c.mass}/${from}/${to}`;
  const hit = springCache.get(key);
  if (hit) return hit;
  const { stiffness: k, damping: d, mass: m } = c;
  const zeta = d / (2 * Math.sqrt(k * m));
  const w0 = Math.sqrt(k / m);
  const w1 = w0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const x0 = to - from;
  const out: number[] = [from];
  for (let i = 1; i < 600; i++) {
    const t = (i * FRAME) / 1000;
    let pos: number;
    let vel: number;
    if (zeta < 1) {
      const env = Math.exp(-zeta * w0 * t);
      const a = (zeta * w0 * x0) / w1;
      pos = to - env * (a * Math.sin(w1 * t) + x0 * Math.cos(w1 * t));
      vel = zeta * w0 * env * (Math.sin(w1 * t) * a + x0 * Math.cos(w1 * t)) - env * (Math.cos(w1 * t) * zeta * w0 * x0 - w1 * x0 * Math.sin(w1 * t));
    } else {
      const env = Math.exp(-w0 * t);
      pos = to - env * (x0 + w0 * x0 * t);
      vel = env * (t * x0 * w0 * w0);
    }
    if (Math.abs(vel) <= 0.001 && Math.abs(to - pos) <= 0.001) break;
    out.push(pos);
  }
  out.push(to);
  springCache.set(key, out);
  return out;
}

/** 움직임 한 가지: 시간과 곡선(timing) 또는 스프링 이름이나 값(spring). */
export type Curve = { duration: number; easing?: (x: number) => number } | { spring: SpringName | SpringCfg };

/** 브라우저 움직임 하나와, 그 움직임이 지나는 값들(중간에 끊을 때 지금 값을 알아내는 데 쓴다). */
export type Tween = { anim: Animation; values: number[]; from: number; to: number };

function samplesOf(curve: Curve, from: number, to: number): { values: number[]; duration: number } {
  if ('spring' in curve) {
    const cfg = typeof curve.spring === 'string' ? SPRING[curve.spring] : curve.spring;
    const values = springSamples(cfg, from, to);
    return { values, duration: Math.max(FRAME, (values.length - 1) * FRAME) };
  }
  const ease = curve.easing ?? Easing.inOut(Easing.ease);
  const n = Math.max(2, Math.ceil(curve.duration / FRAME) + 1);
  const values: number[] = [];
  for (let i = 0; i < n; i++) values.push(from + (to - from) * ease(i / (n - 1)));
  values[n - 1] = to;
  return { values, duration: Math.max(1, curve.duration) };
}

/** 웹 요소(ref 또는 요소). react-native-web 의 View ref 는 DOM 요소다. */
type Target = React.RefObject<unknown> | HTMLElement | Element | null | undefined;
function elOf(target: Target): HTMLElement | null {
  if (!target) return null;
  const el = ('current' in (target as any) ? (target as any).current : target) as HTMLElement | null;
  return el && typeof el.animate === 'function' ? el : null;
}

/**
 * 웹 전용: 값 v 를 from 에서 to 로 curve 대로 옮기는 움직임을, frame(v) 로 만든 장면들로 브라우저에 맡긴다.
 * Animated 와 같은 곡선과 같은 interpolate 결과를 1/60초 간격으로 미리 계산해 두므로 모양은 같고,
 * 움직이는 동안 JavaScript 와 React 는 일하지 않는다. 웹이 아니거나 요소가 없으면 null.
 * fill 기본값 'backwards': 기다리는 동안(delay)은 첫 장면을 보이고, 끝나면 React 가 그린 모습(끝 상태)으로 돌아간다.
 */
export function webTween(target: Target, curve: Curve, frame: (v: number) => Keyframe, opts: { from?: number; to?: number; delay?: number; fill?: FillMode; iterations?: number } = {}): Tween | null {
  if (!WEB) return null;
  const el = elOf(target);
  if (!el) return null;
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const { values, duration } = samplesOf(curve, from, to);
  const last = values.length - 1;
  const frames = values.map((v, i) => ({ ...frame(v), offset: i / last }));
  const anim = el.animate(frames, { duration, delay: opts.delay ?? 0, easing: 'linear', fill: opts.fill ?? 'backwards', iterations: opts.iterations ?? 1 });
  return { anim, values, from, to };
}

/** 움직임이 지금 지나고 있는 값. 아직 기다리는 중이면 시작 값, 끝났거나 없으면 끝 값(없으면 rest). */
export function tweenValue(tw: Tween | null | undefined, rest: number): number {
  if (!tw) return rest;
  const { anim, values } = tw;
  if (anim.playState === 'finished' || anim.playState === 'idle') return tw.to;
  const p = anim.effect?.getComputedTiming().progress;
  if (p == null) return tw.from;
  const x = p * (values.length - 1);
  const i = Math.min(values.length - 2, Math.floor(x));
  return values[i] + (values[i + 1] - values[i]) * (x - i);
}

/** 브라우저 움직임을 멈추고, 멈춘 순간의 값을 돌려준다(이어서 다른 움직임을 걸 때). */
export function tweenStop(tw: Tween | null | undefined, rest: number): number {
  const v = tweenValue(tw, rest);
  tw?.anim.cancel();
  return v;
}

/** Animated.spring 의 friction/tension 값을 stiffness/damping 으로 바꾼다(Animated 와 같은 식). */
export function origami(tension: number, friction: number): SpringCfg {
  return { stiffness: (tension - 30) * 3.62 + 194, damping: (friction - 8) * 3 + 25, mass: 1 };
}

/** 웹 전용: 옆으로 흔들기(translateX). input/output 은 Animated interpolate 와 같은 표. */
export function webShake(target: Target, input: readonly number[], output: readonly number[], duration: number, easing: (x: number) => number): Tween | null {
  return webTween(target, { duration, easing }, (v) => ({ transform: `translateX(${lerp(v, input, output)}px)` }));
}

/** Toss 스프링으로 값을 옮긴다. 동작 줄이기가 켜져 있으면 바로 끝 값으로 둔다. */
export function spring(v: Animated.Value, toValue: number, name: SpringName = 'quick', opts: { delay?: number; native?: boolean } = {}): Animated.CompositeAnimation {
  const a = Animated.spring(v, { toValue, ...SPRING[name], delay: opts.delay ?? 0, useNativeDriver: opts.native ?? NATIVE_DRIVER });
  if (reduce) {
    v.setValue(toValue);
    return { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => {}, reset: () => {} } as Animated.CompositeAnimation;
  }
  return a;
}

let reduce = false;
const listeners = new Set<(v: boolean) => void>();
const setReduce = (v: boolean) => {
  reduce = !!v;
  listeners.forEach((l) => l(reduce));
};
try {
  AccessibilityInfo.isReduceMotionEnabled()
    .then(setReduce)
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
} catch {
  // 알 수 없으면 움직임을 켠 채로 둔다.
}

export function motionOff(): boolean {
  return reduce;
}

export function useReduceMotion(): boolean {
  const [v, setV] = useState(reduce);
  useEffect(() => {
    listeners.add(setV);
    setV(reduce);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

/** 아래에서 살짝 올라오며 나타난다. trigger 값이 바뀌면 다시 재생한다. */
type RiseProps = { children: React.ReactNode; delay?: number; y?: number; trigger?: unknown; style?: StyleProp<ViewStyle> };

function RiseNative({ children, delay = 0, y = 12, trigger, style }: RiseProps) {
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 480, delay, easing: EASE, useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [trigger]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}>{children}</Animated.View>;
}

/** 웹: 같은 움직임(480ms, 같은 곡선)을 브라우저에 맡긴다. 그리기 전에 걸어 첫 장면부터 투명하다. */
function RiseWeb({ children, delay = 0, y = 12, trigger, style }: RiseProps) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (reduce) return;
    const a = webAnimate(ref, [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 480, delay, easing: CSS_EASE.ease, fill: 'backwards' });
    return () => a?.cancel();
  }, [trigger]);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}

export const Rise = WEB ? RiseWeb : RiseNative;

type CountProps = { to: number; from?: number; duration?: number; delay?: number; format?: (n: number) => string };
const round = (n: number) => String(Math.round(n));

/** 앱: 숫자가 from 에서 to 까지 세어 올라간다(ML.count). 이 글자만 다시 그린다. */
function CountNative({ to, from = 0, duration = 900, delay = 0, format = round }: CountProps) {
  const [n, setN] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) {
      setN(to);
      return;
    }
    const v = new Animated.Value(from);
    const id = v.addListener(({ value }) => setN(value));
    const a = Animated.timing(v, { toValue: to, duration, delay, easing: EASE_OUT, useNativeDriver: false });
    a.start();
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [to]);
  return <Text>{format(n)}</Text>;
}

/**
 * 웹: 같은 곡선으로 세어 올라가되, React 를 다시 그리지 않고 글자 마디만 고쳐 쓴다.
 * React 는 끝 숫자를 그려 두고, 그리기 전에 시작 숫자로 바꿔 둔 뒤 프레임마다 숫자가 바뀔 때만 쓴다.
 */
function CountWeb({ to, from = 0, duration = 900, delay = 0, format = round }: CountProps) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    const write = (s: string) => {
      const node = el.firstChild;
      if (node && node.nodeType === 3) {
        if (node.nodeValue !== s) node.nodeValue = s;
      } else el.textContent = s;
    };
    if (reduce) return write(format(to));
    write(format(from));
    let t0 = -1;
    let id = requestAnimationFrame(function tick(ts) {
      if (t0 < 0) t0 = ts;
      const p = Math.max(0, Math.min(1, (ts - t0 - delay) / duration));
      write(format(p >= 1 ? to : from + (to - from) * EASE_OUT(p)));
      if (p < 1) id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [to]);
  return <Text ref={ref}>{format(to)}</Text>;
}

/** 세어 올라가는 숫자. 글자(T) 안에 넣는다. 동작 줄이기면 바로 to. */
export const Count = WEB ? CountWeb : CountNative;

/**
 * 값이 바뀌는 순간 한 번 톡 튀는 크기. 읽음 표식과 체크 버튼에 쓴다.
 * 돌려준 ref 와 style 을 MView 에 붙인다(앱은 style 의 Animated 값, 웹은 ref 에 거는 브라우저 움직임).
 */
const POP = origami(220, 5);
function usePopNative(trigger: unknown): { ref: React.RefObject<any>; style: any } {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const ref = useRef<any>(null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    v.setValue(0.72);
    Animated.spring(v, { toValue: 1, friction: 5, tension: 220, useNativeDriver: NATIVE_DRIVER }).start();
  }, [trigger]);
  return { ref, style: { transform: [{ scale: v }] } };
}
function usePopWeb(trigger: unknown): { ref: React.RefObject<any>; style: any } {
  const ref = useRef<any>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    const tw = webTween(ref, { spring: POP }, (v) => ({ transform: `scale(${v})` }), { from: 0.72, to: 1 });
    return () => tw?.anim.cancel();
  }, [trigger]);
  return { ref, style: null };
}
export const usePop = WEB ? usePopWeb : usePopNative;

/** 불러오는 동안 숨 쉬듯 옅어졌다 짙어지는 자리 표시. */
function PulseNative({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.35, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, []);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}
function PulseWeb({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (reduce) return;
    const q = Easing.inOut(Easing.quad);
    // 0.8초 동안 1 → 0.35, 다시 0.8초 동안 0.35 → 1 을 되풀이한다.
    const tw = webTween(ref, { duration: 1600, easing: (x) => (x < 0.5 ? q(x * 2) : 1 - q(x * 2 - 1)) }, (v) => ({ opacity: 1 - 0.65 * v }), { iterations: Infinity });
    return () => tw?.anim.cancel();
  }, []);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
export const Pulse = WEB ? PulseWeb : PulseNative;
