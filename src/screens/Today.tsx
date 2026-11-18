import React, { useState } from 'react';
import { View } from 'react-native';
import { isWeekend, korean, stamp, todayKST } from '../dates';
import { TabScreen, useNav } from '../nav';
import { STANDALONE, streak, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, Followup } from '../types';
import { Card, Chip, EmptyState, Icon, T, Tap, VERDICT_LABEL, verdictTone } from '../ui';

function ArticleCard({ a, read }: { a: Article; read: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const threadLine = a.threadName ? (a.isNewThread ? `새 이슈 · ${a.threadName}` : `${a.threadName}${a.threadOrder ? ` · ${a.threadOrder}번째 기사` : ''}`) : null;
  return (
    <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexShrink: 1 }}>
            <Chip label={a.category} />
            {read ? <Chip label="읽음" tone="neutral" /> : null}
          </View>
          <T s={12} c={t.sub} mono>
            {a.minutes}분
          </T>
        </View>
        <T s={19} w="600" lh={1.36} role="heading" level={2}>
          {a.title}
        </T>
        <T s={14} c={t.sub}>
          {a.gist}
        </T>
        {threadLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Icon name="threads" size={16} color={t.blue} bold />
            <T s={13} w="500" c={t.blue} lines={1} style={{ flexShrink: 1 }}>
              {threadLine}
            </T>
          </View>
        ) : null}
      </Card>
    </Tap>
  );
}

function FollowupCard({ f }: { f: Followup }) {
  const t = useTheme();
  const nav = useNav();
  const open = () => {
    if (f.threadId) nav.openThread(f.threadId);
    else if (f.refArticleId) nav.push({ name: 'article', id: f.refArticleId });
  };
  return (
    <Tap onPress={open} label="후속 점검 보기">
      <Card style={{ gap: 6, paddingVertical: 12, borderRadius: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12} w="600" c={t.sub} lines={1} style={{ flexShrink: 1 }}>
            후속 점검 · {korean(f.refDate)} 보도
          </T>
          <Chip label={VERDICT_LABEL[f.verdict]} tone={verdictTone(f.verdict)} />
        </View>
        <T s={14}>{f.text}</T>
      </Card>
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
    <Card tone="blue" style={{ gap: 8, borderRadius: 14 }}>
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
  const total = day ? day.articles.length : 0;
  const done = day ? day.articles.filter((a) => user.read[a.id]).length : 0;
  const minutes = day ? day.articles.reduce((n, a) => n + (a.minutes || 0), 0) : 0;
  const run = streak(days, user.read);
  const stale = day && day.date !== today;

  const settings = (
    <Tap onPress={() => nav.push({ name: 'settings' })} label="설정" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
      <Icon name="gear" />
    </Tap>
  );

  return (
    <TabScreen
      title="오늘의 주요 뉴스"
      subtitle={day ? `${total}건 · 읽는 시간 ${minutes}분` : '평일 오전, 경제 뉴스 2건을 발행합니다.'}
      top={
        <T s={13} w="500" c={t.sub} mono style={{ letterSpacing: 0.5 }}>
          {stamp(day ? day.date : today)}
        </T>
      }
      right={settings}
    >
      <InstallHint />
      {!day ? (
        <EmptyState
          title={status === 'loading' ? '기사를 불러오는 중입니다' : '첫 발행을 준비 중입니다'}
          body="평일 오전 7시 15분 전후에 주요 뉴스 2건을 발행합니다. 핵심 요약과 본문, 관련 기사를 함께 싣습니다."
        />
      ) : (
        <>
          {stale ? (
            <View style={{ paddingHorizontal: 4 }}>
              <T s={13} c={t.sub}>
                {isWeekend(today) ? '주말에는 발행하지 않습니다.' : '오늘 자 기사는 발행 전입니다.'} 아래는 {korean(day.date)} 자 기사입니다.
              </T>
            </View>
          ) : null}
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderRadius: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T s={14} w="600">
                읽은 기사
              </T>
              <View style={{ flexDirection: 'row', gap: 4 }} aria-hidden>
                {day.articles.map((a) => (
                  <View key={a.id} style={{ width: 28, height: 6, borderRadius: 3, backgroundColor: user.read[a.id] ? t.ink : t.track }} />
                ))}
              </View>
              <T s={13} c={t.sub} mono>
                {done}/{total}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <T s={13} c={t.sub}>
                연속
              </T>
              <T s={16} w="600" mono>
                {run}일
              </T>
            </View>
          </Card>
          {day.articles.map((a) => (
            <ArticleCard key={a.id} a={a} read={!!user.read[a.id]} />
          ))}
          {(day.followups ?? []).map((f, i) => (
            <FollowupCard key={`${f.refDate}-${i}`} f={f} />
          ))}
          {day.note ? (
            <View style={{ paddingHorizontal: 4 }}>
              <T s={13} c={t.sub}>
                {day.note}
              </T>
            </View>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}
