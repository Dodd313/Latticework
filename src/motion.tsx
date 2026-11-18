// 화면 전체가 같이 쓰는 움직임. 빠르게 시작해 부드럽게 멎는 한 가지 곡선만 쓴다.
// 기기에서 "동작 줄이기"를 켜 두면 모든 움직임을 건너뛰고 바로 끝 상태를 보여 준다.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native';

export const NATIVE_DRIVER = Platform.OS !== 'web';
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

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

/** 왼쪽에서 오른쪽으로 그어지는 괘선. */
export function RuleDraw({ color, height, delay = 0 }: { color: string; height: number; delay?: number }) {
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const a = Animated.timing(v, { toValue: 1, duration: 620, delay, easing: EASE, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <View style={{ height }} aria-hidden>
      <Animated.View style={{ height, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
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
