import React, { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, TextInput, View } from 'react-native';
import { korean, monthGrid, monthKey, monthTitle, shiftMonth, todayKST } from '../dates';
import { EASE_OUT, NATIVE_DRIVER, Rise, motionOff, useLater } from '../motion';
import { heatColor } from '../heat';
import { TabScreen, useNav } from '../nav';
import { DayStatus, partsOf, useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import type { Day } from '../types';
import { Box, Divider, EmptyState, Icon, ReadMark, Sheet, T, Tap, TaskRow } from '../ui';
import { HeatWeek } from '../heatBand';

const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/** 월요일부터 시작하는 달력. 빈 칸은 null. */
function mondayGrid(key: string): (string | null)[][] {
  const sunday = monthGrid(key);
  const lead = sunday[0].findIndex((d) => d !== null);
  const dates = sunday.flat().filter((d): d is string => d !== null);
  const cells: (string | null)[] = Array((lead + 6) % 7).fill(null);
  cells.push(...dates);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 위쪽 세 칸: 연속, 최장, 이번 달 */
function Stat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  const t = useTheme();
  const c = hot ? t.orangeText : t.ink;
  return (
    <View accessible accessibilityLabel={`${label} ${value}일`} style={{ flex: 1, minWidth: 0, backgroundColor: t.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
      <T s={13} w="600" c={t.mute} lines={1}>
        {label}
      </T>
      <T s={22} lh={31 / 22} w="700" c={c} mono lines={1}>
        {value}
        <T s={15} w="600" c={c}>
          일
        </T>
      </T>
    </View>
  );
}

const Calendar = memo(function Calendar({ month, statusOf, extraOf, onPrev, onNext, canPrev, canNext, onPick }: { month: string; statusOf: (date: string) => DayStatus; extraOf: (date: string) => number; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean; onPick: (date: string) => void }) {
  const t = useTheme();
  const today = todayKST();
  const weeks = mondayGrid(month);
  const [width, setWidth] = useState(0);
  const navBtn = { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Box>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <T s={17} w="700" mono role="heading" level={2}>
          {monthTitle(month)}
        </T>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Tap onPress={onPrev} disabled={!canPrev} label="이전 달" style={navBtn}>
            <Icon name="prev" size={20} color={t.sub} bold />
          </Tap>
          <Tap onPress={onNext} disabled={!canNext} label="다음 달" style={navBtn}>
            <Icon name="next" size={20} color={t.sub} bold />
          </Tap>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingBottom: 6 }} aria-hidden>
        {WEEK_LABELS.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <T s={12} w="600" c={t.mute} lh={1.5}>
              {d}
            </T>
          </View>
        ))}
      </View>
      <View
        style={{ gap: 6 }}
        onLayout={(e) => {
          // 탭이 가려질 때 폭이 0 으로 보고되므로 무시한다. 그래야 띠가 사라졌다 다시 그어지지 않는다.
          // 폭이 처음 정해지면 띠를 그리는 일은 끊어 가며 한다(탭이 떠오르는 움직임을 막지 않게). 띠는 60ms 뒤에 그어지기 시작한다.
          const w = e.nativeEvent.layout.width;
          if (w > 0) startTransition(() => setWidth(w));
        }}
      >
        {weeks.map((week, wi) => (
          <HeatWeek key={`${month}-${wi}`} id={`${month}-${wi}`} week={week} width={width} row={wi} statusOf={statusOf} extraOf={extraOf} today={today} onPick={onPick} />
        ))}
      </View>
    </Box>
  );
});

/** 달력 아래 기사 목록. 시트를 열고 닫을 때는 다시 그리지 않는다. */
const ArticleGroups = memo(function ArticleGroups({ groups, trigger, read, today, empty, since }: { groups: { date: string; articles: Day['articles'] }[]; trigger: string; read: Record<string, string>; today: string; empty: string; since?: number }) {
  const t = useTheme();
  const nav = useNav();
  if (groups.length === 0)
    return (
      <T s={15} w="600" c={t.mute} center style={{ paddingVertical: 12 }}>
        {empty}
      </T>
    );
  return (
    <>
      {groups.map((g, gi) => (
        <Rise key={g.date} trigger={trigger} delay={60 + Math.min(gi, 8) * 50} since={since}>
          <Box style={{ paddingTop: 18, paddingBottom: 8 }}>
            <T s={13} w="700" c={g.date === today ? t.blue : t.mute} mono role="heading" level={2} style={{ marginBottom: 2 }}>
              {korean(g.date)}
            </T>
            {g.articles.map((a) => {
              const isRead = !!read[a.id];
              return (
                <Tap
                  key={a.id}
                  press="soft"
                  onPress={() => nav.push({ name: 'article', id: a.id })}
                  label={`${a.title} 열기`}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 12, backgroundColor: t.card }}
                >
                  <ReadMark read={isRead} lineHeight={26} />
                  <T s={17} w="600" lh={1.5} lines={2} c={isRead ? t.sub : t.ink} style={{ flex: 1 }}>
                    {a.title}
                  </T>
                </Tap>
              );
            })}
          </Box>
        </Rise>
      ))}
    </>
  );
});

/** 주간 줄의 하루 칸. 처음 그릴 때 왼쪽에서 펴진다. */
function Seg({ color, delay }: { color: string; delay: number }) {
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (motionOff()) return;
    Animated.timing(v, { toValue: 1, duration: 320, delay, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, []);
  return (
    <Animated.View
      style={{
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: v,
        transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
      }}
    />
  );
}


const PART_NAME = { news: '뉴스', voc: '영단어', read: '개념 읽기', lat: 'Latticework', num: '수리' } as const;

/** 달력에서 고른 하루: 과제별 막대와, 마친 날이면 그날 기사. */
function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const t = useTheme();
  const nav = useNav();
  const { days, user, study, studyData, num } = useStore();
  const goals = useGoals();
  // 닫히는 동안에도 내용이 남아 있도록 마지막 날짜를 붙잡아 둔다.
  const last = useRef<string | null>(null);
  if (date) last.current = date;
  const d = date ?? last.current;
  const parts = d ? partsOf(d, days, user, study, !!studyData, goals.today, num) : [];
  const done = !!d && goals.statusOf(d) === 'done';
  const extra = d ? goals.extraOf(d) : 0;
  const articles = d ? days.find((x) => x.date === d)?.articles ?? [] : [];
  return (
    <Sheet open={!!date} onClose={onClose}>
      {d ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <View aria-hidden style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? heatColor(extra) : t.hair, borderWidth: done ? 0 : 1, borderColor: t.p.grey300 }} />
            <T type="t4" w="700" mono role="heading" level={2} style={{ flex: 1 }}>
              {korean(d)}
            </T>
            {done && extra > 0 ? (
              <T s={14} w="700" c={heatColor(extra)} mono>
                {`+${extra}`}
              </T>
            ) : null}
          </View>
          {parts.map((p) => (
            <TaskRow
              key={p.key}
              name={PART_NAME[p.key]}
              value={p.done}
              of={p.total}
              color={p.done >= p.total ? heatColor(0) : t.p.grey400}
              doneColor={t.p.orange600}
              trackWidth={120}
              a11yLabel={`${PART_NAME[p.key]} ${p.done}/${p.total}`}
            />
          ))}
          {done && articles.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <Divider />
              <View style={{ paddingTop: 4 }}>
                {articles.map((a) => (
                  <Tap
                    key={a.id}
                    press="soft"
                    onPress={() => {
                      onClose();
                      nav.push({ name: 'article', id: a.id });
                    }}
                    label={`${a.title} 열기`}
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderRadius: 12 }}
                  >
                    <ReadMark read={!!user.read[a.id]} lineHeight={22.5} />
                    <T s={15} w="600" lh={1.5} lines={2} c={user.read[a.id] ? t.sub : t.ink} style={{ flex: 1 }}>
                      {a.title}
                    </T>
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

export function ArchiveScreen() {
  const t = useTheme();
  const { days, user } = useStore();
  const [q, setQ] = useState('');
  const latest = days[0]?.date ?? todayKST();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? monthKey(latest);
  const today = todayKST();

  const goals = useGoals();
  const [picked, setPicked] = useState<string | null>(null);
  const later = useLater();

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

  const groups = useMemo(
    () =>
      days
        .filter((d) => filtering || monthKey(d.date) === shown)
        .map((d) => ({ date: d.date, articles: d.articles.filter((a) => !needle || [a.title, a.gist].join(' ').toLowerCase().includes(needle)) }))
        .filter((g) => g.articles.length > 0),
    [days, filtering, shown, needle],
  );
  // 달을 바꿀 때 새 달력은 끊어 가며 그린다(누른 순간 한 번에 그리면 다른 움직임이 그동안 멈춘다). 그리는 동안은 지금 달이 그대로 보인다.
  const onPrev = useCallback(() => startTransition(() => setMonth(shiftMonth(shown, -1))), [shown]);
  const onNext = useCallback(() => startTransition(() => setMonth(shiftMonth(shown, 1))), [shown]);
  const onClose = useCallback(() => setPicked(null), []);

  return (
    <TabScreen title="기록" overlay={<DaySheet date={picked} onClose={onClose} />}>
      {days.length === 0 ? (
        <EmptyState title="기록 없음" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat label="연속" value={goals.streak} hot />
            <Stat label="최장" value={goals.longest} />
            <Stat label="이번 달" value={doneThisMonth} />
          </View>
          <Calendar month={shown} statusOf={goals.statusOf} extraOf={goals.extraOf} canPrev={shown > oldest} canNext={shown < newest} onPrev={onPrev} onNext={onNext} onPick={setPicked} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.card }}>
            <Icon name="search" size={20} color={t.faint} bold />
            <TextInput
              nativeID="archive-search"
              accessibilityLabel="기사 검색"
              value={q}
              onChangeText={setQ}
              placeholder="기사 검색"
              placeholderTextColor={t.faint}
              style={[{ flex: 1, height: 48, fontFamily: FONT_SANS, fontSize: 17, color: t.ink }, { outlineStyle: 'none' } as any]}
            />
          </View>
          {/* 웹: 기사 목록(나타나기 전 60ms 이상 투명하다)은 탭을 처음 열 때 첫 장면을 그린 뒤 이어서 그린다. */}
          {later.ready ? <ArticleGroups groups={groups} trigger={`${shown}-${needle}`} read={user.read} today={today} empty={filtering ? '결과 없음' : '기사 없음'} since={later.since} /> : null}
        </>
      )}
    </TabScreen>
  );
}
