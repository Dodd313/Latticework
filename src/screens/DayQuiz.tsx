import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { korean } from '../dates';
import { MView, NATIVE_DRIVER, Rise, WEB, motionOff, spring, webTween } from '../motion';
import { BOTTOM_PAD, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Day, Review } from '../types';
import { Chip, Icon, LipButton, ProgressBar, Ring, T, Tap } from '../ui';
import { QuizFeedback, QuizNav, QuizQuestion, QuizState, quizCheer, useQuiz } from './Review';

/** 저녁 퀴즈의 저장 키. 주간 퀴즈와 같은 저장 칸(user.quiz)을 쓴다. */
export function dayQuizId(date: string): string {
  return `day-${date}`;
}

/** 그날 기사들의 문항을 한 묶음으로 만든다. 문항이 없으면 null. */
export function dayQuiz(day: Day | undefined): Review | null {
  if (!day) return null;
  const questions = day.articles.flatMap((a) => (a.quiz ?? []).map((q) => ({ ...q, refArticleId: a.id, refDate: day.date })));
  if (questions.length === 0) return null;
  return { id: dayQuizId(day.date), title: `${korean(day.date)} 퀴즈`, range: `${questions.length}문항`, questions };
}

/** 저녁 퀴즈가 열리는 시각(한국 시각 18시). 지난 날짜의 퀴즈는 언제든 열려 있다. */
export const QUIZ_OPEN_HOUR = 18;

export function quizOpen(date: string, now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const today = kst.toISOString().slice(0, 10);
  if (date < today) return true;
  return date === today && kst.getUTCHours() >= QUIZ_OPEN_HOUR;
}

/** 위쪽 줄(높이 64): 닫기 X, 진행 막대 16, 맞힌 수/문항 수. 연속 정답이 2 이상이면 막대가 주황이 되고 ×N 이 뜬다. */
function QuizHeader({ s }: { s: QuizState }) {
  const t = useTheme();
  const nav = useNav();
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
      <Tap onPress={nav.pop} label="홈(으)로 돌아가기" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
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

export function DayQuizScreen({ date }: { date: string }) {
  const t = useTheme();
  const { days } = useStore();
  const review = dayQuiz(days.find((d) => d.date === date));
  if (!review) {
    return (
      <View style={{ flex: 1, backgroundColor: t.card }}>
        <EmptyHeader />
        <View style={{ padding: 20 }}>
          <T type="t6" c={t.sub}>
            퀴즈 없음
          </T>
        </View>
      </View>
    );
  }
  return <DayQuizBody key={review.id} review={review} />;
}

function EmptyHeader() {
  const t = useTheme();
  const nav = useNav();
  return (
    <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
      <Tap onPress={nav.pop} label="홈(으)로 돌아가기" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={24} color={t.faint} sw={2.4} />
      </Tap>
    </View>
  );
}

/** 다 푼 뒤의 결과: 응원 한 줄 아래에 맞힌 수/문항 수. */
function DayQuizDone({ s, onReview, onClose }: { s: QuizState; onReview: () => void; onClose: () => void }) {
  const t = useTheme();
  const acc = s.total ? s.correct / s.total : 0;
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <EmptyHeader />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 32, paddingHorizontal: 16, paddingBottom: 24, gap: 28 }}>
        <Rise y={8} style={{ alignSelf: 'stretch', alignItems: 'center', gap: 4 }}>
          <T type="t6" w="600" c={t.sub} center>
            {s.review.title}
          </T>
          <T type="t2" w="700" center role="heading" level={1}>
            {quizCheer(s.review, s.correct, s.total)}
          </T>
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

function DayQuizBody({ review }: { review: Review }) {
  const t = useTheme();
  const nav = useNav();
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
      <DayQuizDone
        s={s}
        onReview={() => {
          s.setAt(0);
          setShowDone(false);
        }}
        onClose={nav.pop}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <QuizHeader s={s} />
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
