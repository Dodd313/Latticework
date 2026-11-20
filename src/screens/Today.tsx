import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { cheerHome, seedOf } from '../cheer';
import { addDays, weekdaysOf } from '../dates';
import { EASE_OUT, MView, NATIVE_DRIVER, Pulse, Rise, WEB, motionOff, webTween } from '../motion';
import { TabScreen, useNav } from '../nav';
import { quotesFor } from '../quotes';
import { GoalPart, STANDALONE, useGoals, useStore } from '../store';
import { useTheme } from '../theme';
import { Box, DayMark, Icon, IconName, Pill, PrimaryButton, ReadMark, T, Tap, TaskRow } from '../ui';
import { dayQuiz, quizOpen } from './DayQuiz';

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

/** '2026-11-20' → '11월 20일' */
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// 웹에서만: 쪽 표시 점의 폭과 색이 부드럽게 바뀐다.
const DOT_EASE: any = Platform.OS === 'web' ? { transitionProperty: 'width, background-color', transitionDuration: '200ms' } : null;

/** 큰 따옴표 표식. 글꼴에 기대지 않고 직접 그린다. */
function QuoteMark({ color }: { color: string }) {
  const one = 'M1 14.5C1 8.6 4.2 4.4 10.2 1.6l1.1 2C7.7 5.6 6.1 7.8 6 9.6z';
  return (
    <View aria-hidden style={{ height: 30, justifyContent: 'flex-end', paddingBottom: 6 }}>
      <Svg width={26} height={20} viewBox="0 0 26 20">
        <Path d={one} fill={color} />
        <Circle cx={6} cy={14.5} r={5} fill={color} />
        <Path d={one} fill={color} transform="translate(13 0)" />
        <Circle cx={19} cy={14.5} r={5} fill={color} />
      </Svg>
    </View>
  );
}

/** 한 덩어리의 나가고 들어오는 움직임: 투명도와 가로 위치. */
function useSlide() {
  const op = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  return { op, x, style: { opacity: op, transform: [{ translateX: x }] } };
}

type Slide = ReturnType<typeof useSlide>;

const ease = (v: Animated.Value, toValue: number, duration: number, delay = 0) => Animated.timing(v, { toValue, duration, delay, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });

/** 투자자의 문장. 누르면 지금 문장이 왼쪽으로 사라지고 다음 문장이 오른쪽에서 들어온다. */
function QuoteBlock({ today }: { today: string }) {
  const t = useTheme();
  const list = useMemo(() => quotesFor(today), [today]);
  const [i, setI] = useState(0);
  const text = useSlide();
  const by = useSlide();
  const busy = useRef(false);
  const q = list[i % list.length];
  // 웹: 나가기(140ms)와 들어오기(260ms, 이름은 40ms 뒤)를 브라우저에 맡긴다. 문장이 바뀐 장면을 그리기 전에 들어오기를 건다.
  const textRef = useRef<any>(null);
  const byRef = useRef<any>(null);
  const outs = useRef<(Animation | undefined)[]>([]);
  const entering = useRef(false);
  useLayoutEffect(() => {
    if (!WEB || !entering.current) return;
    entering.current = false;
    const frame = (v: number) => ({ opacity: v, transform: `translateX(${12 * (1 - v)}px)` });
    const a = webTween(textRef, { duration: 260, easing: EASE_OUT }, frame);
    const b = webTween(byRef, { duration: 260, easing: EASE_OUT }, frame, { delay: 40 });
    outs.current.forEach((x) => x?.cancel());
    outs.current = [];
    if (!b) busy.current = false;
    else b.anim.onfinish = () => (busy.current = false);
    return () => {
      a?.anim.cancel();
      b?.anim.cancel();
      busy.current = false;
    };
  }, [i]);

  const next = () => {
    if (busy.current) return;
    const step = () => setI((n) => (n + 1) % list.length);
    if (motionOff()) {
      step();
      return;
    }
    // 웹: 문장이 하나뿐이면 바뀌지 않으므로(들어오기가 걸리지 않아 사라진 채 남는다) 움직이지 않는다.
    if (WEB && list.length < 2) return;
    busy.current = true;
    if (WEB) {
      const frame = (v: number) => ({ opacity: 1 - v, transform: `translateX(${-12 * v}px)` });
      const a = webTween(textRef, { duration: 140, easing: EASE_OUT }, frame, { fill: 'forwards' });
      const b = webTween(byRef, { duration: 140, easing: EASE_OUT }, frame, { fill: 'forwards' });
      outs.current = [a?.anim, b?.anim];
      const done = () => {
        entering.current = true;
        step();
      };
      if (a) a.anim.onfinish = done;
      else done();
      return;
    }
    const out = (s: Slide) => Animated.parallel([ease(s.op, 0, 140), ease(s.x, -12, 140)]);
    const into = (s: Slide, delay: number) => Animated.parallel([ease(s.op, 1, 260, delay), ease(s.x, 0, 260, delay)]);
    Animated.parallel([out(text), out(by)]).start(() => {
      step();
      text.x.setValue(12);
      by.x.setValue(12);
      Animated.parallel([into(text, 0), into(by, 40)]).start(() => {
        busy.current = false;
      });
    });
  };

  return (
    <Tap onPress={next} press="none" label={`${q.text} ${q.by}`} style={{ paddingTop: 6, paddingHorizontal: 24, paddingBottom: 18 }}>
      <QuoteMark color={t.p.blue200} />
      <MView ref={textRef} style={WEB ? null : text.style}>
        <T s={19} w="600" lh={29 / 19} c={t.body} style={{ letterSpacing: -0.4 }}>
          {q.text}
        </T>
      </MView>
      <MView ref={byRef} style={[{ marginTop: 12, paddingRight: 96 }, WEB ? null : by.style]}>
        <T s={14} w="600" c={t.sub} style={{ letterSpacing: 0 }}>
          {q.by}
        </T>
      </MView>
      <View aria-hidden style={{ position: 'absolute', right: 24, bottom: 24, flexDirection: 'row', gap: 4 }}>
        {list.map((_, k) => (
          <View key={k} style={[DOT_EASE, { width: k === i ? 12 : 5, height: 5, borderRadius: 3, backgroundColor: k === i ? t.sub : t.p.grey300 }]} />
        ))}
      </View>
    </Tap>
  );
}

const HINT_KEY = 'lw.installHint.v1';

/** 자체 주소를 사파리 탭으로 열었을 때만 한 번 보인다. */
function InstallHint() {
  const t = useTheme();
  const g = globalThis as any;
  const installed = !!g.navigator?.standalone || !!g.matchMedia?.('(display-mode: standalone)')?.matches;
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return g.localStorage?.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!STANDALONE || installed || hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      g.localStorage?.setItem(HINT_KEY, '1');
    } catch {
      // 저장을 못 해도 이번에는 닫는다.
    }
  };
  return (
    <Box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 }}>
      <T s={16} w="600" style={{ flexShrink: 1 }}>
        홈 화면에 추가
      </T>
      <Tap onPress={close} label="안내 닫기" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.blueWeak, justifyContent: 'center' }}>
        <T s={15} w="600" c={t.blueText}>
          확인
        </T>
      </Tap>
    </Box>
  );
}

/** 불러오는 동안의 자리 */
function Placeholder() {
  const t = useTheme();
  return (
    <Box>
      <Pulse style={{ gap: 14 }}>
        <View style={{ width: 72, height: 20, borderRadius: 6, backgroundColor: t.p.grey100 }} />
        <View style={{ height: 40, borderRadius: 12, backgroundColor: t.p.grey100 }} />
        <View style={{ width: '72%', height: 40, borderRadius: 12, backgroundColor: t.p.grey100 }} />
      </Pulse>
    </Box>
  );
}

const PART: Record<GoalPart['key'], { name: string; icon: IconName }> = {
  news: { name: '뉴스', icon: 'news' },
  voc: { name: '영단어', icon: 'word' },
  lat: { name: 'Latticework', icon: 'lattice' },
};

export function TodayScreen() {
  const t = useTheme();
  const nav = useNav();
  const { days, user, status, studyData, study } = useStore();
  const goals = useGoals();
  const { today, parts, streak } = goals;
  const day = days[0];
  const todayDay = day && day.date === today ? day : undefined;
  const doneCount = parts.filter((p) => p.complete).length;
  const allDone = parts.length > 0 && doneCount === parts.length;

  const tint: Record<GoalPart['key'], { color: string; ink: string; bg: string }> = {
    news: { color: t.blue, ink: t.blueText, bg: t.blueWeak },
    voc: { color: t.purple, ink: t.purple, bg: t.purpleWeak },
    lat: { color: t.green, ink: t.greenText, bg: t.greenWeak },
  };

  const open = (key: GoalPart['key']) => {
    if (key === 'news') nav.push({ name: 'news' });
    else nav.push({ name: 'study', sect: key });
  };

  // 이어서 하기: 아직 안 끝난 첫 과제. 뉴스는 안 읽은 첫 기사를 바로 연다.
  const next = parts.find((p) => !p.complete);
  const goNext = () => {
    if (!next) return;
    if (next.key === 'news') {
      const unread = todayDay?.articles.find((a) => !user.read[a.id]);
      if (unread) nav.push({ name: 'article', id: unread.id });
      else nav.push({ name: 'news' });
    } else open(next.key);
  };

  // 저녁 퀴즈: 열렸고 기사를 다 읽었거나, 이미 다 풀었을 때만 뉴스 카드 아래에 둔다.
  const quiz = dayQuiz(todayDay);
  const quizAnswers = quiz ? (user.quiz[quiz.id] ?? {}) : {};
  const quizTotal = quiz?.questions.length ?? 0;
  const quizAnswered = quiz ? quiz.questions.filter((_, i) => quizAnswers[String(i)] !== undefined).length : 0;
  const quizCorrect = quiz ? quiz.questions.filter((q, i) => quizAnswers[String(i)] === q.answer).length : 0;
  const quizDone = !!quiz && quizAnswered === quizTotal;
  const allRead = !!todayDay && todayDay.articles.every((a) => !!user.read[a.id]);
  const showQuiz = !!quiz && (quizDone || (quizOpen(today) && allRead));

  // 오늘 카드 머리 아래의 응원 한 줄. 숫자는 모두 오늘 기록에서 온다.
  const rec = study.days[today];
  const solvedToday = rec ? rec.lat + rec.voc + (rec.extra ?? 0) : 0;
  const readToday = todayDay ? todayDay.articles.filter((a) => !!user.read[a.id]).length : 0;
  const hourKST = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  const cheer =
    parts.length > 0
      ? cheerHome({ doneParts: doneCount, totalParts: parts.length, solvedToday, readToday, streakDays: streak, allDone, hourKST, seed: seedOf(today, 'home', doneCount, allDone) })
      : null;

  const monday = weekdaysOf(today)[0];
  const week = WEEK.map((label, i) => {
    const date = addDays(monday, i);
    const st = date > today ? ('future' as const) : goals.statusOf(date);
    return { label, date, st, extra: goals.extraOf(date), isToday: date === today };
  });
  const weekDone = week.filter((d) => d.st === 'done').length;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -8 }}>
      <Pill label="연속" value={`${streak}일`} hot={goals.status === 'done'} a11yLabel={`연속 ${streak}일`} />
      <Tap onPress={() => nav.push({ name: 'settings' })} label="설정" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="gear" size={22} color={t.mute} bold />
      </Tap>
    </View>
  );

  const loading = status === 'loading' && !day;

  return (
    <TabScreen title="Latticework" brand right={header} top={<QuoteBlock today={today} />}>
      <InstallHint />
      {loading ? (
        <Placeholder />
      ) : (
        <>
          {parts.length > 0 ? (
            <Rise delay={40}>
              <Box title="오늘" aside={`${doneCount}/${parts.length}`}>
                {cheer ? (
                  <T s={15} w="600" lh={22.5 / 15} c={allDone ? t.blueText : t.deck} style={{ marginTop: -2, marginBottom: 6 }}>
                    {cheer}
                  </T>
                ) : null}
                {parts.map((p) => (
                  <TaskRow
                    key={p.key}
                    name={PART[p.key].name}
                    value={p.complete ? p.total : p.done}
                    of={p.total}
                    color={tint[p.key].color}
                    icon={PART[p.key].icon}
                    iconColor={tint[p.key].ink}
                    iconBg={tint[p.key].bg}
                    onPress={() => open(p.key)}
                    a11yLabel={`${PART[p.key].name} 열기`}
                    doneLabel={p.key === 'news' ? undefined : '추가 학습'}
                  />
                ))}
                {!allDone && next ? <PrimaryButton label="이어서 하기" onPress={goNext} style={{ marginTop: 10 }} /> : null}
              </Box>
            </Rise>
          ) : STANDALONE && !studyData ? (
            <Placeholder />
          ) : null}

          <Rise delay={100}>
            {todayDay ? (
              <Box title="오늘의 뉴스" aside={shortDate(todayDay.date)}>
                {todayDay.articles.map((a) => {
                  const read = !!user.read[a.id];
                  return (
                    <Tap key={a.id} onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`} press="soft" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
                      <ReadMark read={read} />
                      <T s={17} w="600" lh={1.5} c={read ? t.sub : t.ink} style={{ flex: 1 }}>
                        {a.title}
                      </T>
                    </Tap>
                  );
                })}
                {showQuiz && quiz ? (
                  <Tap onPress={() => nav.push({ name: 'quiz', date: todayDay.date })} label="저녁 퀴즈 풀기" press="soft" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
                    <ReadMark read={quizDone} />
                    <T s={17} w="600" lh={1.5} c={quizDone ? t.sub : t.ink} style={{ flex: 1 }}>
                      저녁 퀴즈
                    </T>
                    <T s={15} w="600" lh={25.5 / 15} c={quizDone ? t.greenText : t.mute} mono>
                      {quizDone ? quizCorrect : quizAnswered}/{quizTotal}
                    </T>
                  </Tap>
                ) : null}
              </Box>
            ) : (
              <Box title="오늘의 뉴스" aside={day ? shortDate(day.date) : undefined} chevron={!!day} onPress={day ? () => nav.push({ name: 'news' }) : undefined} label="뉴스 열기" style={{ paddingBottom: 14 }} />
            )}
          </Rise>

          <Rise delay={160}>
            <Box title="이번 주" aside={`${weekDone}/7`} chevron onPress={() => nav.setTab('archive')} label={`이번 주 ${weekDone}/7`}>
              <View style={{ marginTop: 6, gap: 6 }}>
                <View style={{ flexDirection: 'row' }}>
                  {week.map((d) => (
                    <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
                      <T s={12} w={d.isToday ? '700' : '600'} c={d.isToday ? t.ink : t.mute} lh={1.5}>
                        {d.label}
                      </T>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {week.map((d) => (
                    <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
                      <DayMark variant="week" status={d.st} label={d.label} today={d.isToday} extra={d.extra} a11yLabel={`${d.label}요일${d.st === 'done' ? ' 완료' : ''}`} />
                    </View>
                  ))}
                </View>
              </View>
            </Box>
          </Rise>
        </>
      )}
    </TabScreen>
  );
}
