// Latti 의 말 고르기(순수 함수). motion-lab/v8/latti.js 의 lines 를 옮겼다(화면 요소 없이).
// 문구 자료는 docs/data/latti.json(store 가 읽는다). 화면에 띄우는 부품은 src/latti.tsx.
//
// 고르는 순서 (시안과 같다)
// 1. 후보: 오늘 줄(날짜 안에 든 것) + 늘 쓰는 줄
// 2. 상황(s), 조건(when), 빈칸 채우기(fill), 길이(fits) 를 거른다
// 3. 가장 높은 우선 단계와 한 단계 아래만 남긴다
// 4. 3일 안에 보인 줄과 이번에 막 보인 문장은 뺀다. 다 빠지면 가장 오래전에 보인 두 줄에서 고른다
// 5. 무게(w, 오늘 줄은 todayBoost 배)로 고르고, 아래 단계는 lowerTierShare 만큼만 나온다
import { kstHour, weekdayOf } from './dates';
import type { LattiData, LattiLine, LattiRules } from './lattiTypes';

export type LattiCtx = Record<string, string | number | boolean | null | undefined>;
export type LattiPick = { id: string; text: string; src: 'bank' | 'today'; tier: number };

export const DEFAULT_RULES: LattiRules = { maxLen: 40, maxSentences: 2, maxSentenceLen: 32, noRepeatDays: 3, todayBoost: 3, lowerTierShare: 0.3, sessionAvoid: 8 };

/** 같은 seed 면 늘 같은 수열을 내는 난수(FNV-1a 로 seed 를 만들고 mulberry32 로 이어 간다). */
export function rngOf(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문장 나누기: 마침표, 물음표, 느낌표 뒤 빈칸에서 자른다. */
export function sentences(t: string): string[] {
  return String(t)
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter(Boolean);
}

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** 상황에서 저절로 나오는 값. 날짜와 시는 한국 시각이다(기기 시간대와 상관없다). */
export function derive(ctx: LattiCtx, now: Date): LattiCtx {
  const c: LattiCtx = { ...ctx };
  if (c.hour == null) c.hour = kstHour(now);
  if (!c.date) c.date = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const h = Number(c.hour);
  if (!c.part) c.part = h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 22 ? 'evening' : 'night';
  const wd = weekdayOf(String(c.date));
  if (!c.day) c.day = DAYS[wd];
  if (c.weekend == null) c.weekend = wd === 0 || wd === 6;
  const total = Number(c.total);
  if (c.acc == null && total > 0 && c.right != null) c.acc = Math.round((Number(c.right) / total) * 100);
  if (c.left == null && c.totalParts != null && c.doneParts != null) c.left = Number(c.totalParts) - Number(c.doneParts);
  return c;
}

/* 조건: 3, ">=3", "3..9", "%5", "a|b" (또는), ">=10&%5" (그리고), true/false, 배열(모두) */
function atom(a: string, cv: unknown): boolean {
  const n = Number(cv);
  let m: RegExpMatchArray | null;
  if ((m = a.match(/^(>=|<=|!=|>|<|=)(-?\d+(?:\.\d+)?)$/))) {
    if (!Number.isFinite(n)) return false;
    const v = +m[2];
    switch (m[1]) {
      case '>=':
        return n >= v;
      case '<=':
        return n <= v;
      case '!=':
        return n !== v;
      case '>':
        return n > v;
      case '<':
        return n < v;
      default:
        return n === v;
    }
  }
  if ((m = a.match(/^(-?\d+)\.\.(-?\d+)$/))) return Number.isFinite(n) && n >= +m[1] && n <= +m[2];
  if ((m = a.match(/^%(\d+)$/))) return Number.isFinite(n) && n % +m[1] === 0;
  return String(cv) === a;
}

/** 조건 cond 를 값 v 가 채우는지. */
export function test(cond: unknown, v: unknown): boolean {
  if (Array.isArray(cond)) return cond.every((x) => test(x, v));
  if (typeof cond === 'boolean') return !!v === cond;
  if (v === undefined || v === null) return false;
  if (typeof cond === 'number') return Number(v) === cond;
  return String(cond)
    .split('|')
    .some((alt) => alt.split('&').every((x) => atom(x.trim(), v)));
}

/* 조사: 앞말의 마지막 소리를 보고 고른다 */
const PAIRS: [string, string][] = [
  ['을', '를'],
  ['이', '가'],
  ['은', '는'],
  ['과', '와'],
  ['으로', '로'],
  ['이에요', '예요'],
  ['이라', '라'],
  ['이랑', '랑'],
  ['이나', '나'],
  ['이죠', '죠'],
];

function final(word: string): { has: boolean; rieul: boolean } {
  const s = String(word);
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const j = (code - 0xac00) % 28;
      return { has: j !== 0, rieul: j === 8 };
    }
    if (ch === '%') return { has: false, rieul: false }; // 퍼센트
    if (/[0-9]/.test(ch)) {
      const d = +ch;
      // 끝자리 0 은 십·백·천·만·영 모두 받침이 있다.
      return { has: [0, 1, 3, 6, 7, 8].includes(d), rieul: [1, 7, 8].includes(d) };
    }
    if (/[A-Za-z]/.test(ch)) {
      let k = i;
      while (k > 0 && /[A-Za-z]/.test(s[k - 1])) k--;
      const run = s.slice(k, i + 1);
      const acronym = run === run.toUpperCase();
      const L = ch.toLowerCase();
      if (acronym) return { has: 'lmnr'.includes(L), rieul: 'lr'.includes(L) }; // 엘 엠 엔 알
      if (run.toLowerCase().endsWith('ng')) return { has: true, rieul: false };
      return { has: 'lmn'.includes(L), rieul: L === 'l' }; // 영어 낱말은 어림값이다
    }
    // 괄호, 따옴표, 빈칸 같은 것은 건너뛰고 앞 글자를 본다.
  }
  return { has: false, rieul: false };
}

/** word 뒤에 붙일 조사. p 는 짝 가운데 아무 쪽(을/를, 이/가, (으)로 ...). 모르는 조사는 그대로. */
export function josa(word: string, p: string): string {
  const pair = PAIRS.find((x) => x.includes(p));
  if (!pair) return p;
  const f = final(word);
  if (pair[0] === '으로') return f.has && !f.rieul ? '으로' : '로';
  return f.has ? pair[0] : pair[1];
}

/** 글자와 읽는 소리가 다른 이름. ctx 에 {key}Read 가 없을 때 쓴다(WACC 는 '왝'이라 '을'). */
const READ: Record<string, string> = { WACC: '왝' };

const num = (v: number) => (Number.isInteger(v) ? (Math.abs(v) >= 10000 ? v.toLocaleString('ko-KR') : String(v)) : String(Math.round(v * 10) / 10));

/** {key} 와 {key|조사} 를 채운다. 값이 하나라도 없으면 null. */
export function fill(t: string, ctx: LattiCtx): string | null {
  let ok = true;
  const out = t.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (_m, k: string, p: string | undefined) => {
    const v = ctx[k];
    if (v === undefined || v === null || v === '' || typeof v === 'boolean' || (typeof v === 'number' && !Number.isFinite(v))) {
      ok = false;
      return '';
    }
    const s = typeof v === 'number' ? num(v) : String(v);
    if (!p) return s;
    const read = ctx[k + 'Read'];
    return s + josa(typeof read === 'string' && read ? read : (READ[s] ?? s), p);
  });
  return ok ? out : null;
}

const len = (s: string) => [...s].length;

/** 채운 뒤의 길이 검사: 전체 maxLen, 문장 수 maxSentences, 문장마다 maxSentenceLen. */
export function fits(text: string, rules: LattiRules = DEFAULT_RULES): boolean {
  const ss = sentences(text);
  return len(text) <= rules.maxLen && ss.length <= rules.maxSentences && ss.every((x) => len(x) <= rules.maxSentenceLen);
}

/** 문구 검사(latti.js lint 와 같다). 빈 배열이면 통과. */
export function lint(t: string, rules: LattiRules = DEFAULT_RULES, o: { allowLatin?: boolean } = {}): string[] {
  const out: string[] = [];
  const plain = t.replace(/\{[^}]+\}/g, '');
  if (/더\s*풀기/.test(t)) out.push('금지어: 더 풀기');
  if (/[—–]/.test(t)) out.push('긴 줄표');
  if (/[→←⇒⇐↑↓➜]|->|=>/.test(t)) out.push('화살표');
  if ((t.match(/!/g) || []).length > 1) out.push('느낌표 둘 이상');
  if (/\p{Extended_Pictographic}/u.test(t)) out.push('이모지');
  const ss = sentences(t);
  const sv = sentences(t.replace(/\{\w+\|([^}]+)\}/g, '0$1').replace(/\{\w+\}/g, '0'));
  if (ss.length > rules.maxSentences) out.push(`문장 ${ss.length}개`);
  const ends = (x: string, i: number) => /(요|죠)([.!?]|\?!)?$/.test(x) || (i < sv.length - 1 && /!$/.test(x) && len(x) <= 10);
  if (!sv.every(ends)) out.push('해요체 끝맺음 아님');
  if (/[,.?!][^\s.?!]/.test(plain.replace(/\d[,.]\d/g, '0'))) out.push('문장부호 뒤 빈칸 없음');
  if (/누르|눌러|탭하|스와이프|화면|버튼|아래쪽|위쪽|표시돼|[을를] 의미해요|[을를] 뜻해요|오른쪽|왼쪽/.test(plain)) out.push('화면 설명');
  if (/왜 안|안 왔|놓쳤|게을|실망|빠졌|이제야|기다렸잖/.test(plain)) out.push('죄책감');
  if (/최고|천재|대박|레전드|미쳤|역대급/.test(plain)) out.push('부풀림');
  if (!o.allowLatin && /[a-z]{2,}/.test(plain.replace(/Latticework|Latti/g, ''))) out.push('영어');
  if (!/\{/.test(t)) {
    if (len(t) > rules.maxLen) out.push(`${len(t)}자`);
    ss.forEach((x) => len(x) > rules.maxSentenceLen && out.push(`한 문장 ${len(x)}자`));
  }
  return out;
}

type Cand = { l: LattiLine; text: string; p: number; src: 'bank' | 'today' };

/** 하루 묶음(daily 목록과 예전 today) 가운데 date 에 쓸 수 있는 줄. 묶음의 date 부터 줄(또는 묶음)의 until 까지. */
function todayLines(data: LattiData, date: string): LattiLine[] {
  const batches = [...(data.today ? [data.today] : []), ...(Array.isArray(data.daily) ? data.daily : [])];
  const out: LattiLine[] = [];
  const ids = new Set<string>();
  // 뒤에 덧붙인 묶음이 먼저(같은 id 가 겹치면 새 묶음의 줄을 쓴다)
  for (let i = batches.length - 1; i >= 0; i--) {
    const td = batches[i];
    if (!td || !Array.isArray(td.lines) || !td.date || date < td.date) continue;
    for (const l of td.lines) {
      if (!l || ids.has(l.id) || date > (l.until || td.until || td.date)) continue;
      ids.add(l.id);
      out.push(l);
    }
  }
  return out;
}

function candidates(data: LattiData, sit: string, c: LattiCtx, rules: LattiRules): Cand[] {
  const date = String(c.date);
  const pool: [LattiLine, 'bank' | 'today'][] = [...todayLines(data, date).map((l) => [l, 'today'] as [LattiLine, 'today']), ...(data.bank ?? []).map((l) => [l, 'bank'] as [LattiLine, 'bank'])];
  const out: Cand[] = [];
  for (const [l, src] of pool) {
    const ss = Array.isArray(l.s) ? l.s : [l.s];
    if (!ss.includes(sit)) continue;
    if (l.when && !Object.keys(l.when).every((k) => test(l.when![k], c[k]))) continue;
    const text = fill(l.t, c);
    if (!text || !fits(text, rules)) continue;
    out.push({ l, text, p: l.p || 0, src });
  }
  return out;
}

/**
 * 상황에 맞는 줄 하나를 고른다. sit 이 여럿이면 앞에서부터 맞는 줄이 있는 첫 상황을 쓴다.
 * hist 는 줄 id 별로 마지막에 보인 시각, recent 는 이번에 막 보인 문장들(바로 앞 문장이 마지막). 맞는 줄이 없으면 null.
 */
export function choose(data: LattiData, sit: string | string[], ctx: LattiCtx, o: { rng: () => number; now: number; hist: Record<string, number>; recent: string[] }): LattiPick | null {
  const rules: LattiRules = { ...DEFAULT_RULES, ...(data.rules ?? {}) };
  const c = derive(ctx, new Date(o.now));
  let cands: Cand[] = [];
  for (const s of Array.isArray(sit) ? sit : [sit]) {
    cands = candidates(data, s, c, rules);
    if (cands.length) break;
  }
  if (!cands.length) return null;
  const H = o.hist;
  const maxP = Math.max(...cands.map((x) => x.p));
  const tier = cands.filter((x) => x.p >= maxP - 1);
  const cut = o.now - rules.noRepeatDays * 864e5;
  const last = o.recent[o.recent.length - 1];
  let fresh = tier.filter((x) => !((H[x.l.id] ?? 0) > cut) && !o.recent.includes(x.text));
  if (!fresh.length) {
    // 다 최근에 보였다: 가장 오래전에 보인 두 줄 가운데서 고르되 바로 앞 문장은 피한다.
    const top = tier.filter((x) => x.p === maxP && x.text !== last);
    fresh = (top.length ? top : tier)
      .slice()
      .sort((a, b) => (H[a.l.id] || 0) - (H[b.l.id] || 0))
      .slice(0, 2);
  }
  const wOf = (x: Cand) => (x.l.w || 1) * (x.src === 'today' ? rules.todayBoost : 1);
  const hi = fresh.filter((x) => x.p === maxP);
  const lo = fresh.filter((x) => x.p < maxP);
  const group = hi.length && lo.length ? (o.rng() < rules.lowerTierShare ? lo : hi) : hi.length ? hi : lo;
  let r = o.rng() * group.reduce((s, x) => s + wOf(x), 0);
  let pick = group[group.length - 1];
  for (const x of group) {
    r -= wOf(x);
    if (r <= 0) {
      pick = x;
      break;
    }
  }
  return { id: pick.l.id, text: pick.text, src: pick.src, tier: pick.p };
}

/**
 * 전에 고른 줄(id)이 지금 ctx 에서도 맞는지. 맞으면 지금 값으로 다시 채운 문장, 아니면 null.
 * 같은 순간에 숫자가 바뀌었거나 조건이 더는 맞지 않으면 새로 골라야 한다(지난 숫자를 보이지 않게).
 */
export function still(data: LattiData, id: string, sit: string | string[], ctx: LattiCtx, now: number): string | null {
  const rules: LattiRules = { ...DEFAULT_RULES, ...(data.rules ?? {}) };
  const c = derive(ctx, new Date(now));
  for (const s of Array.isArray(sit) ? sit : [sit]) {
    const hit = candidates(data, s, c, rules).find((x) => x.l.id === id);
    if (hit) return hit.text;
  }
  return null;
}
