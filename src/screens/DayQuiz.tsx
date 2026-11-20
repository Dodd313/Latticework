import React from 'react';
import { korean } from '../dates';
import { useNav } from '../nav';
import { QuizEmpty, QuizRunner } from '../quizKit';
import { useStore } from '../store';
import { Day, Review } from '../types';

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
  const nav = useNav();
  const { days } = useStore();
  const review = dayQuiz(days.find((d) => d.date === date));
  if (!review) return <QuizEmpty onClose={nav.pop} />;
  return <QuizRunner key={review.id} review={review} onClose={nav.pop} />;
}
