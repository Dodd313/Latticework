import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { todayKST } from '../dates';
import { EASE_OUT, NATIVE_DRIVER, Rise, motionOff, spring, useCount } from '../motion';
import { BOTTOM_PAD, useNav } from '../nav';
import { useGoals, useStore } from '../store';
import { LAT_GOAL, Q, Section, buildLat, buildVoc, levelOf, xpFor } from '../study';
import { useTheme } from '../theme';
import { Chip, Icon, LipButton, OptionState, OptionTile, ProgressBar, Rich, Ring, StatCard, T, Tap } from '../ui';

// 아래 단추 줄과 피드백 판의 아래 여백. 자체 주소에서는 아이폰 홈 막대 영역을 더한다.
const FOOT_PAD: any = typeof BOTTOM_PAD === 'number' ? 28 : 'calc(28px + env(safe-area-inset-bottom, 0px))';
const PANEL_PAD: any = typeof BOTTOM_PAD === 'number' ? 104 : 'calc(104px + env(safe-area-inset-bottom, 0px))';
const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

type Phase = 'answer' | 'hint' | 'right' | 'wrong' | 'think' | 'grade';
type Fb = { ok: boolean; title?: string; body?: string };

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
function SlideIn({ delay, children, style }: { delay: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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

/** 열릴 때 한 번: 투명에서 나타나며 y 만큼 올라오고 scale 에서 1 로. */
function Enter({ delay = 0, duration = 400, easing = EASE_OUT, y = 0, scale = 1, children, style }: { delay?: number; duration?: number; easing?: (x: number) => number; y?: number; scale?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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

/** 선택지 하나의 반응: 틀리면 옆으로 흔들리고, 맞으면 1.03 배로 한 번 커진다. */
function TileFx({ shake, pop, children, style }: { shake: number; pop: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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
          transform: [
            { translateX: sx.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -8, 7, -4, 2, 0] }) },
            { scale: sc.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.03, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** 막대 위 연속 정답 칩 "×N". 3 이상일 때 통 튀어나오고, 끊기면 사라진다. */
function Combo({ n }: { n: number }) {
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

/** 맞힌 순간 노란 "+10" 이 떠올라 경험치 숫자로 빨려 들어간다. */
function FlyXp({ amount, onDone }: { amount: number; onDone: () => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (motionOff()) {
      onDone();
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 880, delay: 180, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER });
    a.start(() => onDone());
    return () => a.stop();
  }, []);
  return (
    <Animated.View
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
        opacity: v.interpolate({ inputRange: [0, 0.3, 0.62, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 0.3, 0.62, 1], outputRange: [36, 20, -6, -30] }) },
          { translateX: v.interpolate({ inputRange: [0, 0.62, 1], outputRange: [-40, -16, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 0.3, 0.62, 1], outputRange: [0.3, 1, 0.95, 0.5] }) },
        ],
      }}
    >
      <Icon name="bolt" size={14} color={t.onYellow} />
      <T s={14} w="700" c={t.onYellow} mono lh={1.4}>
        +{amount}
      </T>
    </Animated.View>
  );
}

/** 채점 뒤 화면 아래 끝에서 올라오는 판. 단추는 제자리에 있고 판만 뒤에서 올라온다. */
function Panel({ fb, onHeight }: { fb: Fb | null; onHeight: (h: number) => void }) {
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
  const ok = shown.ok;
  const ink = ok ? t.greenText : t.redText;
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
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
        maxHeight: '78%',
        paddingTop: 20,
        paddingHorizontal: 16,
        paddingBottom: PANEL_PAD,
        backgroundColor: ok ? t.greenWeak : t.redWeak,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [h || 1000, 0] }) }],
      }}
    >
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} bounces={false}>
        <View style={{ flexDirection: 'row', alignItems: ok ? 'flex-start' : 'center', gap: 12 }}>
          <Animated.View
            accessible
            accessibilityLabel={ok ? '정답' : '오답'}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: [{ scale: ic }] }}
          >
            {ok ? <Icon name="check" size={20} color={t.green} sw={3.4} /> : <Icon name="x" size={18} color={t.red} sw={3.4} />}
          </Animated.View>
          {ok ? (
            shown.body ? (
              <Animated.View style={{ flex: 1, paddingTop: 5, opacity: tx }}>
                <Rich type="t6" w="600" c={ink}>
                  {shown.body}
                </Rich>
              </Animated.View>
            ) : null
          ) : (
            <Animated.View style={{ flex: 1, opacity: tx, transform: [{ translateX: tx.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
              <Rich type="t3" w="700" c={ink} style={{ letterSpacing: -0.3 }}>
                {shown.title ?? ''}
              </Rich>
            </Animated.View>
          )}
        </View>
        {!ok && shown.body ? (
          <Animated.View style={{ marginTop: 8, opacity: tx }}>
            <Rich type="t6" c={t.deck}>
              {shown.body}
            </Rich>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// 문제 풀이
// ─────────────────────────────────────────────────────────────

export function StudyScreen({ sect }: { sect: Section }) {
  const t = useTheme();
  const nav = useNav();
  const { studyData, study, recordStudy, studyAsked } = useStore();
  const goals = useGoals();
  const today = todayKST();
  const rec = study.days[today];
  const goal = sect === 'lat' ? (rec?.latGoal ?? LAT_GOAL) : (rec?.vocGoal ?? 0);
  const doneAtOpen = useRef(sect === 'lat' ? (rec?.lat ?? 0) : (rec?.voc ?? 0)).current;
  const streakAtOpen = useRef(goals.streak).current;
  const xpAtRound = useRef(study.xp);

  // 세션은 화면을 열 때 한 번 짠다. 오늘 목표가 남았으면 남은 만큼, 다 했으면 "더 풀기"로 연다.
  const first = useMemo<{ queue: Q[]; extra: boolean }>(() => {
    if (!studyData) return { queue: [], extra: false };
    const left = Math.max(0, goal - doneAtOpen);
    const now = new Date();
    const asked = studyAsked();
    if (left > 0) return { queue: sect === 'lat' ? buildLat(studyData, study, today, now, left, 'daily', asked) : buildVoc(studyData, study, today, now, 'daily', left, asked), extra: false };
    return { queue: [], extra: true };
  }, []);

  const [queue, setQueue] = useState<Q[]>(first.queue);
  const [, setExtra] = useState(first.extra);
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>(first.queue[0]?.reveal !== undefined ? 'think' : 'answer');
  const [picked, setPicked] = useState<number | null>(null);
  const [crossed, setCrossed] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [tally, setTally] = useState({ right: 0, total: 0, xp: 0 });
  const [exhausted, setExhausted] = useState(false);
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
      bolt.setValue(1.35);
      spring(bolt, 1, 'medium').start();
    }, flying.current ? 1060 : 0);
  }, [study.xp]);

  const q = queue[at];
  const finished = !q;
  const firstRun = queue.filter((x) => !x.retry).length;

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
      setFb({ ok: true, body: q.explain });
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
      setFb({ ok: false, title: q.options?.[q.answer] ?? '', body: q.explain });
    }
  };

  const selfGrade = (grade: 1 | 2 | 3) => {
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
        <Header onClose={nav.pop} value={0} hot={false} xp={shownXp} bolt={bolt} combo={0} />
        <View style={{ padding: 20 }}>
          <T type="t5" c={t.sub}>
            오프라인
          </T>
        </View>
      </View>
    );
  }

  if (finished) {
    return (
      <Finish
        key={round}
        tally={tally}
        xpFrom={xpAtRound.current}
        xpTo={study.xp}
        streakFrom={streakAtOpen}
        streakTo={goals.streak}
        exhausted={exhausted}
        onMore={more}
        onDone={nav.pop}
      />
    );
  }

  const kicker = q.kicker.split(' · ').pop() ?? q.kicker;
  const ox = isOX(q);

  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <Header onClose={nav.pop} value={firstRun ? filled / firstRun : 0} hot={combo >= 3} xp={shownXp} bolt={bolt} combo={combo} a11yValue={`${filled}/${firstRun}`} />
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
        <View key={`${round}-${at}-${q.key}`}>
          <SlideIn delay={100} style={{ marginBottom: 8 }}>
            <T type="t7" w="700" c={t.blue}>
              {kicker}
            </T>
          </SlideIn>
          <SlideIn delay={130} style={{ marginBottom: q.pre ? 16 : 28 }}>
            <Rich type="t3" w="700" role="heading" level={1} style={{ letterSpacing: -0.3 }}>
              {q.q}
            </Rich>
          </SlideIn>
          {q.pre ? (
            <SlideIn delay={145} style={{ marginBottom: 28, padding: 16, borderRadius: 16, backgroundColor: t.layer }}>
              <Rich type="t5" c={t.body}>
                {q.pre}
              </Rich>
            </SlideIn>
          ) : null}

          {q.options ? (
            <View accessibilityRole="radiogroup" style={{ flexDirection: ox ? 'row' : 'column', gap: 12 }}>
              {q.options.map((opt, i) => (
                <SlideIn key={i} delay={160 + i * 35} style={ox ? { flex: 1 } : null}>
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
function Header({ onClose, value, hot, xp, bolt, combo, a11yValue }: { onClose: () => void; value: number; hot: boolean; xp: number; bolt: Animated.Value; combo: number; a11yValue?: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, zIndex: 3 }}>
      <Tap onPress={onClose} label="홈(으)로 돌아가기" press="dim" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={24} color={t.faint} />
      </Tap>
      <Combo n={combo} />
      <ProgressBar value={value} hot={hot} style={{ flex: 1 }} a11yLabel={a11yValue ? `진행 ${a11yValue}` : undefined} />
      <View accessible accessibilityLabel={`경험치 ${xp}`} style={{ minWidth: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
        <Animated.View style={{ transform: [{ scale: bolt }, { rotate: bolt.interpolate({ inputRange: [1, 1.35], outputRange: ['0deg', '-12deg'] }) }] }}>
          <Icon name="bolt" size={18} color={t.yellow} />
        </Animated.View>
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
  onMore,
  onDone,
}: {
  tally: { right: number; total: number; xp: number };
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
  const accN = useCount(Math.round(acc * 100), { duration: 900, delay: 100 });
  const xpN = useCount(tally.xp, { duration: 600, delay: 420 });
  const rightN = useCount(tally.right, { duration: 500, delay: 420 });
  const stN = useCount(streakTo, { from: streakFrom, duration: 320, delay: 680 });
  const barN = useCount(up ? needFrom : curTo, { from: curFrom, duration: up ? 360 : 600, delay: BAR_AT });
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
  const [boxCur, boxNeed] = lvShown === lvTo && up ? [curTo, needTo] : [Math.round(barN), up ? needFrom : needTo];

  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24, gap: 22 }}>
        {any ? (
          <>
            <Enter duration={400} scale={0.94}>
              <Ring value={acc} a11yLabel={`정답률 ${Math.round(acc * 100)}%`}>
                <T s={36} w="800" mono lh={40 / 36} style={{ letterSpacing: -1 }}>
                  {Math.round(accN)}%
                </T>
              </Ring>
            </Enter>
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
              <Enter delay={260} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                <StatCard tone="yellow" icon="bolt" lead="bolt" value={`+${Math.round(xpN)}`} a11yLabel={`경험치 ${tally.xp}`} />
              </Enter>
              <Enter delay={320} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                <StatCard tone="green" icon="check" value={`${Math.round(rightN)}/${tally.total}`} a11yLabel={`정답 ${tally.right}/${tally.total}`} />
              </Enter>
              <Enter delay={380} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
                <StatCard tone="orange" icon="calFill" value={`${Math.round(stN)}일`} a11yLabel={`연속 ${streakTo}일`} />
              </Enter>
            </View>
          </>
        ) : null}
        <Enter delay={any ? 440 : 0} duration={320} y={10} style={{ alignSelf: 'stretch' }}>
          <LevelBox lv={lvShown} cur={boxCur} need={boxNeed} value={bar} />
        </Enter>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD, flexDirection: 'row', gap: 10 }}>
        {exhausted ? null : <LipButton label="더 풀기" tone="ghost" onPress={onMore} style={{ flex: 1 }} />}
        <LipButton label="계속" onPress={onDone} style={{ flex: 1 }} />
      </View>
      {lvUp ? <LevelUp from={lvFrom} to={lvTo} cur={curTo} need={needTo} onClose={() => setLvUp(false)} /> : null}
    </View>
  );
}

/** 회색 상자: "Lv.N" 과 경험치 숫자, 노란 막대(높이 12). */
function LevelBox({ lv, cur, need, value, hideLv }: { lv: number; cur: number; need: number; value: number; hideLv?: boolean }) {
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
          {cur} / {need}
        </T>
      </View>
      <ProgressBar value={value} height={12} color={t.yellow} a11yLabel={`Lv.${lv} ${cur}/${need}`} />
    </View>
  );
}

/** 레벨이 오른 순간의 화면: 파란 메달 숫자가 바뀌고, 새 레벨의 막대가 보인다. */
function LevelUp({ from, to, cur, need, onClose }: { from: number; to: number; cur: number; need: number; onClose: () => void }) {
  const t = useTheme();
  const fade = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  const medal = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  const roll = useRef(new Animated.Value(1)).current;
  const [n, setN] = useState(motionOff() ? to : from);
  useEffect(() => {
    if (motionOff()) return;
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.ease, useNativeDriver: NATIVE_DRIVER }).start();
    spring(medal, 1, 'bounce', { delay: 100 }).start();
    const id = setTimeout(() => {
      setN(to);
      roll.setValue(0);
      Animated.timing(roll, { toValue: 1, duration: 360, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    }, 620);
    return () => clearTimeout(id);
  }, []);
  const close = () => {
    if (motionOff()) return onClose();
    Animated.timing(fade, { toValue: 0, duration: 200, easing: Easing.ease, useNativeDriver: NATIVE_DRIVER }).start(() => onClose());
  };
  return (
    <Animated.View accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 30, backgroundColor: t.card, opacity: fade }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 }}>
        <Animated.View
          accessible
          accessibilityLabel={`Lv.${to}`}
          style={{
            width: 128,
            height: 134,
            opacity: medal.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: medal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
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
            <Animated.View style={{ opacity: roll, transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
              <T s={56} w="800" c="#ffffff" mono lh={60 / 56}>
                {n}
              </T>
            </Animated.View>
          </View>
        </Animated.View>
        <Enter delay={300} duration={300} y={8} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 300 }}>
            <LevelBox lv={to} cur={cur} need={need} value={cur / need} hideLv />
          </View>
        </Enter>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD }}>
        <LipButton label="확인" onPress={close} />
      </View>
    </Animated.View>
  );
}
