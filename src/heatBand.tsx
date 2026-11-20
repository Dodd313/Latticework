// 기록 탭 달력의 한 주(D형 불꽃 띠). 할당량을 마친 날이 이어지면 하나의 띠로 합치고, 더 푼 만큼 짙어진다.
// 기록 탭과 돌아보기(recap)가 같이 쓴다.
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { korean } from './dates';
import { MView, WEB, lerp, motionOff, webTween } from './motion';
import { HEAT_RING, heatColor, heatInk } from './heat';
import type { DayStatus } from './store';
import { useTheme } from './theme';
import { T, Tap } from './ui';

export const MARK = 36;

/** 같은 주 안에서 이어서 할당량을 마친 날들 */
export function runsOf(done: boolean[]): { a: number; b: number }[] {
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
export function BandFill({ id: gid, r, w, cw, week, extraOf }: { id: string; r: { a: number; b: number }; w: number; cw: number; week: (string | null)[]; extraOf: (date: string) => number }) {
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

export const GROW_EASE = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * 한 주. 할당량을 마친 날이 이어지면 하나의 띠로 합치고, 띠 안에서 날마다 더 푼 만큼 색이 짙어진다.
 * 처음 그릴 때 띠가 왼쪽에서 오른쪽으로 그어진다.
 */
export function HeatWeek({ id, week, width, row, statusOf, extraOf, today, onPick }: { id: string; week: (string | null)[]; width: number; row: number; statusOf: (date: string) => DayStatus; extraOf: (date: string) => number; today: string; onPick: (date: string) => void }) {
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
        // 웹: 폭을 알기 전(띠를 아직 그리지 않은 장면)에는 칠한 날의 숫자를 숨겨 둔다. 폭이 정해진 장면부터는 브라우저 움직임이 이어받는다.
        const show = !isDone ? 1 : WEB ? (width > 0 || motionOff() ? 1 : 0) : grow.interpolate({ inputRange: [end - 0.1, end], outputRange: [0, 1], extrapolate: 'clamp' });
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
