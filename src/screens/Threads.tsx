import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { monthDay, shortStamp } from '../dates';
import { Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Thread, ThreadEntry, ThreadEntryKind } from '../types';
import { Card, Chip, EmptyState, T, Tap, Tone, VERDICT_LABEL, verdictTone } from '../ui';

const KIND_LABEL: Record<ThreadEntryKind, string> = { start: '첫 보도', continue: '후속 보도', reverse: '반전', cross: '연관 이슈', pattern: '유사 사례', check: '후속 점검' };
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
      <Card style={{ gap: 10, borderTopWidth: 0, paddingTop: 6 }}>
        <View style={{ gap: 4 }}>
          <T serif s={21} w="700" lh={1.38} role="heading" level={2}>
            {th.name}
          </T>
          <T s={12} c={t.sub} mono>
            {monthDay(th.startedAt)} 첫 보도 · 기사 {count}건 · {th.status === 'active' ? '진행 중' : '종결'}
          </T>
        </View>
        {th.indicator ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 10 }}>
            <T s={13} c={t.sub} style={{ flex: 1 }}>
              주요 지표 · {th.indicator.label}
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
      <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: t.line }}>
        {th.entries.map((e, i) => (
          <Rise key={`${e.date}-${i}`} trigger={th.id} delay={80 + i * 90}>
            <Entry e={e} last={i === th.entries.length - 1 && !th.nextCheck} />
          </Rise>
        ))}
        {th.nextCheck ? (
          <Rise trigger={th.id} delay={80 + th.entries.length * 90}>
            <Entry e={{ date: th.nextCheck.date, kind: 'check', title: th.nextCheck.text }} last />
          </Rise>
        ) : null}
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
    <TabScreen title="이슈" subtitle="이슈별 보도 흐름을 시간순으로 봅니다.">
      {threads.length === 0 ? (
        <EmptyState title="등록된 이슈가 없습니다" body="첫 기사가 발행되면 이슈별 타임라인이 만들어집니다. 후속 보도가 나오면 같은 이슈에 이어 싣습니다." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
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
                    borderRadius: 0,
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
