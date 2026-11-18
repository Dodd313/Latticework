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
  const threadLine = a.threadName ? (a.isNewThread ? `새 실 시작 · ${a.threadName}` : `${a.threadName}${a.threadOrder ? ` · ${a.threadOrder}번째` : ''}`) : null;
  return (
    <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexShrink: 1 }}>
            <Chip label={a.category} />
            {read ? <Chip label="읽음" tone="neutral" /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T s={12} c={t.sub}>
              투자 관련도
            </T>
            <T s={17} w="600" c={t.orange} mono>
              {a.relevance.total}
            </T>
          </View>
        </View>
        <T s={19} w="600" lh={1.36} role="heading" level={2}>
          {a.title}
        </T>
        <T s={14} c={t.sub}>
          {a.gist}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          {threadLine ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <Icon name="threads" size={16} color={t.blue} bold />
              <T s={13} w="500" c={t.blue} lines={1} style={{ flexShrink: 1 }}>
                {threadLine}
              </T>
            </View>
          ) : (
            <View />
          )}
          <T s={12} c={t.sub} mono>
            {a.minutes}분
          </T>
        </View>
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
    <Tap onPress={open} label="추적 지표 점검 결과 보기">
      <Card style={{ gap: 6, paddingVertical: 12, borderRadius: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12} w="600" c={t.sub} lines={1} style={{ flexShrink: 1 }}>
            추적 지표 점검 · {korean(f.refDate)} 기사
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
          알겠습니다
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
      title={total === 1 ? '오늘의 한 건' : '오늘의 두 건'}
      subtitle={day ? `주식투자 관련도로 고른 ${total}건, ${minutes}분이면 읽습니다.` : '주식투자 관련도로 고른 경제 뉴스를 매일 두 건씩 읽습니다.'}
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
          title={status === 'loading' ? '기사를 불러오고 있습니다' : '첫 기사를 준비하고 있습니다'}
          body="평일 오전 7시 30분 전후에 그날의 두 건이 올라옵니다. 요약, 시장 영향, 지난 기사와의 연결이 함께 정리됩니다."
        />
      ) : (
        <>
          {stale ? (
            <View style={{ paddingHorizontal: 4 }}>
              <T s={13} c={t.sub}>
                {isWeekend(today) ? '주말에는 새 기사가 올라오지 않습니다.' : '오늘 기사는 아직 올라오지 않았습니다.'} 아래는 {korean(day.date)} 기사입니다.
              </T>
            </View>
          ) : null}
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderRadius: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T s={14} w="600">
                {stale ? '이날 읽기' : '오늘 읽기'}
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
              <T s={16} w="600" mono>
                {run}
              </T>
              <T s={13} c={t.sub}>
                일 연속
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
