// 주간, 월간 돌아보기(시안 motion-lab/v8/recap.html). 시작 화면(그리고 해금) 다음에 카드 한 더미로 놓인다.
//
// 화면 어디를 눌러도 다음 장이다(끌기, 밀기 없음). 맨 위 카드가 14px 떠오르며 1.025배로 커진 뒤 왼쪽 위로 기울며 빠지고(520ms),
// 뒤 카드가 medium 스프링으로 올라와 자리를 잡는다. 오른쪽 위 X 로 닫고, 마지막 장은 "계속"으로 나간다.
// 카드의 내용(숫자 세기, 막대, Latti 한 줄)은 그 카드가 맨 위에 온 순간에 붙어 움직이기 시작한다.
// 웹의 움직임은 모두 브라우저(webTween, Element.animate)가 맡고, React 는 장이 바뀔 때만 다시 그린다.
import React, { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { addDays, monthDays, weekdayOf } from '../dates';
import { HeatWeek } from '../heatBand';
import { LattiAvatar, LattiSays, useLattiLine } from '../latti';
import { CSS_EASE, Count, EASE_OUT, NATIVE_DRIVER, Rise, SPRING, SinceCtx, WEB, motionOff, webAnimate, webTween } from '../motion';
import { BOTTOM_PAD } from '../nav';
import { quizScore, type Period, type PeriodStats } from '../period';
import { QuizRunner } from '../quizKit';
import { useGoals, useKnowledge, usePeriodStats, useStore, weeklyReviewFor } from '../store';
import { latPeriodQuiz, vocKind } from '../study';
import { fitBox } from '../graph/camera';
import { GraphView, Pulse, RevealStep } from '../graph/GraphView';
import { getModel } from '../graph/layout';
import { dayDiff } from '../dates';
import { useTheme } from '../theme';
import type { Review } from '../types';
import { Icon, PrimaryButton, T, Tap } from '../ui';
import { rgbaOf } from './Unlock';

type Due = { show: Period; alsoSeen: string[] };
type Kind = 'period' | 'lat' | 'voc' | 'news' | 'close';

const PEEK = 12;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const lvStart = (l: number) => 60 * (l - 1) * (l - 1);
const lvRange = (l: number) => 60 * (2 * l - 1);
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
const dot = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 카드 자리. r 은 맨 위에서 몇 번째인가(-1 은 빠진 카드). 웹 CSS 글. */
function poseCss(r: number, cw: number): string {
  if (r < 0) return `translate3d(${-1.25 * cw}px, -90px, 0px) rotate(-12deg) scale(1.02)`;
  const q = Math.min(r, 2);
  return `translate3d(0px, ${PEEK * q}px, 0px) rotate(0deg) scale(${(1 - 0.06 * q).toFixed(3)})`;
}
const LIFT = 'translate3d(0px, -14px, 0px) rotate(-1.5deg) scale(1.025)';

export function RecapDeck({ due, go, onDone }: { due: Due; go: boolean; onDone: () => void }) {
  const t = useTheme();
  const s = useStore();
  const stats = usePeriodStats(due.show)!;
  const { width, height } = useWindowDimensions();
  const W = Math.min(width, 560);
  const cardW = W - 40;
  const CH = Math.max(460, height - 76 - PEEK * 2 - 28);
  const kinds = useMemo<Kind[]>(() => (s.studyData ? ['period', 'lat', 'voc', 'news', 'close'] : ['period', 'news', 'close']), [!!s.studyData]);
  const N = kinds.length;
  const [cur, setCur] = useState(0);
  const prev = useRef(0);
  const [quiz, setQuiz] = useState<Review | null>(null);
  // 웹: 누른 순간에는 카드 자리만 옮기고(가벼운 그리기, 움직임은 브라우저가 맡는다), 새 맨 위 카드의 내용은
  // 다음 그리기에서 나눠 붙인다. 그래서 누르는 순간 긴 작업이 움직임 시작을 막지 않는다. since 로 내용의 움직임 시각은 누른 때에 맞춘다.
  const [filled, setFilled] = useState(0);
  const tapAt = useRef(0);
  useEffect(() => {
    if (!WEB || filled >= cur) return;
    startTransition(() => setFilled(cur));
  }, [cur]);
  const shown = WEB ? filled : cur;

  // 첫 장이 보이면 그 기간(월간이면 겹친 주간도)을 본 것으로 적는다.
  useEffect(() => {
    if (go) s.markSeen('recap', [due.show.key, ...due.alsoSeen]);
  }, [go]);

  const slotRefs = useRef<Record<number, any>>({});
  const veilRefs = useRef<Record<number, any>>({});
  const segRefs = useRef<Record<number, any>>({});
  const pos = useRef<Record<number, Animated.Value>>({});
  // 새로 붙는 카드는 지난 장 기준 자리에서 시작한다(그 뒤 effect 가 새 자리로 옮긴다).
  const posOf = (k: number) => (pos.current[k] ??= new Animated.Value(Math.min(3, k - prev.current)));

  // 장이 바뀌면: 빠지는 카드는 들렸다가 왼쪽 위로, 뒤 카드는 한 칸씩 앞으로.
  (WEB ? useLayoutEffect : useEffect)(() => {
    const k0 = prev.current;
    prev.current = cur;
    if (cur === k0 || motionOff()) {
      if (!WEB) for (let k = Math.max(0, cur - 1); k < Math.min(N, cur + 3); k++) posOf(k).setValue(k - cur);
      return;
    }
    if (WEB) {
      const anims: (Animation | null | undefined)[] = [];
      anims.push(
        webAnimate({ current: slotRefs.current[k0] }, [{ transform: poseCss(0, cardW), easing: 'cubic-bezier(.2,.8,.3,1)' }, { transform: LIFT, offset: 0.24, easing: 'cubic-bezier(.5,0,.75,.2)' }, { transform: poseCss(-1, cardW) }], {
          duration: 520,
          fill: 'forwards',
        }),
      );
      for (let k = cur; k < Math.min(N, cur + 3); k++) {
        const r = k - cur;
        const from = Math.min(r + 1, 2);
        const to = Math.min(r, 2);
        const delay = 120 + r * 50;
        const tw = webTween(
          slotRefs.current[k],
          { spring: 'medium' },
          (v) => {
            const q = from + (to - from) * v;
            return { transform: `translate3d(0px, ${PEEK * q}px, 0px) scale(${1 - 0.06 * q})`, opacity: r + 1 >= 3 ? Math.min(1, v * 3) : 1 };
          },
          { delay },
        );
        anims.push(tw?.anim);
        const veil = veilRefs.current[k];
        anims.push(webAnimate({ current: veil }, [{ opacity: Math.min(r + 1, 2) * 0.35 }, { opacity: r ? Math.min(r, 2) * 0.35 : 0 }], { duration: 300, delay, easing: 'ease', fill: 'backwards' }));
      }
      anims.push(webAnimate({ current: segRefs.current[cur] }, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 360, delay: 80, easing: CSS_EASE.out, fill: 'backwards' }));
      return () => anims.forEach((a) => a?.cancel());
    }
    Animated.timing(posOf(k0), { toValue: -1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
    for (let k = cur; k < Math.min(N, cur + 3); k++) {
      const r = k - cur;
      Animated.spring(posOf(k), { toValue: r, ...SPRING.medium, delay: 120 + r * 50, useNativeDriver: NATIVE_DRIVER }).start();
    }
  }, [cur]);

  const next = () => {
    if (quiz) return;
    if (cur >= N - 1) {
      // 더 갈 곳이 없으면 카드가 눌렸다 튀어 돌아온다.
      if (WEB && !motionOff()) webTween({ current: slotRefs.current[cur] } as any, { spring: 'bounce' }, (v) => ({ transform: `scale(${0.975 + 0.025 * v})` }));
      return;
    }
    tapAt.current = performance.now();
    setCur((c) => Math.min(N - 1, c + 1));
  };

  const label = due.show.label;
  const bottomPad: any = BOTTOM_PAD === 6 ? 20 : 'calc(20px + env(safe-area-inset-bottom, 0px))';
  if (!go) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const slots: React.ReactNode[] = [];
  for (let k = Math.min(N, cur + 3) - 1; k >= Math.max(0, cur - 1); k--) {
    const r = k - cur;
    const p = posOf(k);
    const nativeStyle: any = WEB
      ? null
      : {
          opacity: p.interpolate({ inputRange: [2, 3], outputRange: [1, 0], extrapolate: 'clamp' }),
          transform: [
            { translateX: p.interpolate({ inputRange: [-1, 0], outputRange: [-1.25 * cardW, 0], extrapolate: 'clamp' }) },
            { translateY: p.interpolate({ inputRange: [-1, 0, 1, 2, 3], outputRange: [-90, 0, PEEK, PEEK * 2, PEEK * 2], extrapolate: 'clamp' }) },
            { rotate: p.interpolate({ inputRange: [-1, 0], outputRange: ['-12deg', '0deg'], extrapolate: 'clamp' }) },
            { scale: p.interpolate({ inputRange: [-1, 0, 1, 2, 3], outputRange: [1.02, 1, 0.94, 0.88, 0.88], extrapolate: 'clamp' }) },
          ],
        };
    const webStyle: any = WEB ? { transform: poseCss(r, cardW), transformOrigin: '50% 100%', zIndex: 100 - k } : null;
    const Box: any = WEB ? View : Animated.View;
    slots.push(
      <Box
        key={k}
        ref={(el: any) => void (slotRefs.current[k] = el)}
        aria-hidden={r !== 0}
        style={[{ position: 'absolute', left: 20, right: 20, top: 0, height: CH }, webStyle, nativeStyle, r < 0 ? { pointerEvents: 'none' } : null]}
      >
        <View style={[styles.card, { backgroundColor: t.card }, WEB ? ({ boxShadow: '0 0 0 1px rgba(0,23,51,0.03), 0 6px 22px rgba(0,23,51,0.07)' } as any) : styles.shadow]}>
          {k <= shown ? (
            <SinceCtx.Provider value={k === 0 ? 0 : tapAt.current}>
              <RecapCard kind={kinds[k]} index={k} count={N} stats={stats} due={due} width={cardW - 48} onQuiz={setQuiz} onClose={onDone} />
            </SinceCtx.Provider>
          ) : null}
          <View ref={(el: any) => void (veilRefs.current[k] = el)} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.layer, opacity: r <= 0 ? 0 : Math.min(r, 2) * 0.35 }]} />
        </View>
      </Box>,
    );
  }

  return (
    <View testID="recap" style={{ flex: 1, backgroundColor: t.bg }}>
      <Pressable onPress={next} accessibilityRole="button" accessibilityLabel="다음 장" style={{ flex: 1, cursor: 'pointer' } as any}>
        <View style={{ position: 'absolute', top: 10, left: 20, right: 20, height: 3, flexDirection: 'row', gap: 4, zIndex: 3 }}>
          {kinds.map((_, i) => (
            <View key={i} style={{ flex: 1, borderRadius: 2, overflow: 'hidden', backgroundColor: t.line }}>
              <View ref={(el: any) => void (segRefs.current[i] = el)} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderRadius: 2, backgroundColor: t.p.grey800, transformOrigin: 'left', transform: [{ scaleX: i <= cur ? 1 : 0 }] } as any} />
            </View>
          ))}
        </View>
        <View style={{ position: 'absolute', top: 16, left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 8, zIndex: 3 }}>
          <T s={20} w="800" lh={1.4} style={{ letterSpacing: -0.4 }} role="heading" level={1}>
            {label}
          </T>
          <Tap onPress={onDone} label="닫기" style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={24} color={t.mute} sw={2.4} />
          </Tap>
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 76, bottom: bottomPad }}>{slots}</View>
      </Pressable>
      {quiz ? <QuizLayer review={quiz} onClosed={() => setQuiz(null)} /> : null}
    </View>
  );
}

/** 돌아보기 위에 겹쳐 여는 종합 퀴즈. 오른쪽에서 밀려 들어오고, 닫으면 같은 길로 나가 같은 카드로 돌아온다. */
function QuizLayer({ review, onClosed }: { review: Review; onClosed: () => void }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const w = Math.min(width, 560);
  const ref = useRef<any>(null);
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) return;
    if (WEB) {
      const a = webAnimate(ref, [{ transform: `translateX(${w}px)` }, { transform: 'translateX(0px)' }], { duration: 420, easing: CSS_EASE.sheet });
      return () => a?.cancel();
    }
    Animated.timing(v, { toValue: 1, duration: 420, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, []);
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (motionOff()) return onClosed();
    if (WEB) {
      const a = webAnimate(ref, [{ transform: 'translateX(0px)' }, { transform: `translateX(${w}px)` }], { duration: 320, easing: CSS_EASE.out, fill: 'forwards' });
      if (a) a.onfinish = onClosed;
      else onClosed();
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 320, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start(() => onClosed());
  };
  const Box: any = WEB ? View : Animated.View;
  const style: any = WEB ? null : { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [w, 0] }) }] };
  return (
    <Box ref={ref} testID="recap-quiz" style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: t.card }, style]}>
      <QuizRunner review={review} onClose={close} />
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// 카드
// ─────────────────────────────────────────────────────────────

type CardProps = { kind: Kind; index: number; count: number; stats: PeriodStats; due: Due; width: number; onQuiz: (r: Review) => void; onClose: () => void };

function RecapCard(p: CardProps) {
  const week = p.due.show.kind === 'week';
  const st = p.stats;
  const ctx = useMemo(() => ctxOf(st), [st]);
  const P = week ? 'recap.' : 'mrecap.';
  const sit = p.kind === 'period' ? (week ? 'recap.streak' : 'mrecap.period') : P + p.kind;
  const line = useLattiLine(sit, ctx, `recap:${p.due.show.key}:${p.kind}`);
  return (
    <View role="group" aria-label={`${p.index + 1}/${p.count}`} style={{ flex: 1, paddingTop: 20, paddingHorizontal: 24, paddingBottom: 24 }}>
      {p.kind === 'close' ? null : <LattiSays text={line} size={30} bubble="s" delay={p.index ? 360 : 80} style={{ minHeight: 32, alignItems: 'flex-start' }} />}
      {p.kind === 'period' ? <PeriodCard {...p} /> : p.kind === 'lat' ? <LatCard {...p} /> : p.kind === 'voc' ? <VocCard {...p} /> : p.kind === 'news' ? <NewsCard {...p} /> : <CloseCard {...p} line={line} />}
    </View>
  );
}

/** Latti 빈칸: 그 기간의 실제 숫자와 이름 */
function ctxOf(st: PeriodStats) {
  const active = st.lat.discs.filter((d) => d.solved > 0 || d.branches.some((b) => b.added > 0));
  const added = (d: PeriodStats['lat']['discs'][number]) => d.branches.reduce((n, b) => n + b.added, 0);
  const top = active.slice().sort((a, b) => added(b) - added(a) || b.solved - a.solved)[0];
  const words = st.voc.terms.filter((x) => vocKind({ term: x } as any) === '단어' && x.length <= 10);
  const lv0 = st.xp.levelFrom;
  const lv1 = st.xp.level;
  return {
    weekDays: st.doneDays,
    doneDays: st.doneDays,
    streak: st.streak,
    month: st.period.kind === 'month' ? st.period.label : undefined,
    weekConcepts: st.lat.newConcepts.length,
    newConcepts: st.lat.newConcepts.length,
    weekFields: active.length,
    fields: active.length,
    topField: top?.ko,
    topFieldN: top ? added(top) : undefined,
    newest: st.lat.newest,
    weekWords: st.voc.words,
    words: st.voc.added,
    vocTotal: st.voc.total,
    word: words.length ? words[words.length - 1] : undefined,
    weekRead: st.news.read,
    read: st.news.read,
    newsDays: st.news.days,
    quizRight: st.news.weekly?.taken ? st.news.weekly.right : 0,
    wq: st.news.weeklyTaken,
    solved: st.lat.solved,
    days: st.doneDays,
    xpS: fmt(st.xp.gained),
    level: lv1,
    levelUp: lv1 > lv0,
    newField: st.lat.newDiscs[0],
    hasNewField: st.lat.newDiscs.length > 0,
  };
}

function Title({ children }: { children: string }) {
  return (
    <T s={22} w="700" lh={31 / 22} style={{ marginTop: 18, letterSpacing: -0.4 }}>
      {children}
    </T>
  );
}

/** 큰 숫자 하나: 이름(15) 아래 세어 올라가는 숫자 */
function Hero({ label, to, small, md: mid, delay = 0 }: { label: string; to: number; small?: string; md?: boolean; delay?: number }) {
  const t = useTheme();
  const s = mid ? 34 : 52;
  return (
    <View>
      <T s={15} w="600" lh={22 / 15} c={t.sub}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2, height: mid ? 60 : 60, justifyContent: 'flex-start' }}>
        <T s={s} w="800" lh={60 / s} mono style={{ letterSpacing: mid ? -0.8 : -1.5 }}>
          <Count to={to} duration={700} delay={delay} format={fmt} />
        </T>
        {small ? (
          <T s={mid ? 18 : 22} w="700" c={t.faint} style={{ marginLeft: 3, letterSpacing: -0.4 }}>
            {small}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** 회색 칸 두 개 */
function Two({ cells }: { cells: { label: string; to: number; unit: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cells.map((c) => (
        <View key={c.label} style={{ flex: 1, backgroundColor: t.layer, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
          <T s={15} w="600" lh={22 / 15} c={t.sub}>
            {c.label}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T s={22} w="700" lh={31 / 22} mono>
              <Count to={c.to} duration={620} format={fmt} />
            </T>
            <T s={15} w="600" c={t.mute} style={{ marginLeft: 2 }}>
              {c.unit}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 왼쪽부터 자라는 막대(웹은 브라우저 움직임, 앱은 Animated) */
function Grow({ style, delay = 0, duration = 640 }: { style: any; delay?: number; duration?: number }) {
  const ref = useRef<any>(null);
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) return;
    if (WEB) {
      const el = ref.current as HTMLElement | null;
      if (el) el.style.transformOrigin = 'left center';
      const tw = webTween(ref, { duration, easing: EASE_OUT }, (x) => ({ transform: `scaleX(${x})` }), { delay });
      return () => tw?.anim.cancel();
    }
    Animated.timing(v, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: false }).start();
  }, []);
  if (WEB) return <View ref={ref} style={style} />;
  return <Animated.View style={[style, { transform: [{ scaleX: v }] }]} />;
}

const Spacer = ({ min = 16, max }: { min?: number; max?: number }) => <View style={{ flexGrow: 1, flexShrink: 1, minHeight: min, maxHeight: max }} />;

// ---------- 1장: 기간과 완료한 날
function PeriodCard({ stats: st, due, width }: CardProps) {
  const t = useTheme();
  const goals = useGoals();
  const p = due.show;
  const week = p.kind === 'week';
  const rows = useMemo(() => {
    if (week) return [Array.from({ length: 7 }, (_, i) => addDays(p.from, i))];
    const all = monthDays(p.from.slice(0, 7));
    const cells: (string | null)[] = Array((weekdayOf(all[0]) + 6) % 7).fill(null);
    cells.push(...all);
    while (cells.length % 7) cells.push(null);
    const out: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [p.key]);
  const total = week ? 7 : monthDays(p.from.slice(0, 7)).length;
  const range = week ? `${md(p.from)} ~ ${Number(p.to.slice(5, 7)) === Number(p.from.slice(5, 7)) ? `${Number(p.to.slice(8, 10))}일` : md(p.to)}` : `${p.from.slice(0, 4)}년 ${Number(p.from.slice(5, 7))}월`;
  const noop = () => {};
  return (
    <>
      <Title>{range}</Title>
      <View style={{ marginTop: 16 }}>
        <Hero label="완료한 날" to={st.doneDays} small={`/${total}`} />
      </View>
      <Spacer min={20} />
      <View pointerEvents="none">
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {['월', '화', '수', '목', '금', '토', '일'].map((x) => (
            <T key={x} s={13} w="600" c={t.mute} center style={{ flex: 1 }}>
              {x}
            </T>
          ))}
        </View>
        {rows.map((w, i) => (
          <HeatWeek key={i} id={`recap-${p.key}-${i}`} week={w} width={width} row={i} statusOf={goals.statusOf} extraOf={goals.extraOf} today={goals.today} onPick={noop} />
        ))}
      </View>
      <Spacer min={20} />
      <Two
        cells={[
          { label: '추가 학습', to: st.extra, unit: '문제' },
          { label: '연속', to: st.streak, unit: '일' },
        ]}
      />
      {st.num.sets > 0 ? <NumLine sets={st.num.sets} change={st.num.change} /> : null}
    </>
  );
}

/** 수리 한 줄: 기간의 세트 수와, 같은 분야 같은 수준에서 문제당 시간이 얼마나 바뀌었는지 */
function NumLine({ sets, change }: { sets: number; change: number | null }) {
  const t = useTheme();
  const ch = change == null || change === 0 ? null : change < 0 ? `${-change}% 단축` : `${change}% 늘어남`;
  return (
    <View accessible accessibilityLabel={`수리 ${sets}세트${ch ? ' ' + ch : ''}`} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.layer, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
      <Icon name="calc" size={18} color={t.orangeText} />
      <T s={15} w="600" c={t.sub} lh={22 / 15} style={{ flex: 1 }}>
        수리
      </T>
      <T s={15} w="700" mono lh={22 / 15}>
        {`${sets}세트`}
      </T>
      {ch ? (
        <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 8, backgroundColor: change! < 0 ? t.greenWeak : t.p.grey100, justifyContent: 'center' }}>
          <T s={13} w="700" c={change! < 0 ? t.greenText : t.sub} mono>
            {ch}
          </T>
        </View>
      ) : null}
    </View>
  );
}

// ---------- 2장: Latticework
/**
 * 지식 지도가 자라는 모습(2026-11-24 소유자 결정): 기간이 시작할 때의 방사형 지도에서 출발해, 그 기간에 새로 생긴 학문, 분과, 주제, 개념이
 * 생긴 날 순서로 돋는다. 새 학문과 분과에는 고리가 한 번 퍼진다. 자리는 지금 지도의 자리를 그대로 쓴다(그래서 점이 움직이지 않고 돋기만 한다).
 */
function GrowthMap({ from, to, width, height }: { from: string; to: string; width: number; height: number }) {
  const { tree } = useKnowledge();
  const M = useMemo(() => (tree ? getModel(tree) : null), [tree]);
  const scene = useMemo(() => {
    if (!M) return null;
    const fit = fitBox(M.box, width, height, { x: 28, y: 28 });
    const cam = { x: fit.x, y: fit.y, k: fit.k * 0.96 };
    const ns = [...M.N.values()].filter((x) => x.at >= from && x.at <= to).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.depth - b.depth));
    const order = new Map<string, RevealStep>();
    const span = ns.length ? Math.max(1, dayDiff(ns[0].at, ns[ns.length - 1].at)) : 1;
    ns.forEach((x, k) => order.set(x.id, { t: (dayDiff(ns[0].at, x.at) / span) * 1600 + k * 30, d: x.kind === 'disc' ? 560 : 440, mode: x.kind === 'disc' ? 'fade' : 'grow' }));
    const pulses: Pulse[] = ns
      .filter((x) => x.kind === 'disc' || x.kind === 'branch')
      .slice(0, 8)
      .map((x) => ({ id: x.id, delay: 700 + (order.get(x.id)?.t ?? 0) + 120, r: x.kind === 'disc' ? 30 : 20, d: 1000, key: `grow:${x.id}` }));
    return { cam, K0: fit.k, order, pulses, n: ns.filter((x) => x.kind === 'concept').length };
  }, [M, from, to, width, height]);
  if (!M || !scene) return null;
  return (
    <View aria-hidden style={{ height, marginHorizontal: -8, marginTop: 10 }}>
      <GraphView model={M} width={width} height={height} cam={scene.cam} K0={scene.K0} reveal={motionOff() ? null : { order: scene.order, t0Delay: 700 }} pulses={motionOff() ? [] : scene.pulses} />
    </View>
  );
}

function LatCard({ stats: st, due, width, onQuiz }: CardProps) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const s = useStore();
  const month = due.show.kind === 'month';
  const discs = st.lat.discs;
  const maxSolved = Math.max(1, ...discs.map((d) => d.solved));
  const budget = month ? 46 : 90;
  const mapH = Math.round(Math.max(150, Math.min(220, height * 0.24)));
  // 지식 종합 퀴즈: 그 기간에 배운 개념에서 다섯 문항
  const quiz = useMemo(() => {
    if (!s.studyData) return null;
    const p = due.show;
    const to = st.dates.length ? st.dates[st.dates.length - 1] : p.to;
    return latPeriodQuiz(s.studyData, s.study, s.studyLog(), p.from, to, `lat-${p.kind === 'week' ? p.weekId ?? p.key : p.key}`, `${p.label} 지식 종합 퀴즈`);
  }, [s.studyData, s.study, due.show.key]);
  const score = quiz ? quizScore(s.user, quiz.id, quiz.questions) : null;
  const taken = !!score && score.answered >= score.total;
  return (
    <>
      <Title>Latticework</Title>
      <GrowthMap from={due.show.from} to={st.dates.length ? st.dates[st.dates.length - 1] : due.show.to} width={width + 16} height={mapH} />
      <View style={{ marginTop: 16, flexDirection: 'row', gap: 28 }}>
        <Hero label="푼 문제" to={st.lat.solved} />
        <Hero label="새 개념" to={st.lat.newConcepts.length} />
      </View>
      <Spacer min={16} max={28} />
      <View style={{ flexShrink: 1, overflow: 'hidden' }}>
        {discs.map((d, k) => {
          const brs = d.branches.filter((b) => b.added > 0);
          const idle = !d.solved && !brs.length;
          return (
            <Rise key={d.id} delay={120 + k * 80} y={8} style={{ marginTop: k ? 18 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 26 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: idle ? t.p.grey300 : d.color }} />
                <T s={17} w="700" c={idle ? t.faint : t.ink} lines={1} style={{ flexShrink: 1, letterSpacing: -0.2 }}>
                  {d.ko}
                </T>
                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline' }}>
                  <T s={17} w="700" mono c={idle ? t.faint : t.ink}>
                    {fmt(d.solved)}
                  </T>
                  <T s={13} w="600" c={t.mute} style={{ marginLeft: 2 }}>
                    문제
                  </T>
                </View>
              </View>
              {!d.solved ? null : (
                <View style={{ height: 6, marginTop: 6, marginBottom: 2, marginLeft: 18, borderRadius: 3, backgroundColor: t.p.grey100, overflow: 'hidden' }}>
                  <Grow delay={220 + k * 80} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(d.solved ? 2 : 0, (d.solved / maxSolved) * 100)}%`, borderRadius: 3, backgroundColor: d.color }} />
                </View>
              )}
              {brs.map((b) => (
                <View key={b.id} style={{ marginTop: 10, marginLeft: 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <T s={15} w="600" lh={22 / 15} c={t.p.grey700} lines={1} style={{ flexShrink: 1 }}>
                      {b.ko}
                    </T>
                    <T s={15} w="700" mono c={d.color} style={{ marginLeft: 'auto' }}>
                      {`+${b.added}`}
                    </T>
                  </View>
                  <Names groups={b.groups} budget={budget} />
                </View>
              ))}
            </Rise>
          );
        })}
      </View>
      {quiz && taken ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 }}>
          <T s={15} w="600" c={t.sub}>
            지식 종합 퀴즈
          </T>
          <T s={17} w="700" mono>
            {`${score!.right}/${score!.total}`}
          </T>
        </View>
      ) : quiz ? (
        <PrimaryButton label="지식 종합 퀴즈" weak onPress={() => onQuiz(quiz as Review)} style={{ minHeight: 48, borderRadius: 14, marginTop: 14 }} />
      ) : null}
      <Spacer min={0} />
    </>
  );
}

/** 분과 아래 배운 이름. 주제가 있으면 주제 이름을 굵게 앞에. 길면 주제는 이름과 수(CAPM 8)로 접는다. */
function Names({ groups, budget }: { groups: { topic: string | null; names: string[] }[]; budget: number }) {
  const t = useTheme();
  const full = groups.reduce((n, g) => n + (g.topic ?? '').length + g.names.join('').length, 0);
  const item = (s: string, k: string) => (
    <T key={k} s={13} w="500" lh={19 / 13} c={t.mute}>
      {s}
    </T>
  );
  const head = (s: string, k: string, n?: number) => (
    <T key={k} s={13} w="700" lh={19 / 13} c={t.sub}>
      {s}
      {n != null ? <T s={13} w="600" c={t.sub} mono>{` ${n}`}</T> : null}
    </T>
  );
  if (full <= budget) {
    return (
      <View style={{ marginTop: 3, gap: 2 }}>
        {groups.map((g, i) => (
          <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}>
            {g.topic ? head(g.topic, 'h') : null}
            {g.names.map((n, j) => item(n, String(j)))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ marginTop: 3, flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}>{groups.flatMap((g, i) => (g.topic ? [head(g.topic, `h${i}`, g.names.length)] : g.names.map((n, j) => item(n, `${i}-${j}`))))}</View>
  );
}

// ---------- 3장: 영단어
function VocCard({ stats: st, due, width }: CardProps) {
  const t = useTheme();
  const v = st.voc;
  const tot = v.words + v.phrases;
  const G = 3;
  const usable = width - (v.words && v.phrases ? G : 0);
  const light = rgbaOf(t.purple, t.mode === 'dark' ? 0.55 : 0.42);
  const segs = [
    { k: '단어', v: v.words, c: t.purple, tc: t.purple },
    { k: '구문', v: v.phrases, c: light, tc: rgbaOf(t.purple, 0.75) },
  ].filter((x) => x.v > 0);
  let x = 0;
  const sg = segs.map((s) => {
    const w = (s.v / Math.max(1, tot)) * usable;
    const o = { ...s, x, w };
    x += w + G;
    return o;
  });
  const cap = due.show.kind === 'week' ? 40 : 34;
  // 단어를 먼저, 구문을 뒤에 모아 막대의 두 조각과 같은 차례로 놓는다. 넘치면 두 쪽을 비율대로 자른다.
  const all = v.terms.map((term) => ({ term, ph: vocKind({ term } as any) === '구문' }));
  const ws = all.filter((x) => !x.ph);
  const ps = all.filter((x) => x.ph);
  const terms = ws.concat(ps);
  const capW = Math.min(ws.length, Math.round((cap * ws.length) / Math.max(1, terms.length)));
  const shown = terms.length > cap ? ws.slice(0, capW).concat(ps.slice(0, cap - capW)) : terms;
  return (
    <>
      <Title>영단어</Title>
      <View style={{ marginTop: 16 }}>
        <Hero label="새로 익힘" to={v.added} />
      </View>
      <Spacer min={16} max={24} />
      <View style={{ height: 16, borderRadius: 6, backgroundColor: tot ? 'transparent' : t.p.grey100 }}>
        {sg.map((s, i) => (
          <Grow key={s.k} delay={i * 120} duration={900} style={{ position: 'absolute', top: 0, bottom: 0, left: s.x, width: s.w, borderRadius: 6, backgroundColor: s.c }} />
        ))}
      </View>
      <View style={{ height: 52, marginTop: 10 }}>
        {sg.map((s, i) => (
          <Rise key={s.k} delay={700 + i * 90} y={6} style={i && width - s.x < 56 ? { position: 'absolute', top: 0, right: 0, alignItems: 'flex-end' } : { position: 'absolute', top: 0, left: s.x }}>
            <T s={13} w="600" lh={19 / 13} c={t.sub}>
              {s.k}
            </T>
            <T s={22} w="700" lh={31 / 22} mono c={s.tc}>
              {fmt(s.v)}
            </T>
          </Rise>
        ))}
      </View>
      <Spacer min={12} max={24} />
      <Rise delay={900} y={4} style={{ flexShrink: 1, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
          {shown.map((x, i) => (
            <T key={i} s={14} w="500" lh={21 / 14} c={x.ph ? rgbaOf(t.purple, 0.75) : t.mute}>
              {x.term}
            </T>
          ))}
          {terms.length > shown.length ? (
            <T s={14} w="600" lh={21 / 14} c={t.faint} mono>
              {`+${terms.length - shown.length}`}
            </T>
          ) : null}
        </View>
      </Rise>
      <Spacer min={20} />
      <Two
        cells={[
          { label: '복습', to: v.reviewed, unit: '번' },
          { label: '모은 영단어', to: v.total, unit: '개' },
        ]}
      />
    </>
  );
}

// ---------- 4장: 뉴스
function NewsCard({ stats: st, due, onQuiz }: CardProps) {
  const t = useTheme();
  const { reviews } = useStore();
  const n = st.news;
  const week = due.show.kind === 'week';
  const review = week && due.show.weekId ? weeklyReviewFor(reviews, due.show.weekId) : null;
  const acc = n.quizAnswered ? Math.round((n.quizRight / n.quizAnswered) * 100) : 0;
  const cap = 6;
  const hls = n.titles.slice(0, cap);
  return (
    <>
      <Title>뉴스</Title>
      <View style={{ marginTop: 16, flexDirection: 'row', gap: 28 }}>
        <Hero label="읽은 기사" to={n.read} />
        <Hero label="읽은 날" to={n.days} small="일" md />
      </View>
      <Spacer min={20} max={28} />
      {n.quizAnswered ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <T s={15} w="600" c={t.sub}>
              저녁 퀴즈
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <T s={17} w="700" mono>
                <Count to={acc} duration={600} delay={200} />%
              </T>
              <T s={15} w="600" c={t.mute} mono style={{ marginLeft: 6 }}>
                {`${n.quizRight}/${n.quizAnswered}`}
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: n.quizAnswered > 20 ? 2 : 3, height: 10 }}>
            {Array.from({ length: n.quizAnswered }, (_, i) => (
              <View key={i} style={{ flex: 1, borderRadius: 5, backgroundColor: t.p.grey100, overflow: 'hidden' }}>
                <Grow delay={i * (n.quizAnswered > 20 ? 14 : 40)} duration={260} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: i < n.quizRight ? t.green : t.p.red300 }} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {week && n.weekly?.taken ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
          <T s={15} w="600" c={t.sub}>
            종합 퀴즈
          </T>
          <T s={17} w="700" mono>
            {`${n.weekly.right}/${n.weekly.total}`}
          </T>
        </View>
      ) : week && review ? (
        <PrimaryButton label="종합 퀴즈" weak onPress={() => onQuiz(review)} style={{ minHeight: 48, borderRadius: 14, marginTop: 14 }} />
      ) : !week && n.weeklyTaken ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
          <T s={15} w="600" c={t.sub}>
            종합 퀴즈
          </T>
          <T s={17} w="700" mono>
            {`${n.weeklyTaken}회`}
          </T>
        </View>
      ) : null}
      <Spacer min={22} max={24} />
      <View style={{ flexShrink: 1, overflow: 'hidden' }}>
        {hls.map((h, i) => (
          <Rise key={h.id} delay={300 + i * 40} y={4} style={{ flexDirection: 'row', gap: 10 }}>
            <T s={13} w="500" lh={21 / 13} c={t.faint} mono lines={1} style={{ width: 40 }}>
              {dot(h.date)}
            </T>
            <T s={13} w="500" lh={21 / 13} c={t.mute} lines={1} style={{ flex: 1 }}>
              {h.title}
            </T>
          </Rise>
        ))}
        {n.titles.length > cap ? (
          <T s={13} w="600" lh={21 / 13} c={t.faint} mono style={{ marginLeft: 50 }}>
            {`+${n.titles.length - cap}`}
          </T>
        ) : null}
      </View>
      <Spacer min={0} />
    </>
  );
}

// ---------- 5장: 마무리
function CloseCard({ stats: st, onClose, line, due }: CardProps & { line: string | null }) {
  const t = useTheme();
  const p = due.show;
  const { studyData, study } = useStore();
  const l0 = st.xp.levelFrom;
  const l1 = st.xp.level;
  const xp1 = study.xp;
  const x1 = xp1 - lvStart(l1);
  const x0 = l0 === l1 ? xp1 - st.xp.gained - lvStart(l1) : 0;
  const f0 = Math.max(0, Math.min(1, x0 / lvRange(l1)));
  const f1 = Math.max(0, Math.min(1, x1 / lvRange(l1)));
  const fill = useRef<any>(null);
  const lv = useRef<any>(null);
  useLayoutEffect(() => {
    if (!WEB || motionOff()) return;
    const el = fill.current as HTMLElement | null;
    if (el) el.style.transformOrigin = 'left center';
    const a = webTween(fill, { duration: 220 + (f1 - f0) * 620, easing: EASE_OUT }, (v) => ({ transform: `scaleX(${f0 + (f1 - f0) * v})` }), { delay: 600 });
    const b = l1 > l0 ? webTween(lv, { spring: 'bounce' }, (v) => ({ transform: `scale(${v})` }), { from: 1.18, to: 1, delay: 500 }) : null;
    return () => {
      a?.anim.cancel();
      b?.anim.cancel();
    };
  }, []);
  const cells = studyData
    ? [
        { k: '문제', v: st.lat.solved },
        { k: '영단어', v: st.voc.added },
        { k: '기사', v: st.news.read },
      ]
    : [
        { k: '기사', v: st.news.read },
        { k: '읽은 날', v: st.news.days },
      ];
  return (
    <>
      <Spacer min={0} />
      {line ? (
        <LattiSays text={line} size={64} bubble="l" side="bottom" delay={200} />
      ) : (
        // Latti 문구가 없는 빌드(Claude 링크): 표식과 기간만
        <Rise delay={120} y={8} style={{ alignItems: 'center', gap: 16 }}>
          <LattiAvatar size={64} />
          <T s={22} w="700" lh={31 / 22} center style={{ letterSpacing: -0.4 }}>
            {p.kind === 'week' ? `${md(p.from)} ~ ${md(p.to)}` : `${p.from.slice(0, 4)}년 ${Number(p.from.slice(5, 7))}월`}
          </T>
        </Rise>
      )}
      <View style={{ height: 48 }} />
      {studyData ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T s={22} w="700" c={t.faint} style={{ marginRight: 6, letterSpacing: -0.4 }}>
              Lv
            </T>
            <View ref={lv} style={{ transformOrigin: '50% 80%' } as any}>
              <T s={52} w="800" lh={60 / 52} mono style={{ letterSpacing: -1.5 }}>
                {String(l1)}
              </T>
            </View>
            {st.xp.gained ? (
              <Rise delay={500} y={0} style={{ alignSelf: 'center', marginLeft: 12 }}>
                <View style={{ height: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: t.orangeWeak, justifyContent: 'center' }}>
                  <T s={15} w="700" c={t.orangeText} mono>
                    {`+${fmt(st.xp.gained)} XP`}
                  </T>
                </View>
              </Rise>
            ) : null}
          </View>
          <View style={{ marginTop: 14, height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
            <View ref={fill} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', borderRadius: 4, backgroundColor: t.blue, transform: [{ scaleX: f1 }] } as any} />
          </View>
          <T s={13} w="600" c={t.mute} mono style={{ marginTop: 8, textAlign: 'right' }}>
            {`${fmt(x1)} / ${fmt(lvRange(l1))}`}
          </T>
        </View>
      ) : null}
      <Spacer min={20} />
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.hair, paddingTop: 16 }}>
        {cells.map((c, i) => (
          <View key={c.k} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: t.hair }}>
            <T s={13} w="600" lh={19 / 13} c={t.mute}>
              {c.k}
            </T>
            <T s={20} w="700" lh={28 / 20} mono style={{ marginTop: 2 }}>
              {fmt(c.v)}
            </T>
          </View>
        ))}
      </View>
      <View style={{ height: 20 }} />
      <PrimaryButton label="계속" onPress={onClose} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  shadow: { shadowColor: '#001733', shadowOpacity: 0.07, shadowRadius: 22, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
});
