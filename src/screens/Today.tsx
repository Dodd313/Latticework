import React, { useState } from 'react';
import { View } from 'react-native';
import { isWeekend, korean, todayKST } from '../dates';
import { TabScreen, useNav } from '../nav';
import { STANDALONE, streak, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, Followup } from '../types';
import { Card, Chip, EmptyState, Icon, ReadMark, T, Tap, VERDICT_LABEL, verdictTone } from '../ui';

function Story({ a, read, lead }: { a: Article; read: boolean; lead: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const related = a.links.filter((l) => l.kind !== 'new').length;
  return (
    <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 읽기`}>
      <View style={{ gap: 10, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Chip label={a.category} />
          <ReadMark read={read} />
        </View>
        <T serif s={lead ? 26 : 22} w="700" lh={lead ? 1.36 : 1.4} c={read ? t.sub : t.ink} role="heading" level={2}>
          {a.title}
        </T>
        <T s={15} lh={1.65} c={t.deck}>
          {a.gist}
        </T>
        <T s={12.5} c={t.sub}>
          {a.source} · 읽는 시간 {a.minutes}분{related > 0 ? ` · 관련 기사 ${related}건` : ''}
        </T>
      </View>
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
      <View style={{ gap: 6, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <T s={12.5} w="700" c={t.sub} lines={1} style={{ flexShrink: 1, letterSpacing: 0.3 }}>
            후속 점검 · {korean(f.refDate)} 보도
          </T>
          <Chip label={VERDICT_LABEL[f.verdict]} tone={verdictTone(f.verdict)} />
        </View>
        <T s={14.5} lh={1.6} c={t.deck}>
          {f.text}
        </T>
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
  const { days, user, status } = useStore();
  const today = todayKST();
  const day = days[0];
  const total = day ? day.articles.length : 0;
  const done = day ? day.articles.filter((a) => user.read[a.id]).length : 0;
  const run = streak(days, user.read);
  const stale = day && day.date !== today;

  const settings = (
    <Tap onPress={() => nav.push({ name: 'settings' })} label="설정" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
      <Icon name="gear" />
    </Tap>
  );

  const dated = day ? day.date : today;
  return (
    <TabScreen
      title="Latticework 시사"
      subtitle={`${dated.slice(0, 4)}년 ${korean(dated)}`}
      meta={day ? `읽은 기사 ${done}/${total} · 연속 ${run}일` : undefined}
      right={settings}
      contentStyle={{ gap: 0 }}
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
            <T s={12.5} c={t.sub} style={{ paddingTop: 12 }}>
              {isWeekend(today) ? '주말에는 발행하지 않습니다.' : '오늘 자 기사는 발행 전입니다.'}
            </T>
          ) : null}
          {day.articles.map((a, i) => (
            <Story key={a.id} a={a} read={!!user.read[a.id]} lead={i === 0} />
          ))}
          {(day.followups ?? []).map((f, i) => (
            <FollowupCard key={`${f.refDate}-${i}`} f={f} />
          ))}
          {day.note ? (
            <T s={13} c={t.sub} style={{ paddingTop: 14 }}>
              {day.note}
            </T>
          ) : null}
        </>
      )}
    </TabScreen>
  );
}
