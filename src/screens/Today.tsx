import React, { useState } from 'react';
import { View } from 'react-native';
import { WEEKDAY_SHORT, isWeekend, korean, todayKST, weekdaysOf } from '../dates';
import { Pulse, Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { STANDALONE, dayStatus, streak, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, Day } from '../types';
import { Card, DayMark, EmptyState, Icon, ReadMark, T, Tap } from '../ui';
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
    ? `${total}문항 가운데 ${correct}문항을 맞혔습니다.`
    : !open
      ? `오후 ${QUIZ_OPEN_HOUR - 12}시에 열립니다. 아침에 읽은 내용을 저녁에 확인합니다.`
      : unread > 0
        ? '기사를 모두 읽으면 풀 수 있습니다.'
        : answered > 0
          ? `${total - answered}문항 남았습니다.`
          : `기사마다 두 문항, 모두 ${total}문항입니다.`;
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

/** 연속 기록과 이번 주 달성 현황. 오늘 할 일을 한 줄로 알려 준다. */
function StreakPanel() {
  const t = useTheme();
  const { days, user } = useStore();
  const today = todayKST();
  const run = streak(days, user);
  const byDate: Record<string, (typeof days)[number]> = {};
  days.forEach((d) => (byDate[d.date] = d));
  const todayDay = byDate[today];
  const status = dayStatus(todayDay, user, today);
  const left = todayDay ? todayDay.articles.filter((a) => !user.read[a.id]).length : 0;
  const hadBreak = days.some((d) => d.date < today && dayStatus(d, user, today) !== 'done');

  let line: string;
  if (status === 'done') line = '오늘 목표를 달성했습니다.';
  else if (status === 'pending' && left < (todayDay?.articles.length ?? 0)) line = `${left}건 남았습니다. 마저 읽으면 연속 ${run + 1}일이 됩니다.`;
  else if (status === 'pending' && run > 0) line = `오늘 ${left}건을 읽으면 연속 ${run + 1}일이 됩니다.`;
  else if (status === 'pending') line = hadBreak ? `오늘 ${left}건을 읽고 연속 기록을 다시 시작하세요.` : `오늘 ${left}건을 읽으면 연속 기록이 시작됩니다.`;
  else if (isWeekend(today)) line = run > 0 ? '주말에는 발행하지 않습니다. 연속 기록은 유지됩니다.' : '주말에는 발행하지 않습니다.';
  else line = run > 0 ? '오늘 자 기사는 발행 전입니다. 발행되면 연속 기록을 이어 가세요.' : '오늘 자 기사는 발행 전입니다.';

  return (
    <View style={{ gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.rule }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <T s={13} w="700" c={t.sub} style={{ letterSpacing: 0.4 }}>
            연속
          </T>
          <T serif s={34} w="700" lh={1.1}>
            {run}
          </T>
          <T s={13} w="700" c={t.sub}>
            일
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel="이번 주 달성 현황">
          {weekdaysOf(today).map((date, i) => {
            const st = date > today ? 'future' : dayStatus(byDate[date], user, today);
            return <DayMark key={date} status={st} label={WEEKDAY_SHORT[i]} size={34} today={date === today} />;
          })}
        </View>
      </View>
      <T s={14} w="500" lh={1.5}>
        {line}
      </T>
    </View>
  );
}

const HINT_KEY = 'lw.installHint.v1';

/** 자체 주소를 사파리 탭으로 열었을 때만: 홈 화면에 추가하는 법을 한 번 알려 준다. */
function InstallHint() {
  const t = useTheme();
  const g = globalThis as any;
  const installed = !!g.navigator?.standalone || !!g.matchMedia?.('(display-mode: standalone)')?.matches;
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return g.localStorage?.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!STANDALONE || installed || hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      g.localStorage?.setItem(HINT_KEY, '1');
    } catch {
      // 저장을 못 해도 이번에는 닫는다.
    }
  };
  return (
    <Card tone="blue" style={{ gap: 8, marginTop: 14 }}>
      <T s={15} w="600">
        홈 화면에 추가하면 앱처럼 열립니다
      </T>
      <T s={14} c={t.onBlueTint}>
        사파리 아래의 공유 버튼을 누르고 "홈 화면에 추가"를 고르세요. 주소창 없이 전체 화면으로 열립니다.
      </T>
      <Tap onPress={close} label="안내 닫기" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <T s={14} w="600" c={t.blue}>
          확인
        </T>
      </Tap>
    </Card>
  );
}

export function TodayScreen() {
  const t = useTheme();
  const nav = useNav();
  const { days, user, status } = useStore();
  const today = todayKST();
  const day = days[0];
  const stale = day && day.date !== today;

  const settings = (
    <Tap onPress={() => nav.push({ name: 'settings' })} label="설정" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
      <Icon name="gear" />
    </Tap>
  );

  return (
    <TabScreen title="Latticework 시사" subtitle={`${today.slice(0, 4)}년 ${korean(today)}`} right={settings} contentStyle={{ gap: 0 }}>
      <InstallHint />
      {!day ? (
        status === 'loading' ? (
          <Pulse style={{ gap: 12, paddingVertical: 24 }}>
            <View style={{ width: 96, height: 12, backgroundColor: t.chip }} />
            <View style={{ height: 26, backgroundColor: t.chip }} />
            <View style={{ width: '72%', height: 26, backgroundColor: t.chip }} />
            <View style={{ height: 14, backgroundColor: t.chip, marginTop: 4 }} />
            <View style={{ width: '54%', height: 14, backgroundColor: t.chip }} />
          </Pulse>
        ) : (
          <EmptyState title="첫 발행을 준비 중입니다" body="평일 오전 7시 15분 전후에 주요 뉴스 2건을 발행합니다. 그날 안에 2건을 모두 읽으면 하루 목표 달성입니다." />
        )
      ) : (
        <>
          <Rise delay={60}>
            <StreakPanel />
          </Rise>
          {stale ? (
            <T s={12.5} c={t.sub} style={{ paddingTop: 14 }}>
              아래는 {korean(day.date)} 자 기사입니다.
            </T>
          ) : null}
          {day.articles.map((a, i) => (
            <Rise key={a.id} delay={160 + i * 110}>
              <Story a={a} read={!!user.read[a.id]} lead={i === 0} />
            </Rise>
          ))}
          <Rise delay={160 + day.articles.length * 110}>
            <QuizRow day={day} />
          </Rise>
        </>
      )}
    </TabScreen>
  );
}
