import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { addDays, korean, monthGrid, monthKey, monthTitle, shiftMonth, todayKST, weekTitle, weekdaysOf } from '../dates';
import { EASE_OUT, MView, NATIVE_DRIVER, Rise, WEB, lerp, motionOff, useLater, webTween } from '../motion';
import { HEAT_RING, heatColor, heatInk } from '../heat';
import { TabScreen, useNav } from '../nav';
import { DayStatus, partsOf, useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import type { Day } from '../types';
import { Box, Divider, EmptyState, Icon, ReadMark, Sheet, T, Tap, TaskRow } from '../ui';

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

const MARK = 36;

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

/** 띠 안쪽: 날마다 더 푼 만큼 짙어지는 가로 그라데이션과 위쪽 흰 광택. */
function BandFill({ id: gid, r, w, cw, week, extraOf }: { id: string; r: { a: number; b: number }; w: number; cw: number; week: (string | null)[]; extraOf: (date: string) => number }) {
  return (
    <Svg width={w} height={MARK}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          {Array.from({ length: r.b - r.a + 1 }, (_, k) => {
            const date = week[r.a + k] as string;
            return <Stop key={k} offset={String(r.a === r.b ? 0.5 : (k * cw + MARK / 2) / w)} stopColor={heatColor(extraOf(date))} />;
          })}
        </LinearGradient>
        <LinearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={MARK} fill={`url(#${gid})`} />
      <Rect x={0} y={0} width={w} height={MARK} fill={`url(#${gid}-s)`} />
    </Svg>
  );
}

const GROW_EASE = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * 한 주. 할당량을 마친 날이 이어지면 하나의 띠로 합치고, 띠 안에서 날마다 더 푼 만큼 색이 짙어진다.
 * 처음 그릴 때 띠가 왼쪽에서 오른쪽으로 그어진다.
 */
function WeekRow({ id, week, width, row, statusOf, extraOf, today, onPick }: { id: string; week: (string | null)[]; width: number; row: number; statusOf: (date: string) => DayStatus; extraOf: (date: string) => number; today: string; onPick: (date: string) => void }) {
  const t = useTheme();
  const done = week.map((d) => !!d && d <= today && statusOf(d) === 'done');
  const runs = runsOf(done);
  const cw = width / 7;
  const grow = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  // 한 달을 처음 그릴 때 한 번만 그어진다. 탭을 오가거나 다시 그려져도 반복하지 않는다(달을 바꾸면 줄이 새로 생겨 다시 그어진다).
  const played = useRef(false);
  // 웹: 띠마다 [띠, 그림자] 요소, 칠한 날마다 숫자 요소. 그어지는 움직임은 브라우저가 맡는다.
  const bands = useRef<Record<number, [any, any]>>({});
  const marks = useRef<Record<number, any>>({});
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (width <= 0 || played.current) return;
    played.current = true;
    if (WEB) {
      if (motionOff()) return;
      const curve = { duration: 560, easing: GROW_EASE };
      const delay = 60 + row * 110;
      const all: (ReturnType<typeof webTween> | null)[] = [];
      for (const r of runs) {
        const [band, shade] = bands.current[r.a] ?? [];
        const w = (r.b - r.a) * cw + MARK;
        const w0 = Math.min(w, MARK);
        const op = (v: number) => lerp(v, [0, 0.15, 1], [0, 1, 1]);
        // 띠는 왼쪽부터 드러난다(오른쪽을 둥글게 잘라 낸다). 폭을 바꾸지 않으므로 그라데이션은 제자리에 있다.
        all.push(webTween(band, curve, (v) => ({ opacity: op(v), clipPath: `inset(0px ${w - lerp(v, [0, 1], [w0, w])}px 0px 0px round ${MARK / 2}px)` }), { delay, stops: [0.15] }));
        // 그림자는 따로 두고 같은 자리까지만 드러낸다(끝에서 그림자 끝자락까지 펼친다).
        all.push(webTween(shade, curve, (v) => ({ opacity: op(v), clipPath: `inset(-12px ${w - lerp(v, [0, 1], [w0, w]) - 12 * v}px -12px -12px)` }), { delay, stops: [0.15] }));
      }
      done.forEach((isDone, di) => {
        if (!isDone) return;
        const run = runs.find((r) => r.a <= di && di <= r.b);
        const reach = run && run.b > run.a && cw > 0 ? ((di - run.a) * cw) / ((run.b - run.a) * cw) : 0;
        const end = Math.max(0.22, reach);
        all.push(webTween(marks.current[di], curve, (v) => ({ opacity: lerp(v, [end - 0.1, end], [0, 1], true) }), { delay, stops: [end - 0.1, end] }));
      });
      return () => all.forEach((x) => x?.anim.cancel());
    }
    if (motionOff()) return grow.setValue(1);
    Animated.timing(grow, { toValue: 1, duration: 560, delay: 60 + row * 110, easing: GROW_EASE, useNativeDriver: false }).start();
  }, [width > 0]);
  return (
    <View style={{ height: 40, flexDirection: 'row' }}>
      {width > 0
        ? runs.map((r) => {
            const left = r.a * cw + (cw - MARK) / 2;
            const w = (r.b - r.a) * cw + MARK;
            const gid = `heat-${id}-${r.a}`;
            const shadow = `0 2px 8px ${heatColor(extraOf(week[r.b] as string))}40`;
            if (WEB) {
              // 웹: 그림자와 띠를 따로 둔다. 띠의 폭은 처음부터 끝 폭이고, 드러나는 부분만 움직인다.
              const box = { position: 'absolute', left, top: (40 - MARK) / 2, width: w, height: MARK, borderRadius: MARK / 2 } as const;
              return (
                <React.Fragment key={r.a}>
                  <View ref={(el) => {
                      (bands.current[r.a] ??= [null, null])[1] = el;
                    }} aria-hidden style={[box, { boxShadow: shadow } as any]} />
                  <View ref={(el) => {
                      (bands.current[r.a] ??= [null, null])[0] = el;
                    }} style={[box, { overflow: 'hidden' }]}>
                    <BandFill id={gid} r={r} w={w} cw={cw} week={week} extraOf={extraOf} />
                  </View>
                </React.Fragment>
              );
            }
            return (
              <Animated.View
                key={r.a}
                style={{ position: 'absolute', left, top: (40 - MARK) / 2, height: MARK, borderRadius: MARK / 2, overflow: 'hidden', boxShadow: shadow, width: grow.interpolate({ inputRange: [0, 1], outputRange: [Math.min(w, MARK), w] }), opacity: grow.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }) }}
              >
                <BandFill id={gid} r={r} w={w} cw={cw} week={week} extraOf={extraOf} />
              </Animated.View>
            );
          })
        : null}
      {week.map((date, di) => {
        if (!date) return <View key={di} style={{ flex: 1 }} />;
        const isDone = done[di];
        const ring = date === today && !isDone;
        const fg = isDone ? heatInk(extraOf(date)) : date > today ? t.p.grey300 : t.deck;
        // 칠한 날의 숫자는 띠가 그 날에 닿는 순간 나타난다. 흰 숫자가 띠보다 먼저 보이지 않게.
        const run = isDone ? runs.find((r) => r.a <= di && di <= r.b) : undefined;
        const reach = run && run.b > run.a && cw > 0 ? ((di - run.a) * cw) / ((run.b - run.a) * cw) : 0;
        // 띠가 보이기 시작하는 구간(0~0.15)이 지난 뒤에만 숫자가 나타난다.
        const end = Math.max(0.22, reach);
        const show = isDone && !WEB ? grow.interpolate({ inputRange: [end - 0.1, end], outputRange: [0, 1], extrapolate: 'clamp' }) : 1;
        const mark = (
          <MView ref={WEB ? (el: any) => void (marks.current[di] = el) : undefined} style={{ width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: HEAT_RING, opacity: show }}>
            <T s={15} w={isDone || date === today ? '700' : '600'} c={fg} mono lh={1.2}>
              {String(Number(date.slice(8)))}
            </T>
          </MView>
        );
        return (
          <View key={di} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {date > today ? (
              mark
            ) : (
              <Tap onPress={() => onPick(date)} label={korean(date)} selected={isDone} press="none" style={{ borderRadius: MARK / 2 }}>
                {mark}
              </Tap>
            )}
          </View>
        );
      })}
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
          const w = e.nativeEvent.layout.width;
          if (w > 0) setWidth(w);
        }}
      >
        {weeks.map((week, wi) => (
          <WeekRow key={`${month}-${wi}`} id={`${month}-${wi}`} week={week} width={width} row={wi} statusOf={statusOf} extraOf={extraOf} today={today} onPick={onPick} />
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


const PART_NAME = { news: '뉴스', voc: '영단어', lat: 'Latticework' } as const;

/** 달력에서 고른 하루: 과제별 막대와, 마친 날이면 그날 기사. */
function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const t = useTheme();
  const nav = useNav();
  const { days, user, study, studyData } = useStore();
  const goals = useGoals();
  // 닫히는 동안에도 내용이 남아 있도록 마지막 날짜를 붙잡아 둔다.
  const last = useRef<string | null>(null);
  if (date) last.current = date;
  const d = date ?? last.current;
  const parts = d ? partsOf(d, days, user, study, !!studyData, goals.today) : [];
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
  const onPrev = useCallback(() => setMonth(shiftMonth(shown, -1)), [shown]);
  const onNext = useCallback(() => setMonth(shiftMonth(shown, 1)), [shown]);
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
