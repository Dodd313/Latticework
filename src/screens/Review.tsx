import React, { useState } from 'react';
import { View } from 'react-native';
import { WEEKDAY_SHORT, isWeekend, shortStamp, todayKST, weekTitle, weekdaysOf } from '../dates';
import { Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { dayStatus, useStore } from '../store';
import { useTheme } from '../theme';
import { Review } from '../types';
import { Card, DayMark, ReadMark, SectionTitle, T, Tap } from '../ui';

function Quiz({ review }: { review: Review }) {
  const t = useTheme();
  const nav = useNav();
  const { user, answerQuiz } = useStore();
  const answers = user.quiz[review.id] ?? {};
  const firstOpen = review.questions.findIndex((_, i) => answers[String(i)] === undefined);
  const [at, setAt] = useState(firstOpen === -1 ? 0 : firstOpen);
  const q = review.questions[at];
  const picked = answers[String(at)];
  const answered = picked !== undefined;
  const correctCount = review.questions.filter((qq, i) => answers[String(i)] === qq.answer).length;
  const allDone = review.questions.every((_, i) => answers[String(i)] !== undefined);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 0 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }} aria-hidden>
          {review.questions.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: answers[String(i)] !== undefined ? t.ink : i === at ? t.mute : t.track }} />
          ))}
        </View>
        <T s={13} c={t.sub} mono>
          {at + 1}/{review.questions.length}
        </T>
      </View>

      <Rise trigger={at} y={10}>
      <Card style={{ gap: 12 }}>
        <T serif s={20} w="700" lh={1.45} role="heading" level={2}>
          {q.q}
        </T>
        <View style={{ gap: 8 }}>
          {q.options.map((opt, i) => {
            const isAnswer = answered && i === q.answer;
            const isWrong = answered && i === picked && i !== q.answer;
            return (
              <Tap
                key={i}
                onPress={() => answerQuiz(review.id, at, i)}
                disabled={answered}
                selected={picked === i}
                label={opt}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    minHeight: 48,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 0,
                    borderWidth: 1.5,
                    backgroundColor: isAnswer ? t.blueTint : isWrong ? t.orangeTint : t.card,
                    borderColor: isAnswer ? t.blue : isWrong ? t.orange : t.line,
                  },
                  answered ? { opacity: 1 } : null,
                ]}
              >
                <T s={15} w="500" style={{ flex: 1 }}>
                  {opt}
                </T>
                {isAnswer ? (
                  <T s={12} w="700" c={t.blue}>
                    정답
                  </T>
                ) : isWrong ? (
                  <T s={12} w="700" c={t.orange}>
                    내 답
                  </T>
                ) : null}
              </Tap>
            );
          })}
        </View>
        {answered ? (
          <Rise y={8} style={{ gap: 6, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 12 }}>
            <T s={14} lh={1.5}>
              {q.explain}
            </T>
            {q.refArticleId ? (
              <Tap onPress={() => nav.push({ name: 'article', id: q.refArticleId! })} label="관련 기사 보기" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <T s={14} w="600" c={t.blue}>
                  관련 기사 보기
                </T>
              </Tap>
            ) : null}
          </Rise>
        ) : (
          <T s={13} c={t.sub}>
            답을 선택하면 해설이 표시됩니다.
          </T>
        )}
      </Card>
      </Rise>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tap onPress={() => setAt(Math.max(0, at - 1))} disabled={at === 0} label="이전 문항" style={{ flex: 1, height: 48, borderRadius: 0, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
          <T s={15} w="600">
            이전
          </T>
        </Tap>
        <Tap
          onPress={() => setAt(Math.min(review.questions.length - 1, at + 1))}
          disabled={at === review.questions.length - 1}
          label="다음 문항"
          style={{ flex: 1, height: 48, borderRadius: 0, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}
        >
          <T s={15} w="600" c={t.onInverse}>
            다음
          </T>
        </Tap>
      </View>

      {allDone ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 0 }}>
          <T s={14} w="600">
            이번 주 정답 수
          </T>
          <T s={16} w="600" mono>
            {correctCount}/{review.questions.length}
          </T>
        </Card>
      ) : null}

    </>
  );
}

/** 이번 주 달성 현황과 이번 주에 발행된 기사 다시 보기 */
function WeekRecap() {
  const t = useTheme();
  const nav = useNav();
  const { days, user } = useStore();
  const today = todayKST();
  const anchor = days[0]?.date && days[0].date > today ? today : (days[0]?.date ?? today);
  const week = weekdaysOf(isWeekend(today) || !days.some((d) => weekdaysOf(today).includes(d.date)) ? anchor : today);
  const inWeek = days.filter((d) => week.includes(d.date)).slice().reverse();
  const done = inWeek.filter((d) => dayStatus(d, user, today) === 'done').length;
  return (
    <>
      <View style={{ gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.rule }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T s={13} w="700" c={t.sub} style={{ letterSpacing: 0.4 }}>
              달성
            </T>
            <T serif s={34} w="700" lh={1.1}>
              {done}
            </T>
            <T s={13} w="700" c={t.sub}>
              / {inWeek.length}일
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel="이번 주 달성 현황">
            {week.map((date, i) => {
              const day = days.find((d) => d.date === date);
              return <DayMark key={date} status={date > today ? 'future' : dayStatus(day, user, today)} label={WEEKDAY_SHORT[i]} size={34} today={date === today} />;
            })}
          </View>
        </View>
      </View>

      {inWeek.length > 0 ? (
        <View style={{ paddingTop: 10 }}>
          <SectionTitle title="이번 주 기사" />
          {inWeek.map((d, di) =>
            d.articles.map((a, ai) => (
              <Rise key={a.id} delay={80 + (di * 2 + ai) * 50}>
                <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 열기`} style={{ gap: 6, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.lineSoft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <T s={12.5} c={t.sub} mono>
                      {shortStamp(d.date)}
                    </T>
                    <ReadMark read={!!user.read[a.id]} />
                  </View>
                  <T serif s={17} w="700" lh={1.45} c={user.read[a.id] ? t.sub : t.ink}>
                    {a.title}
                  </T>
                  <T s={14} lh={1.6} c={t.deck}>
                    {a.gist}
                  </T>
                </Tap>
              </Rise>
            )),
          )}
        </View>
      ) : null}
    </>
  );
}

export function ReviewScreen() {
  const t = useTheme();
  const { reviews, days } = useStore();
  const review = reviews[0];
  const today = todayKST();
  return (
    <TabScreen title="주간 리뷰" subtitle={weekTitle(days[0]?.date ?? today)} contentStyle={{ gap: 0 }}>
      <WeekRecap />
      <View style={{ gap: 12, paddingTop: 26 }}>
        <View style={{ borderTopWidth: 3, borderTopColor: t.rule, paddingTop: 12 }}>
          <SectionTitle title={review && review.questions.length > 0 ? `주간 퀴즈 · ${review.title}` : '주간 퀴즈'} />
        </View>
        {review && review.questions.length > 0 ? (
          <Quiz key={review.id} review={review} />
        ) : (
          <T s={14} lh={1.6} c={t.sub}>
            금요일 오전에 한 주간 기사에서 다섯 문항을 출제합니다. 오답 문항은 다음 주에 다시 출제합니다.
          </T>
        )}
      </View>
    </TabScreen>
  );
}
