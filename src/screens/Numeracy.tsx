// 수리 구역: 연습(오늘 세트와 분야 일곱), 기록(분야별 추이와 수준), 문제 풀이(자판과 시계), 세트 결과.
// 시안 motion-lab/v11/numeracy.html. 문제는 src/numeracy.ts 가 씨앗으로 만들고, 기록은 store 의 recordNum 이 남긴다.
// 시간은 문제가 다 들어온 뒤(0.3초)부터 확인까지. 그 전에는 자판이 먹지 않고, 피드백과 앱을 떠난 시간은 넣지 않는다.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { addDays, todayKST } from '../dates';
import { LattiSays, useLattiSay } from '../latti';
import { MView, NATIVE_DRIVER, Pulse, Rise, WEB, motionOff, tweenStop, Tween, webShake, webTween } from '../motion';
import { useNav } from '../nav';
import {
  DAILY_TOTAL,
  NumResult,
  NumSession,
  Problem,
  REASON,
  SKILL,
  SKILLS,
  SkillId,
  check,
  dailyPair,
  fmtNum,
  lastAt,
  lastOf,
  perDay,
  personalBest,
  quotaDone,
  quotaLeft,
  setFor,
} from '../numeracy';
import { useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { Box, Icon, LipButton, PrimaryButton, ProgressBar, Rich, Segmented, StatCard, T, Tap } from '../ui';
import { Enter, FOOT_PAD, Fb, Panel, SlideIn } from './Study';

type Tab = 'practice' | 'record';
type Mode = 'daily' | 'extra';
type Item = { k: SkillId; lv: number; p: Problem };
type Done = { mode: Mode; results: NumResult[]; streakFrom: number; id: number; direct: boolean };

const TABS: { key: Tab; label: string }[] = [
  { key: 'practice', label: '연습' },
  { key: 'record', label: '기록' },
];
const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);
/** 문제가 다 들어오는 시간. 이 뒤부터 시계가 돌고 자판이 먹는다 */
const SETTLE_MS = 300;

const sec = (x: number | null | undefined) => (x == null ? '-' : fmtNum(x, 1));
const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const md = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;

// ─────────────────────────────────────────────────────────────
// 분야 표식: 글자 하나(또는 둘)를 색 상자에
// ─────────────────────────────────────────────────────────────
const GLYPH: Record<SkillId, string> = { read: '억', fx: '$', ratio: '%', growth: '복', pv: 'PV', unit: 'bp', est: '≈' };
function useLook() {
  const t = useTheme();
  return useMemo(
    () =>
      ({
        read: { fg: t.blueText, bg: t.blueWeak },
        fx: { fg: t.greenText, bg: t.greenWeak },
        ratio: { fg: t.orangeText, bg: t.orangeWeak },
        growth: { fg: t.purple, bg: t.purpleWeak },
        pv: { fg: t.redText, bg: t.redWeak },
        unit: { fg: t.p.grey700, bg: t.p.grey100 },
        est: { fg: t.p.orange900, bg: t.p.yellow50 },
      }) as Record<SkillId, { fg: string; bg: string }>,
    [t],
  );
}
function SkillMark({ k, size = 40 }: { k: SkillId; size?: number }) {
  const look = useLook()[k];
  const fs = Math.round(size * (GLYPH[k].length > 1 ? 0.36 : 0.4));
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <T s={fs} w="800" c={look.fg} lh={1.2} style={{ letterSpacing: -0.3 }}>
        {GLYPH[k]}
      </T>
    </View>
  );
}
function LvPill({ lv, small }: { lv: number; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ height: small ? 20 : 22, paddingHorizontal: 7, borderRadius: 7, backgroundColor: small ? t.blueWeak : t.fill, justifyContent: 'center' }}>
      <T s={12} w={small ? '700' : '600'} c={small ? t.blueText : t.deck} mono lh={1.4}>
        {`Lv.${lv}`}
      </T>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 추이 그림: 날짜마다 중앙값의 중앙값 한 점. 수준이 바뀐 자리에 세로 점선과 수준 이름, 주황 점은 지금 수준의 최고 기록
// ─────────────────────────────────────────────────────────────
type Pt = { d: string; lv: number; med: number };
function Trend({ pts, w, h, big, best }: { pts: Pt[]; w: number; h: number; big?: boolean; best?: NumSession | null }) {
  const t = useTheme();
  if (!w) return <View style={{ height: h }} />;
  const pl = big ? 34 : 3;
  const pr = big ? 8 : 4;
  const pt = big ? 18 : 4;
  const pb = big ? 26 : 4;
  const font = { fontFamily: FONT_SANS, fontSize: 11, fontWeight: '600' as const };
  const lines = big ? (
    <>
      <Line x1={pl} x2={w - pr} y1={pt} y2={pt} stroke={t.hair} strokeWidth={1} />
      <Line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} stroke={t.hair} strokeWidth={1} />
    </>
  ) : null;
  if (!pts.length) {
    return (
      <Svg width={w} height={h} aria-hidden>
        {lines}
      </Svg>
    );
  }
  const ys = pts.map((p) => p.med);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 2) {
    hi += 1;
    lo -= 1;
  }
  const x = (i: number) => pl + (pts.length === 1 ? (w - pl - pr) / 2 : (i * (w - pl - pr)) / (pts.length - 1));
  const y = (v: number) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb);
  // 수준마다 선을 끊는다(수준이 오르면 시간이 다시 늘어나는 것이 정상이라 잇지 않는다)
  let d = '';
  pts.forEach((p, i) => (d += `${i && p.lv === pts[i - 1].lv ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.med).toFixed(1)}`));
  let bi = -1;
  if (best) pts.forEach((p, i) => p.d === best.d && p.lv === best.lv && (bi = i));
  const L = pts.length - 1;
  return (
    <Svg width={w} height={h} aria-hidden>
      {lines}
      {big ? (
        <>
          <SvgText x={0} y={pt + 4} fill={t.faint} {...font}>{`${Math.round(hi)}초`}</SvgText>
          <SvgText x={0} y={h - pb + 4} fill={t.faint} {...font}>{`${Math.round(lo)}초`}</SvgText>
          <SvgText x={pl} y={h - 3} fill={t.faint} {...font}>
            {md(pts[0].d)}
          </SvgText>
          {pts[L].d !== pts[0].d ? (
            <SvgText x={w - pr} y={h - 3} fill={t.faint} textAnchor="end" {...font}>
              {md(pts[L].d)}
            </SvgText>
          ) : null}
          {pts.map((p, i) => {
            if (!i || p.lv === pts[i - 1].lv) return null;
            const xm = (x(i) + x(i - 1)) / 2;
            return (
              <React.Fragment key={'lv' + i}>
                <Line x1={xm} x2={xm} y1={pt - 2} y2={h - pb} stroke={t.p.grey300} strokeDasharray="3 3" />
                <SvgText x={xm + 4} y={pt - 6} fill={t.blueText} {...font} fontWeight="700">{`Lv.${p.lv}`}</SvgText>
              </React.Fragment>
            );
          })}
        </>
      ) : null}
      <Path d={d} fill="none" stroke={t.blue} strokeWidth={big ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" />
      {big ? pts.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.med)} r={2.6} fill={t.blue} />) : null}
      {big && bi >= 0 ? <Circle cx={x(bi)} cy={y(pts[bi].med)} r={5} fill={t.orange} stroke={t.card} strokeWidth={2} /> : null}
      <Circle cx={x(L)} cy={y(pts[L].med)} r={big ? 5 : 3.2} fill={t.blue} stroke={t.card} strokeWidth={big ? 2 : 1.5} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 구역 화면
// ─────────────────────────────────────────────────────────────
export function NumeracyScreen({ start }: { start?: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const { num } = useStore();
  const goals = useGoals();
  const today = todayKST();
  // 홈의 이어서 하기로 바로 연 세트(direct)면, 닫기와 계속이 홈으로 돌아간다. 그 뒤에 여기서 연 세트는 이 화면으로 돌아온다.
  const [tab, setTab] = useState<Tab>('practice');
  const [run, setRun] = useState<{ id: number; mode: Mode; flat: Item[]; prevMed: Partial<Record<SkillId, number | null>>; streakFrom: number; direct: boolean } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const seq = useRef(0);

  const begin = (mode: Mode, ks: SkillId[], direct = false) => {
    const flat: Item[] = [];
    const prevMed: Partial<Record<SkillId, number | null>> = {};
    for (const k of ks) {
      const { lv, problems } = setFor(num, today, k);
      prevMed[k] = lastAt(num.sessions, k, lv)?.med ?? null;
      for (const p of problems) flat.push({ k, lv, p });
    }
    setDone(null);
    setRun({ id: ++seq.current, mode, flat, prevMed, streakFrom: goals.streak, direct });
  };
  const startDaily = (direct = false) => {
    const left = quotaLeft(num, today);
    if (left.length) begin('daily', left, direct);
  };
  // 이어서 하기: 열자마자 오늘 남은 분야로
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (start && quotaLeft(num, today).length) startDaily(true);
  }, []);

  if (run) {
    return (
      <Run
        key={run.id}
        mode={run.mode}
        flat={run.flat}
        prevMed={run.prevMed}
        onClose={() => (run.direct ? nav.pop() : setRun(null))}
        onDone={(results) => {
          setDone({ mode: run.mode, results, streakFrom: run.streakFrom, id: run.id, direct: run.direct });
          setRun(null);
        }}
      />
    );
  }
  if (done) {
    return (
      <Summary
        key={done.id}
        done={done}
        onMore={() => {
          setDone(null);
          setTab('practice');
        }}
        onDone={() => {
          if (done.direct) return nav.pop();
          setDone(null);
          setTab('record');
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ backgroundColor: t.bg, paddingBottom: 12 }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8 }}>
          <Tap onPress={nav.pop} label="홈(으)로 돌아가기" press="dim" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={24} color={t.ink} sw={2.2} />
          </Tap>
          <T s={18} w="700" lh={1.4} role="heading" level={1}>
            수리
          </T>
        </View>
        <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginTop: 0, marginHorizontal: 12, height: 44 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 12 }}>
        {tab === 'practice' ? <Practice key="p" onDaily={() => startDaily()} onExtra={(k) => begin('extra', [k])} /> : <Records key="r" />}
      </ScrollView>
    </View>
  );
}

/** 연습: 오늘 세트(두 분야)와 분야 일곱. 할당을 마치면 분야 줄을 눌러 그 분야만 6문제(추가 학습). */
function Practice({ onDaily, onExtra }: { onDaily: () => void; onExtra: (k: SkillId) => void }) {
  const t = useTheme();
  const { num } = useStore();
  const today = todayKST();
  const pair = dailyPair(today);
  const doneN = quotaDone(num, today);
  const complete = doneN >= DAILY_TOTAL;
  const look = useLook();
  return (
    <>
      <Rise delay={0}>
        <Box title="오늘 세트" aside={`${doneN}/${DAILY_TOTAL}`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {pair.map((k) => {
              const did = (num.days[today]?.ks ?? []).includes(k);
              return (
                <View key={k} style={{ height: 30, paddingLeft: 4, paddingRight: 10, borderRadius: 15, backgroundColor: t.p.grey100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: did ? t.green : look[k].bg, alignItems: 'center', justifyContent: 'center' }}>
                    {did ? (
                      <Icon name="check" size={13} color="#ffffff" sw={3.4} />
                    ) : (
                      <T s={GLYPH[k].length > 1 ? 9 : 11} w="800" c={look[k].fg} lh={1.2}>
                        {GLYPH[k]}
                      </T>
                    )}
                  </View>
                  <T s={14} w="600" c={t.body} lh={1.4}>
                    {SKILL[k].name}
                  </T>
                  <T s={14} w="600" c={t.mute} mono lh={1.4}>
                    {`Lv.${num.level[k]}`}
                  </T>
                </View>
              );
            })}
          </View>
          {complete ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.green, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color="#ffffff" sw={3.4} />
              </View>
              <T s={15} w="600" c={t.greenText}>
                오늘 완료
              </T>
            </View>
          ) : (
            <PrimaryButton label={doneN > 0 ? '이어서 하기' : '시작'} onPress={onDaily} style={{ marginTop: 14 }} />
          )}
        </Box>
      </Rise>
      <Rise delay={60}>
        <Box style={{ paddingTop: 10, paddingBottom: 8 }}>
          {SKILLS.map((S) => {
            const last = lastOf(num.sessions, S.id);
            const pts = perDay(num.sessions, S.id).slice(-8);
            const row = (
              <>
                <SkillMark k={S.id} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T s={16} w="600" lh={23 / 16} lines={1}>
                    {S.name}
                  </T>
                  <T s={13} w="600" c={t.mute} mono lh={19 / 13}>
                    {`Lv.${num.level[S.id]}${last && last.med != null ? ` · ${sec(last.med)}초` : ''}`}
                  </T>
                </View>
                <Trend pts={pts} w={56} h={24} />
                {complete ? <Icon name="chev" size={16} color={t.faint} /> : <View style={{ width: 16 }} />}
              </>
            );
            const st = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 60, paddingVertical: 8 };
            return complete ? (
              <Tap key={S.id} onPress={() => onExtra(S.id)} label={`${S.name} 추가 학습`} press="soft" style={[st, { borderRadius: 12 }]}>
                {row}
              </Tap>
            ) : (
              <View key={S.id} style={st} accessible accessibilityLabel={`${S.name} Lv.${num.level[S.id]}`}>
                {row}
              </View>
            );
          })}
        </Box>
      </Rise>
    </>
  );
}

/** 기록: 이번 주 숫자 셋, 분야마다 추이 그림과 최고 기록, 목표 시간, 최근 정답률. */
function Records() {
  const t = useTheme();
  const { num } = useStore();
  const today = todayKST();
  const [w, setW] = useState(0);
  const from = addDays(today, -6);
  const week = num.sessions.filter((s) => s.d >= from);
  const wn = week.reduce((a, s) => a + s.n, 0);
  const wok = week.reduce((a, s) => a + s.ok, 0);
  const cells = [
    { k: '이번 주', v: String(week.length), u: '세트' },
    { k: '문제', v: String(wn), u: '' },
    { k: '정답률', v: wn ? String(Math.round((wok / wn) * 100)) : '-', u: wn ? '%' : '' },
  ];
  return (
    <>
      <Rise delay={0} style={{ flexDirection: 'row', gap: 8 }}>
        {cells.map((c) => (
          <View key={c.k} accessible accessibilityLabel={`${c.k} ${c.v}${c.u}`} style={{ flex: 1, backgroundColor: t.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
            <T s={13} w="600" c={t.mute} lh={19 / 13}>
              {c.k}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <T s={22} w="700" mono lh={31 / 22}>
                {c.v}
              </T>
              {c.u ? (
                <T s={15} w="600" style={{ marginLeft: 1 }}>
                  {c.u}
                </T>
              ) : null}
            </View>
          </View>
        ))}
      </Rise>
      {SKILLS.map((S, i) => {
        const lv = num.level[S.id];
        const pts = perDay(num.sessions, S.id).slice(-14);
        const pb = personalBest(num.sessions, S.id, lv);
        const last3 = num.sessions.filter((s) => s.k === S.id).slice(-3);
        const n3 = last3.reduce((a, s) => a + s.n, 0);
        const acc = n3 ? Math.round((last3.reduce((a, s) => a + s.ok, 0) / n3) * 100) : null;
        const lastMed = pts.length ? pts[pts.length - 1].med : null;
        return (
          <Rise key={S.id} delay={40 + i * 30}>
            <View style={{ backgroundColor: t.card, borderRadius: 20, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <SkillMark k={S.id} />
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <T s={17} w="700" lh={1.4} style={{ letterSpacing: -0.2 }}>
                    {S.name}
                  </T>
                  <LvPill lv={lv} small />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <T s={22} w="700" mono lh={28 / 22}>
                      {sec(lastMed)}
                    </T>
                    <T s={14} w="600" style={{ marginLeft: 1 }}>
                      초
                    </T>
                  </View>
                  <T s={12} w="600" c={t.mute} lh={1.4}>
                    최근 중앙값
                  </T>
                </View>
              </View>
              <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ marginTop: 12 }}>
                <Trend pts={pts} w={w} h={100} big best={pb} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 8 }}>
                {pb ? (
                  <T s={13} c={t.sub} mono>
                    {'최고 '}
                    <T s={13} w="700" c={t.orangeText} mono>{`${sec(pb.med)}초`}</T>
                    {` · ${md(pb.d)}`}
                  </T>
                ) : null}
                <T s={13} c={t.sub} mono>
                  {'목표 '}
                  <T s={13} w="700" c={t.ink} mono>{`${S.levels[lv - 1].target}초`}</T>
                </T>
                <T s={13} c={t.sub} mono>
                  {'정답률 '}
                  <T s={13} w="700" c={t.ink} mono>
                    {acc == null ? '-' : `${acc}%`}
                  </T>
                </T>
              </View>
            </View>
          </Rise>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 문제 풀이
// ─────────────────────────────────────────────────────────────

/** 차분한 시계(m:ss). 웹은 React 를 다시 그리지 않고 글자 마디만 0.25초마다 고쳐 쓴다. */
function Clock({ read, tick }: { read: () => number; tick: unknown }) {
  const t = useTheme();
  const ref = useRef<any>(null);
  const [txt, setTxt] = useState(() => clockText(read()));
  useEffect(() => {
    const write = (s: string) => {
      if (Platform.OS === 'web') {
        const el = ref.current as HTMLElement | null;
        if (el && el.textContent !== s) el.textContent = s;
      } else setTxt(s);
    };
    write(clockText(read()));
    const id = setInterval(() => write(clockText(read())), 250);
    return () => clearInterval(id);
  }, [tick]);
  return (
    <View accessible accessibilityLabel="걸린 시간" style={{ minWidth: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
      <Icon name="clock" size={16} color={t.faint} sw={2.2} />
      <Text ref={ref} style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: '600', color: t.faint, fontVariant: ['tabular-nums'], lineHeight: 21 }}>
        {txt}
      </Text>
    </View>
  );
}

/** 자판에 입력한 글자를 보기 좋게: 세 자리 쉼표, 한글 단위 뒤 띄어쓰기 */
function display(s: string, kr: boolean): string {
  if (!s) return '';
  if (!kr) {
    const neg = s[0] === '-';
    const t = neg ? s.slice(1) : s;
    const [a, b] = t.split('.');
    return (neg ? '-' : '') + (a ? a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '') + (t.includes('.') ? '.' + (b || '') : '');
  }
  return s.replace(/(\d+)(\.\d*)?/g, (_m, a: string, b: string | undefined) => a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b || '')).replace(/([조억만])(?=[\d.])/g, '$1 ');
}
const UNITS = ['조', '억', '만'] as const;
/** 자판 한 번 누른 뒤의 입력(시안과 같은 규칙) */
function typeKey(s: string, k: string, kr: boolean): string {
  if (k === 'bs') return s.slice(0, -1);
  if (k === '-') return s[0] === '-' ? s.slice(1) : '-' + s;
  if (k === '.') {
    const seg = s.split(/[조억만]/).pop()!;
    return seg.includes('.') ? s : s + (/\d$/.test(s) ? '.' : '0.');
  }
  if ((UNITS as readonly string[]).includes(k)) return kr && /\d$/.test(s) ? s + k : s;
  if (/^\d$/.test(k)) {
    if (s.replace(/\D/g, '').length >= 16) return s;
    const seg = s.split(/[조억만]/).pop()!.replace('-', '');
    return (seg === '0' ? s.slice(0, -1) : s) + k;
  }
  return s;
}
/** 지금 누를 수 있는 단위 단추: 숫자 뒤에서만, 큰 단위부터 한 번씩 */
function unitOk(s: string, u: string): boolean {
  if (!/\d$/.test(s)) return false;
  const used = s.match(/[조억만]/g);
  const lastUsed = used ? UNITS.indexOf(used[used.length - 1] as any) : -1;
  return UNITS.indexOf(u as any) > lastUsed;
}

function Key({ label, a11y, onPress, disabled, unit, tool, compact, children }: { label?: string; a11y: string; onPress: () => void; disabled?: boolean; unit?: boolean; tool?: boolean; compact?: boolean; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      label={a11y}
      press="soft"
      style={[
        { height: tool ? (compact ? 38 : 44) : compact ? 44 : 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: unit ? t.blueWeak : tool ? t.p.grey100 : t.layer },
        tool ? { minWidth: 60, paddingHorizontal: 14 } : { flex: 1 },
      ]}
    >
      {children ?? (
        <T s={tool ? 17 : 22} w={tool ? '700' : '600'} c={unit ? t.blueText : tool ? t.deck : t.ink} lh={1.3}>
          {label}
        </T>
      )}
    </Tap>
  );
}

/** 정답이면 그대로, 오답이면 옆으로 흔들리는 답 칸(웹은 브라우저 움직임) */
const SHAKE: [number[], number[]] = [
  [0, 0.2, 0.4, 0.6, 0.8, 1],
  [0, -8, 7, -4, 2, 0],
];

function Run({ mode, flat, prevMed, onClose, onDone }: { mode: Mode; flat: Item[]; prevMed: Partial<Record<SkillId, number | null>>; onClose: () => void; onDone: (results: NumResult[]) => void }) {
  const t = useTheme();
  const { recordNum } = useStore();
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [settled, setSettled] = useState<null | boolean>(null);
  const [fb, setFb] = useState<Fb | null>(null);
  const [shake, setShake] = useState(0);
  // 시계: t0 는 시계가 돈 시각(아직이면 0), hiddenAt 은 앱을 떠난 시각, frozen 은 확인을 누른 순간의 초
  const clock = useRef({ t0: 0, hiddenAt: 0, frozen: null as number | null });
  const items = useRef<Record<string, { ms: number; ok: boolean }[]>>({});
  const results = useRef<NumResult[]>([]);
  const inputRef = useRef('');
  inputRef.current = input;
  const item = flat[i];
  const p = item.p;
  const kr = p.input === 'kr';
  const last = i + 1 >= flat.length;
  // 짧은 화면(아이폰 SE, 사파리 주소창이 보일 때): 자판과 머리를 줄이고, 그래도 문제가 넘치면 글자를 한두 단계 줄인다. 끝까지 넘치면 문제 칸이 밀린다.
  const compact = useWindowDimensions().height < 740;
  const [fit, setFit] = useState({ i: 0, n: 0, area: 0, content: 0 });
  const fitN = fit.i === i ? fit.n : 0;
  const measure = (k: 'area' | 'content', h: number) =>
    setFit((f) => {
      const cur = f.i === i ? f : { i, n: 0, area: f.area, content: 0 };
      const nx = { ...cur, [k]: h };
      if (nx.area > 0 && nx.content > nx.area + 1 && nx.n < 2) nx.n += 1;
      return nx.n === cur.n && nx.area === cur.area && nx.content === cur.content && cur === f ? f : nx;
    });

  // 새 문제: 들어오는 동안(0.3초)은 시계와 자판을 멈춘다.
  const qSince = useRef(0);
  useLayoutEffect(() => {
    qSince.current = performance.now();
    clock.current = { t0: 0, hiddenAt: 0, frozen: null };
    const id = setTimeout(() => {
      const now = performance.now();
      clock.current.t0 = now;
      // 문제가 들어오는 사이에 앱을 떠났으면 시계는 떠난 상태로 시작한다(돌아올 때까지 멈춰 있다).
      if (AppState.currentState !== 'active') clock.current.hiddenAt = now;
    }, motionOff() ? 0 : SETTLE_MS);
    return () => clearTimeout(id);
  }, [i]);

  // 앱을 떠난 동안(다른 앱, 잠금 화면)은 문제 시간에 넣지 않는다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const c = clock.current;
      if (!c.t0 || c.frozen != null) return;
      if (s !== 'active') {
        if (!c.hiddenAt) c.hiddenAt = performance.now();
      } else if (c.hiddenAt) {
        c.t0 += performance.now() - c.hiddenAt;
        c.hiddenAt = 0;
      }
    });
    return () => sub.remove();
  }, []);
  const readSec = () => {
    const c = clock.current;
    if (c.frozen != null) return c.frozen;
    if (!c.t0) return 0;
    return ((c.hiddenAt || performance.now()) - c.t0) / 1000;
  };

  const press = (k: string) => {
    if (settled != null || !clock.current.t0) return;
    setInput((s) => typeKey(s, k, kr));
  };

  const submit = () => {
    const s = inputRef.current;
    const c = clock.current;
    if (!s || !/\d/.test(s) || settled != null || !c.t0) return;
    const ms = (c.hiddenAt || performance.now()) - c.t0;
    c.frozen = ms / 1000;
    const res = check(p, s);
    (items.current[item.k] ??= []).push({ ms, ok: res.ok });
    setSettled(res.ok);
    const secs = sec(ms / 1000) + '초';
    if (res.ok) {
      const pm = prevMed[item.k];
      const cmp = pm != null && ms / 1000 < pm ? `지난 세트 중앙값 ${sec(pm)}초보다 ${sec(pm - ms / 1000)}초 빠름` : undefined;
      setFb({ ok: true, title: '정답', aside: secs, body: cmp });
    } else {
      setFb({ ok: false, title: p.show, aside: secs, note: REASON[res.reason], body: p.why });
      setShake((n) => n + 1);
    }
    // 한 분야의 6문제를 마치면 그 자리에서 기록한다(두 분야 세트를 반쯤 하고 닫아도 앞 분야는 남는다).
    const next = flat[i + 1];
    if (!next || next.k !== item.k) results.current.push(recordNum(item.k, item.lv, items.current[item.k], mode === 'daily'));
  };

  const next = () => {
    if (settled == null) return;
    if (last) return onDone(results.current);
    setInput('');
    setSettled(null);
    setFb(null);
    setI(i + 1);
  };

  // 실물 자판(웹): 숫자, 소수점, 빼기, 지우기, 엔터
  const keyRef = useRef({ press, submit, next, settled });
  keyRef.current = { press, submit, next, settled };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const h = keyRef.current;
      if (/^[0-9]$/.test(e.key)) h.press(e.key);
      else if (e.key === '.') h.press('.');
      else if (e.key === '-') h.press('-');
      else if (e.key === 'Backspace') h.press('bs');
      else if (e.key === 'Enter') (h.settled == null ? h.submit : h.next)();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 시험용(웹): 지금 문제를 바깥에서 읽을 수 있게
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (globalThis as any).__LW_NUM__ = { problem: () => flat[i].p, index: () => i, total: flat.length };
    return () => {
      delete (globalThis as any).__LW_NUM__;
    };
  }, [i]);

  // 답 칸 흔들기와 자판 흐려지기
  const ansRef = useRef<any>(null);
  const sx = useRef(new Animated.Value(0)).current;
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (!shake || motionOff()) return;
    if (WEB) {
      webShake(ansRef, SHAKE[0], SHAKE[1], 360, Easing.linear);
      return;
    }
    sx.setValue(0);
    Animated.timing(sx, { toValue: 1, duration: 360, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }).start();
  }, [shake]);
  const padRef = useRef<any>(null);
  const padTw = useRef<Tween | null>(null);
  const pad = useRef(new Animated.Value(1)).current;
  (WEB ? useLayoutEffect : useEffect)(() => {
    const on = settled != null;
    if (WEB) {
      tweenStop(padTw.current, 1);
      padTw.current = on && !motionOff() ? webTween(padRef, { duration: 140 }, (v) => ({ opacity: 1 - v }), { fill: 'forwards' }) : null;
      return;
    }
    if (on) Animated.timing(pad, { toValue: 0, duration: motionOff() ? 0 : 140, useNativeDriver: NATIVE_DRIVER }).start();
    else pad.setValue(1);
  }, [settled]);

  const shown = display(input, kr);
  const fs = shown.length > 20 ? 19 : shown.length > 15 ? 22 : 26;
  const okBtn = settled == null ? (input && /\d/.test(input) ? 'blue' : 'off') : settled ? 'green' : 'red';
  const progress = (settled != null ? i + 1 : i) / flat.length;
  const border = settled == null ? t.blueLine : settled ? t.greenLine : t.redLine;
  const ansBg = settled == null ? t.card : settled ? t.greenWeak : t.redWeak;
  const padHidden = settled != null;

  return (
    <View style={{ flex: 1, backgroundColor: t.card, overflow: 'hidden' }}>
      <View style={{ height: compact ? 56 : 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, zIndex: 3 }}>
        <Tap onPress={onClose} label="닫기" press="dim" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={24} color={t.faint} />
        </Tap>
        <ProgressBar value={progress} style={{ flex: 1 }} a11yLabel={`진행 ${settled != null ? i + 1 : i}/${flat.length}`} />
        <Clock read={readSec} tick={`${i}:${settled}`} />
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingTop: compact ? 12 : 20, paddingHorizontal: 16, paddingBottom: 12 }}
        onLayout={(e) => measure('area', Math.round(e.nativeEvent.layout.height))}
        onContentSizeChange={(_w, h) => measure('content', Math.round(h))}
      >
        <View key={i}>
          <SlideIn delay={100} since={qSince.current} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <T type="t7" w="700" c={t.blue}>
              {SKILL[item.k].name}
            </T>
            <LvPill lv={item.lv} />
            {mode === 'extra' ? (
              <T type="t7" w="600" c={t.mute}>
                추가 학습
              </T>
            ) : null}
          </SlideIn>
          <SlideIn delay={130} since={qSince.current}>
            <Rich type={fitN === 0 ? 't3' : fitN === 1 ? 't4' : 't5'} w="700" role="heading" level={1} style={{ letterSpacing: -0.3 }}>
              {p.q}
            </Rich>
          </SlideIn>
          {p.note ? (
            <SlideIn delay={160} since={qSince.current} style={{ alignSelf: 'flex-start', marginTop: 12, minHeight: 28, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.p.grey100, justifyContent: 'center' }}>
              <T s={14} w="600" c={t.deck} lh={1.5}>
                {p.note}
              </T>
            </SlideIn>
          ) : null}
        </View>
      </ScrollView>

      <MView
        ref={ansRef}
        accessible
        accessibilityLabel={`입력 ${shown || '없음'}${shown ? ' ' + p.unit : ''}`}
        style={[
          { marginHorizontal: 16, height: compact ? 56 : 64, borderRadius: 16, borderWidth: 2, borderColor: border, backgroundColor: ansBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingHorizontal: 16, overflow: 'hidden' },
          WEB ? null : { transform: [{ translateX: sx.interpolate({ inputRange: SHAKE[0], outputRange: SHAKE[1] }) }] },
        ]}
      >
        <T s={fs} w="700" mono lines={1} lh={1.3} style={{ letterSpacing: -0.4, flexShrink: 1 }}>
          {shown}
        </T>
        {settled == null ? (
          <Pulse>
            <View style={{ width: 2, height: 28, borderRadius: 1, backgroundColor: t.blue }} />
          </Pulse>
        ) : null}
        {input ? (
          <T s={18} w="600" c={t.mute} lines={1} lh={1.3}>
            {p.unit}
          </T>
        ) : null}
      </MView>

      <MView ref={padRef} pointerEvents={padHidden ? 'none' : 'auto'} aria-hidden={padHidden} style={[{ paddingTop: compact ? 8 : 12, paddingHorizontal: 16 }, WEB ? null : { opacity: pad }]}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: compact ? 6 : 8 }}>
          <Key tool compact={compact} label="±" a11y="부호 바꾸기" onPress={() => press('-')} />
          <View style={{ flex: 1 }} />
          {kr ? UNITS.map((u) => <Key key={u} tool unit compact={compact} label={u} a11y={u} disabled={!unitOk(input, u)} onPress={() => press(u)} />) : null}
        </View>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['.', '0', 'bs'],
        ].map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 8, marginBottom: r < 3 ? (compact ? 6 : 8) : 0 }}>
            {row.map((d) =>
              d === 'bs' ? (
                <Key key={d} compact={compact} a11y="지우기" onPress={() => press('bs')}>
                  <Icon name="erase" size={26} color={t.deck} sw={2} />
                </Key>
              ) : (
                <Key key={d} compact={compact} label={d} a11y={d === '.' ? '소수점' : d} onPress={() => press(d)} />
              ),
            )}
          </View>
        ))}
      </MView>

      <Panel fb={fb} onHeight={() => {}} />

      <View style={{ zIndex: 3, paddingHorizontal: 16, paddingTop: compact ? 8 : 12, paddingBottom: FOOT_PAD }}>
        <LipButton label={settled == null ? '확인' : last ? '마치기' : '계속'} tone={okBtn} onPress={settled == null ? submit : next} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 세트 결과
// ─────────────────────────────────────────────────────────────
function Summary({ done, onMore, onDone }: { done: Done; onMore: () => void; onDone: () => void }) {
  const t = useTheme();
  const goals = useGoals();
  const today = todayKST();
  const rows = done.results;
  const nAll = rows.reduce((a, r) => a + r.row.n, 0);
  const nOk = rows.reduce((a, r) => a + r.row.ok, 0);
  const solve = rows.reduce((a, r) => a + r.row.sum, 0);
  const extra = done.mode === 'extra' || rows.every((r) => !r.quota);
  // Latti 한 줄: 빨라진 분야, 새 최고 기록, 수준 올림, 연속 기록
  const faster = rows
    .map((r) => ({ r, gain: r.prev && r.prev.med != null && r.row.med != null ? Math.round((r.prev.med - r.row.med) * 10) / 10 : 0 }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain)[0];
  const ctx = {
    total: nAll,
    right: nOk,
    extra,
    faster: faster ? 1 : 0,
    fastSkill: faster ? SKILL[faster.r.k].name : undefined,
    gain: faster ? faster.gain : undefined,
    best: rows.some((r) => r.newPB && !!r.pbBefore),
    levelUp: rows.some((r) => r.j.change > 0),
    streak: goals.streak,
    streakUp: goals.streak > done.streakFrom,
  };
  const said = useLattiSay('num.finish', ctx, `num:${today}:${done.id}`);
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 44, paddingBottom: 24 }}>
        <Enter duration={400} scale={0.94} style={{ alignItems: 'center', paddingHorizontal: 16 }}>
          <T type="t6" w="600" c={t.sub} center role="heading" level={1}>
            {extra ? '추가 학습' : '오늘 세트'}
          </T>
          <T s={44} w="800" mono lh={52 / 44} center style={{ letterSpacing: -1.2 }}>
            {clockText(solve)}
          </T>
        </Enter>
        {said.text && said.latti ? <LattiSays text={said.text} size={28} bubble="m" delay={300} style={{ marginTop: 14, paddingHorizontal: 16, alignSelf: 'center', maxWidth: '100%' }} /> : null}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
          <Enter delay={260} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="green" icon="check" label="정답" value={`${nOk}/${nAll}`} a11yLabel={`정답 ${nOk}/${nAll}`} />
          </Enter>
          <Enter delay={320} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="blue" icon="clock" label="문제당" value={`${sec(nAll ? solve / nAll : null)}초`} a11yLabel={`문제당 ${sec(nAll ? solve / nAll : null)}초`} />
          </Enter>
          <Enter delay={380} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="orange" icon="calFill" label="연속" value={`${goals.streak}일`} a11yLabel={`연속 ${goals.streak}일`} />
          </Enter>
        </View>
        {rows.map((r, n) => (
          <Enter key={r.k + n} delay={440 + n * 70} duration={320} y={10}>
            <ResultCard r={r} />
          </Enter>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD, flexDirection: 'row', gap: 10 }}>
        <LipButton label="추가 학습" tone="ghost" onPress={onMore} style={{ flex: 1 }} />
        <LipButton label="계속" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** 분야 하나의 결과: 중앙값, 같은 수준의 지난 세트와 견준 시간, 최고 기록, 다음 수준 */
function ResultCard({ r }: { r: NumResult }) {
  const t = useTheme();
  const S = SKILL[r.k];
  const prev = r.prev;
  const d = prev && r.row.med != null && prev.med != null ? Math.round((prev.med - r.row.med) * 10) / 10 : null;
  return (
    <View style={{ marginTop: 12, marginHorizontal: 16, borderWidth: 2, borderColor: t.hair, borderRadius: 18, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SkillMark k={r.k} size={32} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T s={17} w="700" lh={1.4} lines={1} style={{ flexShrink: 1 }}>
            {S.name}
          </T>
          <LvPill lv={r.lv} small />
        </View>
        <T s={15} w="700" c={t.deck} mono>{`${r.row.ok}/${r.row.n}`}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T s={28} w="800" mono lh={34 / 28} style={{ letterSpacing: -0.6 }}>
              {sec(r.row.med)}
            </T>
            <T s={16} w="700" style={{ marginLeft: 1 }}>
              초
            </T>
          </View>
          <T s={13} w="600" c={t.mute}>
            중앙값
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 1 }}>
          <T s={13} w="600" c={t.mute} mono>
            {prev ? `지난번 ${sec(prev.med)}초` : '이 수준 첫 세트'}
          </T>
          {d != null ? (
            <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 8, backgroundColor: d > 0 ? t.greenWeak : t.p.grey100, justifyContent: 'center' }}>
              <T s={13} w="700" c={d > 0 ? t.greenText : t.sub} mono>
                {d > 0 ? `${sec(d)}초 단축` : d < 0 ? `${sec(-d)}초 늘어남` : '같음'}
              </T>
            </View>
          ) : null}
        </View>
      </View>
      {/* 이 수준의 첫 세트는 견줄 기록이 없으므로 최고 기록 표시를 하지 않는다 */}
      {r.newPB && r.pbBefore ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Enter delay={760} duration={360} easing={BACK} scale={0.5}>
            <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 8, backgroundColor: t.orangeWeak, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="star" size={13} color={t.p.orange800} />
              <T s={13} w="700" c={t.p.orange800}>
                최고 기록
              </T>
            </View>
          </Enter>
        </View>
      ) : null}
      {r.j.change !== 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.hair }}>
          {r.j.change > 0 ? (
            <Enter delay={760} duration={360} easing={BACK} scale={0.5}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="up" size={14} color="#ffffff" />
              </View>
            </Enter>
          ) : null}
          <T s={15} w="600" c={r.j.change > 0 ? t.body : t.sub}>
            {r.j.change > 0 ? `다음 세트부터 Lv.${r.j.next}` : `다음 세트는 Lv.${r.j.next}`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

