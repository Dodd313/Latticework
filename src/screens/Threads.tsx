import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { monthDay, shortStamp } from '../dates';
import { TabScreen, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Thread, ThreadEntry, ThreadEntryKind } from '../types';
import { Card, Chip, EmptyState, T, Tap, Tone, VERDICT_LABEL, verdictTone } from '../ui';

const KIND_LABEL: Record<ThreadEntryKind, string> = { start: '실 시작', continue: '이어짐', reverse: '뒤집힘', cross: '교차', pattern: '반복 패턴', check: '점검' };
const KIND_TONE: Record<ThreadEntryKind, Tone> = { start: 'neutral', continue: 'solid', reverse: 'orange', cross: 'blue', pattern: 'blue', check: 'outline' };

function Entry({ e, last }: { e: ThreadEntry; last: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const dot = e.kind === 'start' ? t.ink : e.kind === 'reverse' ? t.orange : t.blue;
  const hollow = e.kind === 'cross' || e.kind === 'check';
  const content = (
    <View style={{ flex: 1, gap: 4, paddingBottom: last ? 0 : 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <T s={12} c={t.sub} mono>
          {shortStamp(e.date)}
        </T>
        <Chip label={KIND_LABEL[e.kind]} tone={KIND_TONE[e.kind]} />
        {e.verdict ? <Chip label={VERDICT_LABEL[e.verdict]} tone={verdictTone(e.verdict)} /> : null}
      </View>
      <T s={15} w="600" lh={1.4}>
        {e.title}
      </T>
      {e.note ? (
        <T s={13} c={t.sub} lh={1.45}>
          {e.note}
        </T>
      ) : null}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 16, alignItems: 'center' }} aria-hidden>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            marginTop: 4,
            backgroundColor: hollow ? t.ground : dot,
            borderWidth: hollow ? 3 : 0,
            borderColor: e.kind === 'check' ? t.mute : dot,
          }}
        />
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: t.track, marginTop: 4 }} /> : null}
      </View>
      {e.articleId ? (
        <Tap onPress={() => nav.push({ name: 'article', id: e.articleId! })} label={`${e.title} 열기`} style={{ flex: 1 }}>
          {content}
        </Tap>
      ) : (
        content
      )}
    </View>
  );
}

function ThreadView({ th }: { th: Thread }) {
  const t = useTheme();
  const count = th.entries.filter((e) => e.articleId).length;
  return (
    <>
      <Card style={{ gap: 10 }}>
        <View style={{ gap: 4 }}>
          <T s={18} w="700" lh={1.3} role="heading" level={2}>
            {th.name}
          </T>
          <T s={12} c={t.sub} mono>
            {monthDay(th.startedAt)} 시작 · 기사 {count}건 · {th.status === 'active' ? '진행 중' : '마무리됨'}
          </T>
        </View>
        {th.indicator ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 10 }}>
            <T s={13} c={t.sub} style={{ flex: 1 }}>
              추적 지표 · {th.indicator.label}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T s={18} w="600" mono>
                {th.indicator.value}
              </T>
              <T s={12} c={t.sub} mono>
                {monthDay(th.indicator.asOf)}
              </T>
            </View>
          </View>
        ) : null}
      </Card>
      <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
        {th.entries.map((e, i) => (
          <Entry key={`${e.date}-${i}`} e={e} last={i === th.entries.length - 1 && !th.nextCheck} />
        ))}
        {th.nextCheck ? <Entry e={{ date: th.nextCheck.date, kind: 'check', title: th.nextCheck.text }} last /> : null}
      </View>
    </>
  );
}

export function ThreadsScreen() {
  const t = useTheme();
  const nav = useNav();
  const { threads } = useStore();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (nav.threadFocus) setPicked(nav.threadFocus);
  }, [nav.threadFocus]);

  const current = threads.find((x) => x.id === picked) ?? threads[0];

  return (
    <TabScreen title="연결" subtitle="읽은 기사를 실로 꿰어 흐름을 봅니다.">
      {threads.length === 0 ? (
        <EmptyState title="아직 실이 없습니다" body="첫 기사가 올라오면 주제마다 실이 하나씩 시작됩니다. 이후 기사가 이어지거나 뒤집힐 때마다 여기에 꿰어집니다." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {threads.map((th) => {
              const on = current && th.id === current.id;
              return (
                <Tap
                  key={th.id}
                  onPress={() => setPicked(th.id)}
                  selected={on}
                  label={th.name}
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    borderRadius: 22,
                    justifyContent: 'center',
                    backgroundColor: on ? t.inverse : t.card,
                    borderWidth: 1,
                    borderColor: on ? t.inverse : t.line,
                  }}
                >
                  <T s={14} w={on ? '600' : '500'} c={on ? t.onInverse : t.ink} lines={1}>
                    {th.name}
                  </T>
                </Tap>
              );
            })}
          </ScrollView>
          {current ? <ThreadView th={current} /> : null}
        </>
      )}
    </TabScreen>
  );
}
