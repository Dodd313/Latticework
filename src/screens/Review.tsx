import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { cheerQuiz, seedOf } from '../cheer';
import { addDays, isWeekend, todayKST, weekTitle, weekdaysOf } from '../dates';
import { NATIVE_DRIVER, Rise, motionOff, spring } from '../motion';
import { TabScreen, useNav } from '../nav';
import { useGoals, useStore } from '../store';
import { useTheme } from '../theme';
import { Review, ReviewQuestion } from '../types';
import { Box, DayMark, Icon, LipButton, OptionState, OptionTile, ReadMark, Rich, T, Tap } from '../ui';

const WEEK7 = ['월', '화', '수', '목', '금', '토', '일'];

// ─────────────────────────────────────────────────────────────
// 퀴즈 상태
// ─────────────────────────────────────────────────────────────

export type QuizState = {
  review: Review;
  at: number;
  setAt: (i: number) => void;
  q: ReviewQuestion;
  picked: number | undefined;
  answered: boolean;
  total: number;
  correct: number;
  done: number;
  allDone: boolean;
  combo: number;
  resultOf: (i: number) => 'right' | 'wrong' | undefined;
  pick: (choice: number) => void;
};

/** 퀴즈 하나의 진행 상태. 답은 store 의 user.quiz 에만 저장한다. */
export function useQuiz(review: Review): QuizState {
  const { user, answerQuiz } = useStore();
  const answers = user.quiz[review.id] ?? {};
  const firstOpen = review.questions.findIndex((_, i) => answers[String(i)] === undefined);
  const [at, setAt] = useState(firstOpen === -1 ? 0 : firstOpen);
  const q = review.questions[at];
  const picked = answers[String(at)];
  const resultOf = (i: number) => {
    const a = answers[String(i)];
    if (a === undefined) return undefined;
    return a === review.questions[i].answer ? ('right' as const) : ('wrong' as const);
  };
  let correct = 0;
  let done = 0;
  let combo = 0;
  review.questions.forEach((_, i) => {
    const r = resultOf(i);
    if (!r) return;
    done += 1;
    if (r === 'right') {
      correct += 1;
      combo += 1;
    } else combo = 0;
  });
  return {
    review,
    at,
    setAt: (i) => setAt(Math.max(0, Math.min(review.questions.length - 1, i))),
    q,
    picked,
    answered: picked !== undefined,
    total: review.questions.length,
    correct,
    done,
    allDone: done === review.questions.length,
    combo,
    resultOf,
    pick: (choice) => answerQuiz(review.id, at, choice),
  };
}

/** 다 푼 퀴즈의 응원 한 줄. 숫자는 맞힌 수와 문항 수. seed 가 퀴즈와 결과에 묶여 있어 어느 화면에서 봐도 같은 줄이다. */
export function quizCheer(review: Review, right: number, total: number): string {
  return cheerQuiz({ right, total, seed: seedOf(review.id, 'quiz', right, total) });
}

// ─────────────────────────────────────────────────────────────
// 퀴즈 조각
// ─────────────────────────────────────────────────────────────

/** 문제와 선택지. 답을 고르면 바로 저장되고 정답은 초록, 고른 오답은 빨강, 나머지는 흐려진다. */
export function QuizQuestion({ s, big }: { s: QuizState; big?: boolean }) {
  const { q, answered, picked } = s;
  return (
    <Rise trigger={s.at} y={10} style={{ gap: big ? 28 : 16 }}>
      <Rich type={big ? 't3' : 't4'} w="700" role="heading" level={2} style={{ letterSpacing: -0.3 }}>
        {q.q}
      </Rich>
      <View style={{ gap: 12 }}>
        {q.options.map((opt, i) => {
          const state: OptionState = !answered ? 'idle' : i === q.answer ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <OptionTile key={i} state={state} onPress={() => s.pick(i)} disabled={answered} a11yLabel={opt}>
              {(ink) => (
                <Rich s={17} w="600" c={ink} lh={1.5} style={{ flex: 1 }}>
                  {opt}
                </Rich>
              )}
            </OptionTile>
          );
        })}
      </View>
    </Rise>
  );
}

/** 맞힘, 틀림 표시: 흰 동그라미 안 체크(초록) 또는 X(빨강). 튀어 오르며 나타난다. */
function ResultIcon({ right }: { right: boolean }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    const a = spring(v, 1, 'bounce', { delay: 60, native: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel={right ? '정답' : '오답'}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}
    >
      {right ? <Icon name="check" size={20} color={t.green} sw={3.4} /> : <Icon name="x" size={18} color={t.red} sw={3.4} />}
    </Animated.View>
  );
}

/**
 * 답한 뒤의 풀이. 맞히면 풀이를 초록으로, 틀리면 정답을 빨강 굵게, 풀이를 회색으로.
 * 오른쪽 아이콘은 관련 기사로 간다.
 */
export function QuizFeedback({ s, big }: { s: QuizState; big?: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const { q, picked } = s;
  if (picked === undefined) return null;
  const right = picked === q.answer;
  const ink = right ? t.greenText : t.redText;
  return (
    <View style={{ gap: big ? 8 : 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ResultIcon right={right} />
        {right ? (
          <Rise y={0} delay={120} style={{ flex: 1 }}>
            <T type="t6" w="600" c={ink}>
              {q.explain}
            </T>
          </Rise>
        ) : (
          <Rise y={0} delay={120} style={{ flex: 1 }}>
            <Rich type={big ? 't3' : 't5'} w="700" c={ink} style={{ letterSpacing: -0.3 }}>
              {q.options[q.answer]}
            </Rich>
          </Rise>
        )}
        {q.refArticleId ? (
          <Tap onPress={() => nav.push({ name: 'article', id: q.refArticleId! })} label="관련 기사 보기" style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="news" size={22} color={ink} />
          </Tap>
        ) : null}
      </View>
      {right ? null : (
        <Rise y={0} delay={200}>
          <T type="t6" c={t.deck}>
            {q.explain}
          </T>
        </Rise>
      )}
    </View>
  );
}

/** 이전(네모 고스트)과 다음(입체 단추). 답하면 다음 단추가 결과 색으로 바뀐다. */
export function QuizNav({ s, onEnd, endLabel = '닫기' }: { s: QuizState; onEnd?: () => void; endLabel?: string }) {
  const t = useTheme();
  const last = s.at === s.total - 1;
  const r = s.resultOf(s.at);
  const endable = last && !!onEnd && s.allDone;
  const nextOff = last && !endable;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <LipButton tone="ghost" onPress={() => s.setAt(s.at - 1)} disabled={s.at === 0} a11yLabel="이전 문항" style={{ width: 56, flexShrink: 0, opacity: s.at === 0 ? 0.4 : 1 }}>
        <Icon name="prev" size={22} color={t.sub} sw={2.4} />
      </LipButton>
      <LipButton
        tone={nextOff ? 'off' : r === 'right' ? 'green' : r === 'wrong' ? 'red' : 'blue'}
        label={endable ? endLabel : '다음'}
        a11yLabel={endable ? endLabel : '다음 문항'}
        disabled={nextOff}
        onPress={() => (endable ? onEnd!() : s.setAt(s.at + 1))}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/** 문항마다 한 칸: 맞힘 초록, 틀림 빨강, 지금 문항 파랑, 남은 문항 회색. 누르면 그 문항으로 간다. */
function QuizSegments({ s }: { s: QuizState }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {s.review.questions.map((_, i) => {
        const r = s.resultOf(i);
        const color = r === 'right' ? t.green : r === 'wrong' ? t.red : i === s.at ? t.blue : t.line;
        return (
          <Tap key={i} press="none" onPress={() => s.setAt(i)} selected={i === s.at} label={`${i + 1}번 문항`} style={{ flex: 1, height: 24, justifyContent: 'center' }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: color }} />
          </Tap>
        );
      })}
    </View>
  );
}

/** 카드 안의 퀴즈(리뷰 탭). 머리 오른쪽은 맞힌 수/문항 수. */
export function Quiz({ review, title = '퀴즈' }: { review: Review; title?: string }) {
  const t = useTheme();
  const s = useQuiz(review);
  const r = s.resultOf(s.at);
  return (
    <Box title={title} aside={<T s={15} w="600" c={s.allDone ? t.greenText : t.mute} mono>{`${s.correct}/${s.total}`}</T>}>
      <View style={{ gap: 16 }}>
        <QuizSegments s={s} />
        <QuizQuestion s={s} />
        {r ? (
          <Rise key={s.at} y={8} style={{ borderRadius: 16, padding: 16, backgroundColor: r === 'right' ? t.greenWeak : t.redWeak }}>
            <QuizFeedback s={s} />
          </Rise>
        ) : null}
        <QuizNav s={s} />
        {s.allDone ? (
          <Rise y={8} style={{ borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: t.greenWeak, alignItems: 'center', gap: 2 }}>
            <T type="t5" w="700" c={t.greenText} center>
              {quizCheer(review, s.correct, s.total)}
            </T>
            <T s={26} w="800" c={t.greenText} mono center lh={34 / 26} style={{ letterSpacing: -0.5 }}>
              {`${s.correct}/${s.total}`}
            </T>
          </Rise>
        ) : null}
      </View>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// 리뷰 탭
// ─────────────────────────────────────────────────────────────

function useWeek() {
  const { days } = useStore();
  const today = todayKST();
  const anchor = days[0]?.date && days[0].date > today ? today : (days[0]?.date ?? today);
  const week = weekdaysOf(isWeekend(today) || !days.some((d) => weekdaysOf(today).includes(d.date)) ? anchor : today);
  const all = [...week, addDays(week[4], 1), addDays(week[4], 2)];
  const inWeek = days.filter((d) => week.includes(d.date)).slice().reverse();
  return { today, week, all, inWeek };
}

/** 이번 주 이름, 마친 날 수/7, 요일별 표시 */
function WeekRecap() {
  const t = useTheme();
  const goals = useGoals();
  const { today, week, all } = useWeek();
  const done = all.filter((date) => date <= today && goals.statusOf(date) === 'done').length;
  return (
    <Box title={weekTitle(week[0]).replace(/차$/, '')} aside={`${done}/7`}>
      <View style={{ marginTop: 6, gap: 6 }} accessibilityLabel={`이번 주 ${done}일 달성`}>
        <View style={{ flexDirection: 'row' }}>
          {WEEK7.map((d, i) => (
            <T key={d} s={12} w={all[i] === today ? '700' : '600'} c={all[i] === today ? t.ink : t.mute} center style={{ flex: 1 }}>
              {d}
            </T>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {all.map((date, i) => {
            const status = date > today ? 'future' : goals.statusOf(date);
            return (
              <View key={date} style={{ flex: 1, alignItems: 'center' }}>
                <DayMark variant="week" status={status} label={WEEK7[i]} today={date === today} extra={goals.extraOf(date)} a11yLabel={`${WEEK7[i]}요일${status === 'done' ? ' 달성' : ''}`} />
              </View>
            );
          })}
        </View>
      </View>
    </Box>
  );
}

/** 이번 주에 나온 기사. 안 읽은 기사는 파랑 점. */
function WeekArticles() {
  const t = useTheme();
  const nav = useNav();
  const { user } = useStore();
  const { inWeek } = useWeek();
  const list = inWeek.flatMap((d) => d.articles);
  if (list.length === 0) return null;
  return (
    <Box style={{ paddingVertical: 8 }}>
      {list.map((a, i) => {
        const read = !!user.read[a.id];
        return (
          <Rise key={a.id} delay={60 + i * 40} y={6}>
            <Tap press="soft" onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 열기`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
              <ReadMark read={read} />
              <T type="t5" w="600" c={read ? t.sub : t.ink} style={{ flex: 1 }}>
                {a.title}
              </T>
            </Tap>
          </Rise>
        );
      })}
    </Box>
  );
}

export function ReviewScreen() {
  const { reviews } = useStore();
  const { inWeek } = useWeek();
  const review = reviews[0];
  return (
    <TabScreen title="리뷰">
      <Rise y={8}>
        <WeekRecap />
      </Rise>
      {inWeek.some((d) => d.articles.length > 0) ? (
        <Rise y={8} delay={40}>
          <WeekArticles />
        </Rise>
      ) : null}
      {review && review.questions.length > 0 ? (
        <Rise y={8} delay={80}>
          <Quiz key={review.id} review={review} />
        </Rise>
      ) : null}
    </TabScreen>
  );
}
