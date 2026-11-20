import React from 'react';
import { ScrollView, View } from 'react-native';
import { todayKST } from '../dates';
import { Rise } from '../motion';
import { BackBar, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Article, Day } from '../types';
import { Box, EmptyState, Icon, ReadMark, T, Tap } from '../ui';
import { QUIZ_OPEN_HOUR, dayQuiz, quizOpen } from './DayQuiz';

/** 11월 20일 */
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 머리기사 한 줄: 왼쪽 읽음 점, 제목, 요지, 출처와 분량. */
function Story({ a, read }: { a: Article; read: boolean }) {
  const t = useTheme();
  const nav = useNav();
  return (
    <Tap press="soft" onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
        <ReadMark read={read} />
        <View style={{ flex: 1, gap: 4 }}>
          <T s={17} lh={1.5} w="600" c={read ? t.sub : t.ink} role="heading" level={2}>
            {a.title}
          </T>
          <T type="t6" c={t.sub}>
            {a.gist}
          </T>
          <T type="t7" c={t.mute} mono>
            {a.source} · {a.minutes}분
          </T>
        </View>
      </View>
    </Tap>
  );
}

/** 저녁 퀴즈 카드. 열리기 전에는 시각과 자물쇠, 기사를 다 읽기 전에는 자물쇠, 푼 뒤에는 정답 수. */
function QuizCard({ day }: { day: Day }) {
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
  const locked = !ready && !done;
  return (
    <Box style={{ paddingVertical: 16 }}>
      <Tap press="soft" onPress={() => nav.push({ name: 'quiz', date: day.date })} disabled={locked} label="저녁 퀴즈 풀기">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: done ? t.greenWeak : t.blueWeak, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="note" size={22} color={done ? t.greenText : t.blueText} />
          </View>
          <T s={16} w="600" style={{ flex: 1 }} lines={1}>
            저녁 퀴즈
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {done ? (
              <T s={15} w="700" c={t.greenText} mono>
                {correct}/{total}
              </T>
            ) : !open ? (
              <T s={15} w="600" c={t.mute} mono>
                {QUIZ_OPEN_HOUR}:00
              </T>
            ) : ready ? (
              <T s={15} w="600" c={t.mute} mono>
                {answered}/{total}
              </T>
            ) : (
              <T s={14} w="600" c={t.mute} mono>
                읽은 기사 {day.articles.length - unread}/{day.articles.length}
              </T>
            )}
            {locked ? <Icon name="lock" size={18} color={t.faint} /> : <Icon name="chev" size={14} color={t.faint} />}
          </View>
        </View>
      </Tap>
    </Box>
  );
}

export function NewsScreen() {
  const t = useTheme();
  const { days, user } = useStore();
  const day = days[0];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar label="홈" bg={t.bg} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20, gap: 12 }}>
          <T s={26} w="700" lh={1.35} role="heading" level={1} style={{ flexShrink: 1 }}>
            오늘의 뉴스
          </T>
          <T s={15} w="600" c={t.mute} mono>
            {shortDate(day ? day.date : todayKST())}
          </T>
        </View>
        <View style={{ paddingHorizontal: 12, gap: 12 }}>
          {!day ? (
            <EmptyState title="기사 없음" />
          ) : (
            <>
              <Rise delay={60}>
                <Box style={{ paddingVertical: 8 }}>
                  {day.articles.map((a) => (
                    <Story key={a.id} a={a} read={!!user.read[a.id]} />
                  ))}
                </Box>
              </Rise>
              <Rise delay={140}>
                <QuizCard day={day} />
              </Rise>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
