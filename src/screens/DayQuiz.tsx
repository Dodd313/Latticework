import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { korean } from '../dates';
import { NATIVE_DRIVER, motionOff, spring } from '../motion';
import { BOTTOM_PAD, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Day, Review } from '../types';
import { Chip, Icon, ProgressBar, T, Tap } from '../ui';
import { QuizFeedback, QuizNav, QuizQuestion, QuizState, useQuiz } from './Review';

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
  useEffect(() => {
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
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 56, top: 2, opacity: pop.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: pop }] }}>
          <Chip tone="hot" label={`×${s.combo}`} />
        </Animated.View>
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

function DayQuizBody({ review }: { review: Review }) {
  const t = useTheme();
  const nav = useNav();
  const s = useQuiz(review);
  const r = s.resultOf(s.at);
  const [footH, setFootH] = useState(96);
  const [panelH, setPanelH] = useState(0);
  const scroll = useRef<any>(null);
  const slide = useRef(new Animated.Value(0)).current;

  // 답하면 풀이 판이 아래에서 올라온다(quick 스프링). 단추는 제자리에 있다.
  useEffect(() => {
    if (!r) return;
    if (motionOff()) {
      slide.setValue(1);
    } else {
      slide.setValue(0);
      spring(slide, 1, 'quick', { native: NATIVE_DRIVER }).start();
    }
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [s.at, !!r]);

  const cover = r ? Math.max(0, panelH - footH) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <QuizHeader s={s} />
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 + cover }}>
        <QuizQuestion s={s} big />
      </ScrollView>

      {r ? (
        <Animated.View
          key={s.at}
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
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [panelH || 400, 0] }) }],
          }}
        >
          <QuizFeedback s={s} big />
        </Animated.View>
      ) : null}

      <View onLayout={(e) => setFootH(e.nativeEvent.layout.height)} style={{ zIndex: 2, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 22 }}>
        <QuizNav s={s} onEnd={nav.pop} />
        <View style={{ height: BOTTOM_PAD }} />
      </View>
    </View>
  );
}
