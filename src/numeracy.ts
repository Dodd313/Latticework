// 수리: 기업분석과 재무학에서 자주 쓰는 계산을 분야별로, 같은 수준에서 되풀이해 낸다.
// 처음에는 motion-lab/v11/numeracy-gen.js(11차 시안)를 옮겼고, 2026-11-21 소유자 피드백으로 수준 1, 2 를 암산 수준으로 다시 만들었다
// (시안과는 이제 다르다). 분야 이름은 기록과 시험에만 쓰고 화면에는 보이지 않는다. 저장은 하지 않는다.
// 저장과 불러오기는 src/store.tsx 가 맡고, 이 파일은 순수 함수만 둔다(DOM, React 없음).
// - 문제는 씨앗 문자열 하나로 정해진다(같은 씨앗이면 같은 문제). 푼 문제는 남기지 않는다.
// - 수준마다 문제 유형 묶음(6개)과 숫자 범위가 고정이라, 날마다 다른 문제를 풀어도 시간을 견줄 수 있다.
// - 기록은 분야마다 한 세트에 한 줄 { d, k, lv, n, ok, med, best, sum } 뿐이다.
// 자체 시험: node scripts/numeracy-test.mjs

// ─────────────────────────────────────────────────────────────
// 설정(소유자 결정 2026-11-21). 목표 시간은 처음 정한 값이고, 2주 써 본 실제 기록을 보고 고친다.
// ─────────────────────────────────────────────────────────────
export const NUM_CONFIG = {
  /** 한 분야 한 세트의 문제 수 */
  setSize: 6,
  /** 하루 할당: 날짜로 정한 두 분야 × 6문제 = 12문제(약 3분). 하루 목표와 연속 기록에 든다 */
  dailySkills: 2,
  /** 수준 규칙. 올림: 이 수준 3세트 이상, 최근 3세트 정답률 90% 이상, 최근 3세트 중앙값들의 중앙값이 목표 이하. 내림: 최근 2세트 모두 60% 미만 */
  rule: { upWindow: 3, upAcc: 0.9, downWindow: 2, downAcc: 0.6 },
  /** 최고 기록으로 셀 수 있는 세트의 정답률 하한 */
  bestMinAcc: 0.8,
  /** 수준 1~4 의 목표 시간(초): 맞힌 문제 시간의 중앙값. 1, 2 는 암산으로 닿을 만한 값(2026-11-21 소유자 피드백으로 다시 정함) */
  targets: {
    read: [8, 10, 14, 16],
    fx: [10, 12, 20, 25],
    ratio: [10, 12, 20, 25],
    growth: [10, 12, 20, 25],
    pv: [10, 12, 20, 25],
    unit: [6, 10, 15, 20],
    est: [8, 10, 12, 12],
  } as Record<string, number[]>,
};

// ─────────────────────────────────────────────────────────────
// 난수: 씨앗 문자열에서 정해지는 수열 (FNV-1a 해시 + mulberry32)
// ─────────────────────────────────────────────────────────────
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  next: () => number;
  int: (lo: number, hi: number) => number;
  step: (lo: number, hi: number, st: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
  sign: () => number;
  shuffle: <T>(arr: readonly T[]) => T[];
};

export function makeRng(seed: string): Rng {
  let a = hash32(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    step: (lo, hi, st) => lo + st * Math.floor(next() * (Math.floor((hi - lo) / st) + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    shuffle: (arr) => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      return b;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 수 다루기와 표기
// ─────────────────────────────────────────────────────────────
// BigInt 는 거듭제곱 연산자 대신 곱셈으로만 쓴다(번들러가 ** 를 Math.pow 로 바꾸면 BigInt 에서 깨진다).
const B0 = BigInt(0);
const B10 = BigInt(10);
function pow10n(e: number): bigint {
  let v = BigInt(1);
  for (let i = 0; i < e; i++) v *= B10;
  return v;
}

const clean = (x: number) => +x.toFixed(9);
/** 반올림(0.5 는 0 에서 먼 쪽으로). 우리말 "반올림"과 같다. */
export function roundTo(x: number, dp: number): number {
  const f = Math.pow(10, dp);
  const s = x < 0 ? -1 : 1;
  return clean((s * Math.round(Math.abs(x) * f + 1e-9)) / f);
}
/** 반올림 자리에서 0.5 경계에 너무 가까우면 참. 이런 문제는 내지 않는다(계산 순서에 따라 답이 갈릴 수 있다). */
function nearHalf(x: number, dp: number): boolean {
  const y = Math.abs(x) * Math.pow(10, dp);
  const fr = y - Math.floor(y);
  return Math.abs(fr - 0.5) < 0.05;
}
export function roundSig(x: number, s: number): number {
  if (x === 0) return 0;
  const e = Math.floor(Math.log10(Math.abs(x))) - s + 1;
  const f = Math.pow(10, e);
  return clean(Math.round(x / f) * f);
}
function trimDec(ax: number): string {
  let s = ax.toFixed(6);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
/** 세 자리 쉼표. dp 를 주면 그 자리까지 고정. */
export function fmtNum(x: number, dp?: number | null): string {
  const neg = x < 0;
  const ax = Math.abs(x);
  const s = dp == null ? trimDec(ax) : ax.toFixed(dp);
  const [i, f] = s.split('.');
  return (neg && +s !== 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}
const groupComma = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const KR_UNITS: [string, number][] = [
  ['조', 12],
  ['억', 8],
  ['만', 4],
];
/** 정수를 조, 억, 만으로 끊어 쓴다. 312323425321 은 "3123억 2342만 5321". comma 면 "3,123억 2,342만 5,321". */
export function fmtKR(n: number, o: { comma?: boolean; space?: boolean } = {}): string {
  if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error('fmtKR: 정수가 아님 ' + n);
  const neg = n < 0;
  let b = BigInt(Math.abs(n));
  if (b === B0) return '0';
  const parts: string[] = [];
  for (const [u, e] of KR_UNITS) {
    const v = pow10n(e);
    const q = b / v;
    if (q > B0) {
      parts.push((o.comma ? groupComma(q.toString()) : q.toString()) + u);
      b -= q * v;
    }
  }
  if (b > B0) parts.push(o.comma ? groupComma(b.toString()) : b.toString());
  return (neg ? '-' : '') + parts.join(o.space === false ? '' : ' ');
}
/** 뒤에서 네 자리씩 끊은 모습: "3123 2342 5321" */
export function group4(n: number): string {
  const s = String(n);
  const out: string[] = [];
  for (let i = s.length; i > 0; i -= 4) out.unshift(s.slice(Math.max(0, i - 4), i));
  return out.join(' ');
}
/**
 * 조, 억, 만이 섞인 입력을 읽는다. 쉼표와 띄어쓰기는 무시한다.
 * 돌려주는 것: { value, canonical } 또는 null(읽을 수 없음).
 * canonical: 조 아래 자리는 모두 네 자리 이하의 정수, 단위는 큰 것부터 한 번씩, 빈 자리(0억)와 앞의 0 없음.
 */
export function parseKR(str: string | null | undefined): { value: number; canonical: boolean } | null {
  if (str == null) return null;
  let s = String(str).replace(/[\s,]/g, '');
  if (!s) return null;
  let neg = false;
  if (s[0] === '-') {
    neg = true;
    s = s.slice(1);
  }
  const EXP: Record<string, number> = { 조: 12, 억: 8, 만: 4, '': 0 };
  let last = 99;
  let canonical = true;
  let total = B0;
  let frac = 0;
  let any = false;
  while (s.length) {
    const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(조|억|만)?/);
    if (!m) return null;
    const unit = m[2] || '';
    const e = EXP[unit];
    if (e >= last) return null;
    if (!unit && m[0].length !== s.length) return null;
    last = e;
    const [ip, fp = ''] = m[1].split('.');
    if (fp) canonical = false;
    const digits = BigInt((ip || '0') + fp);
    if (fp.length <= e) total += digits * pow10n(e - fp.length);
    else frac += Number(digits) / Math.pow(10, fp.length - e);
    const segVal = Number(ip || '0');
    if (segVal === 0 && !fp) canonical = false;
    if (unit !== '조' && segVal > 9999) canonical = false;
    if (ip.length > 1 && ip[0] === '0') canonical = false;
    s = s.slice(m[0].length);
    any = true;
  }
  if (!any) return null;
  const value = (Number(total) + frac) * (neg ? -1 : 1);
  return { value, canonical };
}
const EN: Record<string, number> = { million: 6, billion: 9, trillion: 12 };
/** 10 의 거듭제곱을 곱한 값을 정확히(BigInt) 계산한다. */
function decTimes(numStr: string, exp: number): number {
  const neg = numStr[0] === '-';
  const t = neg ? numStr.slice(1) : numStr;
  const [ip, fp = ''] = t.split('.');
  const digits = BigInt((ip || '0') + fp);
  const v = fp.length <= exp ? Number(digits * pow10n(exp - fp.length)) : Number(digits) / Math.pow(10, fp.length - exp);
  return neg ? -v : v;
}
/** 영어 단위: 312300000000 은 "312.3 billion" */
export function fmtEN(n: number, unit?: string): string {
  const u = unit || (n >= 1e12 ? 'trillion' : n >= 1e9 ? 'billion' : 'million');
  return fmtNum(clean(n / Math.pow(10, EN[u]))) + ' ' + u;
}
export function parseEN(s: string): number | null {
  const m = String(s)
    .trim()
    .match(/^(-?[\d,]*\.?\d+)\s*(million|billion|trillion)$/i);
  if (!m) return null;
  return decTimes(m[1].replace(/,/g, ''), EN[m[2].toLowerCase()]);
}

/** 받침에 따라 조사를 고른다. a: 받침 있을 때(은, 을, 이), b: 없을 때(는, 를, 가). */
export function josa(word: string, a: string, b: string): string {
  const ch = String(word).replace(/[\s)\]]+$/, '').slice(-1);
  const code = ch.charCodeAt(0);
  let has: boolean;
  if (code >= 0xac00 && code <= 0xd7a3) has = (code - 0xac00) % 28 !== 0;
  else if (/[0-9]/.test(ch)) has = '013678'.includes(ch);
  else if (/[LMNRlmnr]/.test(ch)) has = true;
  else has = false;
  return word + (has ? a : b);
}
/** 으로/로: 받침이 없거나 ㄹ 받침이면 "로". 숫자는 1, 7, 8(ㄹ)과 2, 4, 5, 9(받침 없음)가 "로". */
export function ro(word: string): string {
  const ch = String(word).replace(/[\s)\]]+$/, '').slice(-1);
  const code = ch.charCodeAt(0);
  let eu: boolean;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const j = (code - 0xac00) % 28;
    eu = j !== 0 && j !== 8;
  } else if (/[0-9]/.test(ch)) eu = '036'.includes(ch);
  else eu = /[MNmn]/.test(ch);
  return word + (eu ? '으로' : '로');
}

/** 원 금액을 문장에 넣는 모양. 억 넘는 금액과 만 원 단위 금액은 한글 단위로. */
function won(n: number): string {
  if (n >= 1e6 && n % 1e4 === 0) return fmtKR(n, { comma: true }) + ' 원';
  return fmtNum(n) + '원';
}
const eok = (x: number) => fmtKR(Math.round(x * 1e8), { comma: true }) + ' 원';
const pct = (x: number) => fmtNum(x) + '%';
const ORD = ['', '첫째', '둘째', '셋째', '넷째'];
const roundNote = (dp: number) => (dp === 0 ? '반올림해 정수로' : `반올림해 소수 ${ORD[dp]} 자리까지`);
const joinUnit = (unit: string) => (!unit ? '' : /^(million|billion|trillion)/.test(unit) ? ' ' + unit : unit);
/** 한글 단위로 끝나면 띄어 쓴다: "8,300만 원", "2,500만 주", "1,957원" */
const krWith = (txt: string, u: string) => txt + (/[조억만]$/.test(txt) ? ' ' : '') + u;
const shares = (n: number) => krWith(fmtKR(n, { comma: true }), '주');

// ─────────────────────────────────────────────────────────────
// 문제 모양
// ─────────────────────────────────────────────────────────────
//  input 'kr' : 조, 억, 만 단추가 있는 자판. form 이면 끊어 쓴 모양까지 맞아야 정답.
//  dp         : 반올림 자리(문제에 적힌다). 없으면 정확한 값.
//  tol        : { rel } 또는 { abs }. 어림셈. raw 와의 차이로 채점한다.
export type Tol = { rel?: number; abs?: number };
export type SkillId = 'read' | 'fx' | 'ratio' | 'growth' | 'pv' | 'unit' | 'est';
export type Problem = {
  skill: SkillId;
  level: number;
  type: string;
  seed: string;
  q: string;
  note: string;
  input: 'kr' | 'num';
  form: boolean;
  unit: string;
  answer: number;
  raw: number;
  dp: number | null;
  tol: Tol | null;
  neg?: boolean;
  show: string;
  typed: string;
  why: string;
  vars: Record<string, any>;
};
type Draft = { q: string; unit: string; why: string; vars: Record<string, any>; input?: 'kr' | 'num'; form?: boolean; neg?: boolean; note?: string; answer?: number; raw?: number; dp?: number | null; tol?: Tol | null };
type Gen = (R: Rng, lv: number) => Draft | null;

const SKIP = null;
function exact(o: Draft, value: number): Draft {
  return Object.assign(o, { answer: clean(value), raw: clean(value), dp: null });
}
function rounded(o: Draft, raw: number, dp: number): Draft | null {
  if (nearHalf(raw, dp)) return SKIP;
  return Object.assign(o, { raw: clean(raw), dp, answer: roundTo(raw, dp), note: roundNote(dp) });
}
function approx(o: Draft, raw: number, tol: Tol): Draft {
  const note = tol.rel != null ? `실제 값의 ±${fmtNum(tol.rel * 100)}% 안` : `±${fmtNum(tol.abs!)}%p 안`;
  return Object.assign(o, { raw: clean(raw), answer: clean(raw), dp: null, tol, note });
}

// 수준 1, 2 는 암산으로 5~15초에 풀리게 만든다(소유자 결정 2026-11-21: "100/6=16.66 이 정도는 할 수 있다").
//  - 곱하고 나누는 수는 0 이 아닌 숫자가 한두 개(3억 2,000만, 4,500달러, 1,400원)
//  - 환율은 50원 간격(1달러 1,250~1,550원, 100엔 850~1,000원, 1유로 1,400~1,700원). 비율은 5, 10, 15, 20, 25, 50% 같은 수
//  - 나눗셈은 나누는 수가 한 자리 크기(600, 7,000)라 답이 짧다. 반올림 자리는 문제에 적는다
//  - 같은 규칙 안에서 숫자 조합은 유형마다 500 가지 이상(scripts/numeracy-test.mjs 5번이 센다). 자주 풀어도 답을 외울 수 없게(2026-11-21)
// 수준 3, 4 는 더 어렵지만, 곱하고 나누는 수는 앞자리 두 개(2,700억, 1,450원)까지만 쓴다. 손으로 긴 곱셈을 할 일은 없다.
type Cur = 'usd' | 'jpy' | 'eur';
/** 수준 1, 2 의 환율(50원 간격). 1달러 1,250~1,550원, 100엔 850~1,000원, 1유로 1,400~1,700원 */
const RATES12: Record<Cur, number[]> = {
  usd: [1250, 1300, 1350, 1400, 1450, 1500, 1550],
  jpy: [850, 900, 950, 1000],
  eur: [1400, 1450, 1500, 1550, 1600, 1650, 1700],
};
const RATE: Record<Cur, (R: Rng, lv: number) => number> = {
  usd: (R, lv) => (lv <= 2 ? R.pick(RATES12.usd) : R.step(1300, 1500, 50)),
  jpy: (R, lv) => (lv <= 2 ? R.pick(RATES12.jpy) : R.pick([900, 1000])), // 100엔당 원
  eur: (R, lv) => (lv <= 2 ? R.pick(RATES12.eur) : R.step(1450, 1650, 50)),
};
const RATE_TXT: Record<Cur, (r: number) => string> = {
  usd: (r) => `1달러가 ${fmtNum(r)}원`,
  jpy: (r) => `100엔이 ${fmtNum(r)}원`,
  eur: (r) => `1유로가 ${fmtNum(r)}원`,
};
const CUR: Record<Cur, string> = { usd: '달러', jpy: '엔', eur: '유로' };
const PER_UNIT: Record<Cur, number> = { usd: 1, jpy: 100, eur: 1 }; // 환율이 몇 단위당인지

/** 유효숫자 s 개짜리 수를 lo..hi 에서 */
const sigIn = (R: Rng, s: number, lo: number, hi: number): number => {
  for (;;) {
    const v = roundSig(R.int(lo, hi), s);
    if (v >= lo && v <= hi) return v;
  }
};
/** 앞자리(유효숫자)가 s 개 이하인 수인지. 곱해서 나온 금액이 1,275만처럼 길어지면 다시 뽑는다. */
const few = (x: number, s = 3) => roundSig(x, s) === x;
/** 0 이 아닌 숫자가 하나: 1~9 에 자리 하나를 곱한다(300, 4,000) */
const one = (R: Rng, places: number[]) => R.int(1, 9) * R.pick(places);

// 숫자 조합 늘리기(소유자 결정 2026-11-21: "난이도는 그대로, 숫자는 외울 수 없게").
// 유형마다 난이도 규칙(앞자리 수, 친한 비율, 똑 떨어지는 답)을 지키는 조합을 미리 늘어놓고 그 안에서 고르게 뽑는다.
// 자릿수(10 의 거듭제곱)는 난이도를 바꾸지 않으므로 넓게 쓴다: 1,000만 원에서 90조 원까지.
/** 앞자리 m 에 10 의 거듭제곱을 곱해 [lo, hi) 에 드는 수들. 3 이면 30, 300, 3,000, ... */
function scales(m: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let p = 1; m * p < hi; p *= 10) if (m * p >= lo) out.push(m * p);
  return out;
}
/** 조합 목록은 한 번만 만든다(순수 함수라 결과가 같다). */
const LISTS = new Map<string, unknown>();
function listOf<T>(key: string, build: () => T): T {
  if (!LISTS.has(key)) LISTS.set(key, build());
  return LISTS.get(key) as T;
}
/** 묶음을 먼저 고르고(비율, 환율 같은 것) 그 안에서 하나를 고른다. 묶음마다 조합 수가 달라도 고르게 섞인다. */
function pick2<T>(R: Rng, groups: T[][]): T {
  const gs = groups.filter((g) => g.length);
  return R.pick(R.pick(gs));
}
/** 원 금액: 100만 원 위나 만 원 단위로 떨어지면 조, 억, 만(3억 2,000만 원, 518만 4,000원), 아니면 쉼표(405,000원) */
function krw(n: number): string {
  if (n >= 1e6 || (n >= 1e4 && n % 1e4 === 0)) return krWith(fmtKR(n, { comma: true }), '원');
  return fmtNum(n) + '원';
}
/**
 * 답의 단위. 답이 정수로 떨어지게 고른다(수준 1, 2 의 정확한 답에 소수가 생기지 않게):
 * 100만 원 아래와 정수로 안 떨어지는 금액은 원(조, 억, 만 자판으로 "1억 3,500만"), 1억 원 아래는 만 원, 그 위는 억 원이나 조 원.
 */
function tier(n: number): { unit: string; div: number } {
  const whole = (div: number) => Number.isInteger(clean(n / div));
  if (n >= 1e12) return whole(1e12) ? { unit: '조 원', div: 1e12 } : { unit: '원', div: 1 };
  if (n >= 1e8 && whole(1e8)) return { unit: '억 원', div: 1e8 };
  if (n >= 1e6 && n < 1e8 && whole(1e4)) return { unit: '만 원', div: 1e4 };
  return { unit: '원', div: 1 };
}
/** 앞자리 하나(1~9) */
const D1 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** 앞자리 하나 또는 둘(1~99) */
const D12 = Array.from({ length: 99 }, (_, i) => i + 1);
/** 회사 금액의 자릿수: 1,000만 원 이상 100조 원 미만 */
const CO = [1e7, 1e14] as const;

// ── 1. 큰 수 읽기 ──────────────────────────────────────────
const EN_BASE: Record<string, string> = { million: '1 million은 100만', billion: '1 billion은 10억', trillion: '1 trillion은 1조' };
const read: Record<string, Gen> = {
  d2k(R, lv) {
    let n: number;
    if (lv === 1) {
      // 0 이 아닌 숫자 두 개, 만 위 아무 자리에서 한두 자리 떨어져: 32만, 3억 200만, 45억, 1조 2,000억, 50조 7,000억(앞자리 셋까지)
      const a = R.int(5, 13);
      const b = a === 5 ? 4 : a - R.int(1, 2);
      n = R.int(1, 9) * Math.pow(10, a) + R.int(1, 9) * Math.pow(10, b);
    } else if (lv === 2) n = R.chance(0.7) ? sigIn(R, 3, 1e8, 99e8) : sigIn(R, 3, 1e12, 99e12); // 3억 2,500만, 12억 3,000만, 1조 2,500억
    else if (lv === 3) n = R.int(10, 9999) * 1e8 + (R.chance(0.25) ? 0 : R.int(1, 9999)) * 1e4;
    else if (R.chance(0.5)) n = R.int(100, 9999) * 1e8 + (R.chance(0.2) ? 0 : R.int(1, 9999)) * 1e4 + R.int(1, 9999);
    else n = R.int(1, 999) * 1e12 + (R.chance(0.3) ? 0 : R.int(1, 9999)) * 1e8 + (R.chance(0.3) ? 0 : R.int(1, 9999)) * 1e4 + R.int(0, 9999);
    const o: Draft = { q: `${fmtNum(n)}원을 조, 억, 만 단위를 넣어 쓰면?`, input: 'kr', form: true, unit: '원', vars: { n }, why: `뒤에서부터 네 자리씩 끊으면 ${group4(n)}. 끊은 자리마다 만, 억, 조를 붙인다.` };
    return exact(o, n);
  },
  k2e(R, lv) {
    const cur = R.pick(['원', '달러']);
    let n: number, en: string;
    if (lv === 1) [n, en] = R.chance(0.5) ? [sigIn(R, 2, 1e7, 99e7), 'million'] : [sigIn(R, 2, 1e9, 99e9), 'billion']; // 4,500만 = 45 million, 45억 = 4.5 billion
    else if (lv === 2) {
      const k = R.int(0, 2);
      if (k === 0) [n, en] = [sigIn(R, 3, 1e7, 999e6), 'million'];
      else if (k === 1) [n, en] = [sigIn(R, 3, 1e9, 999e9), 'billion'];
      else [n, en] = [sigIn(R, 3, 1e12, 99e12), 'trillion'];
    } else if (lv === 3) [n, en] = R.chance(0.5) ? [R.int(11, 9999) * 1e8, 'billion'] : [R.int(1, 30) * 1e12 + R.int(1, 99) * 1e10, R.pick(['billion', 'trillion'])];
    else {
      const k = R.int(0, 2);
      if (k === 0) [n, en] = [R.int(101, 9999) * 1e5, 'million'];
      else if (k === 1) [n, en] = [R.int(1, 9) * 1e12 + R.int(1, 9999) * 1e8, 'billion'];
      else [n, en] = [R.int(1, 9) * 1e12 + R.int(1, 999) * 1e9, 'trillion'];
    }
    const x = clean(n / Math.pow(10, EN[en]));
    const kr = fmtKR(n, { comma: true });
    const o: Draft = { q: `${kr} ${josa(cur, '은', '는')} 몇 ${en} ${cur}?`, unit: `${en} ${cur}`, vars: { n, en }, why: `${EN_BASE[en]}이므로 ${josa(kr, '은', '는')} ${fmtNum(x)} ${en}.` };
    return exact(o, x);
  },
  e2k(R, lv) {
    const cur = R.pick(['달러', '원']);
    let n: number, en: string;
    if (lv === 1) [n, en] = R.chance(0.5) ? [sigIn(R, 2, 10, 990) * 1e6, 'million'] : [(sigIn(R, 2, 10, 990) / 10) * 1e9, 'billion']; // 45 billion = 450억
    else if (lv === 2) {
      const k = R.int(0, 2);
      if (k === 0) [n, en] = [sigIn(R, 3, 100, 999) * 1e6, 'million'];
      else if (k === 1) [n, en] = [sigIn(R, 3, 100, 9990) * 1e7, 'billion'];
      else [n, en] = [sigIn(R, 3, 100, 999) * 1e10, 'trillion'];
    } else if (lv === 3) [n, en] = R.chance(0.5) ? [R.int(11, 999) * 1e8, 'billion'] : [R.int(101, 999) * 1e10, 'trillion'];
    else [n, en] = R.chance(0.5) ? [R.int(101, 9999) * 1e5, 'million'] : [R.int(1001, 9999) * 1e9, 'trillion'];
    n = Math.round(n);
    const o: Draft = { q: `${fmtEN(n, en)} ${josa(cur, '을', '를')} 조, 억, 만 단위를 넣어 쓰면?`, input: 'kr', form: true, unit: cur, vars: { n, en, x: clean(n / Math.pow(10, EN[en])) }, why: `${EN_BASE[en]}이므로 ${josa(fmtEN(n, en), '은', '는')} ${fmtKR(n, { comma: true })}.` };
    return exact(o, n);
  },
};

// ── 2. 환율 환산 ───────────────────────────────────────────
/**
 * 수준 1, 2 의 (환율, 외화 금액) 조합. 원으로 바꾼 금액도 앞자리 셋까지라 암산으로 끝난다.
 *  - 수준 1: 곱하는 두 수 가운데 하나는 0 이 아닌 숫자가 하나(3,000달러 × 1,350원, 35만 엔 × 900원)
 *  - 수준 2: 외화 금액 앞자리 둘(달러, 유로는 500 단위처럼 끝자리 0 또는 5, 엔은 아무 둘)
 * 금액의 자릿수는 1달러에서 수백억 달러까지 넓게 쓴다(자릿수는 난이도를 바꾸지 않는다).
 */
function fxList(lv: number, c: Cur): { r: number; amt: number }[][] {
  return listOf(`fx|${Math.min(lv, 2)}|${c}`, () =>
    RATES12[c].map((r) => {
      const ms = lv <= 1 ? (few(r, 1) ? D12 : D1) : c === 'jpy' ? D12.filter((m) => m >= 10) : D12.filter((m) => m >= 10 && m % 5 === 0);
      const amts = new Set<number>();
      for (const m of ms) for (const amt of scales(m, PER_UNIT[c], c === 'jpy' ? 1e12 : 1e11)) amts.add(amt);
      // 환율의 기준 금액 그 자체(1달러, 100엔)는 답이 문장에 그대로 있으므로 뺀다
      return [...amts].filter((amt) => amt !== PER_UNIT[c] && Number.isInteger((amt / PER_UNIT[c]) * r) && few((amt / PER_UNIT[c]) * r)).map((amt) => ({ r, amt }));
    }),
  );
}
/** 외화 금액 표기: 만 단위로 떨어지면 "35만 엔", "3억 달러", 아니면 "3,500달러", "500엔" */
const fxTxt = (amt: number, c: Cur) => (amt >= 1e4 && amt % 1e4 === 0 ? fmtKR(amt, { comma: true }) + ' ' : fmtNum(amt)) + CUR[c];
function f2k(R: Rng, lv: number, c: Cur): Draft | null {
  if (lv <= 2) {
    const { r, amt } = pick2(R, fxList(lv, c));
    const rt = RATE_TXT[c](r);
    const w = (amt / PER_UNIT[c]) * r;
    const { unit, div } = tier(w);
    const o: Draft = { q: `${rt}일 때 ${josa(fxTxt(amt, c), '은', '는')} 몇 ${unit}?`, unit, vars: { c, r, amt, out: div }, why: `${fmtNum(amt / PER_UNIT[c])} × ${fmtNum(r)} = ${fmtNum(w)}원.` };
    return exact(o, w / div);
  }
  const r = RATE[c](R, lv);
  const rt = RATE_TXT[c](r);
  const amt = sigIn(R, 2, 10, 990) * 1e4; // 35만 달러
  const w = (amt / PER_UNIT[c]) * r;
  const o: Draft = { q: `${rt}일 때 ${josa(fmtKR(amt, { comma: true }) + ' ' + CUR[c], '은', '는')} 몇 억 원?`, unit: '억 원', vars: { c, r, amt, out: 1e8 }, why: `${fmtNum(amt / PER_UNIT[c])} × ${fmtNum(r)} = ${fmtNum(w)}원 = ${fmtNum(w / 1e8)}억 원.` };
  return rounded(o, w / 1e8, 1);
}
function k2f(R: Rng, lv: number, c: Cur): Draft | null {
  if (lv <= 2) {
    const { r, amt } = pick2(R, fxList(lv, c));
    const rt = RATE_TXT[c](r);
    const w = (amt / PER_UNIT[c]) * r;
    const o: Draft = { q: `${rt}일 때 ${krw(w)}은 몇 ${CUR[c]}?`, unit: CUR[c], input: 'kr', vars: { c, r, w, out: 1 }, why: `${fmtNum(w)} ÷ ${fmtNum(r)}${c === 'jpy' ? ' × 100' : ''} = ${fmtNum(amt)}${CUR[c]}.` };
    return exact(o, amt);
  }
  const r = RATE[c](R, lv);
  const rt = RATE_TXT[c](r);
  // 수준 3: 원화 금액 앞자리 둘(4,500만 원, 45억 원, 450억 원은 만 단위로, 4,500억 원은 억 단위로)
  const w = sigIn(R, 2, 10, 99) * R.pick([1e6, 1e7, 1e8, 1e9]);
  const f = (w / r) * PER_UNIT[c];
  const big = w >= 1e10;
  const u = big ? '억' : '만';
  const o: Draft = { q: `${rt}일 때 ${krw(w)}은 몇 ${u} ${CUR[c]}?`, unit: `${u} ${CUR[c]}`, vars: { c, r, w, out: big ? 1e8 : 1e4 }, why: `${fmtNum(w)} ÷ ${fmtNum(r)}${c === 'jpy' ? ' × 100' : ''} = 약 ${fmtNum(roundTo(f, 0))}${CUR[c]}.` };
  return rounded(o, f / (big ? 1e8 : 1e4), big ? 1 : 0);
}
const fx: Record<string, Gen> = {
  f2k_usd: (R, lv) => f2k(R, lv, 'usd'),
  f2k_jpy: (R, lv) => f2k(R, lv, 'jpy'),
  f2k_eur: (R, lv) => f2k(R, lv, 'eur'),
  k2f_usd: (R, lv) => k2f(R, lv, 'usd'),
  k2f_jpy: (R, lv) => k2f(R, lv, 'jpy'),
  k2f_eur: (R, lv) => k2f(R, lv, 'eur'),
  usdmn2eok(R, lv) {
    const r = RATE.usd(R, lv);
    const m = sigIn(R, 2, 5, 990);
    const raw = (m * 1e6 * r) / 1e8;
    return rounded({ q: `${RATE_TXT.usd(r)}일 때 ${m} million 달러는 몇 억 원?`, unit: '억 원', vars: { r, m }, why: `${fmtKR(m * 1e6, { comma: true })} × ${fmtNum(r)} = 약 ${fmtNum(roundTo(raw, 1))}억 원.` }, raw, 0);
  },
  eok2usdmn(R, lv) {
    const r = RATE.usd(R, lv);
    const w = sigIn(R, 2, 100, 9900);
    const raw = (w * 1e8) / r / 1e6;
    return rounded({ q: `${RATE_TXT.usd(r)}일 때 ${eok(w)}은 몇 million 달러?`, unit: 'million 달러', vars: { r, w }, why: `${fmtNum(w)}억 ÷ ${fmtNum(r)} = 약 ${fmtNum(roundTo(raw * 1e6, 0))}달러.` }, raw, 0);
  },
  // 수준 3, 4. 환율은 10원 간격. 1달러 쪽은 몇 달러(1~9)를 엔으로, 엔 쪽은 몇만 엔(1~9)을 달러로 바꾼다.
  cross_jpy(R) {
    const ru = R.step(1250, 1550, 10);
    const rj = R.pick([900, 1000]);
    const n = R.int(1, 9);
    if (R.chance(0.5)) {
      const raw = (n * ru * 100) / rj;
      return rounded({ q: `${RATE_TXT.usd(ru)}, ${RATE_TXT.jpy(rj)}일 때 ${n}달러는 몇 엔?`, unit: '엔', vars: { ru, rj, n, dir: 'u2j' }, why: `1엔은 ${fmtNum(rj / 100)}원이므로 ${n} × ${fmtNum(ru)} ÷ ${fmtNum(rj / 100)}.` }, raw, 1);
    }
    const raw = (n * 100 * rj) / ru;
    return rounded({ q: `${RATE_TXT.usd(ru)}, ${RATE_TXT.jpy(rj)}일 때 ${n}만 엔은 몇 달러?`, unit: '달러', vars: { ru, rj, n, dir: 'j2u' }, why: `${n}만 엔은 ${fmtNum(n * 100 * rj)}원. 이를 ${ro(fmtNum(ru))} 나눈다.` }, raw, 1);
  },
  cross_eur(R) {
    const re = R.step(1400, 1700, 10);
    const ru = R.step(1250, 1550, 10);
    const raw = re / ru;
    return rounded({ q: `${RATE_TXT.eur(re)}, ${RATE_TXT.usd(ru)}일 때 1유로는 몇 달러?`, unit: '달러', vars: { re, ru }, why: `${fmtNum(re)} ÷ ${fmtNum(ru)}.` }, raw, 2);
  },
  // 수준 4. 환율은 10원 간격, 10~200원 움직인다.
  valchg_krw(R) {
    const r0 = R.step(1200, 1600, 10);
    const r1 = r0 + R.sign() * R.step(10, 200, 10);
    const raw = Math.abs(r0 / r1 - 1) * 100;
    const up = r1 < r0;
    return rounded({ q: `환율이 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 원화 자산을 달러로 환산한 가치는 몇 % ${up ? '늘었나' : '줄었나'}?`, unit: '%', vars: { r0, r1 }, why: `달러 가치는 환율에 반비례한다. ${fmtNum(r0)} ÷ ${fmtNum(r1)} = ${fmtNum(roundTo(r0 / r1, 4))}.` }, raw, 1);
  },
  valchg_usd(R) {
    const r0 = R.step(1200, 1600, 10);
    const r1 = r0 + R.sign() * R.step(10, 200, 10);
    const raw = Math.abs(r1 / r0 - 1) * 100;
    const up = r1 > r0;
    return rounded({ q: `환율이 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 달러 자산을 원화로 환산한 가치는 몇 % ${up ? '늘었나' : '줄었나'}?`, unit: '%', vars: { r0, r1 }, why: `${fmtNum(r1)} ÷ ${fmtNum(r0)} = ${fmtNum(roundTo(r1 / r0, 4))}.` }, raw, 1);
  },
  ret_krw(R) {
    const r0 = R.step(1300, 1500, 100);
    let c = 0;
    while (!c) c = R.int(-8, 8);
    const r1 = (r0 * (100 + c)) / 100;
    let s = 0;
    while (!s) s = R.int(-10, 25);
    const raw = ((100 + s) * (100 + c) - 10000) / 100;
    if (Math.abs(raw) < 0.5) return SKIP;
    return rounded({ q: `미국 주식이 달러 기준으로 ${Math.abs(s)}% ${s > 0 ? '올랐' : '내렸'}고, 같은 기간 환율은 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 원화 기준 수익률은 몇 %?`, unit: '%', neg: true, vars: { r0, r1, s }, why: `${fmtNum((100 + s) / 100)} × ${fmtNum(r1 / r0)} = ${fmtNum(clean(((100 + s) * (100 + c)) / 10000))}.` }, raw, 1);
  },
  ret_usd(R) {
    const r0 = R.step(1300, 1500, 100);
    let c = 0;
    while (!c) c = R.int(-8, 8);
    const r1 = (r0 * (100 + c)) / 100;
    let s = 0;
    while (!s) s = R.int(-10, 25);
    const raw = (((100 + s) / 100) * (r0 / r1) - 1) * 100;
    if (Math.abs(raw) < 0.5) return SKIP;
    return rounded({ q: `국내 주식이 원화 기준으로 ${Math.abs(s)}% ${s > 0 ? '올랐' : '내렸'}고, 같은 기간 환율은 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 달러 기준 수익률은 몇 %?`, unit: '%', neg: true, vars: { r0, r1, s }, why: `${fmtNum((100 + s) / 100)} × ${fmtNum(r0)} ÷ ${fmtNum(r1)} = ${fmtNum(roundTo(((100 + s) / 100) * (r0 / r1), 4))}.` }, raw, 1);
  },
};

// ── 3. 비율과 퍼센트 ───────────────────────────────────────
const METRIC = ['매출', '영업이익', '순이익'];
/** 수준 2 의 나누는 수: 0 이 아닌 숫자 하나(600억, 7,000억). 수준 3 위: 앞자리 둘(2,700억) */
const base = (R: Rng, lv: number, lo: number, hi: number) => (lv <= 2 ? sigIn(R, 1, lo, hi) : sigIn(R, 2, lo, hi));
const ratio: Record<string, Gen> = {
  margin(R, lv) {
    if (lv === 1) {
      // 매출은 0 이 아닌 숫자 하나(3,000억, 7조), 이익률은 친한 수
      const rev = one(R, scales(1, ...CO));
      const p = R.pick([4, 5, 8, 10, 12, 15, 20, 25, 30, 40]);
      const op = (rev * p) / 100;
      return exact({ q: `매출 ${krw(rev)}, 영업이익 ${krw(op)}인 회사의 영업이익률은 몇 %?`, unit: '%', vars: { rev, op }, why: `${fmtKR(op, { comma: true })} ÷ ${fmtKR(rev, { comma: true })} = ${fmtNum(p / 100)}.` }, p);
    }
    const rev = base(R, lv, 200, 9900);
    const op = sigIn(R, 2, Math.ceil(rev * 0.03), Math.floor(rev * 0.4));
    return rounded({ q: `매출 ${eok(rev)}, 영업이익 ${eok(op)}인 회사의 영업이익률은 몇 %?`, unit: '%', vars: { rev, op }, why: `${fmtNum(op)} ÷ ${fmtNum(rev)} = ${fmtNum(roundTo(op / rev, 4))}.` }, (op / rev) * 100, 1);
  },
  per(R, lv) {
    if (lv === 1) {
      const eps = one(R, [100, 1000, 10000]); // 300원, 4,000원, 2만 원
      const m = R.int(3, 30);
      return exact({ q: `주가 ${won(eps * m)}, EPS(주당순이익) ${won(eps)}인 회사의 PER(주가수익비율)은 몇 배?`, unit: '배', vars: { price: eps * m, eps }, why: `${fmtNum(eps * m)} ÷ ${fmtNum(eps)} = ${m}.` }, m);
    }
    for (;;) {
      const price = sigIn(R, 2, 10000, 99000);
      const eps = base(R, lv, 300, 9900);
      const raw = price / eps;
      if (raw < 3 || raw > 40) continue;
      return rounded({ q: `주가 ${won(price)}, EPS(주당순이익) ${won(eps)}인 회사의 PER(주가수익비율)은 몇 배?`, unit: '배', vars: { price, eps }, why: `${fmtNum(price)} ÷ ${fmtNum(eps)}.` }, raw, 1);
    }
  },
  pbr(R, lv) {
    for (;;) {
      const mcap = sigIn(R, 2, 500, 99000);
      const eq = base(R, lv, 500, 90000);
      const raw = mcap / eq;
      if (raw < 0.2 || raw > 5) continue;
      return rounded({ q: `시가총액 ${eok(mcap)}, 자기자본 ${eok(eq)}인 회사의 PBR(주가순자산비율)은 몇 배?`, unit: '배', vars: { mcap, eq }, why: `${fmtNum(mcap)} ÷ ${fmtNum(eq)}.` }, raw, 2);
    }
  },
  roe(R, lv) {
    if (lv === 1) {
      const eq = one(R, scales(1, ...CO));
      const p = R.pick([4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
      const ni = (eq * p) / 100;
      return exact({ q: `순이익 ${krw(ni)}, 자기자본 ${krw(eq)}인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { ni, eq }, why: `${fmtKR(ni, { comma: true })} ÷ ${fmtKR(eq, { comma: true })} = ${fmtNum(p / 100)}.` }, p);
    }
    const eq = base(R, lv, 1000, 90000);
    const ni = sigIn(R, 2, Math.ceil(eq * 0.02), Math.floor(eq * 0.3));
    return rounded({ q: `순이익 ${eok(ni)}, 자기자본 ${eok(eq)}인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { ni, eq }, why: `${fmtNum(ni)} ÷ ${fmtNum(eq)} = ${fmtNum(roundTo(ni / eq, 4))}.` }, (ni / eq) * 100, 1);
  },
  payout(R, lv) {
    if (lv === 1) {
      const ni = one(R, scales(1, ...CO));
      const p = R.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
      const div = (ni * p) / 100;
      return exact({ q: `순이익 ${krw(ni)} 가운데 ${krw(div)}을 배당금으로 줬다. 배당성향은 몇 %?`, unit: '%', vars: { ni, div }, why: `${fmtKR(div, { comma: true })} ÷ ${fmtKR(ni, { comma: true })} = ${fmtNum(p / 100)}.` }, p);
    }
    const ni = base(R, lv, 100, 9900);
    const div = sigIn(R, 2, Math.ceil(ni * 0.1), Math.floor(ni * 0.7));
    return rounded({ q: `순이익 ${eok(ni)} 가운데 ${eok(div)}을 배당금으로 줬다. 배당성향은 몇 %?`, unit: '%', vars: { ni, div }, why: `${fmtNum(div)} ÷ ${fmtNum(ni)} = ${fmtNum(roundTo(div / ni, 4))}.` }, (div / ni) * 100, 1);
  },
  pchg(R, lv) {
    if (lv === 1) {
      const p0 = one(R, [100, 1000, 10000, 100000]); // 700원 ~ 90만 원
      const g = R.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, -5, -10, -15, -20, -25, -30, -40, -50, -60]);
      const p1 = (p0 * (100 + g)) / 100;
      if (!few(p1)) return SKIP;
      return exact({ q: `주가가 ${won(p0)}에서 ${won(p1)}${g > 0 ? '으로 올랐다. 몇 % 올랐나' : '으로 내렸다. 몇 % 내렸나'}?`, unit: '%', vars: { p0, p1 }, why: `${fmtNum(p1)} ÷ ${fmtNum(p0)} = ${fmtNum((100 + g) / 100)}.` }, Math.abs(g));
    }
    for (;;) {
      const p0 = lv <= 2 ? one(R, [1000, 10000, 100000]) : base(R, lv, 10000, 99000);
      const p1 = sigIn(R, 2, Math.ceil(p0 * 0.6), Math.floor(p0 * 1.6));
      if (p1 === p0) continue;
      const raw = Math.abs(p1 / p0 - 1) * 100;
      return rounded({ q: `주가가 ${won(p0)}에서 ${won(p1)}${p1 > p0 ? '으로 올랐다. 몇 % 올랐나' : '으로 내렸다. 몇 % 내렸나'}?`, unit: '%', vars: { p0, p1 }, why: `${fmtNum(p1)} ÷ ${fmtNum(p0)} = ${fmtNum(roundTo(p1 / p0, 4))}.` }, raw, 1);
    }
  },
  pp(R) {
    // 기준금리는 0.25%p 간격, 시장 금리는 0.05%p 간격
    const name = R.pick(['기준금리', '국고채 금리', '예금 금리', '대출 금리']);
    const st = name === '기준금리' ? 25 : 5;
    const r0 = R.step(st, 800, st);
    let r1 = 0;
    while (r1 <= 0 || r1 >= 1000 || r1 === r0) r1 = r0 + R.sign() * R.step(st, 300, st);
    const up = r1 > r0;
    return exact({ q: `${name}가 ${pct(r0 / 100)}에서 ${pct(r1 / 100)}로 ${up ? '올랐다' : '내렸다'}. 몇 %p(퍼센트포인트) ${up ? '올랐나' : '내렸나'}?`, unit: '%p', vars: { r0: r0 / 100, r1: r1 / 100 }, why: `두 비율의 차이는 %p로 센다. ${fmtNum(r1 / 100)} 빼기 ${fmtNum(r0 / 100)}.` }, Math.abs(r1 - r0) / 100);
  },
  pp_vs_pct(R, lv) {
    const name = R.pick(['영업이익률', '시장점유율', '배당성향']);
    let r0: number, r1: number;
    for (;;) {
      r0 = lv >= 4 ? sigIn(R, 2, 50, 400) / 10 : R.int(5, 40);
      r1 = clean(r0 + R.sign() * (lv >= 4 ? R.int(5, 50) / 10 : R.int(1, 10)));
      if (r1 > 0 && r1 !== r0) break;
    }
    const up = r1 > r0;
    const verb = up ? '올랐' : '떨어졌';
    if (R.chance(0.5)) return exact({ q: `${name}이 ${pct(r0)}에서 ${pct(r1)}로 ${verb}다. 몇 %p(퍼센트포인트) ${verb}나?`, unit: '%p', vars: { r0, r1, ask: 'pp' }, why: `두 비율의 차이: ${fmtNum(Math.abs(r1 - r0))}%p.` }, clean(Math.abs(r1 - r0)));
    return rounded({ q: `${name}이 ${pct(r0)}에서 ${pct(r1)}로 ${verb}다. 처음 값에 견줘 몇 % ${verb}나?`, unit: '%', vars: { r0, r1, ask: 'pct' }, why: `차이 ${josa(fmtNum(clean(Math.abs(r1 - r0))), '을', '를')} 처음 값 ${ro(fmtNum(r0))} 나눈다.` }, (Math.abs(r1 - r0) / r0) * 100, 1);
  },
  rev_from_margin(R) {
    const rev = R.int(5, 99) * R.pick([10, 100, 1000]);
    const p = R.pick([4, 5, 8, 10, 12, 15, 20, 25]);
    const op = (rev * p) / 100;
    return exact({ q: `영업이익률이 ${p}%이고 영업이익이 ${eok(op)}이면 매출은 몇 억 원?`, unit: '억 원', vars: { p, op }, why: `${fmtNum(op)} ÷ ${fmtNum(p / 100)} = ${fmtNum(rev)}.` }, rev);
  },
  price_from_eps(R) {
    const sh = R.pick([1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000]); // 만 주
    const eps = R.int(5, 80) * 100;
    const ni = (eps * sh) / 1e4; // 억 원
    const m = R.pick([5, 8, 10, 12, 15, 20]);
    return exact({ q: `순이익 ${eok(ni)}, 발행주식 ${shares(sh * 1e4)}인 회사의 PER(주가수익비율)이 ${m}배면 주가는 몇 원?`, unit: '원', input: 'kr', vars: { ni, sh, m }, why: `EPS(주당순이익)는 ${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4, { comma: true })} = ${fmtNum(eps)}원. 여기에 ${m}배.` }, eps * m);
  },
  mcap_from_pbr(R) {
    let eq: number, b10: number;
    do {
      eq = R.int(5, 99) * 100;
      b10 = R.int(3, 30);
    } while ((eq * b10) / 10 >= 1e4);
    return exact({ q: `자기자본 ${eok(eq)}인 회사의 PBR(주가순자산비율)이 ${fmtNum(b10 / 10)}배면 시가총액은 몇 억 원?`, unit: '억 원', input: 'kr', vars: { eq, pbr: b10 / 10 }, why: `${fmtNum(eq)} × ${fmtNum(b10 / 10)}.` }, (eq * b10) / 10);
  },
  ev_ebitda(R) {
    for (;;) {
      const mcap = R.int(5, 99) * 100;
      const nd = R.int(1, 9) * 100;
      const e = sigIn(R, 2, 100, 9900);
      const raw = (mcap + nd) / e;
      if (raw < 2 || raw > 30) continue;
      return rounded({ q: `시가총액 ${eok(mcap)}, 순차입금 ${eok(nd)}, EBITDA(상각 전 영업이익) ${eok(e)}인 회사의 EV(기업가치)/EBITDA는 몇 배?`, unit: '배', vars: { mcap, nd, e }, why: `EV는 시가총액에 순차입금을 더한 ${eok(mcap + nd)}. 이를 ${ro(fmtNum(e))} 나눈다.` }, raw, 1);
    }
  },
  dupont(R) {
    const m = R.int(2, 20);
    const t10 = R.pick([5, 6, 8, 10, 12, 15, 20]);
    const l10 = R.pick([12, 15, 16, 20, 25, 30]);
    const raw = (m * t10 * l10) / 100;
    return rounded({ q: `순이익률 ${m}%, 총자산회전율 ${fmtNum(t10 / 10)}회, 총자산이 자기자본의 ${fmtNum(l10 / 10)}배인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { m, t: t10 / 10, l: l10 / 10 }, why: `${m}% × ${fmtNum(t10 / 10)} × ${fmtNum(l10 / 10)}.` }, raw, 1);
  },
};

// ── 4. 성장과 복리 ─────────────────────────────────────────
/** 앞자리 하나 또는 둘인 금액(100만 원 이상 1조 원 미만): 72의 법칙, 복리 어림에 쓴다 */
const AMT12 = () => listOf('amt12', () => [...new Set(D12.flatMap((m) => scales(m, 1e6, 1e12)))]);
/** 어림 답의 단위: 조, 억, 만 원 가운데 답이 1 이상인 가장 큰 것 */
const tierBig = (n: number) => (n >= 1e12 ? { unit: '조 원', div: 1e12 } : n >= 1e8 ? { unit: '억 원', div: 1e8 } : { unit: '만 원', div: 1e4 });
/**
 * 두 해 성장률 조합. 해마다 같은 비율로 늘거나 줄어(1.1 의 제곱 1.21, 0.8 의 제곱 0.64 처럼 외워 둔 수 하나를 곱한다).
 * 수준 1 은 10, 20, 50%, 수준 2 는 30, 40% 도. 기준 금액은 앞자리 하나(수준 2 는 둘까지), 답은 앞자리 셋까지.
 * 첫해와 이듬해 비율이 다른 문제(1.2 × 0.9)는 곱셈이 하나 늘어 난도가 오르므로 내지 않는다(2026-11-21 검토).
 */
const C2R: Record<number, number[]> = { 1: [10, 20, 50, -10, -20, -50], 2: [10, 20, 30, 40, 50, -10, -20, -30, -40, -50] };
type C2 = { b: number; r: number; end: number };
function comp2List(lv: number): C2[][] {
  const L = Math.min(2, lv);
  return listOf(`comp2|${L}`, () =>
    C2R[L].map((r) => {
      const bs = [...new Set((L === 1 ? D1 : D12).flatMap((m) => scales(m, ...CO)))];
      return bs.map((b) => ({ b, r, end: (b * (100 + r) * (100 + r)) / 1e4 })).filter((x) => Number.isInteger(x.end) && few(x.end));
    }),
  );
}
/** 2년 복리(CAGR) 조합: 해마다 10, 20, 30, 50, 100% 로 늘어 답이 앞자리 셋까지인 기준 금액 */
function cagr2List(): { b: number; r: number; end: number }[][] {
  return listOf('cagr2', () =>
    [10, 20, 30, 50, 100].map((r) => [...new Set(D12.flatMap((m) => scales(m, ...CO)))].map((b) => ({ b, r, end: (b * (100 + r) * (100 + r)) / 1e4 })).filter((x) => Number.isInteger(x.end) && few(x.end))),
  );
}
/** 3년 복리 조합: 10, 20% 는 앞자리 하나인 금액, 50% 는 8 의 배수(× 27/8), 100% 는 앞자리 둘까지. 답은 앞자리 넷까지(1,331만 원). */
function comp3List(): { b: number; r: number; end: number }[][] {
  return listOf('comp3', () =>
    [10, 20, 50, 100].map((r) => {
      const ms = r <= 20 ? D1 : r === 50 ? D12.filter((m) => m < 10 || m % 8 === 0) : D12;
      const bs = [...new Set(ms.flatMap((m) => scales(m, 1e6, 1e12)))];
      return bs.map((b) => ({ b, r, end: (b * (100 + r) * (100 + r) * (100 + r)) / 1e6 })).filter((x) => Number.isInteger(x.end) && few(x.end, 4));
    }),
  );
}
const growth: Record<string, Gen> = {
  yoy(R) {
    const k = R.pick(METRIC);
    const prev = one(R, scales(1, ...CO));
    const g = R.pick([5, 10, 20, 25, 30, 40, 50, 100, -10, -20, -25, -50]);
    const cur = (prev * (100 + g)) / 100;
    if (!few(cur)) return SKIP;
    return exact({ q: `작년 ${k} ${krw(prev)}, 올해 ${k} ${krw(cur)}이면 전년보다 몇 % ${g > 0 ? '늘었나' : '줄었나'}?`, unit: '%', vars: { prev, cur }, why: `${fmtKR(cur, { comma: true })} ÷ ${fmtKR(prev, { comma: true })} = ${fmtNum((100 + g) / 100)}.` }, Math.abs(g));
  },
  yoy_r(R, lv) {
    const k = R.pick(METRIC);
    for (;;) {
      const prev = base(R, lv, 100, 9900);
      const cur = sigIn(R, 2, Math.ceil(prev * 0.5), Math.floor(prev * 1.8));
      if (Math.abs(cur / prev - 1) < 0.01) continue; // 1% 미만은 반올림하면 0.0 이 될 수 있다
      return rounded({ q: `작년 ${k} ${eok(prev)}, 올해 ${k} ${eok(cur)}이면 전년보다 몇 % ${cur > prev ? '늘었나' : '줄었나'}?`, unit: '%', vars: { prev, cur }, why: `${fmtNum(cur)} ÷ ${fmtNum(prev)} = ${fmtNum(roundTo(cur / prev, 4))}.` }, Math.abs(cur / prev - 1) * 100, 1);
    }
  },
  // 72의 법칙: 두 배(72 ÷ r), 네 배(144 ÷ r). 금액은 앞자리 하나 또는 둘이라 몇 배인지는 한눈에 보인다.
  r72_years(R) {
    const k = R.pick([2, 4]);
    const r = R.pick(k === 2 ? [2, 3, 4, 6, 8, 9, 12, 18, 24] : [2, 3, 4, 6, 8, 9, 12, 16, 18, 24]);
    const a = R.pick(AMT12());
    return exact({ q: `72의 법칙(72 ÷ 연 수익률)으로 어림하면, 연 ${r}%로 불어나는 ${krw(a)}이 ${krw(a * k)}이 되기까지 몇 년?`, unit: '년', vars: { r, k, a }, why: `${k === 2 ? '두 배' : '네 배는 두 배의 두 배'}. 72 ÷ ${r} = ${fmtNum(72 / r)}${k === 4 ? `, 그 두 배는 ${fmtNum(144 / r)}` : ''}.` }, (72 * Math.log2(k)) / r);
  },
  r72_rate(R) {
    const k = R.pick([2, 4]);
    const n = R.pick(k === 2 ? [2, 3, 4, 6, 8, 9, 12, 18, 24, 36] : [4, 6, 8, 9, 12, 16, 18, 24, 36, 48]);
    const a = R.pick(AMT12());
    return exact({ q: `72의 법칙(72 ÷ 연 수익률)으로 어림하면, ${krw(a)}이 ${n}년 만에 ${krw(a * k)}이 된 투자의 연 수익률은 몇 %?`, unit: '%', vars: { n, k, a }, why: `${k === 2 ? `두 배에 ${n}년` : `네 배에 ${n}년이면 두 배에 ${fmtNum(n / 2)}년`}. 72 ÷ ${fmtNum(n / (k / 2))} = ${fmtNum((72 * Math.log2(k)) / n)}.` }, (72 * Math.log2(k)) / n);
  },
  // 2년 성장: 해마다 같은 비율. 1.1 의 제곱(1.21)처럼 외워 둔 수 하나를 곱한다. 수준 1, 2 는 답도 앞자리 셋까지.
  comp2(R, lv) {
    const k = R.pick(METRIC);
    const { b, r, end } = pick2(R, comp2List(lv));
    const { unit, div } = tier(end);
    const f = clean(Math.pow(1 + r / 100, 2));
    return exact({ q: `${k} ${krw(b)}이 해마다 ${Math.abs(r)}%씩 2년 ${r > 0 ? '늘면' : '줄면'} 몇 ${unit}?`, unit, vars: { base: b, r, div }, why: `${fmtNum(1 + r / 100)}의 제곱은 ${fmtNum(f)}. ${fmtKR(b, { comma: true })} × ${fmtNum(f)} = ${fmtKR(end, { comma: true })}.` }, end / div);
  },
  cagr2(R) {
    const { b, r, end } = pick2(R, cagr2List());
    return exact({ q: `매출이 2년 만에 ${krw(b)}에서 ${krw(end)}이 됐다. CAGR(연평균 성장률)은 몇 %?`, unit: '%', vars: { base: b, end, n: 2 }, why: `${fmtKR(end, { comma: true })} ÷ ${fmtKR(b, { comma: true })} = ${fmtNum(clean(end / b))}, 이는 ${fmtNum(1 + r / 100)}의 제곱.` }, r);
  },
  comp3(R) {
    const { b, r, end } = pick2(R, comp3List());
    const { unit, div } = tier(end);
    return exact({ q: `${krw(b)}을 연 ${r}% 복리로 3년 굴리면 몇 ${unit}?`, unit, vars: { base: b, r, n: 3, div }, why: `${fmtNum(1 + r / 100)}의 세제곱은 ${fmtNum(clean(Math.pow(1 + r / 100, 3)))}.` }, end / div);
  },
  cagr3(R) {
    const { b, r, end } = pick2(R, comp3List());
    return exact({ q: `${krw(b)}이 3년 만에 ${krw(end)}이 됐다. 연 복리 수익률은 몇 %?`, unit: '%', vars: { base: b, end, n: 3 }, why: `${fmtNum(end)} ÷ ${fmtNum(b)} = ${fmtNum(clean(end / b))}, 이는 ${fmtNum(1 + r / 100)}의 세제곱.` }, r);
  },
  // 수준 4. 몇 배가 됐는지(1.2 ~ 10배) 또는 처음과 나중 금액(앞자리 둘)을 주고 연평균 성장률을 어림한다.
  cagr_est(R) {
    for (;;) {
      const n = R.int(2, 20);
      if (R.chance(0.5)) {
        const m = R.pick([1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 8, 10]);
        const raw = (Math.pow(m, 1 / n) - 1) * 100;
        if (raw < 3 || raw > 40) continue;
        return approx({ q: `매출이 ${n}년 만에 ${fmtNum(m)}배가 됐다. CAGR(연평균 성장률)은 약 몇 %?`, unit: '%', vars: { m, n }, why: `${n}번 곱해 ${josa(fmtNum(m), '이', '가')} 되는 수를 찾는다. 약 ${fmtNum(roundTo(1 + raw / 100, 3))}.` }, raw, { abs: 1 });
      }
      const a = sigIn(R, 2, 10, 99) * R.pick([1e7, 1e8, 1e9, 1e10, 1e11]);
      const b = roundSig(a * (1.1 + R.next() * 8.9), 2);
      const raw = (Math.pow(b / a, 1 / n) - 1) * 100;
      if (raw < 3 || raw > 40) continue;
      return approx({ q: `매출이 ${n}년 만에 ${krw(a)}에서 ${krw(b)}이 됐다. CAGR(연평균 성장률)은 약 몇 %?`, unit: '%', vars: { m: b / a, n, a, b }, why: `${fmtKR(b, { comma: true })} ÷ ${fmtKR(a, { comma: true })} = 약 ${fmtNum(roundTo(b / a, 2))}배. ${n}번 곱해 그만큼 되는 수는 약 ${fmtNum(roundTo(1 + raw / 100, 3))}.` }, raw, { abs: 1 });
    }
  },
  // 수준 3, 4. 연 2~20%, 2~30년(16배 아래). 절반은 금액을 주고 나중 금액을 어림한다.
  mult_est(R, lv) {
    for (;;) {
      const r = R.int(2, 20);
      const n = R.int(2, 30);
      const raw = Math.pow(1 + r / 100, n);
      if (raw > 16 || raw < 1.2) continue;
      const tol = { rel: lv >= 4 ? 0.04 : 0.05 };
      const why = `72 ÷ ${r} = ${fmtNum(roundTo(72 / r, 1))}년마다 두 배. 정확히는 ${fmtNum(roundTo(raw, 3))}배.`;
      if (R.chance(0.5)) return approx({ q: `연 ${r}% 복리로 ${n}년 굴리면 처음 금액의 약 몇 배?`, unit: '배', vars: { r, n }, why }, raw, tol);
      const a = R.pick(AMT12());
      const { unit, div } = tierBig(a * raw);
      return approx({ q: `${krw(a)}을 연 ${r}% 복리로 ${n}년 굴리면 약 몇 ${unit}?`, unit, vars: { r, n, a, div }, why }, (a * raw) / div, tol);
    }
  },
};

// ── 5. 할인과 현재가치 ─────────────────────────────────────
/** 현재가치 금액의 자릿수: 10만 원 이상 100조 원 미만 */
const PVR = [1e5, 1e14] as const;
/** 1년 할인 조합. 받는 돈 = 현재가치 × (1 + r) 이 앞자리 셋까지. 수준 1 은 현재가치가 앞자리 하나, 수준 2 는 둘까지. */
function pv1List(lv: number): { v: number; r: number; cf: number }[][] {
  const L = Math.min(2, lv);
  return listOf(`pv1|${L}`, () =>
    [4, 5, 8, 10, 15, 20, 25, 50].map((r) => [...new Set((L === 1 ? D1 : D12).flatMap((m) => scales(m, ...PVR)))].map((v) => ({ v, r, cf: (v * (100 + r)) / 100 })).filter((x) => Number.isInteger(x.cf) && few(x.cf))),
  );
}
/** 2년 할인 조합: 1.21, 1.44, 1.5625, 1.69, 1.96, 2.25 를 곱해 앞자리 셋까지 떨어지는 금액 */
function pv2List(): { v: number; r: number; cf: number }[][] {
  return listOf('pv2', () =>
    [10, 20, 25, 30, 40, 50].map((r) => [...new Set(D12.flatMap((m) => scales(m, ...PVR)))].map((v) => ({ v, r, cf: (v * (100 + r) * (100 + r)) / 1e4 })).filter((x) => Number.isInteger(x.cf) && few(x.cf))),
  );
}
/** 영구 현금흐름 조합: 할인율 2, 4, 5, 8, 10, 20, 25%(곱하면 50, 25, 20, 12.5, 10, 5, 4배). 수준 1 은 받는 돈이 앞자리 하나. */
function perpList(lv: number): { cf: number; r: number; v: number }[][] {
  const L = Math.min(2, lv);
  return listOf(`perp|${L}`, () =>
    [2, 4, 5, 8, 10, 20, 25].map((r) => [...new Set((L === 1 ? D1 : D12).flatMap((m) => scales(m, ...PVR)))].map((cf) => ({ cf, r, v: (cf * 100) / r })).filter((x) => Number.isInteger(x.v) && few(x.v) && x.v < 1e15)),
  );
}
/** 배당수익률 조합: 주가 앞자리 둘(1만 ~ 9만 9,000원) × 배당수익률 2 ~ 6%, 배당금이 원 단위로 떨어지는 것 */
const gordonYield = () =>
  listOf('gyield', () => {
    const out: { price: number; y: number; d1: number }[] = [];
    for (let m = 10; m <= 99; m++) for (const y of [2, 2.5, 3, 4, 5, 6]) {
      const price = m * 1000;
      const d1 = (price * y) / 100;
      if (Number.isInteger(d1) && few(d1)) out.push({ price, y, d1 });
    }
    return out;
  });
/** 2년 뒤부터 영구히: 현재가치(억 원) 앞자리 둘 × 할인율 5, 10, 20, 25%. 해마다 받는 돈(현재가치 × r × (1 + r))이 앞자리 셋까지 */
function deferredList(): { r: number; v: number; cf: number }[][] {
  return listOf('deferred', () =>
    [5, 10, 20, 25].map((r) => [...new Set(D12.filter((m) => m >= 10).flatMap((m) => scales(m, 10, 1e5)))].map((v) => ({ r, v, cf: (v * r * (100 + r)) / 1e4 })).filter((x) => few(x.cf) && Number.isInteger(clean(x.cf * 1e4)))),
  );
}
const pv: Record<string, Gen> = {
  pv1(R, lv) {
    const { v, r, cf } = pick2(R, pv1List(lv));
    const { unit, div } = tier(v);
    return exact({ q: `할인율이 연 ${r}%일 때, 1년 뒤에 받는 ${krw(cf)}의 현재가치는 몇 ${unit}?`, unit, vars: { r, cf, n: 1, div }, why: `${fmtKR(cf, { comma: true })} ÷ ${fmtNum(1 + r / 100)} = ${fmtKR(v, { comma: true })}.` }, v / div);
  },
  // 2년 할인. 열에 일곱은 현재가치를, 나머지는 할인율을 묻는다(같은 계수를 거꾸로 쓴다).
  pv2(R) {
    const { v, r, cf } = pick2(R, pv2List());
    const f = clean(Math.pow(1 + r / 100, 2));
    if (R.chance(0.3)) return exact({ q: `2년 뒤에 받는 ${krw(cf)}의 현재가치가 ${krw(v)}이면 할인율은 연 몇 %?`, unit: '%', vars: { cf, v, n: 2, ask: 'r' }, why: `${fmtKR(cf, { comma: true })} ÷ ${fmtKR(v, { comma: true })} = ${fmtNum(f)}, 이는 ${fmtNum(1 + r / 100)}의 제곱.` }, r);
    const { unit, div } = tier(v);
    return exact({ q: `할인율이 연 ${r}%일 때, 2년 뒤에 받는 ${krw(cf)}의 현재가치는 몇 ${unit}?`, unit, vars: { r, cf, n: 2, div }, why: `${fmtKR(cf, { comma: true })} ÷ ${fmtNum(f)} = ${fmtKR(v, { comma: true })}.` }, v / div);
  },
  perp(R, lv) {
    const { cf, r, v } = pick2(R, perpList(lv));
    const { unit, div } = tier(v);
    return exact({ q: `할인율이 연 ${r}%일 때, 1년 뒤부터 해마다 ${krw(cf)}을 영원히 받는 권리의 현재가치는 몇 ${unit}?`, unit, vars: { r, cf, div }, why: `영구히 같은 돈: ${fmtKR(cf, { comma: true })} ÷ ${fmtNum(r / 100)} = ${fmtKR(v, { comma: true })}.` }, v / div);
  },
  perp_g(R, lv) {
    let r: number, g: number, cf: number, v: number;
    if (lv <= 2) {
      do {
        g = R.int(1, 5);
        r = g + R.pick([4, 5, 10]);
      } while (r > 15);
      do {
        cf = R.int(1, 99) * 10;
        v = (cf * 100) / (r - g);
      } while (v >= 1e4);
    } else {
      r = R.int(6, 12);
      g = R.int(1, r - 2);
      v = R.int(5, 99) * R.pick([10, 100]); // 50억 ~ 9,900억
      cf = (v * (r - g)) / 100;
    }
    return exact({ q: `1년 뒤에 ${eok(cf)}을 받고, 그 뒤 해마다 ${g}%씩 늘려 영원히 받는다. 할인율이 연 ${r}%일 때 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, g, cf }, why: `${fmtNum(cf)} ÷ (${r}% 빼기 ${g}%) = ${fmtNum(cf)} ÷ ${fmtNum((r - g) / 100)}.` }, v);
  },
  gordon(R, lv) {
    let r: number, g: number, d1: number, price: number;
    if (lv <= 2) {
      let s: number;
      do {
        g = R.int(1, 5);
        s = R.pick([2, 4, 5, 10]);
        r = g + s;
      } while (r > 15);
      d1 = sigIn(R, 2, 100, 9900); // 앞자리 둘(350원, 4,500원)
      price = (d1 * 100) / s;
      if (!few(price)) return SKIP; // 답도 앞자리 셋까지(4,900원 ÷ 0.04 = 122,500원 같은 네 자리는 다시 뽑는다)
    } else {
      r = R.int(6, 12);
      g = R.int(1, r - 2);
      price = R.int(10, 99) * R.pick([1000, 10000]); // 1만 ~ 99만 원
      d1 = (price * (r - g)) / 100;
    }
    return exact({ q: `내년 주당배당금이 ${won(d1)}이고 그 뒤 해마다 ${g}%씩 영원히 늘어난다. 요구수익률이 연 ${r}%일 때 적정 주가는 몇 원?`, unit: '원', input: 'kr', vars: { d1, g, r }, why: `${fmtNum(d1)} ÷ (${r}% 빼기 ${g}%) = ${fmtNum(d1)} ÷ ${fmtNum((r - g) / 100)}.` }, price);
  },
  gordon_r(R) {
    const { price, y, d1 } = R.pick(gordonYield());
    const g = R.int(1, 8);
    return exact({ q: `주가 ${won(price)}, 내년 주당배당금 ${won(d1)}이고 배당이 해마다 ${g}%씩 영원히 늘어난다고 보면, 이 주가에 담긴 요구수익률은 몇 %?`, unit: '%', vars: { price, d1, g }, why: `배당수익률 ${fmtNum(d1)} ÷ ${fmtNum(price)} = ${fmtNum(y)}%에 성장률 ${g}%를 더한다.` }, clean(y + g));
  },
  gordon_g(R) {
    const { price, y, d1 } = R.pick(gordonYield());
    const g = R.int(1, 8);
    const r = clean(y + g);
    return exact({ q: `주가 ${won(price)}, 내년 주당배당금 ${won(d1)}, 요구수익률 연 ${fmtNum(r)}%다. 배당이 해마다 같은 비율로 영원히 늘어난다고 보면, 이 주가에 담긴 성장률은 몇 %?`, unit: '%', vars: { price, d1, r }, why: `요구수익률 ${fmtNum(r)}%에서 배당수익률 ${fmtNum(y)}%를 뺀다.` }, g);
  },
  deferred_perp(R) {
    const { r, v, cf } = pick2(R, deferredList());
    return exact({ q: `할인율이 연 ${r}%일 때, 2년 뒤부터 해마다 ${eok(cf)}을 영원히 받는 권리의 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, cf }, why: `1년 뒤 시점의 가치는 ${fmtNum(cf)} ÷ ${fmtNum(r / 100)} = ${fmtNum(clean(cf / (r / 100)))}. 이를 1년 할인한다.` }, v);
  },
  gordon_d0(R) {
    for (;;) {
      const d0 = R.int(5, 50) * 100;
      const g = R.pick([2, 4, 5, 10]);
      const d1 = (d0 * (100 + g)) / 100;
      const s = R.int(2, 8);
      const r = g + s;
      if (r > 15) continue;
      const price = (d1 * 100) / s;
      if (price !== Math.round(price) || price % 10 !== 0) continue;
      return exact({ q: `올해 주당배당금 ${won(d0)}을 막 지급했고, 배당은 해마다 ${g}%씩 영원히 늘어난다. 요구수익률이 연 ${r}%일 때 적정 주가는 몇 원?`, unit: '원', input: 'kr', vars: { d0, g, r }, why: `내년 배당은 ${fmtNum(d0)} × ${fmtNum(1 + g / 100)} = ${fmtNum(d1)}원. 이를 ${ro(fmtNum(s / 100))} 나눈다.` }, price);
    }
  },
  pv3_est(R) {
    const r = R.pick([4, 5, 6, 8, 10, 12]);
    const n = R.int(3, 5);
    const cf = R.int(1, 99) * 100;
    const raw = cf / Math.pow(1 + r / 100, n);
    return approx({ q: `할인율이 연 ${r}%일 때, ${n}년 뒤에 받는 ${eok(cf)}의 현재가치는 약 몇 억 원?`, unit: '억 원', vars: { r, n, cf }, why: `${fmtNum(1 + r / 100)}의 ${n}제곱은 약 ${fmtNum(roundTo(Math.pow(1 + r / 100, n), 3))}.` }, raw, { rel: 0.03 });
  },
};

// ── 6. 단위 환산 ───────────────────────────────────────────
const BP = 'bp(베이시스포인트, 1bp는 0.01퍼센트포인트)';
const unit: Record<string, Gen> = {
  // 소수점 옮기기라 아무 수나 쓴다(1 ~ 999bp).
  pp2bp(R) {
    const bp = R.int(1, 999);
    return exact({ q: `금리 차이 ${fmtNum(bp / 100)}%p(퍼센트포인트)는 몇 ${BP}?`, unit: 'bp', vars: { pp: bp / 100 }, why: `1%p는 100bp.` }, bp);
  },
  bp2pp(R) {
    const bp = R.int(1, 999);
    return exact({ q: `금리 차이 ${bp}${BP}는 몇 %p(퍼센트포인트)?`, unit: '%p', vars: { bp }, why: `100bp가 1%p.` }, bp / 100);
  },
  bp_add(R, lv) {
    // 수준 1: 금리는 0.25%p 간격(0.25 ~ 10%), 움직임은 5bp 간격(5 ~ 200bp). 수준 2 위: 둘 다 5 간격
    const r0 = lv === 1 ? R.step(25, 1000, 25) : R.step(100, 600, 5);
    let r1 = 0;
    // 수준 1 은 답이 10% 아래(앞자리 셋까지, 9.75 + 0.9 = 10.65 같은 네 자리는 내지 않는다)
    while (r1 <= 0 || (lv === 1 && r1 >= 1000)) r1 = r0 + R.sign() * (lv === 1 ? R.step(5, 200, 5) : R.step(5, 150, 5));
    const up = r1 > r0;
    return exact({ q: `연 ${pct(r0 / 100)}인 금리가 ${Math.abs(r1 - r0)}${BP} ${up ? '오르면' : '내리면'} 몇 %?`, unit: '%', vars: { r0: r0 / 100, d: r1 - r0 }, why: `${Math.abs(r1 - r0)}bp는 ${fmtNum(Math.abs(r1 - r0) / 100)}%p.` }, r1 / 100);
  },
  fs_mn(R, lv) {
    if (lv <= 2) {
      // 앞자리 셋까지, 자릿수는 넓게(123 ~ 9,990만): 답은 1.23억 ~ 99만 9,000억
      const v = R.int(100, 999) * Math.pow(10, R.int(0, 5));
      return exact({ q: `단위가 백만 원인 재무제표에서 매출 칸의 숫자가 ${fmtNum(v)}이다. 매출은 몇 억 원?`, unit: '억 원', vars: { v, scale: 1e6, out: 1e8 }, why: `1억은 백만의 100배. ${fmtNum(v)} ÷ 100.` }, v / 100);
    }
    const v = sigIn(R, 3, 1e6, 3e8); // 1조 ~ 300조
    return rounded({ q: `단위가 백만 원인 재무제표에서 매출 칸의 숫자가 ${fmtNum(v)}이다. 매출은 몇 조 원?`, unit: '조 원', vars: { v, scale: 1e6, out: 1e12 }, why: `1조는 백만의 100만 배. ${fmtNum(v)} ÷ 1,000,000.` }, v / 1e6, 1);
  },
  fs_th(R) {
    const v = R.int(100, 999) * Math.pow(10, R.int(3, 7)); // 123,000 ~ 99억 9,000만: 답은 1.23억 ~ 9만 9,900억
    return exact({ q: `단위가 천 원인 재무제표에서 영업이익 칸의 숫자가 ${fmtNum(v)}이다. 영업이익은 몇 억 원?`, unit: '억 원', vars: { v, scale: 1e3 }, why: `1억은 천의 10만 배. ${fmtNum(v)} ÷ 100,000.` }, v / 1e5);
  },
  eok2jo(R) {
    const v = R.int(10, 999) * Math.pow(10, R.int(2, 3)); // 1,000 ~ 999,000: 답은 0.1조 ~ 99.9조
    return exact({ q: `단위가 억 원인 표에서 자산총계 칸의 숫자가 ${fmtNum(v)}이다. 자산총계는 몇 조 원?`, unit: '조 원', vars: { v, scale: 1e8 }, why: `1조는 1만 억. ${fmtNum(v)} ÷ 10,000.` }, v / 1e4);
  },
  eok2usdmn(R) {
    for (;;) {
      const r = R.step(1300, 1500, 50);
      const m = sigIn(R, 2, 10, 990);
      const w = (m * r) / 100;
      if (w !== Math.round(w) || !few(w)) continue;
      return exact({ q: `${RATE_TXT.usd(r)}일 때 ${eok(w)}은 몇 million 달러?`, unit: 'million 달러', vars: { r, w }, why: `${fmtNum(w)}억 ÷ ${fmtNum(r)} = ${fmtNum(m * 1e6)}달러.` }, m);
    }
  },
  usdmn2eok(R) {
    for (;;) {
      const r = R.step(1300, 1500, 50);
      const m = sigIn(R, 2, 10, 990);
      const w = (m * r) / 100;
      if (w !== Math.round(w) || !few(w)) continue;
      return exact({ q: `${RATE_TXT.usd(r)}일 때 ${m} million 달러는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, m }, why: `${fmtKR(m * 1e6, { comma: true })} × ${fmtNum(r)} = ${fmtNum(w)}억 원.` }, w);
    }
  },
  eps_calc(R) {
    const sh = R.pick([1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 20000]);
    const eps = sigIn(R, 2, 100, 50000);
    const ni = (eps * sh) / 1e4;
    return exact({ q: `순이익 ${eok(ni)}, 발행주식 ${shares(sh * 1e4)}인 회사의 EPS(주당순이익)는 몇 원?`, unit: '원', input: 'kr', vars: { ni, sh }, why: `${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4, { comma: true })}.` }, eps);
  },
  mcap_jo(R) {
    for (;;) {
      const sh = sigIn(R, 2, 1000, 99000); // 만 주
      const price = sigIn(R, 2, 1000, 99000);
      const raw = (sh * 1e4 * price) / 1e12;
      if (raw < 0.1 || raw > 500) continue;
      const o = rounded({ q: `발행주식 ${shares(sh * 1e4)}, 주가 ${won(price)}인 회사의 시가총액은 몇 조 원?`, unit: '조 원', vars: { sh, price }, why: `${fmtKR(sh * 1e4, { comma: true })} × ${fmtNum(price)} = ${fmtNum(sh * 1e4 * price)}원.` }, raw, 1);
      if (o) return o;
    }
  },
};

// ── 7. 어림셈 ─────────────────────────────────────────────
const SIG = [0, 2, 2, 3, 3];
const TOL = [0, 0.1, 0.05, 0.05, 0.03];
const est: Record<string, Gen> = {
  mul(R, lv) {
    const s = SIG[lv];
    let price: number, q: number, raw: number;
    do {
      price = sigIn(R, s, 1000, 99999);
      q = sigIn(R, s, 100, 9999);
      raw = (price * q) / 1e4;
    } while (raw >= 1e4);
    return approx({ q: `주가 ${won(price)}인 주식 ${fmtNum(q)}주를 사면 약 몇 만 원?`, unit: '만 원', vars: { price, qty: q }, why: `${fmtNum(roundSig(price, 2))} × ${fmtNum(roundSig(q, 2))}처럼 앞자리로 어림한다.` }, raw, { rel: TOL[lv] });
  },
  pct_of(R, lv) {
    const s = SIG[lv];
    let b: number, p: number, raw: number;
    do {
      b = sigIn(R, s, 1000, 99999); // 억 원
      p = lv === 1 ? R.pick([5, 10, 15, 20, 25, 30]) : lv === 2 ? R.int(2, 30) : roundSig(R.int(11, 299) / 10, Math.min(s, 3));
      raw = (b * p) / 100;
    } while (raw >= 1e4);
    return approx({ q: `매출 ${eok(b)}의 ${pct(p)}는 약 몇 억 원?`, unit: '억 원', vars: { base: b, p }, why: `1%는 ${fmtNum(roundTo(b / 100, 1))}억 원. 여기에 ${josa(fmtNum(p), '을', '를')} 곱한다.` }, raw, { rel: TOL[lv] });
  },
  fx_div(R, lv) {
    const s = SIG[lv];
    const w = sigIn(R, s, 100, 9999); // 억 원
    const r = lv <= 2 ? R.pick([1300, 1400, 1500]) : R.step(1300, 1500, 50);
    const raw = (w * 1e8) / r / 1e6;
    return approx({ q: `${eok(w)}을 1달러 ${fmtNum(r)}원에 바꾸면 약 몇 million 달러?`, unit: 'million 달러', vars: { w, r }, why: `1억 원은 약 ${fmtNum(roundTo(1e8 / r / 1e3, 0))}천 달러. ${fmtNum(w)}억 ÷ ${fmtNum(r)}.` }, raw, { rel: TOL[lv] });
  },
  per_share(R, lv) {
    const s = SIG[lv];
    const ni = sigIn(R, s, 100, 9999); // 억 원
    const sh = sigIn(R, s, 1000, 50000); // 만 주
    const raw = (ni * 1e8) / (sh * 1e4);
    return approx({ q: `순이익 ${eok(ni)}, 발행주식 ${shares(sh * 1e4)}인 회사의 EPS(주당순이익)는 약 몇 원?`, unit: '원', vars: { ni, sh }, why: `${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4, { comma: true })}. 억을 만으로 나누면 1만 원 단위가 된다.` }, raw, { rel: TOL[lv] });
  },
  pow(R, lv) {
    for (;;) {
      const r = R.int(2, 20);
      const n = R.int(2, 30);
      const raw = Math.pow(1 + r / 100, n);
      if (raw > 16 || raw < 1.2) continue;
      const why = `72의 법칙으로 ${fmtNum(roundTo(72 / r, 1))}년마다 두 배.`;
      if (R.chance(0.5)) return approx({ q: `연 ${r}% 복리로 ${n}년이면 처음 금액의 약 몇 배?`, unit: '배', vars: { r, n }, why }, raw, { rel: TOL[lv] });
      // 절반은 금액(앞자리 하나 또는 둘)을 주고 나중 금액을 어림한다
      const a = R.pick(AMT12());
      const { unit, div } = tierBig(a * raw);
      return approx({ q: `${krw(a)}을 연 ${r}% 복리로 ${n}년 두면 약 몇 ${unit}?`, unit, vars: { r, n, a, div }, why }, (a * raw) / div, { rel: TOL[lv] });
    }
  },
};

// ─────────────────────────────────────────────────────────────
// 분야와 수준
// ─────────────────────────────────────────────────────────────
export type Skill = { id: SkillId; name: string; gen: Record<string, Gen>; levels: { types: string[]; target: number }[] };
const lv = (id: SkillId, types: string[][]) => types.map((t, i) => ({ types: t, target: NUM_CONFIG.targets[id][i] }));
export const SKILLS: Skill[] = [
  {
    id: 'read',
    name: '큰 수 읽기',
    gen: read,
    levels: lv('read', [
      ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'],
      ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'],
      ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'],
      ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'],
    ]),
  },
  {
    id: 'fx',
    name: '환율 환산',
    gen: fx,
    levels: lv('fx', [
      ['f2k_usd', 'k2f_usd', 'f2k_usd', 'k2f_usd', 'f2k_jpy', 'k2f_jpy'],
      ['f2k_usd', 'k2f_usd', 'f2k_jpy', 'k2f_jpy', 'f2k_eur', 'k2f_eur'],
      ['usdmn2eok', 'eok2usdmn', 'cross_jpy', 'cross_eur', 'f2k_usd', 'k2f_jpy'],
      ['valchg_krw', 'valchg_usd', 'ret_krw', 'ret_usd', 'cross_jpy', 'usdmn2eok'],
    ]),
  },
  {
    id: 'ratio',
    name: '비율과 퍼센트',
    gen: ratio,
    levels: lv('ratio', [
      ['margin', 'per', 'roe', 'payout', 'pchg', 'pp'],
      ['margin', 'per', 'pbr', 'roe', 'pchg', 'pp_vs_pct'],
      ['rev_from_margin', 'price_from_eps', 'mcap_from_pbr', 'payout', 'pchg', 'pp_vs_pct'],
      ['ev_ebitda', 'dupont', 'price_from_eps', 'pp_vs_pct', 'mcap_from_pbr', 'roe'],
    ]),
  },
  {
    id: 'growth',
    name: '성장과 복리',
    gen: growth,
    levels: lv('growth', [
      ['yoy', 'yoy', 'r72_years', 'r72_rate', 'comp2', 'comp2'],
      ['yoy_r', 'yoy_r', 'comp2', 'cagr2', 'r72_years', 'comp3'],
      ['yoy_r', 'comp3', 'cagr2', 'cagr3', 'r72_rate', 'mult_est'],
      ['cagr_est', 'cagr_est', 'mult_est', 'mult_est', 'comp3', 'yoy_r'],
    ]),
  },
  {
    id: 'pv',
    name: '할인과 현재가치',
    gen: pv,
    levels: lv('pv', [
      ['pv1', 'pv1', 'pv1', 'perp', 'perp', 'perp'],
      ['pv2', 'pv1', 'perp', 'gordon', 'gordon', 'perp_g'],
      ['gordon_r', 'gordon_g', 'gordon', 'pv2', 'perp_g', 'deferred_perp'],
      ['gordon_d0', 'deferred_perp', 'gordon_r', 'gordon_g', 'pv3_est', 'pv3_est'],
    ]),
  },
  {
    id: 'unit',
    name: '단위 환산',
    gen: unit,
    levels: lv('unit', [
      ['pp2bp', 'bp2pp', 'bp_add', 'pp2bp', 'bp2pp', 'bp_add'],
      ['fs_mn', 'fs_th', 'eok2jo', 'bp_add', 'fs_mn', 'fs_th'],
      ['eok2usdmn', 'usdmn2eok', 'fs_mn', 'eps_calc', 'bp_add', 'eok2jo'],
      ['mcap_jo', 'eps_calc', 'eok2usdmn', 'usdmn2eok', 'fs_mn', 'bp_add'],
    ]),
  },
  {
    id: 'est',
    name: '어림셈',
    gen: est,
    levels: lv('est', [
      ['mul', 'mul', 'pct_of', 'pct_of', 'fx_div', 'per_share'],
      ['mul', 'mul', 'pct_of', 'pct_of', 'fx_div', 'per_share'],
      ['mul', 'pct_of', 'fx_div', 'per_share', 'pow', 'pct_of'],
      ['mul', 'pct_of', 'fx_div', 'per_share', 'pow', 'pct_of'],
    ]),
  },
];
export const SKILL: Record<SkillId, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, Skill>;
export const ORDER: SkillId[] = SKILLS.map((s) => s.id);
export const SET_SIZE = NUM_CONFIG.setSize;
export const MAX_LEVEL = 4;
export const isSkill = (k: unknown): k is SkillId => typeof k === 'string' && (ORDER as string[]).includes(k);

function finish(p: Draft & { skill: SkillId; level: number; type: string; seed: string }): Problem {
  // 자판: 끊어 쓰기 문제와 답의 단위가 맨 화폐(원, 달러, 엔, 유로)인 문제만 조, 억, 만 단추를 쓴다.
  const out = p as unknown as Problem;
  out.input = p.form || /^(원|달러|엔|유로)$/.test(p.unit) ? 'kr' : 'num';
  out.form = !!p.form;
  out.note = p.note || '';
  out.tol = p.tol || null;
  out.show = showOf(out);
  out.typed = typedOf(out);
  return out;
}
function showOf(p: Problem): string {
  if (p.tol) return '약 ' + fmtNum(roundSig(p.raw, 3)) + joinUnit(p.unit);
  // 끊어 쓰기 문제와 조, 억, 만 자판으로 답하는 100만 넘는 답은 한글 단위로(1억 3,500만 원, 43억 엔)
  if (p.form || (p.input === 'kr' && p.answer >= 1e6 && Number.isInteger(p.answer))) return krWith(fmtKR(p.answer, { comma: true }), p.unit);
  return fmtNum(p.answer, p.dp != null ? p.dp : undefined) + joinUnit(p.unit);
}
/** 정답을 자판으로 누른 모양(시험과 자동 풀이용). */
function typedOf(p: Problem): string {
  if (p.tol) return String(roundSig(p.raw, 4));
  if (p.form) return fmtKR(p.answer, { space: false });
  if (p.dp != null) return p.answer.toFixed(p.dp);
  return (p.answer < 0 ? '-' : '') + trimDec(Math.abs(p.answer));
}

/** 문제 하나. 같은 (분야, 수준, 유형, 씨앗)이면 언제나 같은 문제. */
export function makeProblem(skill: SkillId, level: number, type: string, seed: string): Problem {
  const S = SKILL[skill];
  const fn = S.gen[type];
  if (!fn) throw new Error(`유형 없음: ${skill}.${type}`);
  for (let k = 0; k < 200; k++) {
    const R = makeRng(`${seed}#${k}`);
    const p = fn(R, level);
    if (p) return finish(Object.assign(p, { skill, level, type, seed }));
  }
  throw new Error(`문제를 못 만듦: ${skill}.${type}`);
}

/** 답의 단위가 나타내는 배수(만 원이면 1만). 문장 속 금액과 견주려고 쓴다. */
const UNIT_MULT: Record<string, number> = { '만 원': 1e4, '억 원': 1e8, '조 원': 1e12, '만 엔': 1e4, '억 엔': 1e8, '만 달러': 1e4, '억 달러': 1e8 };
/**
 * 문제에 나오는 수와 답을 모은 표식. 서로 뒤집은 두 문제(1,350원일 때 4만 달러는? / 1,350원일 때 5,400만 원은?,
 * 2년 30% 성장 / 같은 금액의 CAGR, 2.69%p 는 몇 bp? / 269bp 는 몇 %p?)는 이 표식이 같다. 한 세트에 함께 내지 않는다.
 */
function numSig(p: Problem): string {
  const vals = new Set<number>();
  const re = /\d[\d,.]*(?:조|억|만)?(?: \d[\d,]*(?:억|만))*(?: \d[\d,]*(?![\d,]*(?:조|억|만)))?/g;
  for (const m of p.q.replace(/\([^)]*\)/g, '').match(re) || []) {
    const v = parseKR(m.trim());
    if (v) vals.add(clean(v.value));
  }
  vals.add(clean(Math.abs(p.answer) * (UNIT_MULT[p.unit] || 1)));
  return [...vals].sort((a, b) => a - b).join('|');
}

/** 한 분야 한 세트(6문제). 유형 묶음은 수준마다 고정이고 순서만 섞는다. 같은 문제와 서로 뒤집은 문제는 한 세트에 두지 않는다. */
export function makeSet(skill: SkillId, level: number, seedKey: string, n = SET_SIZE): Problem[] {
  const S = SKILL[skill];
  const L = Math.max(1, Math.min(S.levels.length, level));
  const types = S.levels[L - 1].types;
  const R = makeRng(`${seedKey}|${skill}|${L}|order`);
  const order = R.shuffle(types).slice(0, n);
  const seen = new Set<string>();
  const sigs = new Set<string>();
  return order.map((t, i) => {
    let p: Problem;
    for (let k = 0; ; k++) {
      p = makeProblem(skill, L, t, `${seedKey}|${skill}|${L}|${i}|${k}`);
      if (!seen.has(p.q) && (k >= 50 || !sigs.has(numSig(p)))) break;
    }
    seen.add(p.q);
    sigs.add(numSig(p));
    return p;
  });
}

// ─────────────────────────────────────────────────────────────
// 채점
// ─────────────────────────────────────────────────────────────
export type Reason = 'ok' | 'empty' | 'parse' | 'wrong' | 'sign' | 'round' | 'scale' | 'form';
export type Checked = { ok: boolean; reason: Reason; value?: number };
/**
 * reason: ok, empty, parse, wrong, sign(부호만 다름), round(반올림 자리만 다름), scale(자릿수가 10 의 거듭제곱만큼 다름), form(값은 맞고 끊어 쓰기가 틀림)
 */
export function check(p: Problem, input: string | null | undefined): Checked {
  const s = String(input == null ? '' : input).trim();
  if (!s) return { ok: false, reason: 'empty' };
  let v: number;
  let canonical = true;
  if (p.input === 'kr') {
    const r = parseKR(s);
    if (!r) return { ok: false, reason: 'parse' };
    v = r.value;
    canonical = r.canonical;
  } else {
    const t = s.replace(/,/g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, reason: 'parse' };
    v = Number(t);
  }
  const close = (a: number, b: number) => (Number.isInteger(b) ? Math.abs(a - b) < 1e-6 : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));
  const scaled = (a: number, b: number) => {
    if (!a || !b) return false;
    const l = Math.log10(Math.abs(a / b));
    return Math.abs(l - Math.round(l)) < 1e-9 && Math.round(l) !== 0 && a / b > 0;
  };
  if (p.tol) {
    const lim = p.tol.rel != null ? Math.abs(p.raw) * p.tol.rel : p.tol.abs!;
    if (Math.abs(v - p.raw) <= lim + 1e-9) return { ok: true, reason: 'ok', value: v };
    if (Math.abs(-v - p.raw) <= lim) return { ok: false, reason: 'sign', value: v };
    const l = Math.log10(Math.abs(v / p.raw));
    if (v && Math.round(l) !== 0 && Math.abs(v / Math.pow(10, Math.round(l)) - p.raw) <= lim) return { ok: false, reason: 'scale', value: v };
    return { ok: false, reason: 'wrong', value: v };
  }
  if (close(v, p.answer)) {
    if (p.form && !canonical) return { ok: false, reason: 'form', value: v };
    return { ok: true, reason: 'ok', value: v };
  }
  if (p.answer !== 0 && close(v, -p.answer)) return { ok: false, reason: 'sign', value: v };
  if (p.dp != null && Math.abs(v - p.raw) < Math.pow(10, -p.dp)) return { ok: false, reason: 'round', value: v };
  if (scaled(v, p.answer)) return { ok: false, reason: 'scale', value: v };
  return { ok: false, reason: 'wrong', value: v };
}
export const REASON: Partial<Record<Reason, string>> = {
  sign: '부호가 반대예요',
  round: '반올림 자리를 다시 보세요',
  scale: '자릿수가 달라요',
  form: '만 단위 아래는 네 자리까지 끊어 써요',
  parse: '단위 순서를 다시 보세요',
};

// ─────────────────────────────────────────────────────────────
// 기록과 수준
// ─────────────────────────────────────────────────────────────
/** 기록 한 줄: 한 분야 한 세트. d 날짜(한국) · k 분야 · lv 수준 · n 문제 수 · ok 맞힌 수 · med 맞힌 문제 시간의 중앙값(초) · best 가장 빠른 정답(초) · sum 모든 문제 시간의 합(초) */
export type NumSession = { d: string; k: SkillId; lv: number; n: number; ok: number; med: number | null; best: number | null; sum: number };
/** 하루 기록. ks 그날 할당으로 마친 분야 · at 할당을 다 채운 시각 · x 할당을 넘겨 더 푼 문제 수(추가 학습) */
export type NumDay = { ks: SkillId[]; at?: string; x?: number };
/** 수리 기록 전체. start 처음 연 날(이 날부터 하루 목표에 든다) · level 분야별 지금 수준 */
export type NumState = { v: 1; start: string; level: Record<SkillId, number>; sessions: NumSession[]; days: Record<string, NumDay> };
/** 한 문제의 시간과 정오. ms 는 문제가 다 들어온 뒤부터 확인까지(피드백과 화면을 떠난 시간은 뺀다) */
export type NumItem = { ms: number; ok: boolean };

export const median = (xs: (number | null | undefined)[]): number | null => {
  const a = (xs.filter((x) => x != null) as number[]).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
/**
 * 한 분야 한 세트를 기록 한 줄로 줄인다. 문제는 남기지 않는다.
 * med 와 best 는 맞힌 문제의 시간만 쓴다(빨리 찍고 틀린 것이 기록을 당기지 않게).
 */
export function summarize(items: NumItem[]): { n: number; ok: number; med: number | null; best: number | null; sum: number } {
  const r1 = (ms: number | null) => (ms == null ? null : Math.round(ms / 100) / 10);
  const okT = items.filter((i) => i.ok).map((i) => i.ms);
  return {
    n: items.length,
    ok: okT.length,
    med: r1(median(okT)),
    best: okT.length ? r1(Math.min(...okT)) : null,
    sum: r1(items.reduce((a, i) => a + i.ms, 0)) ?? 0,
  };
}
export const RULE = NUM_CONFIG.rule;
export type Judged = { target: number; run: number; acc3: number | null; med3: number | null; next: number; change: -1 | 0 | 1 };
/**
 * 다음 세트의 수준. sessions 는 이 분야의 기록(오래된 것부터). 지금 수준에서 이어진 기록만 본다.
 * 올림: 이 수준에서 3세트 이상, 최근 3세트 정답률 90% 이상, 최근 3세트 중앙값들의 중앙값이 목표 시간 이하.
 * 내림: 최근 2세트가 모두 정답률 60% 미만. 그 밖에는 그대로.
 */
export function judge(skill: SkillId, level: number, sessions: { lv: number; ok: number; n: number; med: number | null }[]): Judged {
  const S = SKILL[skill];
  const run: typeof sessions = [];
  for (let i = sessions.length - 1; i >= 0 && sessions[i].lv === level; i--) run.unshift(sessions[i]);
  const target = S.levels[level - 1].target;
  const acc = (ss: typeof sessions) => ss.reduce((a, s) => a + s.ok, 0) / Math.max(1, ss.reduce((a, s) => a + s.n, 0));
  const last3 = run.slice(-RULE.upWindow);
  const med3 = median(last3.map((s) => s.med));
  const info = { target, run: run.length, acc3: last3.length ? acc(last3) : null, med3 };
  if (run.length >= RULE.downWindow && level > 1) {
    const last2 = run.slice(-RULE.downWindow);
    if (last2.every((s) => s.ok / s.n < RULE.downAcc)) return { ...info, next: level - 1, change: -1 };
  }
  if (run.length >= RULE.upWindow && level < S.levels.length && acc(last3) >= RULE.upAcc && med3 != null && med3 <= target) return { ...info, next: level + 1, change: 1 };
  return { ...info, next: level, change: 0 };
}
/** 그 수준의 최고 기록(세트 중앙값이 가장 짧았던 세트). 정답률 80% 넘는 세트만. */
export function personalBest(sessions: NumSession[], skill: SkillId, level: number): NumSession | null {
  let best: NumSession | null = null;
  for (const s of sessions) if (s.k === skill && s.lv === level && s.med != null && s.ok / s.n >= NUM_CONFIG.bestMinAcc && (!best || s.med < best.med!)) best = s;
  return best;
}
/** 오늘의 두 분야. 7 분야가 이틀씩 돌아 한 주에 분야마다 두 번. */
export function dailyPair(date: string): SkillId[] {
  const [y, m, d] = date.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 864e5);
  const i = (((2 * day) % 7) + 7) % 7;
  return [ORDER[i], ORDER[(i + 1) % 7]];
}
/** 하루 할당 문제 수(12) */
export const DAILY_TOTAL = NUM_CONFIG.dailySkills * SET_SIZE;

// ─────────────────────────────────────────────────────────────
// 기록 다루기(순수). 저장은 store 가 한다.
// ─────────────────────────────────────────────────────────────
export function emptyNum(today: string): NumState {
  const level = {} as Record<SkillId, number>;
  for (const k of ORDER) level[k] = 1;
  return { v: 1, start: today, level, sessions: [], days: {} };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
/** 읽어 들인 기록(기기 보관본, 내보낸 파일)을 고쳐 쓴다. 모양이 틀린 줄은 버린다. 쓸 수 없으면 null. */
export function migrateNum(raw: unknown, today: string): NumState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  const out = emptyNum(typeof r.start === 'string' && DATE.test(r.start) ? r.start : today);
  if (Array.isArray(r.sessions)) {
    for (const s of r.sessions) {
      if (!s || !isSkill(s.k) || typeof s.d !== 'string' || !DATE.test(s.d)) continue;
      const n = num(s.n);
      const ok = num(s.ok);
      const lv = num(s.lv);
      if (n == null || ok == null || lv == null || n <= 0 || ok < 0 || ok > n || lv < 1 || lv > MAX_LEVEL) continue;
      out.sessions.push({ d: s.d, k: s.k, lv: Math.round(lv), n, ok, med: num(s.med), best: num(s.best), sum: num(s.sum) ?? 0 });
    }
    out.sessions.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }
  for (const k of ORDER) {
    const v = num(r.level?.[k]);
    out.level[k] = v != null && v >= 1 && v <= MAX_LEVEL ? Math.round(v) : 1;
  }
  if (r.days && typeof r.days === 'object') {
    for (const [d, v] of Object.entries(r.days as Record<string, any>)) {
      if (!DATE.test(d) || !v || typeof v !== 'object') continue;
      const ks = Array.isArray(v.ks) ? ([...new Set(v.ks.filter(isSkill))] as SkillId[]) : [];
      const day: NumDay = { ks };
      if (typeof v.at === 'string') day.at = v.at;
      if (num(v.x)) day.x = v.x;
      out.days[d] = day;
    }
  }
  if (out.sessions.length && out.sessions[0].d < out.start) out.start = out.sessions[0].d;
  return out;
}

/**
 * 그날 할당으로 마친 문제 수(0, 6, 12). 할당을 다 채운 날(at)은 나중에 분야 순서나 하루 양을 바꿔도 다 채운 날로 남는다.
 */
export function quotaDone(st: NumState, date: string): number {
  if (st.days[date]?.at) return DAILY_TOTAL;
  const pair = dailyPair(date);
  const ks = st.days[date]?.ks ?? [];
  return Math.min(DAILY_TOTAL, ks.filter((k) => pair.includes(k)).length * SET_SIZE);
}
/**
 * 두 기록을 합친다(가져오기). 세트는 똑같은 줄을 한 번만 남기고 날짜순으로, 날짜별 할당은 마친 분야를 모두 모으고
 * 다 채운 시각은 이른 쪽, 추가 학습 수는 큰 쪽, 시작일은 이른 쪽. 수준은 분야마다 마지막 세트가 더 늦은 쪽(같으면 a)을 따른다.
 * 같은 파일을 두 번 가져와도 기록이 늘지 않고, 어느 쪽에서 채운 날도 지워지지 않는다.
 */
export function mergeNum(a: NumState, b: NumState): NumState {
  const key = (s: NumSession) => [s.d, s.k, s.lv, s.n, s.ok, s.med, s.best, s.sum].join('|');
  const seen = new Set<string>();
  const sessions: NumSession[] = [];
  for (const s of [...a.sessions, ...b.sessions]) {
    const id = key(s);
    if (seen.has(id)) continue;
    seen.add(id);
    sessions.push(s);
  }
  sessions.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  const days: Record<string, NumDay> = {};
  for (const src of [a.days, b.days]) {
    for (const [d, v] of Object.entries(src)) {
      const cur = days[d];
      if (!cur) {
        days[d] = { ...v, ks: [...v.ks] };
        continue;
      }
      const ks = [...new Set([...cur.ks, ...v.ks])];
      const at = cur.at && v.at ? (cur.at < v.at ? cur.at : v.at) : cur.at ?? v.at;
      const x = Math.max(cur.x ?? 0, v.x ?? 0);
      days[d] = { ks, ...(at ? { at } : null), ...(x ? { x } : null) };
    }
  }
  const level = { ...a.level };
  for (const k of ORDER) {
    const la = lastOf(a.sessions, k);
    const lb = lastOf(b.sessions, k);
    if (lb && (!la || lb.d > la.d)) level[k] = b.level[k];
  }
  return { v: 1, start: a.start < b.start ? a.start : b.start, level, sessions, days };
}

/** 오늘 할당에서 아직 안 푼 분야(날짜로 정한 순서대로) */
export function quotaLeft(st: NumState, date: string): SkillId[] {
  const ks = st.days[date]?.ks ?? [];
  return dailyPair(date).filter((k) => !ks.includes(k));
}
/** 같은 분야, 같은 수준의 바로 앞 세트(수준이 내려갔다 다시 올라와도 그 수준의 예전 기록을 찾는다) */
export function lastAt(sessions: NumSession[], k: SkillId, level: number): NumSession | null {
  for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].k === k && sessions[i].lv === level) return sessions[i];
  return null;
}
/** 그 분야의 마지막 세트 */
export function lastOf(sessions: NumSession[], k: SkillId): NumSession | null {
  for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].k === k) return sessions[i];
  return null;
}
/** 그날 그 분야에서 이미 푼 세트 수(같은 날 다시 풀면 다른 씨앗으로 새 문제를 만든다) */
export function setsOn(st: NumState, date: string, k: SkillId): number {
  let n = 0;
  for (const s of st.sessions) if (s.d === date && s.k === k) n++;
  return n;
}
/** 오늘 이 분야에 낼 세트(지금 수준, 오늘 몇 번째 세트인지로 씨앗을 정한다) */
export function setFor(st: NumState, date: string, k: SkillId): { lv: number; problems: Problem[] } {
  const L = st.level[k] ?? 1;
  return { lv: L, problems: makeSet(k, L, `${date}|${setsOn(st, date, k)}`) };
}

/**
 * 할당을 마친 뒤 수리를 다시 열면 낼 분야(추가 학습). 화면에서 분야를 고르지 않으므로 여기서 정한다:
 * 오늘 아직 안 푼 분야 가운데 마지막으로 푼 날이 가장 오래된 것(한 번도 안 푼 분야가 먼저). 일곱 분야를 다 풀었으면 오늘 가장 적게 푼 분야.
 * 그래서 추가 학습을 이어서 하면 분야가 돌아가며 섞인다. 같은 분야 6문제라 수준 판단과 기록 한 줄은 그대로다.
 */
export function extraSkill(st: NumState, date: string): SkillId {
  const cnt = (k: SkillId) => setsOn(st, date, k);
  const lastD = (k: SkillId) => lastOf(st.sessions, k)?.d ?? '';
  const pool = ORDER.filter((k) => cnt(k) === 0);
  const cand = pool.length ? pool : ORDER.slice();
  let best = cand[0];
  for (const k of cand) {
    if (cnt(k) < cnt(best) || (cnt(k) === cnt(best) && lastD(k) < lastD(best))) best = k;
  }
  return best;
}

/** 날짜마다 한 점: 그날 모든 세트 중앙값의 중앙값(분야를 나누지 않는다). 기록 화면의 추이 그림에 쓴다. */
export function perDayAll(sessions: NumSession[]): { d: string; med: number; n: number; ok: number }[] {
  const m = new Map<string, { meds: number[]; n: number; ok: number }>();
  for (const s of sessions) {
    const a = m.get(s.d) ?? { meds: [], n: 0, ok: 0 };
    if (s.med != null) a.meds.push(s.med);
    a.n += s.n;
    a.ok += s.ok;
    m.set(s.d, a);
  }
  return [...m.entries()]
    .filter(([, a]) => a.meds.length)
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
    .map(([d, a]) => ({ d, med: Math.round(median(a.meds)! * 10) / 10, n: a.n, ok: a.ok }));
}

/**
 * 한 번 푼 것(분야 한둘)을 한데 본 숫자. 분야 이름 없이 전체만 화면에 보인다.
 * med 맞힌 문제 시간의 중앙값(초) · gain 같은 분야 같은 수준의 지난 세트보다 줄어든 초(분야마다 잰 것의 평균, 견줄 세트가 없으면 null) ·
 * prevMed 견준 지난 세트 중앙값들의 평균 · newPB 이 수준 최고 기록을 새로 세운 분야가 있는지(첫 세트는 빼고)
 */
export function overall(results: NumResult[], items: NumItem[]): { n: number; ok: number; sum: number; med: number | null; best: number | null; gain: number | null; prevMed: number | null; newPB: boolean; levelUp: boolean } {
  const s = summarize(items);
  const pairs = results.filter((r) => r.prev && r.prev.med != null && r.row.med != null);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : null);
  return {
    n: s.n,
    ok: s.ok,
    sum: s.sum,
    med: s.med,
    best: s.best,
    gain: avg(pairs.map((r) => r.prev!.med! - r.row.med!)),
    prevMed: avg(pairs.map((r) => r.prev!.med!)),
    newPB: results.some((r) => r.newPB && !!r.pbBefore),
    levelUp: results.some((r) => r.j.change > 0),
  };
}

/** 세트 하나를 마친 결과. prev 같은 수준의 바로 앞 세트 · pbBefore 이 세트 전의 최고 기록 · newPB 이 세트가 새 최고 기록인지 · j 다음 수준 · quota 할당에 들었는지 */
export type NumResult = { k: SkillId; lv: number; row: NumSession; prev: NumSession | null; pbBefore: NumSession | null; newPB: boolean; j: Judged; quota: boolean };

/**
 * 세트 하나를 기록에 더한다. daily 면 오늘 할당의 분야일 때만 할당으로 센다(자정을 넘겨 마친 경우 등은 추가 학습).
 * nowIso 는 할당을 다 채운 시각으로 적는다.
 */
export function addSet(st: NumState, date: string, k: SkillId, lv: number, items: NumItem[], daily: boolean, nowIso: string): { state: NumState; result: NumResult } {
  const sum = summarize(items);
  const prev = lastAt(st.sessions, k, lv);
  const pbBefore = personalBest(st.sessions, k, lv);
  const row: NumSession = { d: date, k, lv, ...sum };
  const sessions = [...st.sessions, row];
  const j = judge(
    k,
    lv,
    sessions.filter((s) => s.k === k),
  );
  const newPB = sum.med != null && sum.ok / sum.n >= NUM_CONFIG.bestMinAcc && (!pbBefore || sum.med < pbBefore.med!);
  const day: NumDay = { ...(st.days[date] ?? { ks: [] }) };
  day.ks = [...day.ks];
  const quota = daily && dailyPair(date).includes(k) && !day.ks.includes(k);
  if (quota) {
    day.ks.push(k);
    if (!day.at && quotaLeft({ ...st, days: { ...st.days, [date]: day } }, date).length === 0) day.at = nowIso;
  } else day.x = (day.x ?? 0) + items.length;
  const state: NumState = { ...st, sessions, level: { ...st.level, [k]: j.next }, days: { ...st.days, [date]: day } };
  return { state, result: { k, lv, row, prev, pbBefore, newPB, j, quota } };
}

/** 날짜마다 한 점: 그날 같은 수준 세트들의 중앙값의 중앙값. 추이 그림에 쓴다. */
export function perDay(sessions: NumSession[], k: SkillId): { d: string; lv: number; med: number }[] {
  const m = new Map<string, { d: string; meds: number[]; lv: number; at: number }>();
  for (const s of sessions)
    if (s.k === k && s.med != null) {
      const key = s.d + '|' + s.lv;
      const a = m.get(key) ?? { d: s.d, meds: [], lv: s.lv, at: m.size };
      a.meds.push(s.med);
      m.set(key, a);
    }
  return [...m.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.at - b.at)).map((a) => ({ d: a.d, lv: a.lv, med: Math.round(median(a.meds)! * 10) / 10 }));
}

/**
 * 기간의 수리 숫자(돌아보기용). sets 세트 수 · n 문제 수 · ok 맞힌 수 ·
 * change 같은 분야 같은 수준의 첫 세트와 마지막 세트 중앙값 변화율(%)의 중앙값(음수면 빨라졌다). 견줄 세트가 없으면 null.
 */
export function numPeriod(st: NumState, from: string, to: string): { sets: number; n: number; ok: number; change: number | null } {
  const rows = st.sessions.filter((s) => s.d >= from && s.d <= to);
  const groups = new Map<string, NumSession[]>();
  for (const s of rows) {
    if (s.med == null) continue;
    const key = s.k + '|' + s.lv;
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  const ch: number[] = [];
  for (const g of groups.values()) if (g.length >= 2 && g[0].med! > 0) ch.push(((g[g.length - 1].med! - g[0].med!) / g[0].med!) * 100);
  const c = median(ch);
  return { sets: rows.length, n: rows.reduce((a, s) => a + s.n, 0), ok: rows.reduce((a, s) => a + s.ok, 0), change: c == null ? null : Math.round(c) };
}

// ─────────────────────────────────────────────────────────────
// 자체 시험(시안과 같다). node scripts/numeracy-test.mjs 로 돌린다.
// ─────────────────────────────────────────────────────────────
// 답을 생성기와 따로 다시 계산한다(vars 만 보고). 반올림과 허용 오차는 여기서 따로 적용한다.
const SOLVE: Record<string, (v: any) => number> = {
  'read.d2k': (v) => v.n,
  'read.k2e': (v) => v.n / Math.pow(10, EN[v.en]),
  'read.e2k': (v) => v.x * Math.pow(10, EN[v.en]),
  'fx.f2k': (v) => ((v.amt / PER_UNIT[v.c as Cur]) * v.r) / v.out,
  'fx.k2f': (v) => (v.w * PER_UNIT[v.c as Cur]) / v.r / v.out,
  'fx.usdmn2eok': (v) => (v.m * v.r) / 100,
  'fx.eok2usdmn': (v) => (v.w * 100) / v.r,
  'fx.cross_jpy': (v) => (v.dir === 'u2j' ? (v.n * v.ru * 100) / v.rj : (v.n * 1e4 * v.rj) / 100 / v.ru),
  'fx.cross_eur': (v) => v.re / v.ru,
  'fx.valchg_krw': (v) => (Math.abs(v.r0 - v.r1) / v.r1) * 100,
  'fx.valchg_usd': (v) => (Math.abs(v.r1 - v.r0) / v.r0) * 100,
  'fx.ret_krw': (v) => (((1 + v.s / 100) * v.r1) / v.r0 - 1) * 100,
  'fx.ret_usd': (v) => (((1 + v.s / 100) * v.r0) / v.r1 - 1) * 100,
  'ratio.margin': (v) => (100 * v.op) / v.rev,
  'ratio.per': (v) => v.price / v.eps,
  'ratio.pbr': (v) => v.mcap / v.eq,
  'ratio.roe': (v) => (100 * v.ni) / v.eq,
  'ratio.payout': (v) => (100 * v.div) / v.ni,
  'ratio.pchg': (v) => (100 * Math.abs(v.p1 - v.p0)) / v.p0,
  'ratio.pp': (v) => Math.abs(v.r1 - v.r0),
  'ratio.pp_vs_pct': (v) => (v.ask === 'pp' ? Math.abs(v.r1 - v.r0) : (100 * Math.abs(v.r1 - v.r0)) / v.r0),
  'ratio.rev_from_margin': (v) => (100 * v.op) / v.p,
  'ratio.price_from_eps': (v) => ((v.ni * 1e8) / (v.sh * 1e4)) * v.m,
  'ratio.mcap_from_pbr': (v) => v.eq * v.pbr,
  'ratio.ev_ebitda': (v) => (v.mcap + v.nd) / v.e,
  'ratio.dupont': (v) => v.m * v.t * v.l,
  'growth.yoy': (v) => (100 * Math.abs(v.cur - v.prev)) / v.prev,
  'growth.yoy_r': (v) => (100 * Math.abs(v.cur - v.prev)) / v.prev,
  'growth.r72_years': (v) => (72 * Math.log(v.k)) / Math.LN2 / v.r,
  'growth.r72_rate': (v) => (72 * Math.log(v.k)) / Math.LN2 / v.n,
  'growth.comp2': (v) => (v.base * Math.pow(1 + v.r / 100, 2)) / v.div,
  'growth.cagr2': (v) => (Math.pow(v.end / v.base, 1 / v.n) - 1) * 100,
  'growth.comp3': (v) => (v.base * Math.pow(1 + v.r / 100, v.n)) / v.div,
  'growth.cagr3': (v) => (Math.pow(v.end / v.base, 1 / v.n) - 1) * 100,
  'growth.cagr_est': (v) => (Math.exp(Math.log(v.m) / v.n) - 1) * 100,
  'growth.mult_est': (v) => (Math.exp(v.n * Math.log(1 + v.r / 100)) * (v.a ?? 1)) / (v.div ?? 1),
  'pv.pv1': (v) => v.cf / Math.pow(1 + v.r / 100, v.n) / v.div,
  'pv.pv2': (v) => (v.ask === 'r' ? (Math.sqrt(v.cf / v.v) - 1) * 100 : v.cf / Math.pow(1 + v.r / 100, v.n) / v.div),
  'pv.perp': (v) => v.cf / (v.r / 100) / v.div,
  'pv.perp_g': (v) => v.cf / ((v.r - v.g) / 100),
  'pv.gordon': (v) => v.d1 / ((v.r - v.g) / 100),
  'pv.gordon_r': (v) => (100 * v.d1) / v.price + v.g,
  'pv.gordon_g': (v) => v.r - (100 * v.d1) / v.price,
  'pv.deferred_perp': (v) => v.cf / (v.r / 100) / (1 + v.r / 100),
  'pv.gordon_d0': (v) => (v.d0 * (1 + v.g / 100)) / ((v.r - v.g) / 100),
  'pv.pv3_est': (v) => v.cf * Math.pow(1 + v.r / 100, -v.n),
  'unit.pp2bp': (v) => v.pp * 100,
  'unit.bp2pp': (v) => v.bp / 100,
  'unit.bp_add': (v) => v.r0 + v.d / 100,
  'unit.fs_mn': (v) => (v.v * v.scale) / v.out,
  'unit.fs_th': (v) => (v.v * v.scale) / 1e8,
  'unit.eok2jo': (v) => (v.v * v.scale) / 1e12,
  'unit.eok2usdmn': (v) => (v.w * 1e8) / v.r / 1e6,
  'unit.usdmn2eok': (v) => (v.m * 1e6 * v.r) / 1e8,
  'unit.eps_calc': (v) => (v.ni * 1e8) / (v.sh * 1e4),
  'unit.mcap_jo': (v) => (v.sh * 1e4 * v.price) / 1e12,
  'est.mul': (v) => (v.price * v.qty) / 1e4,
  'est.pct_of': (v) => (v.base * v.p) / 100,
  'est.fx_div': (v) => (v.w * 1e8) / v.r / 1e6,
  'est.per_share': (v) => (v.ni * 1e8) / (v.sh * 1e4),
  'est.pow': (v) => (Math.pow(1 + v.r / 100, v.n) * (v.a ?? 1)) / (v.div ?? 1),
};
const solveKey = (p: Problem) => `${p.skill}.${p.type.replace(/^(f2k|k2f)_(usd|jpy|eur)$/, '$1')}`;

const GLOSS: [string, RegExp][] = [
  ['PER', /PER\(/],
  ['PBR', /PBR\(/],
  ['ROE', /ROE\(/],
  ['EPS', /EPS\(/],
  ['EBITDA', /EBITDA\(/],
  ['EV', /EV\(/],
  ['CAGR', /CAGR\(/],
  ['bp', /bp\(/],
  ['%p', /%p\(퍼센트포인트\)|퍼센트포인트/],
];
const BAD_JOSA = /(원|엔|만|억|조)(는|를|가|와|로)(?=[\s?.,]|$)|(러|로|%)(은|을|이|으로)(?=[\s?.,]|$)/;
const JOSA_A: Record<string, string> = { 을: '을', 를: '을', 은: '은', 는: '은', 이: '이', 가: '이' };
const JOSA_B: Record<string, string> = { 을: '를', 를: '를', 은: '는', 는: '는', 이: '가', 가: '가' };
/** 문장 검사. 돌려주는 것은 문제 목록(빈 목록이면 통과). */
export function lint(p: Problem): string[] {
  const out: string[] = [];
  const q = p.q;
  if (/[—–→←⇒…]/.test(q + p.note + p.why)) out.push('금지 문자');
  if (!q.endsWith('?')) out.push('물음표로 끝나지 않음');
  const asks = (q.match(/몇|얼마/g) || []).length;
  if (p.form ? asks !== 0 || !q.endsWith('쓰면?') : asks !== 1) out.push('묻는 말이 하나가 아님');
  if (q.length > 120) out.push('문장이 김 ' + q.length);
  if (/  /.test(q)) out.push('빈칸 두 개');
  if (/\d{5,}/.test(q.replace(/\d{1,3}(,\d{3})+/g, ''))) out.push('쉼표 없는 큰 수');
  if (BAD_JOSA.test(q)) out.push('조사 ' + q.match(BAD_JOSA)![0]);
  // 숫자 바로 뒤 조사(문제와 풀이 모두): 3를, 10로, 36로 같은 것
  for (const m of (q + ' ' + p.why).matchAll(/(\d)(으로|로|을|를|은|는|이|가)(?=[\s.,?]|$)/g)) {
    const want = m[2] === '으로' || m[2] === '로' ? ro(m[1]).slice(1) : josa(m[1], JOSA_A[m[2]], JOSA_B[m[2]]).slice(1);
    if (want !== m[2]) out.push('숫자 뒤 조사 ' + m[0]);
  }
  if (/(million|billion|trillion)(는|를|가|로)(?=[\s.,?]|$)/.test(q + ' ' + p.why)) out.push('영어 단위 뒤 조사');
  if (/(^|[^\d,.])\d{4,}(만|억|조)/.test(q + ' ' + p.why)) out.push('쉼표 없는 한글 단위');
  for (const [ac, re] of GLOSS) {
    const has = ac === 'EV' ? /EV(?!\w)/.test(q.replace(/EV\/EBITDA/g, 'X')) || /EV\(/.test(q) : q.includes(ac);
    if (has && !re.test(q)) out.push('약어 설명 없음 ' + ac);
  }
  if (p.input === 'num' && p.unit && !q.includes('몇 ' + p.unit)) out.push('단위가 문장에 없음 ' + p.unit);
  if (p.input === 'kr' && !p.form && p.unit && !q.includes('몇 ' + p.unit)) out.push('단위가 문장에 없음 ' + p.unit);
  if (p.form && !q.includes('조, 억, 만 단위')) out.push('끊어 쓰기 지시 없음');
  if (p.dp != null && !/반올림/.test(p.note)) out.push('반올림 안내 없음');
  if (p.dp == null && /반올림/.test(p.note)) out.push('필요 없는 반올림 안내');
  if (p.tol && !/±/.test(p.note)) out.push('허용 오차 안내 없음');
  if (p.tol && !/약 몇/.test(q)) out.push('어림 문제에 약이 없음');
  if (!p.tol && /약 몇/.test(q)) out.push('정확한 문제에 약');
  if (p.dp != null && nearHalf(p.raw, p.dp)) out.push('반올림 경계');
  if (!p.neg && p.answer < 0) out.push('음수 답');
  if (!Number.isFinite(p.answer) || Math.abs(p.answer) > 9e15) out.push('답 범위');
  if (p.answer === 0) out.push('답이 0');
  return out;
}

export function selfTest(o: { log?: (s: string) => void; per?: number } = {}): boolean {
  const log = o.log || (() => {});
  const PER = o.per || 2000;
  let fail = 0;
  const bad = (msg: string) => {
    if (fail < 40) log('  실패: ' + msg);
    fail++;
  };
  const t0 = Date.now();

  // 1) 표기 왕복
  const R = makeRng('fmt');
  for (let i = 0; i < 20000; i++) {
    const d = R.int(1, 16);
    let n = R.int(0, 9);
    for (let k = 1; k < d; k++) n = n * 10 + R.int(0, 9);
    if (R.chance(0.3)) n = Math.round(n / 1e4) * 1e4;
    if (!Number.isSafeInteger(n)) continue;
    const a = parseKR(fmtKR(n));
    if (!a || a.value !== n || (n > 0 && !a.canonical)) bad(`fmtKR 왕복 ${n} ${fmtKR(n)}`);
    const b = parseKR(fmtKR(n, { comma: true, space: false }));
    if (!b || b.value !== n) bad(`fmtKR 쉼표 왕복 ${n}`);
    if (Number(fmtNum(n).replace(/,/g, '')) !== n) bad(`fmtNum 왕복 ${n}`);
    if (n >= 1e6) {
      const m = roundSig(n, R.int(1, 4));
      if (m >= 1e6 && m < 1e15 && parseEN(fmtEN(m)) !== m) bad(`fmtEN 왕복 ${m} ${fmtEN(m)} ${parseEN(fmtEN(m))}`);
    }
  }
  if (fmtKR(312323425321) !== '3123억 2342만 5321') bad('예시 312,323,425,321');
  if (fmtKR(1e8) !== '1억') bad('1억');
  if (parseEN('100 million') !== 1e8) bad('1억 = 100 million');
  if (fmtEN(1e8) !== '100 million') bad('1억 표기');
  if (parseKR('31232342만5321')!.canonical) bad('끊어 쓰기 검사');
  if (parseKR('3억5조') !== null) bad('단위 순서 검사');
  if (parseKR('0.5조')!.value !== 5e11) bad('소수 조');

  // 2) 분야마다 2,000문제: 독립 계산, 채점, 문장
  const stats: Record<string, { n: number; distinct: Set<string>; lint: number }> = {};
  for (const S of SKILLS) {
    const st = (stats[S.id] = { n: 0, distinct: new Set<string>(), lint: 0 });
    for (let i = 0; i < PER; i++) {
      const L = (i % S.levels.length) + 1;
      const types = S.levels[L - 1].types;
      const t = types[i % types.length];
      const p = makeProblem(S.id, L, t, `test|${i}`);
      st.n++;
      st.distinct.add(p.q);
      const key = solveKey(p);
      const fn = SOLVE[key];
      if (!fn) {
        bad(`풀이 없음 ${key}`);
        continue;
      }
      const raw = fn(p.vars);
      if (Math.abs(raw - p.raw) > 1e-6 * Math.max(1, Math.abs(raw))) bad(`독립 계산 다름 ${key} ${raw} ${p.raw} | ${p.q}`);
      if (p.dp != null) {
        if (roundTo(raw, p.dp) !== p.answer) bad(`반올림 다름 ${key} ${raw} ${p.answer}`);
      } else if (!p.tol && Math.abs(raw - p.answer) > 1e-9 * Math.max(1, Math.abs(raw))) bad(`정확한 답 다름 ${key}`);
      if (!p.tol && !p.dp && p.input === 'kr' && Math.round(p.answer) !== p.answer) bad(`한글 단위 답이 정수가 아님 ${key} ${p.answer}`);
      // 채점: 정답은 맞고, 한 칸 어긋난 답은 틀린다
      const c = check(p, p.typed);
      if (!c.ok) bad(`정답이 틀림 ${key} "${p.typed}" ${c.reason} | ${p.q}`);
      if (p.input === 'kr' || p.form) {
        const sp = check(p, p.form ? fmtKR(p.answer, { comma: true }) : fmtNum(p.answer));
        if (!sp.ok) bad(`쉼표와 띄어쓰기 답이 틀림 ${key}`);
      }
      if (p.tol) {
        const lim = p.tol.rel != null ? Math.abs(p.raw) * p.tol.rel : p.tol.abs!;
        if (!check(p, String(p.raw + lim * 0.9)).ok) bad(`허용 오차 안이 틀림 ${key}`);
        if (check(p, String(p.raw + lim * 1.3)).ok) bad(`허용 오차 밖이 맞음 ${key}`);
      } else {
        const stepv = p.dp != null ? Math.pow(10, -p.dp) : Number.isInteger(p.answer) ? 1 : Math.pow(10, -(String(p.answer).split('.')[1] || '').length);
        const off = clean(p.answer + stepv);
        if (check(p, p.input === 'kr' && p.form ? fmtKR(off, { space: false }) : String(off)).ok) bad(`한 칸 어긋난 답이 맞음 ${key} ${off}`);
        if (p.form && check(p, String(p.answer)).ok && p.answer >= 1e4) bad(`끊어 쓰지 않은 답이 맞음 ${key}`);
      }
      // 보여 주는 정답이 다시 읽힌다
      const shownNum = p.show.replace(/^약 /, '').replace(new RegExp(joinUnit(p.unit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '');
      const back = p.input === 'kr' ? parseKR(shownNum) && parseKR(shownNum)!.value : Number(shownNum.replace(/,/g, ''));
      if (!p.tol && back !== p.answer) bad(`보이는 정답이 다름 ${key} ${p.show}`);
      const issues = lint(p);
      if (issues.length) {
        st.lint++;
        bad(`문장 ${key} [${issues.join(', ')}] ${p.q} / ${p.note}`);
      }
    }
  }
  // 3) 같은 씨앗은 같은 세트, 세트마다 유형 묶음은 같다
  for (const S of SKILLS) {
    for (let L = 1; L <= S.levels.length; L++) {
      const a = JSON.stringify(makeSet(S.id, L, '2026-11-21'));
      const b = JSON.stringify(makeSet(S.id, L, '2026-11-21'));
      if (a !== b) bad(`세트가 매번 다름 ${S.id} ${L}`);
      const want = S.levels[L - 1].types.slice().sort().join();
      for (const day of ['2026-11-22', '2026-12-01', '2027-01-15']) {
        const set = makeSet(S.id, L, day);
        if (set.map((p) => p.type).sort().join() !== want) bad(`유형 묶음 다름 ${S.id} ${L}`);
        if (new Set(set.map((p) => p.q)).size !== set.length) bad(`세트 안 중복 ${S.id} ${L}`);
      }
    }
  }
  // 4) 하루 두 분야: 한 주에 분야마다 두 번
  const cnt: Record<string, number> = {};
  for (let d = 15; d < 22; d++) dailyPair(`2026-11-${d}`).forEach((k) => (cnt[k] = (cnt[k] || 0) + 1));
  if (ORDER.some((k) => cnt[k] !== 2)) bad('하루 두 분야 순환 ' + JSON.stringify(cnt));
  // 5) 수준 규칙
  const ss = (L: number, ok: number, med: number, n = 6) => ({ k: 'fx', lv: L, n, ok, med });
  if (judge('fx', 2, [ss(2, 6, 10), ss(2, 6, 11), ss(2, 5, 12)]).change !== 1) bad('올림 규칙');
  if (judge('fx', 2, [ss(2, 6, 10), ss(2, 6, 30), ss(2, 6, 25)]).change !== 0) bad('느리면 그대로');
  if (judge('fx', 2, [ss(1, 6, 5), ss(2, 6, 10), ss(2, 6, 10)]).change !== 0) bad('이 수준 3세트 전에는 그대로');
  if (judge('fx', 2, [ss(2, 3, 10), ss(2, 2, 12)]).change !== -1) bad('내림 규칙');
  if (judge('fx', 1, [ss(1, 1, 10), ss(1, 2, 12)]).change !== 0) bad('1 아래로 내려가지 않음');
  const sm = summarize([
    { ms: 8200, ok: true },
    { ms: 12000, ok: true },
    { ms: 3000, ok: false },
    { ms: 10100, ok: true },
  ]);
  if (sm.med !== 10.1 || sm.best !== 8.2 || sm.ok !== 3 || sm.n !== 4) bad('세트 요약 ' + JSON.stringify(sm));
  // 6) 기록 다루기: 할당, 추가 학습, 수준 올림, 읽어 들이기
  {
    const day = '2026-11-21';
    const [a, b] = dailyPair(day);
    const fast = Array.from({ length: SET_SIZE }, () => ({ ms: 4000, ok: true }));
    let st = emptyNum(day);
    if (quotaDone(st, day) !== 0 || quotaLeft(st, day).join() !== [a, b].join()) bad('빈 기록의 할당');
    st = addSet(st, day, a, 1, fast, true, 't1').state;
    if (quotaDone(st, day) !== SET_SIZE || st.days[day].at) bad('할당 절반');
    const r2 = addSet(st, day, b, 1, fast, true, 't2');
    st = r2.state;
    if (quotaDone(st, day) !== DAILY_TOTAL || st.days[day].at !== 't2' || !r2.result.quota) bad('할당 채움');
    const r3 = addSet(st, day, a, 1, fast, true, 't3');
    if (r3.result.quota || r3.state.days[day].x !== SET_SIZE || quotaDone(r3.state, day) !== DAILY_TOTAL) bad('할당 뒤 세트는 추가 학습');
    st = r3.state;
    const r4 = addSet(st, day, a, 1, fast, false, 't4');
    if (r4.result.j.change !== 1 || r4.state.level[a] !== 2) bad('세 세트 뒤 수준 올림');
    if (setsOn(r4.state, day, a) !== 3 || setFor(r4.state, day, a).lv !== 2) bad('다음 세트의 수준');
    const back = migrateNum(JSON.parse(JSON.stringify(r4.state)), day);
    if (!back || JSON.stringify(back) !== JSON.stringify(r4.state)) bad('읽어 들이기 왕복');
    if (migrateNum({ sessions: [{ d: 'x', k: 'zz' }] }, day)!.sessions.length !== 0) bad('틀린 줄 버리기');
    // 추가 학습 분야: 오늘 안 푼 분야부터, 이어서 하면 다른 분야
    const e1 = extraSkill(r4.state, day);
    if (e1 === a || e1 === b) bad('추가 학습은 오늘 안 푼 분야부터 ' + e1);
    const s5 = addSet(r4.state, day, e1, 1, fast, true, 't5');
    if (s5.result.quota || s5.state.days[day].x !== 3 * SET_SIZE) bad('추가 학습 세트는 할당이 아님');
    const e2 = extraSkill(s5.state, day);
    if (e2 === e1 || e2 === a || e2 === b) bad('추가 학습 분야가 돌아가지 않음 ' + e2);
    let st7 = s5.state;
    for (let n = 0; n < 12; n++) st7 = addSet(st7, day, extraSkill(st7, day), 1, fast, false, 'x').state;
    if (ORDER.some((k) => setsOn(st7, day, k) < 2)) bad('추가 학습이 일곱 분야를 고루 돌지 않음');
    // 전체 숫자: 맞힌 문제 시간의 중앙값, 지난번 대비
    const slow = Array.from({ length: SET_SIZE }, (_, n) => ({ ms: 10000 + n * 100, ok: n !== 0 }));
    const o1 = overall([s5.result], slow);
    if (o1.n !== SET_SIZE || o1.ok !== SET_SIZE - 1 || o1.med !== 10.3 || o1.gain != null) bad('전체 숫자 ' + JSON.stringify(o1));
    const s6 = addSet(s5.state, day, e1, 1, fast.map((x) => ({ ...x, ms: 3000 })), false, 't6');
    const o2 = overall([s6.result], fast);
    if (o2.gain !== 1 || o2.prevMed !== 4) bad('지난번보다 줄어든 초 ' + JSON.stringify(o2));
    const days = perDayAll(s6.state.sessions);
    if (days.length !== 1 || days[0].d !== day) bad('날짜별 추이 ' + JSON.stringify(days));
  }

  for (const S of SKILLS) log(`  ${S.name.padEnd(8, ' ')} ${stats[S.id].n}문제, 서로 다른 문제 ${stats[S.id].distinct.size}, 문장 경고 ${stats[S.id].lint}`);
  log(fail ? `실패 ${fail}건` : `통과 (${Date.now() - t0}ms)`);
  return fail === 0;
}
