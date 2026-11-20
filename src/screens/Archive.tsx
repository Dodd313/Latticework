import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { WEEKDAYS_KO, monthGrid, monthKey, monthTitle, shiftMonth, shortStamp, todayKST } from '../dates';
import { Rise, motionOff } from '../motion';
import { HEAT_RING, heatColor, heatInk } from '../heat';
import { TabScreen, useNav } from '../nav';
import { DayStatus, useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { Day } from '../types';
import { EmptyState, Icon, ReadMark, T, Tap } from '../ui';

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

const MARK = 34;

/** 같은 주 안에서 이어서 할당량을 마친 날들 */
function runsOf(done: boolean[]): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  done.forEach((d, i) => {
    if (!d) return;
    const last = out[out.length - 1];
    if (last && last.b === i - 1) last.b = i;
    else out.push({ a: i, b: i });
  });
  return out;
}

/**
 * 한 주. 할당량을 마친 날이 이어지면 하나의 띠로 합치고, 띠 안에서 날마다 더 푼 만큼 색이 짙어진다.
 * 처음 그릴 때 띠가 왼쪽에서 오른쪽으로 그어진다.
 */
function WeekRow({ id, week, width, row, statusOf, extraOf, today }: { id: string; week: (string | null)[]; width: number; row: number; statusOf: (date: string) => DayStatus; extraOf: (date: string) => number; today: string }) {
  const t = useTheme();
  const done = week.map((d) => !!d && d <= today && statusOf(d) === 'done');
  const runs = runsOf(done);
  const cw = width / 7;
  const grow = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (width <= 0 || motionOff()) return;
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 560, delay: 60 + row * 110, easing: Easing.bezier(0.65, 0, 0.35, 1), useNativeDriver: false }).start();
  }, [id, width > 0]);
  return (
    <View style={{ height: 40, flexDirection: 'row' }}>
      {width > 0
        ? runs.map((r) => {
            const left = r.a * cw + (cw - MARK) / 2;
            const w = (r.b - r.a) * cw + MARK;
            const gid = `heat-${id}-${r.a}`;
            return (
              <Animated.View
                key={r.a}
                style={{ position: 'absolute', left, top: (40 - MARK) / 2, height: MARK, borderRadius: MARK / 2, overflow: 'hidden', width: grow.interpolate({ inputRange: [0, 1], outputRange: [Math.min(w, MARK), w] }), opacity: grow.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }) }}
              >
                <Svg width={w} height={MARK}>
                  <Defs>
                    <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
                      {Array.from({ length: r.b - r.a + 1 }, (_, k) => {
                        const date = week[r.a + k] as string;
                        return <Stop key={k} offset={String(r.a === r.b ? 0.5 : (k * cw + MARK / 2) / w)} stopColor={heatColor(extraOf(date))} />;
                      })}
                    </LinearGradient>
                    <LinearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
                      <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={w} height={MARK} fill={`url(#${gid})`} />
                  <Rect x={0} y={0} width={w} height={MARK} fill={`url(#${gid}-s)`} />
                </Svg>
              </Animated.View>
            );
          })
        : null}
      {week.map((date, di) => {
        if (!date) return <View key={di} style={{ flex: 1 }} />;
        const isDone = done[di];
        const ring = date === today && !isDone;
        const fg = isDone ? heatInk(extraOf(date)) : date > today ? t.mute : t.ink;
        // 칠한 날의 숫자는 띠가 그 날에 닿는 순간 나타난다. 흰 숫자가 띠보다 먼저 보이지 않게.
        const run = isDone ? runs.find((r) => r.a <= di && di <= r.b) : undefined;
        const reach = run && run.b > run.a && cw > 0 ? ((di - run.a) * cw) / ((run.b - run.a) * cw) : 0;
        const show = isDone ? grow.interpolate({ inputRange: [Math.max(0, reach - 0.12), Math.max(0.01, reach)], outputRange: [0, 1], extrapolate: 'clamp' }) : 1;
        return (
          <View key={di} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: HEAT_RING, opacity: show }}>
              <T s={14} w={isDone || date === today ? '700' : '400'} c={fg} mono lh={1.2}>
                {String(Number(date.slice(8)))}
              </T>
            </Animated.View>
          </View>
        );
      })}
    </View>
  );
}

function Calendar({ month, statusOf, extraOf, onPrev, onNext, canPrev, canNext }: { month: string; statusOf: (date: string) => DayStatus; extraOf: (date: string) => number; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean }) {
  const t = useTheme();
  const today = todayKST();
  const weeks = monthGrid(month);
  const [width, setWidth] = useState(0);
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
      <View style={{ gap: 2 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {weeks.map((week, wi) => (
          <WeekRow key={`${month}-${wi}`} id={`${month}-${wi}`} week={week} width={width} row={wi} statusOf={statusOf} extraOf={extraOf} today={today} />
        ))}
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
          <Calendar month={shown} statusOf={goals.statusOf} extraOf={goals.extraOf} canPrev={shown > oldest} canNext={shown < newest} onPrev={() => setMonth(shiftMonth(shown, -1))} onNext={() => setMonth(shiftMonth(shown, 1))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, backgroundColor: t.field }}>
            <Icon name="search" size={18} color={t.sub} />
            <TextInput
              nativeID="archive-search"
              accessibilityLabel="기사 검색"
              value={q}
              onChangeText={setQ}
              placeholder=""
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
                <T s={12.5} w="700" c={g.date === today ? t.blue : t.sub} mono style={{ paddingTop: 8, letterSpacing: 0.3 }}>
                  {shortStamp(g.date)}
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
