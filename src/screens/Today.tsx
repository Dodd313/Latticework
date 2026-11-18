import React, { useState } from 'react';
import { View } from 'react-native';
import { addDays, isWeekend, korean, todayKST, weekdaysOf } from '../dates';
import { Pulse, Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { GoalPart, STANDALONE, useGoals, useStore } from '../store';
import { levelOf } from '../study';
import { useTheme } from '../theme';
import { Card, DayMark, Icon, ReadMark, T, Tap } from '../ui';
import { dayQuiz, quizOpen } from './DayQuiz';

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
const PART_NAME: Record<GoalPart['key'], string> = { news: '뉴스', voc: '영단어', lat: 'Latticework' };

/** 오늘 끝낸 과제 수, 이번 주 달성 표식, 오늘 할 일 한 줄. */
function TodayPanel() {
  const t = useTheme();
  const goals = useGoals();
  const { today, parts, streak, status } = goals;
  const doneCount = parts.filter((p) => p.complete).length;
  const left = parts.filter((p) => !p.complete).map((p) => PART_NAME[p.key]);
  const monday = weekdaysOf(today)[0];

  let line: string;
  if (parts.length === 0) line = isWeekend(today) ? '주말에는 뉴스를 발행하지 않습니다.' : '오늘 자 기사는 발행 전입니다. 발행되면 자동으로 올라옵니다.';
  else if (status === 'done') line = '오늘 할 일을 모두 마쳤습니다.';
  else if (left.length === parts.length) line = `오늘 할 일은 ${left.join(', ')}입니다. 모두 마치면 연속 ${streak + 1}일이 됩니다.`;
  else line = `${left.join('와 ')}가 남았습니다. 마치면 연속 ${streak + 1}일이 됩니다.`;

  return (
    <View style={{ gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.rule }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <T s={13} w="700" c={t.sub} style={{ letterSpacing: 0.4 }}>
            오늘
          </T>
          <T serif s={34} w="700" lh={1.1}>
            {doneCount}
          </T>
          <T s={13} w="700" c={t.sub}>
            / {parts.length}
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel="이번 주 달성 현황">
          {WEEK.map((label, i) => {
            const date = addDays(monday, i);
            return <DayMark key={date} status={date > today ? 'future' : goals.statusOf(date)} label={label} size={30} today={date === today} />;
          })}
        </View>
      </View>
      <T s={14} w="500" lh={1.5}>
        {line}
      </T>
    </View>
  );
}

/** 과제 한 줄. 제목 아래에 진행 막대와 남은 양을 보여 준다. */
function SectionRow({ kicker, title, meta, part, onPress, locked }: { kicker: string; title: string; meta: string; part?: GoalPart; onPress: () => void; locked?: boolean }) {
  const t = useTheme();
  const complete = !!part?.complete;
  return (
    <Tap onPress={onPress} disabled={locked} label={`${kicker} 열기`}>
      <View style={{ gap: 8, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T s={12.5} w="700" c={t.blue} style={{ letterSpacing: 0.3 }}>
            {kicker}
          </T>
          {part ? <ReadMark read={complete} /> : null}
        </View>
        <T serif s={21} w="700" lh={1.4} c={complete ? t.sub : t.ink} role="heading" level={2}>
          {title}
        </T>
        {part && part.total > 1 && !complete && part.done > 0 ? (
          <View style={{ flexDirection: 'row', gap: 4 }} aria-hidden>
            {Array.from({ length: Math.min(part.total, 15) }).map((_, i) => (
              <View key={i} style={{ flex: 1, height: 3, backgroundColor: i < part.done ? t.rule : t.line }} />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12.5} c={t.sub} style={{ flex: 1 }}>
            {meta}
          </T>
          {part ? (
            <T s={12.5} c={t.sub} mono>
              {part.done}/{part.total}
            </T>
          ) : null}
        </View>
      </View>
    </Tap>
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
  const { days, user, status, studyData, study } = useStore();
  const goals = useGoals();
  const today = goals.today;
  const part = (key: GoalPart['key']) => goals.parts.find((p) => p.key === key);
  const day = days[0];
  const todayDay = day && day.date === today ? day : undefined;

  const settings = (
    <Tap onPress={() => nav.push({ name: 'settings' })} label="설정" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
      <Icon name="gear" />
    </Tap>
  );

  // 뉴스 줄: 오늘 자가 있으면 아직 안 읽은 기사의 제목을, 다 읽었으면 저녁 퀴즈 상태를 보여 준다.
  const unread = todayDay?.articles.find((a) => !user.read[a.id]);
  const quiz = dayQuiz(todayDay);
  const quizAnswers = quiz ? (user.quiz[quiz.id] ?? {}) : {};
  const quizLeft = quiz ? quiz.questions.filter((_, i) => quizAnswers[String(i)] === undefined).length : 0;
  let newsTitle = '오늘의 주요 뉴스 2건';
  let newsMeta = '';
  if (!todayDay) {
    newsTitle = day ? '지난 발행분 보기' : '첫 발행을 준비 중입니다';
    newsMeta = isWeekend(today) ? '주말에는 발행하지 않습니다' : '오늘 자 기사는 발행 전입니다';
  } else if (unread) {
    newsTitle = unread.title;
    newsMeta = `${unread.source} · 읽는 시간 ${unread.minutes}분`;
  } else if (quiz && quizLeft > 0) {
    newsMeta = quizOpen(today) ? `저녁 퀴즈 ${quizLeft}문항이 남았습니다` : '모두 읽음 · 저녁 6시에 퀴즈가 열립니다';
  } else {
    newsMeta = quiz ? '모두 읽음 · 저녁 퀴즈 완료' : '모두 읽음';
  }

  const rec = study.days[today];
  const vocPart = part('voc');
  const latPart = part('lat');
  const newCount = studyData ? studyData.vocab.filter((v) => !study.cards[v.id]).length : 0;
  const fields = studyData ? Array.from(new Set(studyData.concepts.map((c) => c.field).filter(Boolean))).slice(0, 3).join(' · ') : '';

  return (
    <TabScreen title="Latticework" subtitle={`${today.slice(0, 4)}년 ${korean(today)}`} meta={`연속 ${goals.streak}일`} right={settings} contentStyle={{ gap: 0 }}>
      <InstallHint />
      {status === 'loading' && !day ? (
        <Pulse style={{ gap: 12, paddingVertical: 24 }}>
          <View style={{ width: 96, height: 12, backgroundColor: t.chip }} />
          <View style={{ height: 26, backgroundColor: t.chip }} />
          <View style={{ width: '72%', height: 26, backgroundColor: t.chip }} />
        </Pulse>
      ) : (
        <>
          <Rise delay={60}>
            <TodayPanel />
          </Rise>
          <Rise delay={160}>
            <SectionRow kicker="뉴스" title={newsTitle} meta={newsMeta} part={part('news')} onPress={() => nav.push({ name: 'news' })} locked={!day} />
          </Rise>
          {studyData ? (
            <>
              <Rise delay={260}>
                <SectionRow
                  kicker="영단어"
                  title={vocPart ? (vocPart.complete ? '오늘 분량을 마쳤습니다' : `오늘의 표현 ${vocPart.total}개`) : '오늘은 복습할 표현이 없습니다'}
                  meta={vocPart && !vocPart.complete ? `금융영어 · 일반회화 · 아직 안 본 표현 ${newCount}개` : '더 풀기로 약한 표현을 다시 볼 수 있습니다'}
                  part={vocPart}
                  onPress={() => nav.push({ name: 'study', sect: 'voc' })}
                />
              </Rise>
              <Rise delay={360}>
                <SectionRow
                  kicker="Latticework"
                  title={latPart?.complete ? '오늘의 5문제를 마쳤습니다' : `오늘의 ${rec?.latGoal ?? 5}문제`}
                  meta={latPart?.complete ? '더 풀기로 약한 개념을 다시 볼 수 있습니다' : `${fields} · 개념 ${studyData.concepts.length}개`}
                  part={latPart}
                  onPress={() => nav.push({ name: 'study', sect: 'lat' })}
                />
              </Rise>
              <T s={12.5} c={t.sub} style={{ paddingTop: 14 }}>
                레벨 {levelOf(study.xp)} · 경험치 {study.xp}점
              </T>
            </>
          ) : STANDALONE ? (
            <T s={13} c={t.sub} style={{ paddingTop: 14 }}>
              복습 자료를 받는 중입니다.
            </T>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}
