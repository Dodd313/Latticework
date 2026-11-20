// 복습(영단어, Latticework)의 출제와 기억 계산. 저장은 하지 않는다. 저장과 불러오기는 src/store.tsx 가 맡는다.
//
// 기억 계산은 공개된 간격 반복 방식(FSRS 4.5)의 기본값을 쓴다.
// 항목마다 난이도(d)와 안정성(s)을 두고, 기억할 확률이 90% 아래로 내려가는 날을 다음 복습일로 잡는다.
// 안정성 s 는 "기억 확률이 90%가 될 때까지 걸리는 일수"와 같다.
import { addDays } from './dates';

export type Concept = { id: string; name: string; en?: string; field?: string; topic?: string };

/** lv 1 인식 · 2 특징 · 3 구분 · 4 적용 · 5 설명. t 는 mc(4지선다), ox(맞다·틀리다), rc(떠올리고 스스로 채점). */
export type LatQuestion = { id: string; cid: string; lv: number; t: 'mc' | 'ox' | 'rc'; q: string; pre?: string; o?: string[]; a?: number | boolean; h?: string; w?: string; r?: string };

export type Vocab = { id: string; deck: 'fin' | 'gen' | 'toeic'; term: string; level: string; ko: string; def: string; ex?: string; similar?: string; formal?: string; group?: string; pos?: string };

/** 오늘 이미 낸 문제와 항목. 같은 날 같은 문제를 다시 내지 않는 데 쓴다. */
export type Asked = { keys: Set<string>; units: Set<string> };
const NONE: Asked = { keys: new Set(), units: new Set() };

export type StudyData = { version: number; updatedAt?: string; concepts: Concept[]; questions: LatQuestion[]; vocab: Vocab[] };

export type Section = 'lat' | 'voc';

/** 항목 하나의 기억 상태. 개념 하나, 표현 하나가 단위다. */
export type Card = {
  d: number; // 난이도 1~10
  s: number; // 안정성(일)
  last: string; // 마지막으로 푼 시각
  due: string; // 다음 복습일 (YYYY-MM-DD)
  reps: number;
  lapses: number;
  asked: Record<string, number>; // 문제 유형별로 낸 횟수. 같은 유형만 되풀이하지 않게 한다
};

export type StudyDay = { lat: number; voc: number; latGoal: number; vocGoal: number; latDoneAt?: string; vocDoneAt?: string; extra?: number };

export type StudyState = { v: 1; start: string; cards: Record<string, Card>; days: Record<string, StudyDay>; xp: number };

/** 풀이 기록 한 줄. g 는 채점: 1 틀림 · 2 힌트 보고 맞힘 또는 애매함 · 3 맞힘 */
export type LogRow = { t: string; u: string; k: Section; q: string; ok: boolean; n: number; sec: number; g: 1 | 2 | 3 };

export const LAT_GOAL = 5;
export const VOC_NEW_PER_DAY = 6;
export const VOC_REVIEW_CAP = 10;
export const LAT_NEW_PER_DAY = 3;

export const LEVEL_NAME: Record<number, string> = { 1: '인식', 2: '특징', 3: '구분', 4: '적용', 5: '설명' };

export function emptyStudy(today: string): StudyState {
  return { v: 1, start: today, cards: {}, days: {}, xp: 0 };
}

// ---------- 기억 계산 ----------
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const d0 = (g: number) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function daysBetween(fromIso: string, to: Date): number {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (to.getTime() - t) / 86400000);
}

/** 지금 이 항목을 기억하고 있을 확률. 한 번도 안 푼 항목은 0. */
export function recall(card: Card | undefined, now: Date): number {
  if (!card) return 0;
  return Math.pow(1 + (FACTOR * daysBetween(card.last, now)) / card.s, DECAY);
}

/** 한 번 풀고 난 뒤의 기억 상태. g: 1 틀림 · 2 어렵게 맞힘 · 3 맞힘 */
export function review(card: Card | undefined, g: 1 | 2 | 3, now: Date, today: string, typeKey: string): Card {
  let d: number;
  let s: number;
  if (!card) {
    d = d0(g);
    s = W[g - 1];
  } else {
    const r = recall(card, now);
    d = clamp(W[7] * d0(3) + (1 - W[7]) * (card.d - W[6] * (g - 3)), 1, 10);
    if (g === 1) {
      s = Math.min(card.s, W[11] * Math.pow(card.d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
    } else {
      const hard = g === 2 ? W[15] : 1;
      s = card.s * (1 + Math.exp(W[8]) * (11 - card.d) * Math.pow(card.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard);
    }
  }
  s = clamp(s, 0.1, 3650);
  const interval = g === 1 ? 1 : Math.max(1, Math.round(s));
  const asked = { ...(card?.asked ?? {}) };
  asked[typeKey] = (asked[typeKey] ?? 0) + 1;
  return { d, s, last: now.toISOString(), due: addDays(today, interval), reps: (card?.reps ?? 0) + 1, lapses: (card?.lapses ?? 0) + (g === 1 ? 1 : 0), asked };
}

// ---------- 문제 한 건 ----------
/** 화면이 그리는 문제의 공통 모양 */
export type Q = {
  key: string; // 기록에 남는 문제 이름
  unit: string; // 기억 단위 (개념 id, 표현 id)
  sect: Section;
  type: string; // 유형 키
  kicker: string;
  q: string;
  pre?: string;
  options?: string[];
  answer?: number;
  hint?: string;
  explain?: string;
  reveal?: string; // 스스로 채점하는 문제의 기준 답
  retry?: boolean; // 틀려서 세션 끝에 다시 나온 문제
};

// 날짜와 이름으로 정해지는 난수. 같은 날 같은 문제는 보기 순서가 같다.
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function latQ(c: Concept, x: LatQuestion): Q {
  const kicker = [c.field, c.name].filter(Boolean).join(' · ');
  const base = { key: x.id, unit: c.id, sect: 'lat' as Section, type: `lv${x.lv}`, kicker, q: x.q, pre: x.pre };
  if (x.t === 'rc') return { ...base, reveal: x.r ?? '' };
  if (x.t === 'ox') return { ...base, options: ['맞다', '틀리다'], answer: x.a ? 0 : 1, hint: x.h, explain: x.w };
  return { ...base, options: x.o ?? [], answer: typeof x.a === 'number' ? x.a : 0, hint: x.h, explain: x.w };
}

/** 그 개념에서 가장 덜 낸 유형의 문제를 고른다. 처음 보는 개념은 쉬운 유형부터. */
function pickLatQuestion(c: Concept, qs: LatQuestion[], card: Card | undefined, skip: Set<string>): LatQuestion | null {
  // 자기 말로 설명하는 문제(rc)는 내지 않는다 (2026-11-19 사용자 결정).
  const own = qs.filter((x) => x.cid === c.id && x.t !== 'rc' && !skip.has(x.id));
  if (own.length === 0) return null;
  const count = (x: LatQuestion) => card?.asked?.[`lv${x.lv}`] ?? 0;
  return own.slice().sort((a, b) => count(a) - count(b) || a.lv - b.lv)[0];
}

/**
 * Latticework 세션.
 * 하루 분량(daily): 복습할 때가 된 개념을 기억이 약한 순서로 먼저 넣고, 남는 자리에 새 개념을 넣는다.
 * 더 풀기(weak): 오늘 아직 안 나온 개념을 먼저 고른다. 복습할 개념, 새 개념, 나머지 순이다.
 * 어느 쪽이든 오늘 이미 낸 문제는 다시 내지 않고, 한 세션에서 한 개념은 한 번만 나온다(자리가 남을 때만 다른 유형으로 한 번 더).
 */
export function buildLat(data: StudyData, state: StudyState, today: string, now: Date, count: number, mode: 'daily' | 'weak' = 'daily', asked: Asked = NONE): Q[] {
  const seen = data.concepts.filter((c) => state.cards[c.id]);
  const fresh = data.concepts.filter((c) => !state.cards[c.id]);
  const weakest = seen.slice().sort((a, b) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now));
  const due = weakest.filter((c) => state.cards[c.id].due <= today);
  const untouched = (c: Concept) => !asked.units.has(c.id);

  const order: Concept[] = [];
  const push = (c: Concept) => {
    if (!order.includes(c)) order.push(c);
  };
  if (mode === 'daily') {
    due.forEach(push);
    fresh.slice(0, LAT_NEW_PER_DAY).forEach(push);
    weakest.forEach(push);
    fresh.forEach(push);
  } else {
    due.filter(untouched).forEach(push);
    fresh.forEach(push);
    weakest.filter(untouched).forEach(push);
    weakest.forEach(push);
  }

  const out: Q[] = [];
  const used = new Set<string>(asked.keys);
  const add = (c: Concept) => {
    if (out.length >= count) return;
    const x = pickLatQuestion(c, data.questions, state.cards[c.id], used);
    if (!x) return;
    used.add(x.id);
    out.push(latQ(c, x));
  };
  order.forEach(add);
  // 개념이 모자라 자리가 남을 때만, 이번에 나온 개념을 다른 유형으로 한 번 더 묻는다.
  if (out.length < count) order.slice(0, count).forEach(add);
  return out;
}

const REGISTERS = ['친구끼리', '일반', '격식', '속어'];
const DECK_NAME: Record<Vocab['deck'], string> = { fin: '금융영어', gen: '일반회화', toeic: '토익 어휘' };

function vocTypes(v: Vocab): string[] {
  // 격식 고르기와 우리말에서 떠올리기는 내지 않는다 (2026-11-19 사용자 결정).
  const types = ['meaning', 'define'];
  if (v.ex && v.ex.toLowerCase().includes(v.term.replace(/\s*\(.*?\)/g, '').toLowerCase())) types.push('cloze');
  return types;
}

function vocQ(v: Vocab, type: string, data: StudyData, seed: string): Q {
  const rand = rng(`${seed}:${v.id}:${type}`);
  const kicker = DECK_NAME[v.deck];
  const base = { key: `${v.id}:${type}`, unit: v.id, sect: 'voc' as Section, type, kicker };
  // 오답 보기: 같은 단어장에서, 되도록 같은 묶음에서 고른다.
  const pool = data.vocab.filter((x) => x.id !== v.id && x.deck === v.deck);
  // 같은 묶음(금융영어의 단원, 토익 어휘의 품사)이 가까운 보기다.
  const kin = (x: Vocab) => (v.group ? x.group === v.group : v.pos ? x.pos === v.pos : false);
  const near = shuffle(pool.filter(kin), rand);
  const far = shuffle(pool.filter((x) => !kin(x)), rand);
  const others = [...near, ...far].slice(0, 3);
  const withAnswer = (right: string, wrong: string[]) => {
    const options = shuffle([right, ...wrong], rand);
    return { options, answer: options.indexOf(right) };
  };
  const bare = v.term.replace(/\s*\(.*?\)/g, '');
  const detail = [v.pos ? `${v.term} (${v.pos}) ${v.ko}` : `${v.term}: ${v.ko}`, v.def, v.deck === 'toeic' && v.ex ? `예문: ${v.ex}` : '', v.similar ? `비슷한 표현: ${v.similar}` : '', v.formal ? `격식 있는 표현: ${v.formal}` : ''].filter(Boolean).join('\n');

  if (type === 'meaning') {
    return { ...base, q: v.term, ...withAnswer(v.ko, others.map((x) => x.ko)), hint: v.def, explain: detail };
  }
  if (type === 'define') {
    return { ...base, q: '이 정의에 맞는 표현은 무엇입니까?', pre: v.def, ...withAnswer(v.term, others.map((x) => x.term)), hint: `우리말 뜻: ${v.ko}`, explain: detail };
  }
  if (type === 'cloze') {
    const blanked = (v.ex ?? '').replace(new RegExp(bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
    return { ...base, q: '빈칸에 들어갈 표현은 무엇입니까?', pre: blanked, ...withAnswer(bare, others.map((x) => x.term.replace(/\s*\(.*?\)/g, ''))), hint: `우리말 뜻: ${v.ko}`, explain: detail };
  }
  if (type === 'register') {
    return { ...base, q: `"${v.term}"은 어떤 자리에서 쓰는 표현입니까?`, pre: v.ex, options: REGISTERS, answer: REGISTERS.indexOf(v.level), hint: v.formal ? `격식을 갖추면 이렇게 말합니다: ${v.formal}` : v.def, explain: detail };
  }
  return { ...base, q: `"${v.ko}"를 영어로 떠올려 보세요.`, pre: v.deck === 'gen' ? `쓰는 자리: ${v.level}` : undefined, reveal: [v.term, v.def, v.ex ?? ''].filter(Boolean).join('\n') };
}

/**
 * 영단어 세션. 복습할 때가 된 표현(기억이 약한 순)과 새 표현을 섞는다.
 * 더 풀기(weak)는 오늘 아직 안 나온 표현을 먼저 고른다. 오늘 이미 낸 문제는 다시 내지 않는다.
 */
export function buildVoc(data: StudyData, state: StudyState, today: string, now: Date, mode: 'daily' | 'weak' = 'daily', count?: number, asked: Asked = NONE): Q[] {
  const seen = data.vocab.filter((v) => state.cards[v.id]);
  const fresh = data.vocab.filter((v) => !state.cards[v.id]);
  const weakest = seen.slice().sort((a, b) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now));
  const due = weakest.filter((v) => state.cards[v.id].due <= today);
  const untouched = (v: Vocab) => !asked.units.has(v.id);
  // 새 표현은 단어장을 번갈아 가져온다. 토익 어휘를 가장 자주 넣는다.
  const decks: Record<Vocab['deck'], Vocab[]> = { toeic: [], gen: [], fin: [] };
  fresh.forEach((v) => decks[v.deck]?.push(v));
  const turn: Vocab['deck'][] = ['toeic', 'gen', 'toeic', 'fin'];
  const mixed: Vocab[] = [];
  for (let i = 0, guard = 0; mixed.length < fresh.length && guard < fresh.length * 8; i++, guard++) {
    const next = decks[turn[i % turn.length]].shift();
    if (next) mixed.push(next);
  }

  let order: Vocab[];
  if (mode === 'daily') order = [...due.slice(0, VOC_REVIEW_CAP), ...mixed.slice(0, VOC_NEW_PER_DAY)];
  else order = [...due.filter(untouched), ...mixed, ...weakest.filter(untouched), ...weakest];
  order = order.filter((v, i) => order.indexOf(v) === i);

  const limit = count ?? order.length;
  const out: Q[] = [];
  for (const v of order) {
    if (out.length >= limit) break;
    const card = state.cards[v.id];
    // 처음 보는 표현은 뜻부터. 그 뒤로는 가장 덜 낸 유형. 오늘 이미 낸 문제는 건너뛴다.
    const types = (card ? vocTypes(v).slice().sort((a, b) => (card.asked?.[a] ?? 0) - (card.asked?.[b] ?? 0)) : ['meaning', ...vocTypes(v)]).filter((t) => !asked.keys.has(`${v.id}:${t}`));
    if (types.length === 0) continue;
    out.push(vocQ(v, types[0], data, today));
  }
  return shuffle(out, rng(`${today}:voc:${out.length}:${asked.keys.size}`));
}

/** 오늘 영단어 목표 문항 수. 하루에 한 번 정해 두고 바꾸지 않는다. */
export function vocGoalFor(data: StudyData, state: StudyState, today: string, now: Date): number {
  return buildVoc(data, state, today, now, 'daily').length;
}

export function xpFor(g: 1 | 2 | 3): number {
  return g === 3 ? 10 : g === 2 ? 6 : 2;
}

export function levelOf(xp: number): number {
  return Math.floor(Math.sqrt(xp / 60)) + 1;
}
