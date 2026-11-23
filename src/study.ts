// 복습(영단어, Latticework)의 출제와 기억 계산. 저장은 하지 않는다. 저장과 불러오기는 src/store.tsx 가 맡는다.
//
// 기억 계산은 공개된 간격 반복 방식(FSRS 4.5)의 기본값을 쓴다.
// 항목마다 난이도(d)와 안정성(s)을 두고, 기억할 확률이 90% 아래로 내려가는 날을 다음 복습일로 잡는다.
// 안정성 s 는 "기억 확률이 90%가 될 때까지 걸리는 일수"와 같다.
import { addDays, kstDate } from './dates';

/** 지식 분류의 등급: 학문 · 분과 · 주제. 개념은 study.json 의 concepts 에 따로 있다. */
export type TaxRank = 'discipline' | 'branch' | 'topic';

/** 지식 분류의 마디 하나. color 와 domain 은 학문에만 있다. */
/** was 는 이 마디의 예전 id. 분과 이름과 구성을 바꿀 때(예: 기준 개론서를 따라 고칠 때) 예전 마디를 이미 본 사람에게 해금을 다시 띄우지 않으려고 둔다. */
export type TaxNode = { id: string; ko: string; short?: string; en?: string; rank: TaxRank; parent: string | null; color?: string; domain?: string; was?: string[] };

/** node 는 이 개념이 달린 마디(분과나 주제). field, topic 은 예전 자료에만 있고 읽지 않는다. */
/**
 * 개념 하나. 약어 개념은 abbr(약어)와 full(영어 풀네임)을 두고, name 은 늘 "약어 (풀네임)" 꼴이다(2026-11-23 소유자 결정).
 * 문제 글에서도 약어가 처음 나올 때는 "약어(풀네임)"으로 쓴다. 풀네임이 답을 드러내는 "약자 묻기" 문제는 만들지 않는다.
 */
/** card 는 지식 카드 본문(정의, 특징, 구분 등). 앱은 아직 문제만 쓰고, 카드는 드라이브 문서와 앞으로의 개념 보기에 쓴다. */
export type ConceptCard = { ko?: string; def: string; traits: string[]; measure?: string; contrast: { with: string; diff: string }[]; example?: string; analogy?: string; src: { title: string; url: string }[]; added?: string };
export type Concept = { id: string; name: string; en?: string; node: string; field?: string; topic?: string; abbr?: string; full?: string; card?: ConceptCard };

/** lv 1 인식 · 2 특징 · 3 구분 · 4 적용. t 는 mc(4지선다), ox(맞다·틀리다). */
export type LatQuestion = { id: string; cid: string; lv: number; t: 'mc' | 'ox'; q: string; pre?: string; o?: string[]; a?: number | boolean; h?: string; w?: string };

/** mis: 흔한 실수(어색한 연어). bad 는 term 과 같은 자리에 들어가는 꼴이라 빈칸과 정의 문제의 오답으로 쓴다. */
export type VocMistake = { bad: string; good: string; why: string };
export type Vocab = { id: string; deck: 'fin' | 'gen' | 'toeic'; term: string; level: string; ko: string; def: string; ex?: string; similar?: string; formal?: string; group?: string; pos?: string; mis?: VocMistake[]; added?: string };

/** 오늘 이미 낸 문제와 항목. 같은 날 같은 문제를 다시 내지 않는 데 쓴다. */
export type Asked = { keys: Set<string>; units: Set<string> };
const NONE: Asked = { keys: new Set(), units: new Set() };

/** nodes 가 없으면(예전에 받아 둔 자료) 지식 탭과 해금은 아무것도 보이지 않는다. */
export type StudyData = { version: number; updatedAt?: string; nodes?: TaxNode[]; concepts: Concept[]; questions: LatQuestion[]; vocab: Vocab[] };

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
  first?: string; // 처음 답한 날(한국 날짜). 이 날부터 배운 것으로 센다
};

export type StudyDay = { lat: number; voc: number; latGoal: number; vocGoal: number; latDoneAt?: string; vocDoneAt?: string; extra?: number };

export type StudyState = { v: 1; start: string; cards: Record<string, Card>; days: Record<string, StudyDay>; xp: number };

/**
 * 풀이 기록 한 줄. g 는 채점: 1 틀림 · 2 힌트 보고 맞힘 또는 애매함 · 3 맞힘. r 은 틀려서 세션 끝에 다시 나온 문제.
 * id 는 시트로 보낼 때 같은 줄을 한 번만 적는 열쇠(새 줄은 기기 id 와 순번, 예전 줄은 내용의 해시. src/sync.ts 의 rowId).
 */
export type LogRow = { t: string; u: string; k: Section; q: string; ok: boolean; n: number; sec: number; g: 1 | 2 | 3; r?: 1; id?: string };

export const LAT_GOAL = 5;
export const VOC_NEW_PER_DAY = 6;
export const VOC_REVIEW_CAP = 10;
export const LAT_NEW_PER_DAY = 3;

// 개념마다 4단계. 5단계(자기 말로 설명)는 문제 집합에서 뺐다 (2026-11-23 소유자 결정).
export const LEVEL_NAME: Record<number, string> = { 1: '인식', 2: '특징', 3: '구분', 4: '적용' };

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
  return { d, s, last: now.toISOString(), due: addDays(today, interval), reps: (card?.reps ?? 0) + 1, lapses: (card?.lapses ?? 0) + (g === 1 ? 1 : 0), asked, first: card?.first ?? today };
}

/**
 * 처음 답한 날(first)이 없는 항목을 풀이 기록으로 채운다. 그 항목의 가장 이른 기록의 날, 기록이 없으면 마지막으로 푼 날.
 * 바뀐 것이 없으면 받은 객체를 그대로 돌려준다.
 */
export function withFirsts(state: StudyState, log: LogRow[]): StudyState {
  const missing = Object.keys(state.cards).filter((id) => !state.cards[id].first);
  if (missing.length === 0) return state;
  const earliest = new Map<string, string>();
  for (const row of log) {
    const cur = earliest.get(row.u);
    if (!cur || row.t < cur) earliest.set(row.u, row.t);
  }
  const cards = { ...state.cards };
  let changed = false;
  for (const id of missing) {
    const card = cards[id];
    const first = kstDate(earliest.get(id) ?? '') || kstDate(card.last);
    if (!first) continue;
    cards[id] = { ...card, first };
    changed = true;
  }
  return changed ? { ...state, cards } : state;
}

/**
 * 풀이 기록을 처음부터 다시 풀어 기억 상태를 만든다(시트에서 불러올 때). 기록을 남길 때와 같은 review 를 같은 시각으로 부르므로
 * 기록이 빠짐없이 있으면 결과가 기기의 기억 상태와 같다. rows 는 순서와 상관없이 받는다(시각순으로 다시 푼다).
 * 유형 키: Latticework 는 문제의 수준(lv), 영단어는 문제 이름의 마지막 조각. 자료에 없는 문제는 lv1 로 센다(출제 순서에만 쓰인다).
 * 경험치도 같은 방식으로 다시 센다. 다시 나온 문제(r)는 기억 상태와 경험치를 바꾸지 않는다.
 */
export function rebuildFromLog(rows: LogRow[], data: StudyData | null): { cards: Record<string, Card>; xp: number; start: string | null } {
  const lv = new Map<string, number>();
  for (const x of data?.questions ?? []) lv.set(x.id, x.lv);
  const sorted = rows.slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const cards: Record<string, Card> = {};
  let xp = 0;
  for (const row of sorted) {
    if (row.r) continue;
    const at = new Date(row.t);
    const day = kstDate(row.t);
    if (!day || (row.g !== 1 && row.g !== 2 && row.g !== 3)) continue;
    const type = row.k === 'lat' ? `lv${lv.get(row.q) ?? 1}` : row.q.slice(row.q.lastIndexOf(':') + 1);
    cards[row.u] = review(cards[row.u], row.g, at, day, type);
    xp += xpFor(row.g);
  }
  return { cards, xp, start: sorted.length ? kstDate(sorted[0].t) : null };
}

/**
 * 풀이 기록만으로 만든 날짜별 푼 수. 그날의 목표 문항 수는 기록에 없으므로, 날마다 남긴 상태(시트의 상태 탭)가 없을 때만 쓴다.
 * Latticework 목표는 LAT_GOAL, 영단어 목표는 그날 할당으로 푼 수로 잡는다(남은 것은 추가 학습).
 */
export function daysFromLog(rows: LogRow[]): Record<string, StudyDay> {
  const out: Record<string, StudyDay> = {};
  for (const row of rows.slice().sort((a, b) => (a.t < b.t ? -1 : 1))) {
    if (row.r) continue;
    const d = kstDate(row.t);
    if (!d) continue;
    const day = (out[d] ??= { lat: 0, voc: 0, latGoal: LAT_GOAL, vocGoal: 0 });
    if (row.k === 'lat') {
      if (day.lat < day.latGoal) {
        day.lat += 1;
        if (day.lat >= day.latGoal) day.latDoneAt = row.t;
      } else day.extra = (day.extra ?? 0) + 1;
    } else if (day.voc < VOC_REVIEW_CAP + VOC_NEW_PER_DAY) {
      day.voc += 1;
      day.vocGoal = day.voc;
      day.vocDoneAt = row.t;
    } else day.extra = (day.extra ?? 0) + 1;
  }
  return out;
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

// 개념 id → 그 개념의 학문. 자료 객체마다 한 번만 만든다.
const discCache = new WeakMap<StudyData, Map<string, TaxNode>>();

function disciplineOf(data: StudyData, cid: string): TaxNode | null {
  let idx = discCache.get(data);
  if (!idx) {
    idx = new Map();
    const nodes = new Map((data.nodes ?? []).map((n) => [n.id, n]));
    for (const c of data.concepts) {
      let n = nodes.get(c.node);
      for (let guard = 0; n && n.parent && guard < 8; guard++) n = nodes.get(n.parent);
      if (n && n.rank === 'discipline') idx.set(c.id, n);
    }
    discCache.set(data, idx);
  }
  return idx.get(cid) ?? null;
}

const branchCache = new WeakMap<StudyData, Map<string, string>>();
/** 개념이 속한 분과 id(없으면 학문 id, 그것도 없으면 개념이 달린 마디). */
function branchOf(data: StudyData, c: Concept): string {
  let idx = branchCache.get(data);
  if (!idx) {
    idx = new Map();
    const nodes = new Map((data.nodes ?? []).map((n) => [n.id, n]));
    for (const x of data.concepts) {
      let n = nodes.get(x.node);
      for (let guard = 0; n && n.rank !== 'branch' && n.parent && guard < 8; guard++) n = nodes.get(n.parent);
      idx.set(x.id, n?.id ?? x.node);
    }
    branchCache.set(data, idx);
  }
  return idx.get(c.id) ?? c.node;
}

/**
 * 한 학문, 한 분과만 몰려 나오지 않게 섞는다(2026-11-23 소유자 지적: CAPM 문제만 나온다).
 * 학문을 돌아가며 하나씩, 같은 학문 안에서는 분과를 돌아가며 하나씩 꺼낸다. 각 무리 안의 원래 순서(약한 순서, 자료 순서)는 지킨다.
 */
export function mixByField(data: StudyData, list: Concept[], lastNew?: (discId: string) => string, learned?: (discId: string) => number): Concept[] {
  const discs = new Map<string, Map<string, Concept[]>>();
  for (const c of list) {
    const d = disciplineOf(data, c.id)?.id ?? '';
    const b = branchOf(data, c);
    const m = discs.get(d) ?? new Map<string, Concept[]>();
    discs.set(d, m);
    const arr = m.get(b) ?? [];
    m.set(b, arr);
    arr.push(c);
  }
  // lastNew 가 있으면 새 개념을 가장 오래 안 배운 학문부터 돈다(한 번도 안 배운 학문이 맨 앞). 같으면 배운 개념이 적은 학문부터. 없으면 자료 순서.
  const keys = [...discs.keys()];
  if (lastNew) keys.sort((a, b) => (lastNew(a) < lastNew(b) ? -1 : lastNew(a) > lastNew(b) ? 1 : (learned?.(a) ?? 0) - (learned?.(b) ?? 0)));
  const queues = keys.map((k) => discs.get(k)!).map((m) => {
    const lanes = [...m.values()];
    const out: Concept[] = [];
    for (let i = 0; lanes.some((l) => l.length); i++) {
      const lane = lanes[i % lanes.length];
      const x = lane.shift();
      if (x) out.push(x);
    }
    return out;
  });
  const out: Concept[] = [];
  for (let i = 0; queues.some((q) => q.length); i++) {
    const q = queues[i % queues.length];
    const x = q.shift();
    if (x) out.push(x);
  }
  return out;
}

/** 그 마디(학문, 분과, 주제)에 바로 달리거나 아래 마디에 달린 개념 */
export function conceptsOfNode(data: StudyData, nodeId: string): Concept[] {
  const nodes = new Map((data.nodes ?? []).map((n) => [n.id, n]));
  const under = (id: string) => {
    let n = nodes.get(id);
    for (let guard = 0; n && guard < 8; guard++) {
      if (n.id === nodeId) return true;
      n = n.parent ? nodes.get(n.parent) : undefined;
    }
    return false;
  };
  return data.concepts.filter((c) => c.node === nodeId || under(c.node));
}

function latQ(data: StudyData, c: Concept, x: LatQuestion): Q {
  const kicker = [disciplineOf(data, c.id)?.ko, c.name].filter(Boolean).join(' · ');
  const base = { key: x.id, unit: c.id, sect: 'lat' as Section, type: `lv${x.lv}`, kicker, q: x.q, pre: x.pre };
  if (x.t === 'ox') return { ...base, options: ['맞다', '틀리다'], answer: x.a ? 0 : 1, hint: x.h, explain: x.w };
  return { ...base, options: x.o ?? [], answer: typeof x.a === 'number' ? x.a : 0, hint: x.h, explain: x.w };
}

/** 그 개념에서 가장 덜 낸 유형의 문제를 고른다. 처음 보는 개념은 쉬운 유형부터. */
function pickLatQuestion(c: Concept, qs: LatQuestion[], card: Card | undefined, skip: Set<string>): LatQuestion | null {
  const own = qs.filter((x) => x.cid === c.id && !skip.has(x.id));
  if (own.length === 0) return null;
  const count = (x: LatQuestion) => card?.asked?.[`lv${x.lv}`] ?? 0;
  return own.slice().sort((a, b) => count(a) - count(b) || a.lv - b.lv)[0];
}

/**
 * Latticework 세션.
 * 하루 분량(daily): 복습할 때가 된 개념을 기억이 약한 순서로 먼저 넣고, 남는 자리에 새 개념을 넣는다.
 * 추가 학습(weak): 오늘 아직 안 나온 개념을 먼저 고른다. 복습할 개념, 새 개념, 나머지 순이다.
 * 어느 쪽이든 오늘 이미 낸 문제는 다시 내지 않고, 한 세션에서 한 개념은 한 번만 나온다(자리가 남을 때만 다른 유형으로 한 번 더).
 */
export function buildLat(data: StudyData, state: StudyState, today: string, now: Date, count: number, mode: 'daily' | 'weak' = 'daily', asked: Asked = NONE): Q[] {
  return latFrom(data, state, latOrder(data, state, today, now, mode, asked), count, asked);
}

/**
 * 한 개념(또는 마디)에 맞춘 Latticework 세션. 그 개념을 먼저, 같은 마디의 개념을 기억이 약한 순서로, 그 뒤는 하루 분량과 같은 순서다.
 * focusId 가 마디 id 면 그 마디 아래 개념을 기억이 약한 순서로 먼저 낸다.
 */
export function buildLatFocus(data: StudyData, state: StudyState, today: string, now: Date, focusId: string, count: number, asked: Asked = NONE): Q[] {
  const weak = (a: Concept, b: Concept) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now);
  const focus = data.concepts.find((c) => c.id === focusId);
  const head: Concept[] = [];
  if (focus) {
    head.push(focus);
    head.push(...data.concepts.filter((c) => c !== focus && c.node === focus.node).sort(weak));
  } else {
    head.push(...conceptsOfNode(data, focusId).sort(weak));
  }
  const order = [...head];
  for (const c of latOrder(data, state, today, now, 'daily', asked)) if (!order.includes(c)) order.push(c);
  return latFrom(data, state, order, count, asked);
}

function latOrder(data: StudyData, state: StudyState, today: string, now: Date, mode: 'daily' | 'weak', asked: Asked): Concept[] {
  const seen = data.concepts.filter((c) => state.cards[c.id]);
  // 새 개념과 빈자리를 채우는 복습은 학문과 분과를 번갈아 낸다. 복습할 때가 된 개념(due)은 약한 순서 그대로.
  const lastNew = new Map<string, string>();
  const learned = new Map<string, number>();
  for (const c of seen) {
    const d = disciplineOf(data, c.id)?.id ?? '';
    const f = state.cards[c.id].first ?? '';
    if (f > (lastNew.get(d) ?? '')) lastNew.set(d, f);
    learned.set(d, (learned.get(d) ?? 0) + 1);
  }
  const fresh = mixByField(data, data.concepts.filter((c) => !state.cards[c.id]), (d) => lastNew.get(d) ?? '', (d) => learned.get(d) ?? 0);
  const byWeak = seen.slice().sort((a, b) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now));
  const due = byWeak.filter((c) => state.cards[c.id].due <= today);
  const weakest = mixByField(data, byWeak);
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
  return order;
}

function latFrom(data: StudyData, state: StudyState, order: Concept[], count: number, asked: Asked): Q[] {
  const out: Q[] = [];
  const used = new Set<string>(asked.keys);
  const add = (c: Concept) => {
    if (out.length >= count) return;
    const x = pickLatQuestion(c, data.questions, state.cards[c.id], used);
    if (!x) return;
    used.add(x.id);
    out.push(latQ(data, c, x));
  };
  order.forEach(add);
  // 개념이 모자라 자리가 남을 때만, 이번에 나온 개념을 다른 유형으로 한 번 더 묻는다.
  if (out.length < count) order.slice(0, count).forEach(add);
  return out;
}

const REGISTERS = ['친구끼리', '일반', '격식', '속어'];
/** 문제 위 작은 글씨: 단어장 이름이 아니라 단어인지 구문인지만 보인다. 띄어쓰기가 있으면 구문이다(2026-11-20 사용자 결정). */
export const vocKind = (v: Vocab): '단어' | '구문' => (/\s/.test(v.term.replace(/\s*\(.*?\)/g, '').trim()) ? '구문' : '단어');

function vocTypes(v: Vocab): string[] {
  // 격식 고르기와 우리말에서 떠올리기는 내지 않는다 (2026-11-19 사용자 결정).
  const types = ['meaning', 'define'];
  if (v.ex && v.ex.toLowerCase().includes(v.term.replace(/\s*\(.*?\)/g, '').toLowerCase())) types.push('cloze');
  return types;
}

function vocQ(v: Vocab, type: string, data: StudyData, seed: string): Q {
  const rand = rng(`${seed}:${v.id}:${type}`);
  const kicker = vocKind(v);
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
  // 흔한 실수가 있으면 정의와 빈칸 문제의 오답 하나로 먼저 넣는다.
  const wrongs = (v.mis ?? []).map((m) => m.bad).filter((w) => w.toLowerCase() !== bare.toLowerCase());
  const terms = (strip: boolean) => [...wrongs, ...others.map((x) => (strip ? x.term.replace(/\s*\(.*?\)/g, '') : x.term))].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
  // 예문은 한 줄짜리만 해설에 붙인다(대화형 예문은 빼던 그대로).
  const detail = [v.pos ? `${v.term} (${v.pos}) ${v.ko}` : `${v.term}: ${v.ko}`, v.def, v.ex && !v.ex.includes('\n') ? `예문: ${v.ex}` : '', v.similar ? `비슷한 표현: ${v.similar}` : '', v.formal ? `격식 있는 표현: ${v.formal}` : '', ...(v.mis ?? []).map((m) => `어색한 표현: ${m.bad}. ${m.why}`)].filter(Boolean).join('\n');

  if (type === 'meaning') {
    return { ...base, q: v.term, ...withAnswer(v.ko, others.map((x) => x.ko)), hint: v.def, explain: detail };
  }
  if (type === 'define') {
    return { ...base, q: '이 정의에 맞는 표현은 무엇입니까?', pre: v.def, ...withAnswer(v.term, terms(false)), hint: `우리말 뜻: ${v.ko}`, explain: detail };
  }
  if (type === 'cloze') {
    const blanked = (v.ex ?? '').replace(new RegExp(bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
    return { ...base, q: '빈칸에 들어갈 표현은 무엇입니까?', pre: blanked, ...withAnswer(bare, terms(true)), hint: `우리말 뜻: ${v.ko}`, explain: detail };
  }
  if (type === 'register') {
    return { ...base, q: `"${v.term}"은 어떤 자리에서 쓰는 표현입니까?`, pre: v.ex, options: REGISTERS, answer: REGISTERS.indexOf(v.level), hint: v.formal ? `격식을 갖추면 이렇게 말합니다: ${v.formal}` : v.def, explain: detail };
  }
  return { ...base, q: `"${v.ko}"를 영어로 떠올려 보세요.`, pre: v.deck === 'gen' ? `쓰는 자리: ${v.level}` : undefined, reveal: [v.term, v.def, v.ex ?? ''].filter(Boolean).join('\n') };
}

/**
 * 영단어 세션. 복습할 때가 된 표현(기억이 약한 순)과 새 표현을 섞는다.
 * 추가 학습(weak)은 오늘 아직 안 나온 표현을 먼저 고른다. 오늘 이미 낸 문제는 다시 내지 않는다.
 */
export function buildVoc(data: StudyData, state: StudyState, today: string, now: Date, mode: 'daily' | 'weak' = 'daily', count?: number, asked: Asked = NONE): Q[] {
  const seen = data.vocab.filter((v) => state.cards[v.id]);
  const fresh = data.vocab.filter((v) => !state.cards[v.id]);
  const weakest = seen.slice().sort((a, b) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now));
  const due = weakest.filter((v) => state.cards[v.id].due <= today);
  const untouched = (v: Vocab) => !asked.units.has(v.id);
  // 새 표현은 단어장을 번갈아 가져온다. 금융 영어를 가장 자주, 그다음 회화와 면접 표현, 토익 어휘 순이다 (2026-11-22 사용자 결정).
  // 한 단어장이 바닥나면 남은 단어장에서 계속 채운다.
  const decks: Record<Vocab['deck'], Vocab[]> = { toeic: [], gen: [], fin: [] };
  fresh.forEach((v) => decks[v.deck]?.push(v));
  const turn: Vocab['deck'][] = ['fin', 'gen', 'fin', 'toeic'];
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
