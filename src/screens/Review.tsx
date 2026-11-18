import React, { useState } from 'react';
import { View } from 'react-native';
import { Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Review } from '../types';
import { Card, EmptyState, Icon, T, Tap } from '../ui';

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
        {q.threadName ? (
          <T s={12} w="600" c={t.blue}>
            {q.threadName}
          </T>
        ) : null}
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

      {review.threadSummary ? (
        <Tap onPress={() => nav.setTab('threads')} label="이번 주 이슈 보기">
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 0 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T s={14} w="600">
                이번 주 이슈
              </T>
              <T s={13} c={t.sub}>
                {review.threadSummary}
              </T>
            </View>
            <Icon name="next" size={18} />
          </Card>
        </Tap>
      ) : null}
    </>
  );
}

export function ReviewScreen() {
  const { reviews } = useStore();
  const review = reviews[0];
  return (
    <TabScreen title="주간 뉴스 퀴즈" subtitle={review ? `${review.title} · ${review.range}` : '한 주간 보도를 다섯 문항으로 점검합니다.'}>
      {review && review.questions.length > 0 ? (
        <Quiz key={review.id} review={review} />
      ) : (
        <EmptyState title="첫 퀴즈는 금요일 오전에 발행합니다" body="한 주간 발행된 기사에서 다섯 문항을 출제합니다. 오답 문항은 다음 주에 다시 출제합니다." />
      )}
    </TabScreen>
  );
}
