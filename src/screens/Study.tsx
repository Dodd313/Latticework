import React, { useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { cheerCorrect, cheerFinish, cheerLevel, cheerWrong, seedOf } from '../cheer';
import { dayDiff, kstDate, todayKST } from '../dates';
import { LattiSays, lattiSay, useLattiSay } from '../latti';
import { Count, EASE_OUT, MView, NATIVE_DRIVER, Rise, Tween, WEB, lerp, motionOff, spring, tweenStop, lateBy, SinceCtx, useLater, webTween } from '../motion';
import { BOTTOM_PAD, useNav } from '../nav';
import { useGoals, useStore } from '../store';
import { LAT_GOAL, Q, Section, buildLat, buildLatFocus, buildVoc, levelOf, xpFor } from '../study';
import { useTheme } from '../theme';
import { Chip, Icon, LipButton, OptionState, OptionTile, ProgressBar, Rich, Ring, StatCard, T, Tap } from '../ui';

// 아래 단추 줄과 피드백 판의 아래 여백. 자체 주소에서는 아이폰 홈 막대 영역을 더한다.
export const FOOT_PAD: any = typeof BOTTOM_PAD === 'number' ? 28 : 'calc(28px + env(safe-area-inset-bottom, 0px))';
export const PANEL_PAD: any = typeof BOTTOM_PAD === 'number' ? 104 : 'calc(104px + env(safe-area-inset-bottom, 0px))';
const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

type Phase = 'answer' | 'hint' | 'right' | 'wrong' | 'think' | 'grade';
/**
 * cheer: 판 머리의 한 줄. latti 면 Latti 말풍선으로, 아니면 예전 응원 문장 자리에 그린다.
 * title 은 오답이면 정답 보기, 정답이면 머리 글자(없으면 "정답" 또는 cheer). aside 는 머리 오른쪽 짧은 값(수리의 걸린 시간),
 * note 는 풀이 위의 굵은 한 줄(수리의 틀린 이유).
 */
export type Fb = { ok: boolean; title?: string; cheer?: string; latti?: boolean; body?: string; aside?: string; note?: string };

/** 레벨 안에서의 경험치: [현재, 다음 레벨까지 필요한 양] */
function within(xp: number, lv: number): [number, number] {
  const start = 60 * (lv - 1) * (lv - 1);
  return [Math.max(0, xp - start), 60 * lv * lv - start];
}

const isOX = (q: Q) => q.options?.length === 2 && q.options[0] === '맞다' && q.options[1] === '틀리다';
const GLYPH = ['○', '✕'];

// ─────────────────────────────────────────────────────────────
// 움직임 조각
// ─────────────────────────────────────────────────────────────

/** 오른쪽에서 32 밀려 들어온다(Toss quick 스프링). */
type SlideInProps = { delay: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; /** 웹: 이 시각에 시작한 것처럼 맞춘다(나중에 그린 부분용) */ since?: number };
function SlideInNative({ delay, children, style }: SlideInProps) {
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    const a = spring(v, 1, 'quick', { delay });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
const slideIn = (v: number) => ({ opacity: Math.max(0, Math.min(1, v)), transform: `translateX(${32 * (1 - v)}px)` });
/** 웹: 같은 스프링을 미리 계산해 브라우저에 맡긴다. 그리기 전에 걸어 첫 장면부터 제자리 밖에 있다. */
function SlideInWeb({ delay, children, style, since }: SlideInProps) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (motionOff()) return;
    const tw = webTween(ref, { spring: 'quick' }, slideIn, { delay: delay - lateBy(since) });
    return () => tw?.anim.cancel();
  }, []);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
export const SlideIn = WEB ? SlideInWeb : SlideInNative;

/** 열릴 때 한 번: 투명에서 나타나며 y 만큼 올라오고 scale 에서 1 로. */
type EnterProps = { delay?: number; duration?: number; easing?: (x: number) => number; y?: number; scale?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> };
function EnterNative({ delay = 0, duration = 400, easing = EASE_OUT, y = 0, scale = 1, children, style }: EnterProps) {
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (motionOff()) return;
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
function EnterWeb({ delay = 0, duration = 400, easing = EASE_OUT, y = 0, scale = 1, children, style }: EnterProps) {
  const ref = useRef<any>(null);
  const since = useContext(SinceCtx);
  useLayoutEffect(() => {
    if (motionOff()) return;
    const tw = webTween(ref, { duration, easing }, (v) => ({ opacity: lerp(v, [0, 0.4, 1], [0, 1, 1], true), transform: `translateY(${y * (1 - v)}px) scale(${scale + (1 - scale) * v})` }), { delay: delay - lateBy(since), stops: [0.4] });
    return () => tw?.anim.cancel();
  }, []);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
export const Enter = WEB ? EnterWeb : EnterNative;

/** 선택지 하나의 반응: 틀리면 옆으로 흔들리고, 맞으면 1.03 배로 한 번 커진다. */
const TILE_SHAKE: [number[], number[]] = [
  [0, 0.2, 0.4, 0.6, 0.8, 1],
  [0, -8, 7, -4, 2, 0],
];
const TILE_POP: [number[], number[]] = [
  [0, 0.35, 1],
  [1, 1.03, 1],
];
type TileFxProps = { shake: number; pop: number; children: React.ReactNode; style?: StyleProp<ViewStyle> };
function TileFxNative({ shake, pop, children, style }: TileFxProps) {
  const sx = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shake || motionOff()) return;
    sx.setValue(0);
    Animated.timing(sx, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
  }, [shake]);
  useEffect(() => {
    if (!pop || motionOff()) return;
    sc.setValue(0);
    Animated.timing(sc, { toValue: 1, duration: 320, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, [pop]);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateX: sx.interpolate({ inputRange: TILE_SHAKE[0], outputRange: TILE_SHAKE[1] }) }, { scale: sc.interpolate({ inputRange: TILE_POP[0], outputRange: TILE_POP[1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
function TileFxWeb({ shake, pop, children, style }: TileFxProps) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (!shake || motionOff()) return;
    webTween(ref, { duration: 380, easing: Easing.out(Easing.quad) }, (v) => ({ transform: `translateX(${lerp(v, TILE_SHAKE[0], TILE_SHAKE[1])}px)` }), { stops: TILE_SHAKE[0] });
  }, [shake]);
  useLayoutEffect(() => {
    if (!pop || motionOff()) return;
    webTween(ref, { duration: 320, easing: EASE_OUT }, (v) => ({ transform: `scale(${lerp(v, TILE_POP[0], TILE_POP[1])})` }), { stops: TILE_POP[0] });
  }, [pop]);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
const TileFx = WEB ? TileFxWeb : TileFxNative;

/** 막대 위 연속 정답 칩 "×N". 3 이상일 때 통 튀어나오고, 끊기면 사라진다. */
function ComboNative({ n }: { n: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(n);
  const on = n >= 3;
  useEffect(() => {
    if (on) {
      setShown(n);
      v.setValue(0);
      const a = spring(v, 1, 'bounce', { delay: 260 });
      a.start();
      return () => a.stop();
    }
    const a = Animated.timing(v, { toValue: 0, duration: 160, useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [n]);
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      style={{
        position: 'absolute',
        left: 56,
        top: 2,
        zIndex: 3,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
      }}
    >
      <Chip tone="hot" label={`×${shown}`} />
    </Animated.View>
  );
}
const comboFrame = (v: number) => ({ opacity: Math.max(0, Math.min(1, v)), transform: `translateY(${4 * (1 - v)}px) scale(${0.7 + 0.3 * v})` });
/** 웹: 보이는 정도를 브라우저 움직임이 붙들고 있다(React 는 숨긴 모습만 그린다). 끊기면 지금 자리에서 사라진다. */
function ComboWeb({ n }: { n: number }) {
  const ref = useRef<any>(null);
  const tw = useRef<Tween | null>(null);
  const [shown, setShown] = useState(n);
  const on = n >= 3;
  if (on && shown !== n) setShown(n);
  useLayoutEffect(() => {
    const from = tweenStop(tw.current, 0);
    if (motionOff()) {
      tw.current = webTween(ref, { duration: 1 }, comboFrame, { from: on ? 1 : 0, to: on ? 1 : 0, fill: 'forwards' });
      return;
    }
    tw.current = on ? webTween(ref, { spring: 'bounce' }, comboFrame, { from: 0, to: 1, delay: 260, fill: 'both' }) : from > 0 ? webTween(ref, { duration: 160 }, comboFrame, { from, to: 0, fill: 'forwards' }) : null;
  }, [n]);
  return (
    <View ref={ref} pointerEvents="none" aria-hidden style={{ position: 'absolute', left: 56, top: 2, zIndex: 3, opacity: 0 }}>
      <Chip tone="hot" label={`×${shown}`} />
    </View>
  );
}
const Combo = WEB ? ComboWeb : ComboNative;

/** 맞힌 순간 노란 "+10" 이 떠올라 경험치 숫자로 빨려 들어간다. */
const FLY_STOPS = [0, 0.3, 0.62, 1];
function FlyXp({ amount, onDone }: { amount: number; onDone: () => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const ref = useRef<any>(null);
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) {
      onDone();
      return;
    }
    if (WEB) {
      // 웹: 같은 시간(180ms 기다린 뒤 880ms, 일정한 빠르기)과 같은 경로를 브라우저에 맡긴다.
      const tw = webTween(
        ref,
        { duration: 880, easing: Easing.linear },
        (x) => ({
          opacity: lerp(x, FLY_STOPS, [0, 1, 1, 0]),
          transform: `translateY(${lerp(x, FLY_STOPS, [36, 20, -6, -30])}px) translateX(${lerp(x, [0, 0.62, 1], [-40, -16, 0])}px) scale(${lerp(x, FLY_STOPS, [0.3, 1, 0.95, 0.5])})`,
        }),
        { delay: 180, fill: 'both', stops: FLY_STOPS },
      );
      if (!tw) {
        onDone();
        return;
      }
      tw.anim.onfinish = () => onDone();
      return () => {
        tw.anim.onfinish = null;
        tw.anim.cancel();
      };
    }
    const a = Animated.timing(v, { toValue: 1, duration: 880, delay: 180, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER });
    a.start(() => onDone());
    return () => a.stop();
  }, []);
  return (
    <MView
      ref={ref}
      pointerEvents="none"
      aria-hidden
      style={{
        position: 'absolute',
        right: 16,
        top: 44,
        zIndex: 4,
        height: 28,
        paddingLeft: 7,
        paddingRight: 10,
        borderRadius: 14,
        backgroundColor: t.yellow,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        ...(WEB
          ? { opacity: 0 }
          : {
              opacity: v.interpolate({ inputRange: FLY_STOPS, outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: FLY_STOPS, outputRange: [36, 20, -6, -30] }) },
                { translateX: v.interpolate({ inputRange: [0, 0.62, 1], outputRange: [-40, -16, 0] }) },
                { scale: v.interpolate({ inputRange: FLY_STOPS, outputRange: [0.3, 1, 0.95, 0.5] }) },
              ],
            }),
      }}
    >
      <Icon name="bolt" size={14} color={t.onYellow} />
      <T s={14} w="700" c={t.onYellow} mono lh={1.4}>
        +{amount}
      </T>
    </MView>
  );
}

/** 채점 뒤 화면 아래 끝에서 올라오는 판. 단추는 제자리에 있고 판만 뒤에서 올라온다. */
function PanelNative({ fb, onHeight }: { fb: Fb | null; onHeight: (h: number) => void }) {
  const t = useTheme();
  const [shown, setShown] = useState<Fb | null>(fb);
  const [h, setH] = useState(0);
  const [n, setN] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  const ic = useRef(new Animated.Value(0)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (fb) {
      started.current = false;
      v.setValue(0);
      ic.setValue(0);
      tx.setValue(0);
      setShown(fb);
      setN((x) => x + 1);
      return;
    }
    if (!shown) return;
    onHeight(0);
    if (motionOff()) {
      setShown(null);
      return;
    }
    const a = Animated.timing(v, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start(({ finished }) => finished && setShown(null));
    return () => a.stop();
  }, [fb]);
  if (!shown) return null;
  return (
    <Animated.View
      key={n}
      onLayout={(e) => {
        const height = e.nativeEvent.layout.height;
        setH(height);
        onHeight(height);
        if (started.current) return;
        started.current = true;
        spring(v, 1, 'quick').start();
        spring(ic, 1, 'bounce', { delay: 90 }).start();
        if (motionOff()) tx.setValue(1);
        else Animated.timing(tx, { toValue: 1, duration: 220, delay: 120, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
      }}
      accessibilityLiveRegion="polite"
      style={[PANEL_BOX, { backgroundColor: shown.ok ? t.greenWeak : t.redWeak, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [h || 1000, 0] }) }] }]}
    >
      <PanelBody shown={shown} ic={{ transform: [{ scale: ic }] }} tx={{ opacity: tx, transform: [{ translateX: tx.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }} body={{ opacity: tx }} />
    </Animated.View>
  );
}

/**
 * 웹: 같은 스프링(판 quick, 아이콘 bounce 90ms 뒤)과 같은 글자 움직임(220ms, 120ms 뒤)을 브라우저에 맡긴다.
 * 판이 내려가 있는 자리는 translateY(100%) 라서 높이를 재기 전 첫 장면부터 화면 밖에 있다. 닫힐 때는 지금 자리에서 내려간다.
 */
function PanelWeb({ fb, onHeight }: { fb: Fb | null; onHeight: (h: number) => void }) {
  const t = useTheme();
  const [shown, setShown] = useState<Fb | null>(fb);
  const [n, setN] = useState(0);
  const box = useRef<any>(null);
  const icon = useRef<any>(null);
  const text = useRef<any>(null);
  const body = useRef<any>(null);
  const enter = useRef<Tween | null>(null);
  if (fb && fb !== shown) {
    setShown(fb);
    setN((x) => x + 1);
  }
  useLayoutEffect(() => {
    if (!fb || !shown) return;
    if (motionOff()) return;
    enter.current = webTween(box, { spring: 'quick' }, (v) => ({ transform: `translateY(${(1 - v) * 100}%)` }));
    webTween(icon, { spring: 'bounce' }, (v) => ({ transform: `scale(${v})` }), { delay: 90 });
    const txt = (v: number) => ({ opacity: v, transform: `translateX(${-6 * (1 - v)}px)` });
    webTween(text, { duration: 220, easing: EASE_OUT }, txt, { delay: 120 });
    webTween(body, { duration: 220, easing: EASE_OUT }, (v) => ({ opacity: v }), { delay: 120 });
  }, [n]);
  useLayoutEffect(() => {
    if (fb || !shown) return;
    onHeight(0);
    const from = tweenStop(enter.current, 1);
    enter.current = null;
    const out = motionOff() ? null : webTween(box, { duration: 200, easing: Easing.in(Easing.cubic) }, (v) => ({ transform: `translateY(${(1 - v) * 100}%)` }), { from, to: 0, fill: 'forwards' });
    if (!out) {
      setShown(null);
      return;
    }
    out.anim.onfinish = () => setShown(null);
    return () => {
      out.anim.onfinish = null;
    };
  }, [fb]);
  if (!shown) return null;
  return (
    <View key={n} ref={box} onLayout={(e) => fb && onHeight(e.nativeEvent.layout.height)} accessibilityLiveRegion="polite" style={[PANEL_BOX, { backgroundColor: shown.ok ? t.greenWeak : t.redWeak }]}>
      <PanelBody shown={shown} iconRef={icon} textRef={text} bodyRef={body} />
    </View>
  );
}
export const Panel = WEB ? PanelWeb : PanelNative;

const PANEL_BOX: ViewStyle = { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, maxHeight: '78%', paddingTop: 20, paddingHorizontal: 16, paddingBottom: PANEL_PAD };

/** 판 안쪽: 정답·오답 아이콘, 응원 한 줄, 풀이. 움직임은 바깥에서 style(앱) 이나 ref(웹)로 건다. */
function PanelBody({ shown, ic, tx, body, iconRef, textRef, bodyRef }: { shown: Fb; ic?: any; tx?: any; body?: any; iconRef?: React.RefObject<any>; textRef?: React.RefObject<any>; bodyRef?: React.RefObject<any> }) {
  const t = useTheme();
  const ok = shown.ok;
  const ink = ok ? t.greenText : t.redText;
  return (
    <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} bounces={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MView
          ref={iconRef}
          accessible
          accessibilityLabel={ok ? '정답' : '오답'}
          style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, ic]}
        >
          {ok ? <Icon name="check" size={20} color={t.green} sw={3.4} /> : <Icon name="x" size={18} color={t.red} sw={3.4} />}
        </MView>
        <MView ref={textRef} style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, tx]}>
          <View style={{ flex: 1 }}>
            {ok ? (
              <T type="t3" w="700" c={ink}>
                {shown.title ?? (shown.latti ? '정답' : (shown.cheer ?? ''))}
              </T>
            ) : (
              <>
                <Rich type="t3" w="700" c={ink} style={{ letterSpacing: -0.3 }}>
                  {shown.title ?? ''}
                </Rich>
                {shown.cheer && !shown.latti ? (
                  <T type="t6" w="600" c={ink} style={{ marginTop: 2 }}>
                    {shown.cheer}
                  </T>
                ) : null}
              </>
            )}
          </View>
          {shown.aside ? (
            <T s={17} w="700" c={ink} mono lh={1.4} style={ok ? null : { opacity: 0.8 }}>
              {shown.aside}
            </T>
          ) : null}
        </MView>
      </View>
      {shown.latti && shown.cheer ? <LattiSays text={shown.cheer} size={24} bubble="m" tone="white" delay={160} style={{ marginTop: 14, alignSelf: 'flex-start' }} /> : null}
      {shown.body || shown.note ? (
        <MView ref={bodyRef} style={[{ marginTop: 8, gap: 6 }, body]}>
          {shown.note ? (
            <T type="t6" w="700" c={ink}>
              {shown.note}
            </T>
          ) : null}
          {!shown.body ? null : ok ? (
            <Rich type="t6" w="600" c={ink}>
              {shown.body}
            </Rich>
          ) : (
            <Rich type="t6" c={t.deck}>
              {shown.body}
            </Rich>
          )}
        </MView>
      ) : null}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 문제 풀이
// ─────────────────────────────────────────────────────────────

/** focus: 그 개념(또는 지식 노드 id)부터 묻는 Latticework 세션(지식 탭의 복습하기). 같은 노드의 개념이 이어 나온다. */
export function StudyScreen({ sect, focus }: { sect: Section; focus?: string }) {
  const t = useTheme();
  const nav = useNav();
  const { studyData, study, recordStudy, studyAsked, latti, lattiHist, noteLatti } = useStore();
  const lattiSrc = { latti, lattiHist, noteLatti };
  const goals = useGoals();
  const today = todayKST();
  const rec = study.days[today];
  const goal = sect === 'lat' ? (rec?.latGoal ?? LAT_GOAL) : (rec?.vocGoal ?? 0);
  const doneAtOpen = useRef(sect === 'lat' ? (rec?.lat ?? 0) : (rec?.voc ?? 0)).current;
  const streakAtOpen = useRef(goals.streak).current;
  // 오늘 추가 학습 수는 구역을 나누지 않고 센다. 이 화면을 연 뒤 늘어난 만큼이 이 구역의 추가 학습이다.
  const extraAtOpen = useRef(rec?.extra ?? 0).current;
  const xpAtRound = useRef(study.xp);

  // 세션은 화면을 열 때 한 번 짠다. 오늘 목표가 남았으면 남은 만큼, 다 했으면 "추가 학습"으로 연다.
  const first = useMemo<{ queue: Q[]; extra: boolean }>(() => {
    if (!studyData) return { queue: [], extra: false };
    const left = Math.max(0, goal - doneAtOpen);
    const now = new Date();
    const asked = studyAsked();
    if (sect === 'lat' && focus) {
      // 복습하기: 그 개념부터. 오늘 분량이 남았으면 남은 만큼, 다 했으면 추가 학습 5문제.
      return { queue: buildLatFocus(studyData, study, today, now, focus, left > 0 ? left : 5, asked), extra: left === 0 };
    }
    if (left > 0) return { queue: sect === 'lat' ? buildLat(studyData, study, today, now, left, 'daily', asked) : buildVoc(studyData, study, today, now, 'daily', left, asked), extra: false };
    // 오늘 분량을 이미 마쳤으면 빈 화면 대신 바로 추가 학습으로 연다.
    return { queue: sect === 'lat' ? buildLat(studyData, study, today, now, 5, 'weak', asked) : buildVoc(studyData, study, today, now, 'weak', 8, asked), extra: true };
  }, []);

  const [queue, setQueue] = useState<Q[]>(first.queue);
  const [extra, setExtra] = useState(first.extra);
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>(first.queue[0]?.reveal !== undefined ? 'think' : 'answer');
  const [picked, setPicked] = useState<number | null>(null);
  const [crossed, setCrossed] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [tally, setTally] = useState({ right: 0, total: 0, xp: 0 });
  const [exhausted, setExhausted] = useState(first.extra && first.queue.length === 0);
  const [round, setRound] = useState(0);
  // 화면 장식: 채운 칸 수, 연속 정답, 판, 선택지 반응, 경험치 표시
  const [filled, setFilled] = useState(0);
  const [combo, setCombo] = useState(0);
  const [fb, setFb] = useState<Fb | null>(null);
  const [panelH, setPanelH] = useState(0);
  const [ansShown, setAnsShown] = useState(false);
  const [fx, setFx] = useState<{ i: number; kind: 'shake' | 'pop'; n: number }>({ i: -1, kind: 'pop', n: 0 });
  const [fly, setFly] = useState<{ id: number; amount: number } | null>(null);
  const [shownXp, setShownXp] = useState(study.xp);
  const flying = useRef(false);
  const bolt = useRef(new Animated.Value(1)).current;
  const boltRef = useRef<any>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, motionOff() ? 0 : ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const shownAt = useRef(Date.now());

  // 경험치 숫자는 날아간 "+N" 이 닿을 때 바뀌고, 번개가 한 번 튄다.
  useEffect(() => {
    if (study.xp <= shownXp) {
      setShownXp(study.xp);
      return;
    }
    later(() => {
      setShownXp(study.xp);
      if (motionOff()) return;
      if (WEB) {
        webTween(boltRef, { spring: 'medium' }, boltFrame, { from: 1.35, to: 1 });
        return;
      }
      bolt.setValue(1.35);
      spring(bolt, 1, 'medium').start();
    }, flying.current ? 1060 : 0);
  }, [study.xp]);

  // Latti 가 부르는 개념 이름(Latticework 만. 영단어 표현은 이름으로 부르지 않는다).
  const conceptName = useMemo(() => {
    const m = new Map<string, string>();
    studyData?.concepts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [studyData]);
  // 연달아 틀린 수(정답이면 0). Latti 의 오답 한 줄에 쓴다.
  const missRun = useRef(0);

  const q = queue[at];
  const finished = !q;
  const firstRun = queue.filter((x) => !x.retry).length;
  // 웹: 새 문제(나타나기 전 100ms 넘게 투명하다)는 누른 순간의 장면을 먼저 그린 뒤 이어서 그린다.
  // 그 사이 지난 문제는 원래처럼 바로 사라지고, 새 문제의 움직임 시각(qSince 기준)은 처음 계획과 같다.
  const qKey = q ? `${round}-${at}-${q.key}` : '';
  const deferredKey = useDeferredValue(qKey, WEB ? '' : qKey);
  const shownKey = WEB ? deferredKey : qKey;
  const qSince = useRef(0);
  useLayoutEffect(() => {
    qSince.current = performance.now();
  }, [qKey]);

  const open = (index: number, list: Q[]) => {
    setAt(index);
    setPicked(null);
    setCrossed([]);
    setAttempts(0);
    setFb(null);
    setAnsShown(false);
    setPhase(list[index]?.reveal !== undefined ? 'think' : 'answer');
    shownAt.current = Date.now();
  };

  const settle = (grade: 1 | 2 | 3, ok: boolean, tries: number): Q[] => {
    if (!q) return queue;
    recordStudy(q, { ok, attempts: tries, sec: (Date.now() - shownAt.current) / 1000, grade });
    if (!q.retry) setTally((s) => ({ right: s.right + (grade === 3 ? 1 : 0), total: s.total + 1, xp: s.xp + xpFor(grade) }));
    // 막대는 끝난 문제만큼 찬다. 틀려서 다시 낼 문제는 다시 풀 때 찬다.
    if (q.retry || grade !== 1) setFilled((f) => f + 1);
    setCombo((c) => (grade === 1 ? 0 : c + 1));
    // 틀린 문제는 세션 끝에 한 번 더 낸다.
    if (grade === 1 && !q.retry) {
      const next = [...queue, { ...q, retry: true }];
      setQueue(next);
      return next;
    }
    return queue;
  };

  const check = () => {
    if (!q || picked === null || q.answer === undefined) return;
    const tries = attempts + 1;
    setAttempts(tries);
    if (picked === q.answer) {
      const grade = tries === 1 ? 3 : 2;
      settle(grade, true, tries);
      setPhase('right');
      missRun.current = 0;
      const card = study.cards[q.unit];
      const gap = card && !q.retry ? dayDiff(kstDate(card.last), today) : undefined;
      const said = lattiSay(
        lattiSrc,
        'correct',
        { combo: combo + 1, idx: at, firstTry: tries === 1, gap, concept: sect === 'lat' ? conceptName.get(q.unit) : undefined },
        `${today}:${sect}:${round}:${at}:${q.key}:right`,
        () => cheerCorrect({ combo: combo + 1, idx: at, firstTry: tries === 1, seed: seedOf(today, sect, round, at, q.key, 'right') }),
      );
      setFb({ ok: true, cheer: said.text ?? undefined, latti: said.latti && !!said.text, body: q.explain });
      setFx((f) => ({ i: picked, kind: 'pop', n: f.n + 1 }));
      if (!q.retry) {
        flying.current = true;
        setFly((f) => ({ id: (f?.id ?? 0) + 1, amount: xpFor(grade) }));
      }
    } else if (tries === 1 && !q.retry && (q.options?.length ?? 0) > 2) {
      setCrossed((c) => [...c, picked]);
      setFx((f) => ({ i: picked, kind: 'shake', n: f.n + 1 }));
      setPicked(null);
      setCombo(0);
      setPhase('hint');
    } else {
      settle(1, false, tries);
      setPhase('wrong');
      setFx((f) => ({ i: picked, kind: 'shake', n: f.n + 1 }));
      later(() => setAnsShown(true), 240);
      missRun.current += 1;
      const said = lattiSay(
        lattiSrc,
        'wrong',
        { miss: missRun.current, concept: sect === 'lat' ? conceptName.get(q.unit) : undefined },
        `${today}:${sect}:${round}:${at}:${q.key}:wrong`,
        () => cheerWrong({ seed: seedOf(today, sect, round, at, q.key, 'wrong') }),
      );
      setFb({ ok: false, title: q.options?.[q.answer] ?? '', cheer: said.text ?? undefined, latti: said.latti && !!said.text, body: q.explain });
    }
  };

  const selfGrade = (grade: 1 | 2 | 3) => {
    missRun.current = grade === 1 ? missRun.current + 1 : 0;
    open(at + 1, settle(grade, grade !== 1, 1));
  };

  const more = () => {
    if (!studyData) return;
    const now = new Date();
    const asked = studyAsked();
    const list = sect === 'lat' ? buildLat(studyData, study, today, now, 5, 'weak', asked) : buildVoc(studyData, study, today, now, 'weak', 8, asked);
    xpAtRound.current = study.xp;
    setExhausted(list.length === 0);
    setExtra(true);
    setQueue(list);
    setTally({ right: 0, total: 0, xp: 0 });
    setFilled(0);
    setCombo(0);
    setRound((r) => r + 1);
    open(0, list);
  };

  const settled = phase === 'right' || phase === 'wrong';
  const last = at + 1 >= queue.length;

  const stateOf = (i: number): OptionState => {
    if (!q) return 'idle';
    if (phase === 'right') return i === picked ? 'correct' : 'idle';
    if (phase === 'wrong') {
      if (i === picked || crossed.includes(i)) return 'wrong';
      if (i === q.answer) return ansShown ? 'correct' : 'idle';
      return 'dim';
    }
    if (crossed.includes(i)) return 'wrong';
    return picked === i ? 'selected' : 'idle';
  };

  if (!studyData) {
    return (
      <View style={{ flex: 1, backgroundColor: t.card }}>
        <Header onClose={nav.pop} value={0} hot={false} xp={shownXp} bolt={bolt} boltRef={boltRef} combo={0} />
        <View style={{ padding: 20 }}>
          <T type="t5" c={t.sub}>
            오프라인
          </T>
        </View>
      </View>
    );
  }

  if (finished) {
    const recNow = study.days[today];
    const doneNow = sect === 'lat' ? (recNow?.lat ?? 0) : (recNow?.voc ?? 0);
    const goalNow = sect === 'lat' ? (recNow?.latGoal ?? goal) : (recNow?.vocGoal ?? goal);
    const extraNow = recNow?.extra ?? 0;
    const name = sect === 'lat' ? 'Latticework' : '영단어';
    // 푼 문제가 없을 때는 오늘 분량을 정말 마친 경우에만 한 줄을 건넨다.
    const solvedNow = doneNow + Math.max(0, extraNow - extraAtOpen);
    const lastUnit = sect === 'lat' ? [...queue].reverse().find((x) => !x.retry)?.unit : undefined;
    const said =
      tally.total === 0 && doneNow < goalNow
        ? { text: null, latti: false }
        : lattiSay(
            lattiSrc,
            'finish',
            {
              total: tally.total,
              right: tally.total > 0 ? tally.right : undefined,
              solvedToday: solvedNow,
              streak: goals.streak,
              streakUp: goals.streak > streakAtOpen,
              extra,
              sect,
              concept: lastUnit ? conceptName.get(lastUnit) : undefined,
            },
            `${today}:${sect}:${round}:finish`,
            () =>
              cheerFinish({
                sect,
                extra,
                total: tally.total,
                right: tally.right,
                solvedToday: solvedNow,
                extraToday: extraNow,
                streakDays: goals.streak,
                streakUp: goals.streak > streakAtOpen,
                levelUp: levelOf(study.xp) > levelOf(xpAtRound.current),
                seed: seedOf(today, sect, round, 'finish'),
              }).headline,
          );
    const headline = said.text;
    return (
      <Finish
        key={round}
        tally={tally}
        xpFrom={xpAtRound.current}
        xpTo={study.xp}
        streakFrom={streakAtOpen}
        streakTo={goals.streak}
        exhausted={exhausted}
        label={extra ? `${name} 추가 학습` : name}
        headline={headline}
        latti={said.latti}
        onMore={more}
        onDone={nav.pop}
      />
    );
  }

  const kicker = q.kicker.split(' · ').pop() ?? q.kicker;
  const ox = isOX(q);

  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <Header onClose={nav.pop} value={firstRun ? filled / firstRun : 0} hot={combo >= 3} xp={shownXp} bolt={bolt} boltRef={boltRef} combo={combo} a11yValue={`${filled}/${firstRun}`} extra={extra} />
      {fly ? (
        <FlyXp
          key={fly.id}
          amount={fly.amount}
          onDone={() => {
            flying.current = false;
            setFly(null);
          }}
        />
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 + (settled ? panelH : 0) }}>
        {shownKey === qKey ? (
          <View key={qKey}>
            <SlideIn delay={100} since={qSince.current} style={{ marginBottom: 8 }}>
              <T type="t7" w="700" c={t.blue}>
                {kicker}
              </T>
            </SlideIn>
            <SlideIn delay={130} since={qSince.current} style={{ marginBottom: q.pre ? 16 : 28 }}>
              <Rich type="t3" w="700" role="heading" level={1} style={{ letterSpacing: -0.3 }}>
                {q.q}
              </Rich>
            </SlideIn>
            {q.pre ? (
              <SlideIn delay={145} since={qSince.current} style={{ marginBottom: 28, padding: 16, borderRadius: 16, backgroundColor: t.layer }}>
                <Rich type="t5" c={t.body}>
                  {q.pre}
                </Rich>
              </SlideIn>
          ) : null}

          {q.options ? (
            <View accessibilityRole="radiogroup" style={{ flexDirection: ox ? 'row' : 'column', gap: 12 }}>
              {q.options.map((opt, i) => (
                <SlideIn key={i} delay={160 + i * 35} since={qSince.current} style={ox ? { flex: 1 } : null}>
                  <TileFx shake={fx.i === i && fx.kind === 'shake' ? fx.n : 0} pop={fx.i === i && fx.kind === 'pop' ? fx.n : 0}>
                    <OptionTile
                      state={stateOf(i)}
                      a11yLabel={opt}
                      center={ox}
                      disabled={settled || crossed.includes(i)}
                      onPress={() => setPicked(i)}
                      style={ox ? { minHeight: 148 } : null}
                    >
                      {(ink: string) =>
                        ox ? (
                          <T s={44} w="700" c={ink} lh={1} center>
                            {GLYPH[i]}
                          </T>
                        ) : (
                          <Rich type="t5" w="600" c={ink} style={{ flex: 1 }}>
                            {opt}
                          </Rich>
                        )
                      }
                    </OptionTile>
                  </TileFx>
                </SlideIn>
              ))}
            </View>
          ) : null}

          {phase === 'hint' && q.hint ? (
            <Rise y={8} style={{ marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: t.orangeWeak }}>
              <Rich type="t6" c={t.body}>
                {q.hint}
              </Rich>
            </Rise>
          ) : null}

          {phase === 'grade' ? (
            <Rise y={8} style={{ padding: 16, borderRadius: 16, backgroundColor: t.layer }}>
              <Rich type="t5" c={t.body}>
                {q.reveal}
              </Rich>
            </Rise>
          ) : null}
        </View>
        ) : null}
      </ScrollView>

      <Panel fb={fb} onHeight={setPanelH} />

      <View style={{ zIndex: 3, paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD, flexDirection: 'row', gap: 10 }}>
        {phase === 'think' ? <LipButton label="답 보기" onPress={() => setPhase('grade')} style={{ flex: 1 }} /> : null}
        {phase === 'grade' ? (
          <>
            <LipButton label="몰랐다" tone="ghost" onPress={() => selfGrade(1)} style={{ flex: 1 }} />
            <LipButton label="애매했다" tone="ghost" onPress={() => selfGrade(2)} style={{ flex: 1 }} />
            <LipButton label="알았다" onPress={() => selfGrade(3)} style={{ flex: 1 }} />
          </>
        ) : null}
        {phase === 'answer' || phase === 'hint' ? <LipButton label="확인" tone={picked === null ? 'off' : 'blue'} onPress={check} style={{ flex: 1 }} /> : null}
        {settled ? <LipButton label={last ? '마치기' : '계속'} tone={phase === 'right' ? 'green' : 'red'} onPress={() => open(at + 1, queue)} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}

/** 위쪽 줄: 닫기 X, 높이 16 진행 막대(연속 정답 3 이상이면 주황), 번개와 누적 경험치. */
/** 번개의 크기와 기울기: 1.35 배에서 1 로 돌아오며 -12도에서 바로 선다(Animated interpolate 와 같은 계산). */
const boltFrame = (v: number) => ({ transform: `scale(${v}) rotate(${lerp(v, [1, 1.35], [0, -12])}deg)` });

function Header({ onClose, value, hot, xp, bolt, boltRef, combo, a11yValue, extra }: { onClose: () => void; value: number; hot: boolean; xp: number; bolt: Animated.Value; boltRef: React.RefObject<any>; combo: number; a11yValue?: string; extra?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, zIndex: 3 }}>
      <Tap onPress={onClose} label="홈(으)로 돌아가기" press="dim" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={24} color={t.faint} />
      </Tap>
      <Combo n={combo} />
      {extra ? <Chip label="추가 학습" tone="neutral" style={{ alignSelf: 'center' }} /> : null}
      <ProgressBar value={value} hot={hot} style={{ flex: 1 }} a11yLabel={a11yValue ? `진행 ${a11yValue}` : undefined} />
      <View accessible accessibilityLabel={`경험치 ${xp}`} style={{ minWidth: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
        <MView ref={boltRef} style={WEB ? null : { transform: [{ scale: bolt }, { rotate: bolt.interpolate({ inputRange: [1, 1.35], outputRange: ['0deg', '-12deg'] }) }] }}>
          <Icon name="bolt" size={18} color={t.yellow} />
        </MView>
        <T s={15} w="700" c={t.deck} mono lh={1.4}>
          {xp}
        </T>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 학습 완료
// ─────────────────────────────────────────────────────────────

function Finish({
  tally,
  xpFrom,
  xpTo,
  streakFrom,
  streakTo,
  exhausted,
  label,
  headline,
  latti,
  onMore,
  onDone,
}: {
  tally: { right: number; total: number; xp: number };
  label: string;
  headline: string | null;
  /** headline 이 Latti 의 한 줄이면 말풍선으로 그린다 */
  latti?: boolean;
  xpFrom: number;
  xpTo: number;
  streakFrom: number;
  streakTo: number;
  exhausted: boolean;
  onMore: () => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const any = tally.total > 0;
  const acc = any ? tally.right / tally.total : 0;
  const lvFrom = levelOf(xpFrom);
  const lvTo = levelOf(xpTo);
  const up = lvTo > lvFrom;
  const [curFrom, needFrom] = within(xpFrom, lvFrom);
  const [curTo, needTo] = within(xpTo, lvTo);

  // 경험치 막대: 처음 값에서 시작해 잠시 뒤 새 값으로 찬다. 레벨이 오르면 끝까지 찬 뒤 레벨 화면을 띄운다.
  const BAR_AT = any ? 940 : 0;
  const [bar, setBar] = useState(curFrom / needFrom);
  const [lvUp, setLvUp] = useState(false);
  const [lvShown, setLvShown] = useState(lvFrom);
  // 세어 올라가는 숫자는 저마다 작은 글자(Count)가 맡는다. 프레임마다 이 화면 전체를 다시 그리지 않는다.
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => (motionOff() ? 0 : ms);
    ids.push(setTimeout(() => setBar(up ? 1 : curTo / needTo), wait(BAR_AT)));
    if (up) {
      ids.push(
        setTimeout(() => {
          setLvUp(true);
          setLvShown(lvTo);
          setBar(curTo / needTo);
        }, wait(BAR_AT + 560)),
      );
    }
    return () => ids.forEach(clearTimeout);
  }, []);
  // 구역 이름은 작게, 응원 한 줄을 크게. Latti 의 한 줄이면 표식 아래 말풍선으로.
  const heading = headline ? (
    <Enter delay={any ? 140 : 0} duration={320} y={8} style={{ alignSelf: 'stretch', alignItems: 'center', gap: latti ? 14 : 4 }}>
      <T type="t6" w="600" c={t.sub} center role={latti ? 'heading' : undefined} level={1}>
        {label}
      </T>
      {latti ? (
        <LattiSays text={headline} size={36} bubble="l" side="bottom" delay={any ? 220 : 80} style={{ alignSelf: 'stretch' }} />
      ) : (
        <T type="t2" w="700" center role="heading" level={1}>
          {headline}
        </T>
      )}
    </Enter>
  ) : null;
  // 웹: 링 아래(140ms 넘게 투명하다)는 첫 장면을 그린 뒤 이어서 그린다. 움직임과 숫자 세기의 시각은 같다.
  const later = useLater();
  const rest = later.ready || !any;
  const [boxCur, boxNeed]: [React.ReactNode, number] =
    lvShown === lvTo && up ? [curTo, needTo] : [<Count key="bar" from={curFrom} to={up ? needFrom : curTo} duration={up ? 360 : 600} delay={BAR_AT} />, up ? needFrom : needTo];

  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24, gap: 22 }}>
        {any ? (
          <>
            <Enter duration={400} scale={0.94}>
              <Ring value={acc} a11yLabel={`정답률 ${Math.round(acc * 100)}%`}>
                <T s={36} w="800" mono lh={40 / 36} style={{ letterSpacing: -1 }}>
                  <Count to={Math.round(acc * 100)} duration={900} delay={100} />%
                </T>
                <T s={13} w="600" c={t.mute} lh={1.4}>
                  정답률
                </T>
              </Ring>
            </Enter>
            {rest ? (
              <SinceCtx.Provider value={later.since}>
                {heading}
                <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
                  <Enter delay={260} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                    <StatCard tone="yellow" icon="bolt" label="경험치" num={<>+<Count to={tally.xp} duration={600} delay={420} /></>} a11yLabel={`경험치 ${tally.xp}`} />
                  </Enter>
                  <Enter delay={320} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                    <StatCard tone="green" icon="check" label="정답" num={<><Count to={tally.right} duration={500} delay={420} />/{tally.total}</>} a11yLabel={`정답 ${tally.right}/${tally.total}`} />
                  </Enter>
                  <Enter delay={380} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                    <StatCard tone="orange" icon="calFill" label="연속" num={<><Count from={streakFrom} to={streakTo} duration={320} delay={680} />일</>} a11yLabel={`연속 ${streakTo}일`} />
                  </Enter>
                </View>
              </SinceCtx.Provider>
            ) : null}
          </>
        ) : (
          heading
        )}
        {rest ? (
          <SinceCtx.Provider value={later.since}>
            <Enter delay={any ? 440 : 0} duration={320} y={10} style={{ alignSelf: 'stretch' }}>
              <LevelBox lv={lvShown} cur={boxCur} a11yCur={lvShown === lvTo && up ? curTo : up ? needFrom : curTo} need={boxNeed} value={bar} />
            </Enter>
          </SinceCtx.Provider>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD, flexDirection: 'row', gap: 10 }}>
        {exhausted ? null : <LipButton label="추가 학습" tone="ghost" onPress={onMore} style={{ flex: 1 }} />}
        <LipButton label="계속" onPress={onDone} style={{ flex: 1 }} />
      </View>
      {lvUp ? <LevelUp from={lvFrom} to={lvTo} cur={curTo} need={needTo} onClose={() => setLvUp(false)} /> : null}
    </View>
  );
}

/** 회색 상자: "Lv.N" 과 경험치 숫자, 노란 막대(높이 12). */
function LevelBox({ lv, cur, need, value, hideLv, a11yCur }: { lv: number; cur: React.ReactNode; need: number; value: number; hideLv?: boolean; a11yCur?: number }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'stretch', padding: 16, borderRadius: 16, backgroundColor: t.p.grey100, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: hideLv ? 'flex-end' : 'space-between', alignItems: 'center' }}>
        {hideLv ? null : (
          <T type="t6" w="600" c={t.sub}>
            Lv.
            <T type="t6" w="600" c={t.ink} mono>
              {lv}
            </T>
          </T>
        )}
        <T type="t6" w="600" c={t.sub} mono>
          {cur} / {need} XP
        </T>
      </View>
      <ProgressBar value={value} height={12} color={t.yellow} a11yLabel={`Lv.${lv} ${a11yCur ?? cur}/${need}`} />
    </View>
  );
}

/** 레벨이 오른 순간의 화면: 파란 메달 숫자가 바뀌고, 새 레벨의 막대가 보인다. */
function LevelUp({ from, to, cur, need, onClose }: { from: number; to: number; cur: number; need: number; onClose: () => void }) {
  const t = useTheme();
  const fade = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  const medal = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  const roll = useRef(new Animated.Value(1)).current;
  const [n, setN] = useState(motionOff() ? to : from);
  const level = useLattiSay('level', { level: to }, `level:${todayKST()}:${to}`, () => cheerLevel({ level: to, seed: seedOf(todayKST(), 'level', to) }));
  const line = level.text;
  // 웹: 같은 시간과 곡선을 브라우저에 맡긴다. 숫자가 바뀌는 순간(620ms)에만 React 가 다시 그린다.
  const root = useRef<any>(null);
  const medalRef = useRef<any>(null);
  const rollRef = useRef<any>(null);
  const fadeTw = useRef<Tween | null>(null);
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) return;
    if (WEB) {
      fadeTw.current = webTween(root, { duration: 220, easing: Easing.ease }, (v) => ({ opacity: v }));
      webTween(medalRef, { spring: 'bounce' }, (v) => ({ opacity: Math.max(0, Math.min(1, v)), transform: `scale(${0.6 + 0.4 * v})` }), { delay: 100 });
      const id = setTimeout(() => setN(to), 620);
      return () => clearTimeout(id);
    }
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.ease, useNativeDriver: NATIVE_DRIVER }).start();
    spring(medal, 1, 'bounce', { delay: 100 }).start();
    const id = setTimeout(() => {
      setN(to);
      roll.setValue(0);
      Animated.timing(roll, { toValue: 1, duration: 360, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    }, 620);
    return () => clearTimeout(id);
  }, []);
  // 웹: 숫자가 바뀐 장면부터 아래에서 굴러 올라온다.
  const rolled = useRef(false);
  useLayoutEffect(() => {
    if (!WEB || n !== to || n === from || rolled.current || motionOff()) return;
    rolled.current = true;
    webTween(rollRef, { duration: 360, easing: EASE_OUT }, (v) => ({ opacity: v, transform: `translateY(${24 * (1 - v)}px)` }));
  }, [n]);
  const close = () => {
    if (motionOff()) return onClose();
    if (WEB) {
      const from = tweenStop(fadeTw.current, 1);
      const out = webTween(root, { duration: 200, easing: Easing.ease }, (v) => ({ opacity: v }), { from, to: 0, fill: 'forwards' });
      if (out) out.anim.onfinish = () => onClose();
      else onClose();
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: 200, easing: Easing.ease, useNativeDriver: NATIVE_DRIVER }).start(() => onClose());
  };
  return (
    <MView ref={root} accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 30, backgroundColor: t.card, opacity: WEB ? 1 : fade }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 }}>
        <MView
          ref={medalRef}
          accessible
          accessibilityLabel={`Lv.${to}`}
          style={{
            width: 128,
            height: 134,
            ...(WEB
              ? null
              : {
                  opacity: medal.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [{ scale: medal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
                }),
          }}
        >
          <View style={{ position: 'absolute', left: 0, top: 6, width: 128, height: 128, borderRadius: 36, backgroundColor: t.blueLip }} />
          <View style={{ width: 128, height: 128, borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
              <Svg width={128} height={128}>
                <Defs>
                  <LinearGradient id="medal" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={t.p.blue400} />
                    <Stop offset="0.5" stopColor={t.p.blue500} />
                    <Stop offset="1" stopColor={t.p.blue700} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={128} height={128} fill="url(#medal)" />
              </Svg>
            </View>
            <MView ref={rollRef} style={WEB ? null : { opacity: roll, transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
              <T s={56} w="800" c="#ffffff" mono lh={60 / 56}>
                {n}
              </T>
            </MView>
          </View>
        </MView>
        <Enter delay={640} duration={320} y={8} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
          {level.latti ? (
            <LattiSays text={line} size={28} bubble="m" delay={700} style={{ maxWidth: '100%' }} />
          ) : (
            <T type="t3" w="700" center>
              {line}
            </T>
          )}
        </Enter>
        <Enter delay={300} duration={300} y={8} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 300 }}>
            <LevelBox lv={to} cur={cur} need={need} value={cur / need} hideLv />
          </View>
        </Enter>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD }}>
        <LipButton label="확인" onPress={close} />
      </View>
    </MView>
  );
}
