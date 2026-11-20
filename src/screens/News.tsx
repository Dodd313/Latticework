import React from 'react';
import { ScrollView, View } from 'react-native';
import { isWeekend, korean, todayKST } from '../dates';
import { Rise } from '../motion';
import { BackBar, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Article, Day } from '../types';
import { EmptyState, Icon, ReadMark, T, Tap } from '../ui';
import { QUIZ_OPEN_HOUR, dayQuiz, quizOpen } from './DayQuiz';

function Story({ a, read, lead }: { a: Article; read: boolean; lead: boolean }) {
  const t = useTheme();
  const nav = useNav();
  return (
    <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`}>
      <View style={{ gap: 10, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <T serif s={lead ? 26 : 22} w="700" lh={lead ? 1.36 : 1.4} c={read ? t.sub : t.ink} role="heading" level={2}>
          {a.title}
        </T>
        <T s={15} lh={1.65} c={t.deck}>
          {a.gist}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12.5} c={t.sub}>
            {a.source} · 읽는 시간 {a.minutes}분
          </T>
          <ReadMark read={read} />
        </View>
      </View>
    </Tap>
  );
}

/** 저녁 퀴즈로 가는 줄. 저녁 6시 전에는 잠겨 있고, 풀고 나면 정답 수를 보여 준다. */
function QuizRow({ day }: { day: Day }) {
  const t = useTheme();
  const nav = useNav();
  const { user } = useStore();
  const review = dayQuiz(day);
  if (!review) return null;
  const answers = user.quiz[review.id] ?? {};
  const total = review.questions.length;
  const answered = review.questions.filter((_, i) => answers[String(i)] !== undefined).length;
  const correct = review.questions.filter((q, i) => answers[String(i)] === q.answer).length;
  const unread = day.articles.filter((a) => !user.read[a.id]).length;
  const open = quizOpen(day.date);
  const done = answered === total;
  const ready = open && unread === 0;
  const line = done
    ? `정답 ${correct}/${total}`
    : !open
      ? `${QUIZ_OPEN_HOUR}:00`
      : unread > 0
        ? `읽은 기사 ${day.articles.length - unread}/${day.articles.length}`
        : `${answered}/${total}`;
  return (
    <Tap onPress={() => nav.push({ name: 'quiz', date: day.date })} disabled={!ready && !done} label="저녁 퀴즈 풀기">
      <View style={{ gap: 8, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12.5} w="700" c={t.blue} style={{ letterSpacing: 0.3 }}>
            저녁 퀴즈
          </T>
          {done ? <ReadMark read /> : ready ? <ReadMark read={false} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <T s={15} w="500" lh={1.55} style={{ flex: 1 }}>
            {line}
          </T>
          {ready || done ? <Icon name="next" size={18} color={t.ink} bold /> : null}
        </View>
      </View>
    </Tap>
  );
}

export function NewsScreen() {
  const t = useTheme();
  const { days, user } = useStore();
  const today = todayKST();
  const day = days[0];
  const stale = day && day.date !== today;
  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      <BackBar label="오늘" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 32 }}>
        <View style={{ gap: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.rule }}>
          <T s={12.5} w="700" c={t.sub} style={{ letterSpacing: 0.3 }}>
            {day ? korean(day.date) : korean(today)}
          </T>
          <T serif s={26} w="700" lh={1.35} role="heading" level={1}>
            오늘의 주요 뉴스
          </T>
          {stale ? (
            <T s={13} c={t.sub}>
              {isWeekend(today) ? '주말 휴간' : '발행 전'} · 지난 발행분
            </T>
          ) : null}
        </View>
        {!day ? (
          <EmptyState title="기사 없음" />
        ) : (
          <>
            {day.articles.map((a, i) => (
              <Rise key={a.id} delay={80 + i * 110}>
                <Story a={a} read={!!user.read[a.id]} lead={i === 0} />
              </Rise>
            ))}
            <Rise delay={80 + day.articles.length * 110}>
              <QuizRow day={day} />
            </Rise>
          </>
        )}
      </ScrollView>
    </View>
  );
}
