// 화면 전체가 같이 쓰는 움직임. 빠르게 시작해 부드럽게 멎는 한 가지 곡선만 쓴다.
// 기기에서 "동작 줄이기"를 켜 두면 모든 움직임을 건너뛰고 바로 끝 상태를 보여 준다.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native';

export const NATIVE_DRIVER = Platform.OS !== 'web';
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
export function Rise({ children, delay = 0, y = 12, trigger, style }: { children: React.ReactNode; delay?: number; y?: number; trigger?: unknown; style?: StyleProp<ViewStyle> }) {
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

/** 숫자가 from 에서 to 까지 세어 올라간다(ML.count). 동작 줄이기면 바로 to. */
export function useCount(to: number, { from = 0, duration = 900, delay = 0 }: { from?: number; duration?: number; delay?: number } = {}): number {
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
  return n;
}

/** 값이 바뀌는 순간 한 번 톡 튀는 크기. 읽음 표식과 체크 버튼에 쓴다. */
export function usePop(trigger: unknown): Animated.Value {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    v.setValue(0.72);
    Animated.spring(v, { toValue: 1, friction: 5, tension: 220, useNativeDriver: NATIVE_DRIVER }).start();
  }, [trigger]);
  return v;
}

/** 불러오는 동안 숨 쉬듯 옅어졌다 짙어지는 자리 표시. */
export function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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
