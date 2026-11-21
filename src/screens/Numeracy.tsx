// 수리: 누르면 바로 오늘 세트(12문제)가 시작되고, 할당을 채운 뒤에 다시 누르면 추가 학습 6문제가 바로 시작된다.
// 화면에는 분야 이름, 분야 표식, 수준을 두지 않는다(2026-11-21 소유자 결정). 분야와 수준은 src/numeracy.ts 안에서만 쓰고, 기록도 분야마다 한 줄씩 남긴다.
// 결과 화면은 전체 숫자만(정답 수, 중간 시간, 지난번보다 줄어든 초, 최고 기록), 기록 화면은 날짜별 중간 시간 추이 하나.
// 시간은 문제가 다 들어온 뒤(0.3초)부터 확인까지. 그 전에는 자판이 먹지 않고, 피드백과 앱을 떠난 시간은 넣지 않는다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { addDays, todayKST } from '../dates';
import { LattiSays, useLattiSay } from '../latti';
import { MView, NATIVE_DRIVER, Pulse, Rise, WEB, motionOff, tweenStop, Tween, webShake, webTween } from '../motion';
import { useNav } from '../nav';
import { NumItem, NumResult, Problem, REASON, SkillId, check, extraSkill, fmtNum, lastAt, overall, perDayAll, quotaLeft, setFor } from '../numeracy';
import { useGoals, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { Icon, LipButton, ProgressBar, Rich, StatCard, T, Tap } from '../ui';
import { Enter, FOOT_PAD, Fb, Panel, SlideIn } from './Study';

type Mode = 'daily' | 'extra';
type Item = { k: SkillId; lv: number; p: Problem };
type RunState = { id: number; mode: Mode; flat: Item[]; prevMed: Partial<Record<SkillId, number | null>>; streakFrom: number };
type Done = { mode: Mode; results: NumResult[]; items: NumItem[]; streakFrom: number; id: number };

const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);
/** 문제가 다 들어오는 시간. 이 뒤부터 시계가 돌고 자판이 먹는다 */
const SETTLE_MS = 300;

const sec = (x: number | null | undefined) => (x == null ? '-' : fmtNum(x, 1));
const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const md = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;

// ─────────────────────────────────────────────────────────────
// 추이 그림: 날짜마다 그날 중간 시간 한 점. 주황 점은 가장 빨랐던 날
// ─────────────────────────────────────────────────────────────
type Pt = { d: string; med: number };
function Trend({ pts, w, h, best }: { pts: Pt[]; w: number; h: number; best: number }) {
  const t = useTheme();
  if (!w) return <View style={{ height: h }} />;
  const pl = 34;
  const pr = 8;
  const pt = 12;
  const pb = 26;
  const font = { fontFamily: FONT_SANS, fontSize: 11, fontWeight: '600' as const };
  const lines = (
    <>
      <Line x1={pl} x2={w - pr} y1={pt} y2={pt} stroke={t.hair} strokeWidth={1} />
      <Line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} stroke={t.hair} strokeWidth={1} />
    </>
  );
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
  let d = '';
  pts.forEach((p, i) => (d += `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.med).toFixed(1)}`));
  const L = pts.length - 1;
  return (
    <Svg width={w} height={h} aria-hidden>
      {lines}
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
      <Path d={d} fill="none" stroke={t.blue} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.med)} r={2.6} fill={t.blue} />
      ))}
      {best >= 0 && best !== L ? <Circle cx={x(best)} cy={y(pts[best].med)} r={5} fill={t.orange} stroke={t.card} strokeWidth={2} /> : null}
      <Circle cx={x(L)} cy={y(pts[L].med)} r={5} fill={best === L ? t.orange : t.blue} stroke={t.card} strokeWidth={2} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 구역 화면: 열자마자 문제. 할당이 남았으면 오늘 세트, 다 채웠으면 추가 학습.
// ─────────────────────────────────────────────────────────────
export function NumeracyScreen(_: { start?: boolean }) {
  const nav = useNav();
  const { num } = useStore();
  const goals = useGoals();
  const seq = useRef(0);
  const plan = (): RunState => {
    const today = todayKST();
    const left = quotaLeft(num, today);
    const mode: Mode = left.length ? 'daily' : 'extra';
    const ks = left.length ? left : [extraSkill(num, today)];
    const flat: Item[] = [];
    const prevMed: Partial<Record<SkillId, number | null>> = {};
    for (const k of ks) {
      const { lv, problems } = setFor(num, today, k);
      prevMed[k] = lastAt(num.sessions, k, lv)?.med ?? null;
      for (const p of problems) flat.push({ k, lv, p });
    }
    return { id: ++seq.current, mode, flat, prevMed, streakFrom: goals.streak };
  };
  const [run, setRun] = useState<RunState | null>(plan);
  const [done, setDone] = useState<Done | null>(null);
  const [rec, setRec] = useState(false);

  if (run) {
    return (
      <Run
        key={run.id}
        mode={run.mode}
        flat={run.flat}
        prevMed={run.prevMed}
        onClose={nav.pop}
        onDone={(results, items) => {
          setDone({ mode: run.mode, results, items, streakFrom: run.streakFrom, id: run.id });
          setRun(null);
        }}
      />
    );
  }
  if (rec) return <Records onBack={() => setRec(false)} />;
  if (done) {
    return (
      <Summary
        key={done.id}
        done={done}
        onRecords={() => setRec(true)}
        onMore={() => {
          setDone(null);
          setRun(plan());
        }}
        onDone={nav.pop}
      />
    );
  }
  return <View style={{ flex: 1 }} />;
}

// ─────────────────────────────────────────────────────────────
// 기록: 이번 주 숫자 셋과 날짜별 중간 시간 추이(분야를 나누지 않는다)
// ─────────────────────────────────────────────────────────────
function Records({ onBack }: { onBack: () => void }) {
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
  const pts = perDayAll(num.sessions).slice(-14);
  let best = -1;
  pts.forEach((p, i) => (best < 0 || p.med < pts[best].med) && (best = i));
  const lastMed = pts.length ? pts[pts.length - 1].med : null;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8 }}>
        <Tap onPress={onBack} label="돌아가기" press="dim" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="back" size={24} color={t.ink} sw={2.2} />
        </Tap>
        <T s={18} w="700" lh={1.4} role="heading" level={1}>
          기록
        </T>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 12 }}>
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
        <Rise delay={60}>
          <View style={{ backgroundColor: t.card, borderRadius: 20, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <T s={17} w="700" lh={1.4} style={{ letterSpacing: -0.2 }}>
                중간 시간
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }} accessible accessibilityLabel={`최근 중간 시간 ${sec(lastMed)}초`}>
                <T s={22} w="700" mono lh={28 / 22}>
                  {sec(lastMed)}
                </T>
                <T s={14} w="600" style={{ marginLeft: 1 }}>
                  초
                </T>
              </View>
            </View>
            <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ marginTop: 12 }}>
              <Trend pts={pts} w={w} h={120} best={best} />
            </View>
            {best >= 0 ? (
              <T s={13} c={t.sub} mono style={{ marginTop: 8 }}>
                {'최고 '}
                <T s={13} w="700" c={t.orangeText} mono>{`${sec(pts[best].med)}초`}</T>
                {` · ${md(pts[best].d)}`}
              </T>
            ) : null}
          </View>
        </Rise>
      </ScrollView>
    </View>
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

function Run({ mode, flat, prevMed, onClose, onDone }: { mode: Mode; flat: Item[]; prevMed: Partial<Record<SkillId, number | null>>; onClose: () => void; onDone: (results: NumResult[], items: NumItem[]) => void }) {
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
      const cmp = pm != null && ms / 1000 < pm ? `지난번 중간 시간 ${sec(pm)}초보다 ${sec(pm - ms / 1000)}초 빠름` : undefined;
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
    if (last) return onDone(results.current, Object.values(items.current).flat());
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
          <SlideIn delay={100} since={qSince.current}>
            <Rich type={fitN === 0 ? 't3' : fitN === 1 ? 't4' : 't5'} w="700" role="heading" level={1} style={{ letterSpacing: -0.3 }}>
              {p.q}
            </Rich>
          </SlideIn>
          {p.note ? (
            <SlideIn delay={130} since={qSince.current} style={{ alignSelf: 'flex-start', marginTop: 12, minHeight: 28, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.p.grey100, justifyContent: 'center' }}>
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
// 결과: 전체 숫자만
// ─────────────────────────────────────────────────────────────
function Summary({ done, onRecords, onMore, onDone }: { done: Done; onRecords: () => void; onMore: () => void; onDone: () => void }) {
  const t = useTheme();
  const goals = useGoals();
  const today = todayKST();
  const o = overall(done.results, done.items);
  const extra = done.mode === 'extra' || done.results.every((r) => !r.quota);
  const gain = o.gain;
  // Latti 한 줄. 분야 이름(fastSkill)은 넘기지 않는다. 그 이름을 쓰는 줄과 "내일은 다른 두 분야" 줄은 고르지 않게 된다.
  const ctx = {
    total: o.n,
    right: o.ok,
    acc: o.n ? Math.round((o.ok / o.n) * 100) : 0,
    extra: extra ? true : undefined,
    faster: gain != null && gain > 0 ? 1 : 0,
    best: o.newPB,
    levelUp: o.levelUp,
    streak: goals.streak,
    streakUp: goals.streak > done.streakFrom,
  };
  const said = useLattiSay('num.finish', ctx, `num:${today}:${done.id}`);
  const cmp = gain == null ? '첫 기록' : gain > 0 ? `지난번보다 ${sec(gain)}초 빠름` : gain < 0 ? `지난번보다 ${sec(-gain)}초 느림` : '지난번과 같음';
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 12 }}>
        <Tap onPress={onRecords} label="기록" press="dim" style={{ height: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T s={15} w="600" c={t.deck}>
            기록
          </T>
          <Icon name="chev" size={16} color={t.faint} />
        </Tap>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}>
        <Enter duration={400} scale={0.94} style={{ alignItems: 'center', paddingHorizontal: 16 }}>
          <T type="t6" w="600" c={t.sub} center role="heading" level={1}>
            {extra ? '추가 학습' : '오늘 세트'}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }} accessible accessibilityLabel={`중간 시간 ${sec(o.med)}초`}>
            <T s={44} w="800" mono lh={52 / 44} center style={{ letterSpacing: -1.2 }}>
              {sec(o.med)}
            </T>
            <T s={24} w="700" style={{ marginLeft: 2 }}>
              초
            </T>
          </View>
          <T s={14} w="600" c={t.mute} center>
            중간 시간
          </T>
        </Enter>
        {said.text && said.latti ? <LattiSays text={said.text} size={28} bubble="m" delay={300} style={{ marginTop: 14, paddingHorizontal: 16, alignSelf: 'center', maxWidth: '100%' }} /> : null}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
          <Enter delay={260} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="green" icon="check" label="정답" value={`${o.ok}/${o.n}`} a11yLabel={`정답 ${o.ok}/${o.n}`} />
          </Enter>
          <Enter delay={320} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="blue" icon="clock" label="걸린 시간" value={clockText(o.sum)} a11yLabel={`걸린 시간 ${clockText(o.sum)}`} />
          </Enter>
          <Enter delay={380} duration={420} easing={BACK} y={14} scale={0.96} style={{ flex: 1 }}>
            <StatCard tone="orange" icon="calFill" label="연속" value={`${goals.streak}일`} a11yLabel={`연속 ${goals.streak}일`} />
          </Enter>
        </View>
        <Enter delay={440} duration={320} y={10}>
          <View style={{ marginTop: 12, marginHorizontal: 16, borderWidth: 2, borderColor: t.hair, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: gain != null && gain > 0 ? t.greenWeak : t.p.grey100, justifyContent: 'center' }}>
              <T s={14} w="700" c={gain != null && gain > 0 ? t.greenText : t.sub} mono>
                {cmp}
              </T>
            </View>
            {o.newPB ? (
              <Enter delay={760} duration={360} easing={BACK} scale={0.5}>
                <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.orangeWeak, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={14} color={t.p.orange800} />
                  <T s={14} w="700" c={t.p.orange800}>
                    최고 기록
                  </T>
                </View>
              </Enter>
            ) : null}
          </View>
        </Enter>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: FOOT_PAD, flexDirection: 'row', gap: 10 }}>
        <LipButton label="추가 학습" tone="ghost" onPress={onMore} style={{ flex: 1 }} />
        <LipButton label="계속" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
