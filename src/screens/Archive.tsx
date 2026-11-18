import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { WEEKDAYS_KO, monthGrid, monthKey, monthTitle, shiftMonth, shortStamp, todayKST } from '../dates';
import { TabScreen, useNav } from '../nav';
import { dayDone, useStore } from '../store';
import { FONT_MONO, FONT_SANS, useTheme } from '../theme';
import { Article, Day } from '../types';
import { Card, Chip, Divider, EmptyState, Icon, T, Tap } from '../ui';

function topicOf(a: Article): string {
  const parts = a.category.split('·').map((s) => s.trim());
  return parts[parts.length - 1] || a.category;
}

function Calendar({ month, byDate, read, onPrev, onNext, canPrev, canNext }: { month: string; byDate: Record<string, Day>; read: Record<string, string>; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean }) {
  const t = useTheme();
  const today = todayKST();
  const weeks = monthGrid(month);
  const inMonth = Object.values(byDate).filter((d) => monthKey(d.date) === month);
  const done = inMonth.filter((d) => dayDone(d, read)).length;
  const missed = inMonth.filter((d) => !dayDone(d, read) && d.date !== today).length;
  return (
    <Card style={{ gap: 6, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Tap onPress={onPrev} disabled={!canPrev} label="이전 달" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={20} />
          </Tap>
          <T s={15} w="700" role="heading" level={2}>
            {monthTitle(month)}
          </T>
          <Tap onPress={onNext} disabled={!canNext} label="다음 달" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="next" size={20} />
          </Tap>
        </View>
        <T s={12} c={t.sub} mono style={{ paddingRight: 4 }}>
          읽은 날 {done} · 놓친 날 {missed}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }} aria-hidden>
        {WEEKDAYS_KO.map((d) => (
          <View key={d} style={{ flex: 1, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            <T s={12} c={t.mute} lh={1.3}>
              {d}
            </T>
          </View>
        ))}
      </View>
      <View style={{ gap: 2 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row', gap: 2 }}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={{ flex: 1, height: 32 }} />;
              const day = byDate[date];
              const isToday = date === today;
              const isDone = day ? dayDone(day, read) : false;
              const isMissed = !!day && !isDone && !isToday;
              const bg = isToday ? t.inverse : isDone ? t.blueTint : 'transparent';
              const fg = isToday ? t.onInverse : isDone ? t.blue : isMissed ? t.orange : day ? t.ink : t.mute;
              return (
                <View
                  key={di}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                    borderWidth: isMissed ? 1 : 0,
                    borderColor: t.orange,
                    borderStyle: 'dashed',
                  }}
                >
                  <T s={14} w={isToday || isDone ? '600' : '400'} c={fg} mono lh={1.2}>
                    {Number(date.slice(8))}
                  </T>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ArchiveScreen() {
  const t = useTheme();
  const nav = useNav();
  const { days, user } = useStore();
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const latest = days[0]?.date ?? todayKST();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? monthKey(latest);

  const byDate = useMemo(() => {
    const m: Record<string, Day> = {};
    days.forEach((d) => (m[d.date] = d));
    return m;
  }, [days]);

  const topics = useMemo(() => {
    const seen: string[] = [];
    days.forEach((d) => d.articles.forEach((a) => !seen.includes(topicOf(a)) && seen.push(topicOf(a))));
    return seen.slice(0, 12);
  }, [days]);

  const oldest = days.length ? monthKey(days[days.length - 1].date) : shown;
  const newest = monthKey(todayKST());
  const needle = q.trim().toLowerCase();
  const filtering = needle !== '' || topic !== null;

  const groups = days
    .filter((d) => filtering || monthKey(d.date) === shown)
    .map((d) => ({
      date: d.date,
      articles: d.articles.filter((a) => {
        if (topic && topicOf(a) !== topic) return false;
        if (!needle) return true;
        const memo = user.memos[a.id]?.text ?? '';
        return [a.title, a.category, a.gist, a.threadName ?? '', memo].join(' ').toLowerCase().includes(needle);
      }),
    }))
    .filter((g) => g.articles.length > 0);

  return (
    <TabScreen title="아카이브">
      {days.length === 0 ? (
        <EmptyState title="아직 읽은 기사가 없습니다" body="기사가 쌓이면 달력에 읽은 날이 표시되고, 제목과 태그, 내 메모로 찾아볼 수 있습니다." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: t.field }}>
            <Icon name="search" size={18} color={t.sub} />
            <TextInput
              nativeID="archive-search"
              accessibilityLabel="기사 검색"
              value={q}
              onChangeText={setQ}
              placeholder="제목, 태그, 내 메모 검색"
              placeholderTextColor={t.mute}
              style={[{ flex: 1, height: 44, fontFamily: FONT_SANS, fontSize: 16, color: t.ink }, { outlineStyle: 'none' } as any]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {[null, ...topics].map((name) => {
              const on = topic === name;
              return (
                <Tap
                  key={name ?? '전체'}
                  onPress={() => setTopic(name)}
                  selected={on}
                  label={name ?? '전체'}
                  style={{ height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: on ? t.inverse : t.card, borderWidth: 1, borderColor: on ? t.inverse : t.line }}
                >
                  <T s={14} w={on ? '600' : '500'} c={on ? t.onInverse : t.ink}>
                    {name ?? '전체'}
                  </T>
                </Tap>
              );
            })}
          </ScrollView>
          {!filtering ? (
            <Calendar
              month={shown}
              byDate={byDate}
              read={user.read}
              canPrev={shown > oldest}
              canNext={shown < newest}
              onPrev={() => setMonth(shiftMonth(shown, -1))}
              onNext={() => setMonth(shiftMonth(shown, 1))}
            />
          ) : null}
          {groups.length === 0 ? (
            <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
              <T s={14} c={t.sub}>
                {filtering ? '조건에 맞는 기사가 없습니다.' : '이 달에는 기사가 없습니다.'}
              </T>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.date} style={{ gap: 6 }}>
                <T s={12} w="500" c={t.sub} style={{ fontFamily: FONT_MONO, paddingHorizontal: 4 }}>
                  {shortStamp(g.date)}
                  {g.date === todayKST() ? ' · 오늘' : ''}
                </T>
                <Card style={{ paddingVertical: 0, paddingHorizontal: 14, borderRadius: 14 }}>
                  {g.articles.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 ? <Divider /> : null}
                      <Tap onPress={() => nav.push({ name: 'article', id: a.id })} label={`${a.title} 열기`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8 }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <T s={15} w="500" lines={2} lh={1.4}>
                            {a.title}
                          </T>
                          {user.memos[a.id] ? (
                            <T s={12} c={t.sub} lines={1}>
                              메모 · {user.memos[a.id].text}
                            </T>
                          ) : null}
                        </View>
                        <Chip label={user.read[a.id] ? '읽음' : '안 읽음'} tone={user.read[a.id] ? 'neutral' : 'orange'} />
                      </Tap>
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )}
        </>
      )}
    </TabScreen>
  );
}
