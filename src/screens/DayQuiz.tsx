import React from 'react';
import { ScrollView, View } from 'react-native';
import { korean } from '../dates';
import { BackBar } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Day, Review } from '../types';
import { T } from '../ui';
import { Quiz } from './Review';

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

export function DayQuizScreen({ date }: { date: string }) {
  const t = useTheme();
  const { days } = useStore();
  const review = dayQuiz(days.find((d) => d.date === date));
  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      <BackBar label="오늘" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 36, gap: 14 }}>
        <View style={{ gap: 6, paddingBottom: 8 }}>
          <T s={12.5} w="700" c={t.sub} style={{ letterSpacing: 0.3 }}>
            {korean(date)}
          </T>
          <T serif s={26} w="700" lh={1.35} role="heading" level={1}>
            저녁 퀴즈
          </T>
          <T s={14} lh={1.6} c={t.sub}>
            아침에 읽은 기사에서 기사마다 두 문항을 냅니다.
          </T>
        </View>
        {review ? <Quiz key={review.id} review={review} /> : <T s={14} c={t.sub}>이 날짜에는 퀴즈가 없습니다.</T>}
      </ScrollView>
    </View>
  );
}
