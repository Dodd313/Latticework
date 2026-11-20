import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { WEEKDAYS_KO, monthGrid, monthKey, monthTitle, shiftMonth, shortStamp, todayKST } from '../dates';
import { Rise } from '../motion';
import { TabScreen, useNav } from '../nav';
import { DayStatus, useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { Day } from '../types';
import { DayMark, EmptyState, Icon, ReadMark, T, Tap } from '../ui';

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T s={12.5} w="700" c={t.sub} style={{ letterSpacing: 0.3 }}>
        {label}
      </T>
      <T serif s={24} w="700" lh={1.25}>
        {value}
      </T>
    </View>
  );
}

function Legend({ status, label }: { status: DayStatus; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <DayMark status={status} label="" size={14} />
      <T s={12} c={t.sub}>
        {label}
      </T>
    </View>
  );
}

function Calendar({ month, statusOf, onPrev, onNext, canPrev, canNext }: { month: string; statusOf: (date: string) => DayStatus; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean }) {
  const t = useTheme();
  const today = todayKST();
  const weeks = monthGrid(month);
  return (
    <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.line, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Tap onPress={onPrev} disabled={!canPrev} label="이전 달" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }}>
          <Icon name="back" size={20} />
        </Tap>
        <T serif s={18} w="700" role="heading" level={2}>
          {monthTitle(month)}
        </T>
        <Tap onPress={onNext} disabled={!canNext} label="다음 달" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}>
          <Icon name="next" size={20} />
        </Tap>
      </View>
      <View style={{ flexDirection: 'row' }} aria-hidden>
        {WEEKDAYS_KO.map((d) => (
          <View key={d} style={{ flex: 1, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <T s={12} c={t.mute} lh={1.3}>
              {d}
            </T>
          </View>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((date, di) => (
              <View key={di} style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                {date ? <DayMark status={date > today ? 'future' : statusOf(date)} label={String(Number(date.slice(8)))} size={34} today={date === today} /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 8 }}>
        <Legend status="done" label="달성" />
        <Legend status="late" label="늦게 읽음" />
        <Legend status="missed" label="미달성" />
        <Legend status="pending" label="오늘" />
      </View>
    </View>
  );
}

export function ArchiveScreen() {
  const t = useTheme();
  const nav = useNav();
  const { days, user } = useStore();
  const [q, setQ] = useState('');
  const latest = days[0]?.date ?? todayKST();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? monthKey(latest);
  const today = todayKST();

  const goals = useGoals();

  const oldest = days.length ? monthKey(days[days.length - 1].date) : shown;
  const newest = monthKey(today);
  const needle = q.trim().toLowerCase();
  const filtering = needle !== '';
  const doneThisMonth = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= 31; d++) {
      const date = `${shown}-${String(d).padStart(2, '0')}`;
      if (date <= today && goals.statusOf(date) === 'done') n += 1;
    }
    return n;
  }, [shown, today, goals]);

  const groups = days
    .filter((d) => filtering || monthKey(d.date) === shown)
    .map((d) => ({ date: d.date, articles: d.articles.filter((a) => !needle || [a.title, a.gist].join(' ').toLowerCase().includes(needle)) }))
    .filter((g) => g.articles.length > 0);

  return (
    <TabScreen title="기록">
      {days.length === 0 ? (
        <EmptyState title="기록 없음" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 6, paddingBottom: 4 }}>
            <Stat label="연속" value={`${goals.streak}일`} />
            <Stat label="최장 연속" value={`${goals.longest}일`} />
            <Stat label="이달 달성" value={`${doneThisMonth}일`} />
          </View>
          <Calendar month={shown} statusOf={goals.statusOf} canPrev={shown > oldest} canNext={shown < newest} onPrev={() => setMonth(shiftMonth(shown, -1))} onNext={() => setMonth(shiftMonth(shown, 1))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, backgroundColor: t.field }}>
            <Icon name="search" size={18} color={t.sub} />
            <TextInput
              nativeID="archive-search"
              accessibilityLabel="기사 검색"
              value={q}
              onChangeText={setQ}
              placeholder="기사 제목 검색"
              placeholderTextColor={t.mute}
              style={[{ flex: 1, height: 44, fontFamily: FONT_SANS, fontSize: 16, color: t.ink }, { outlineStyle: 'none' } as any]}
            />
          </View>
          {groups.length === 0 ? (
            <T s={14} c={t.sub} style={{ paddingTop: 4 }}>
              {filtering ? '결과 없음' : '기사 없음'}
            </T>
          ) : (
            groups.map((g, gi) => (
              <Rise key={g.date} trigger={`${shown}-${needle}`} delay={60 + gi * 50} style={{ gap: 2 }}>
                <T s={12.5} w="700" c={t.sub} mono style={{ paddingTop: 8, letterSpacing: 0.3 }}>
                  {shortStamp(g.date)}
                  {g.date === today ? ' · 오늘' : ''}
                </T>
                {g.articles.map((a) => (
                  <Tap key={a.id} onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 열기`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.lineSoft }}>
                    <T serif s={16} w="600" lines={2} lh={1.45} c={user.read[a.id] ? t.sub : t.ink} style={{ flex: 1 }}>
                      {a.title}
                    </T>
                    <ReadMark read={!!user.read[a.id]} />
                  </Tap>
                ))}
              </Rise>
            ))
          )}
        </>
      )}
    </TabScreen>
  );
}
