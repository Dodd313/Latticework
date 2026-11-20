// 퀴즈 공통 부품. 저녁 퀴즈(DayQuiz), 주간 종합 퀴즈, 돌아보기 위에 뜨는 퀴즈가 같이 쓴다.
// 답은 store 의 user.quiz 에, 점수는 user.scores 에 저장한다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { cheerQuiz, seedOf } from './cheer';
import { LattiSays, LattiSource, lattiSay } from './latti';
import { MView, NATIVE_DRIVER, Rise, WEB, motionOff, spring, webTween } from './motion';
import { BOTTOM_PAD, useNav } from './nav';
import { useStore } from './store';
import { useTheme } from './theme';
import { Review, ReviewQuestion } from './types';
import { Chip, Icon, LipButton, OptionState, OptionTile, ProgressBar, Rich, Ring, T, Tap } from './ui';

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
    pick: (choice) => answerQuiz(review.id, at, choice, { right: choice === q.answer, total: review.questions.length, prevRight: correct, prevAnswered: done }),
  };
}

/**
 * 다 푼 퀴즈의 한 줄. 숫자는 맞힌 수와 문항 수. 순간이 퀴즈와 결과에 묶여 있어 어느 화면에서 봐도 같은 줄이다.
 * src(store 의 Latti 조각)를 주면 Latti 의 한 줄, 없거나 Latti 문구가 없으면 예전 응원 문장.
 */
export function quizCheer(review: Review, right: number, total: number, src?: LattiSource): string {
  const old = () => cheerQuiz({ right, total, seed: seedOf(review.id, 'quiz', right, total) });
  if (!src) return old();
  return lattiSay(src, 'quiz', { total, right }, quizMoment(review, right, total), old).text ?? old();
}

/** 퀴즈 결과 한 줄의 순간 이름. */
export function quizMoment(review: Review, right: number, total: number): string {
  return `quiz:${review.id}:${right}:${total}`;
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
export function ResultIcon({ right }: { right: boolean }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  const ref = useRef<any>(null);
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (WEB) {
      // 웹: 같은 스프링을 브라우저에 맡긴다.
      const tw = motionOff() ? null : webTween(ref, { spring: 'bounce' }, (x) => ({ transform: `scale(${0.4 + 0.6 * x})` }), { delay: 60 });
      return () => tw?.anim.cancel();
    }
    const a = spring(v, 1, 'bounce', { delay: 60, native: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, []);
  return (
    <MView
      ref={ref}
      accessibilityRole="image"
      accessibilityLabel={right ? '정답' : '오답'}
      style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, WEB ? null : { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
    >
      {right ? <Icon name="check" size={20} color={t.green} sw={3.4} /> : <Icon name="x" size={18} color={t.red} sw={3.4} />}
    </MView>
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
export function QuizSegments({ s }: { s: QuizState }) {
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

// ─────────────────────────────────────────────────────────────
// 한 화면 퀴즈
// ─────────────────────────────────────────────────────────────

/** 위쪽 줄(높이 64): 닫기 X, 진행 막대 16, 맞힌 수/문항 수. 연속 정답이 2 이상이면 막대가 주황이 되고 ×N 이 뜬다. */
export function QuizHeader({ s, onClose }: { s: QuizState; onClose: () => void }) {
  const t = useTheme();
  const hot = s.combo >= 2;
  const pop = useRef(new Animated.Value(hot ? 1 : 0)).current;
  const chip = useRef<any>(null);
  // 웹: 칩이 나타나는 순간(그리기 전) 같은 스프링을 브라우저에 건다.
  useLayoutEffect(() => {
    if (!WEB || !hot || motionOff()) return;
    const tw = webTween(chip, { spring: 'bounce' }, (v) => ({ opacity: Math.max(0, Math.min(1, (v - 0.6) / 0.4)), transform: `scale(${v})` }), { from: 0.6, to: 1 });
    return () => tw?.anim.cancel();
  }, [s.combo]);
  useEffect(() => {
    if (WEB) return;
    if (!hot) {
      pop.setValue(0);
      return;
    }
    if (motionOff()) return pop.setValue(1);
    pop.setValue(0.6);
    const a = spring(pop, 1, 'bounce', { native: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [s.combo]);
  return (
    <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, backgroundColor: t.card }}>
      <Tap onPress={onClose} label="홈(으)로 돌아가기" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={24} color={t.faint} sw={2.4} />
      </Tap>
      <ProgressBar value={s.total ? s.done / s.total : 0} hot={hot} style={{ flex: 1 }} a11yLabel="푼 문항" />
      <T s={15} w="700" c={t.deck} mono style={{ minWidth: 52, textAlign: 'right' }}>
        {`${s.correct}/${s.total}`}
      </T>
      {hot ? (
        <MView ref={chip} pointerEvents="none" style={[{ position: 'absolute', left: 56, top: 2 }, WEB ? null : { opacity: pop.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: pop }] }]}>
          <Chip tone="hot" label={`×${s.combo}`} />
        </MView>
      ) : null}
    </View>
  );
}


/** 퀴즈가 없을 때: 닫기 X 와 짧은 한 줄. */
export function QuizEmpty({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <EmptyHeader onClose={onClose} />
      <View style={{ padding: 20 }}>
        <T type="t6" c={t.sub}>
          퀴즈 없음
        </T>
      </View>
    </View>
  );
}

function EmptyHeader({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
      <Tap onPress={onClose} label="홈(으)로 돌아가기" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={24} color={t.faint} sw={2.4} />
      </Tap>
    </View>
  );
}

/** 다 푼 뒤의 결과: 응원 한 줄 아래에 맞힌 수/문항 수. */
export function QuizDone({ s, onReview, onClose }: { s: QuizState; onReview: () => void; onClose: () => void }) {
  const t = useTheme();
  const { latti, lattiHist, noteLatti } = useStore();
  const acc = s.total ? s.correct / s.total : 0;
  const line = quizCheer(s.review, s.correct, s.total, { latti, lattiHist, noteLatti });
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <EmptyHeader onClose={onClose} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 32, paddingHorizontal: 16, paddingBottom: 24, gap: 28 }}>
        <Rise y={8} style={{ alignSelf: 'stretch', alignItems: 'center', gap: latti ? 14 : 4 }}>
          <T type="t6" w="600" c={t.sub} center role={latti ? 'heading' : undefined} level={1}>
            {s.review.title}
          </T>
          {latti ? (
            <LattiSays text={line} size={36} bubble="l" side="bottom" delay={120} style={{ alignSelf: 'stretch' }} />
          ) : (
            <T type="t2" w="700" center role="heading" level={1}>
              {line}
            </T>
          )}
        </Rise>
        <Rise y={10} delay={120}>
          <Ring value={acc} color={t.green} a11yLabel={`정답 ${s.correct}/${s.total}`}>
            <T s={36} w="800" mono lh={40 / 36} style={{ letterSpacing: -1 }}>
              {`${s.correct}/${s.total}`}
            </T>
            <T s={13} w="600" c={t.mute} lh={1.4}>
              정답
            </T>
          </Ring>
        </Rise>
      </ScrollView>
      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 22 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <LipButton label="문항 보기" tone="ghost" onPress={onReview} style={{ flex: 1 }} />
          <LipButton label="닫기" onPress={onClose} style={{ flex: 1 }} />
        </View>
        <View style={{ height: BOTTOM_PAD }} />
      </View>
    </View>
  );
}

/** 한 화면을 다 쓰는 퀴즈 진행(저녁 퀴즈, 주간 종합 퀴즈). 다 풀면 결과, 닫으면 onClose. */
export function QuizRunner({ review, onClose }: { review: Review; onClose: () => void }) {
  const t = useTheme();
  const s = useQuiz(review);
  const r = s.resultOf(s.at);
  // 이미 다 푼 퀴즈를 다시 열면 결과부터 보여 준다.
  const [showDone, setShowDone] = useState(s.allDone);
  const [footH, setFootH] = useState(96);
  const [panelH, setPanelH] = useState(0);
  const scroll = useRef<any>(null);
  const slide = useRef(new Animated.Value(WEB ? 1 : 0)).current;
  const panel = useRef<any>(null);
  // 웹: 판이 그려지기 전에 같은 스프링을 건다. 판 높이만큼 내려간 자리는 translateY(100%) 다.
  useLayoutEffect(() => {
    if (!WEB || !r || motionOff()) return;
    const tw = webTween(panel, { spring: 'quick' }, (v) => ({ transform: `translateY(${(1 - v) * 100}%)` }));
    return () => tw?.anim.cancel();
  }, [s.at, !!r]);

  // 답하면 풀이 판이 아래에서 올라온다(quick 스프링). 단추는 제자리에 있다.
  useEffect(() => {
    if (!r) return;
    if (motionOff() || WEB) {
      slide.setValue(1);
    } else {
      slide.setValue(0);
      spring(slide, 1, 'quick', { native: NATIVE_DRIVER }).start();
    }
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [s.at, !!r]);

  const cover = r ? Math.max(0, panelH - footH) : 0;
  if (showDone && s.allDone) {
    return (
      <QuizDone
        s={s}
        onReview={() => {
          s.setAt(0);
          setShowDone(false);
        }}
        onClose={onClose}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <QuizHeader s={s} onClose={onClose} />
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 + cover }}>
        <QuizQuestion s={s} big />
      </ScrollView>

      {r ? (
        <MView
          key={s.at}
          ref={panel}
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            paddingTop: 20,
            paddingHorizontal: 16,
            paddingBottom: footH + 8,
            backgroundColor: r === 'right' ? t.greenWeak : t.redWeak,
            ...(WEB ? null : { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [panelH || 400, 0] }) }] }),
          }}
        >
          <QuizFeedback s={s} big />
        </MView>
      ) : null}

      <View onLayout={(e) => setFootH(e.nativeEvent.layout.height)} style={{ zIndex: 2, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 22 }}>
        <QuizNav s={s} onEnd={() => setShowDone(true)} endLabel="결과 보기" />
        <View style={{ height: BOTTOM_PAD }} />
      </View>
    </View>
  );
}
