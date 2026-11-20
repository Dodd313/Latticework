import React from 'react';
import { useNav } from '../nav';
import { QuizEmpty, QuizRunner } from '../quizKit';
import { useStore, weeklyReviewFor } from '../store';

/** 주간 종합 퀴즈(지식 탭 뉴스의 주 머리에서 연다). id 는 ISO 주 이름(예: 2026-W47) */
export function WeeklyQuizScreen({ id }: { id: string }) {
  const nav = useNav();
  const { reviews } = useStore();
  const review = weeklyReviewFor(reviews, id);
  if (!review || review.questions.length === 0) return <QuizEmpty onClose={nav.pop} />;
  return <QuizRunner key={review.id} review={review} onClose={nav.pop} />;
}
