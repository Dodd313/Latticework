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
/** sub 는 하위 요소: 이름이 너무 포괄적이라 따로 세우지 않고 이 개념 안에 둔 개념(예: PLV 안의 상대가격). 2026-11-24 소유자 결정. */
export type ConceptSub = { name: string; en?: string; abbr?: string; full?: string; def: string; traits?: string[]; src?: { title: string; url: string }[] };
export type ConceptCard = { ko?: string; def: string; traits: string[]; measure?: string; contrast: { with: string; diff: string }[]; example?: string; analogy?: string; src: { title: string; url: string }[]; added?: string; sub?: ConceptSub[] };
export type Concept = { id: string; name: string; en?: string; node: string; field?: string; topic?: string; abbr?: string; full?: string; card?: ConceptCard; was?: string[] };

/**
 * lv 1 인식 · 2 특징 · 3 구분 · 4 적용. t 는 mc(4지선다), ox(맞다·틀리다).
 * added 는 문제를 넣은 날. 이미 배운 개념에 나중에 더한 문제(하위 요소 문제 등)는 마지막 풀이보다 늦게 들어왔으면 그 개념을 복습에 올리고 먼저 낸다.
 * retired 는 내용을 바로잡으며 물린 문제. 지우지 않고 남기되 내지 않는다(2026-11-24 소유자 결정).
 */
export type LatQuestion = { id: string; cid: string; lv: number; t: 'mc' | 'ox'; q: string; pre?: string; o?: string[]; a?: number | boolean; h?: string; w?: string; added?: string; retired?: boolean };

/** mis: 흔한 실수(어색한 연어). bad 는 term 과 같은 자리에 들어가는 꼴이라 빈칸과 정의 문제의 오답으로 쓴다. */
export type VocMistake = { bad: string; good: string; why: string };
export type Vocab = { id: string; deck: 'fin' | 'gen' | 'toeic'; term: string; level: string; ko: string; def: string; ex?: string; similar?: string; formal?: string; group?: string; pos?: string; mis?: VocMistake[]; added?: string };

/** 오늘 이미 낸 문제와 항목. 같은 날 같은 문제를 다시 내지 않는 데 쓴다. */
export type Asked = { keys: Set<string>; units: Set<string> };
const NONE: Asked = { keys: new Set(), units: new Set() };

/** nodes 가 없으면(예전에 받아 둔 자료) 지식 탭과 해금은 아무것도 보이지 않는다. */
export type StudyData = { version: number; updatedAt?: string; nodes?: TaxNode[]; concepts: Concept[]; questions: LatQuestion[]; vocab: Vocab[] };

export type Section = 'lat' | 'voc';
/** 풀이 기록과 문제의 구역. rs 는 Research(분석 중인 기업의 사실 복습). 하루 목표에 들지 않는 선택 과제다(2026-11-24 소유자 결정). */
export type StudySect = Section | 'rs';

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

/** readGoal 은 그날 읽기 목표(읽을 개념이 있던 날 1), read 는 그날 읽고 표시한 수(이해했어요와 빼기). 2026-11-27 소유자 결정. */
export type StudyDay = { lat: number; voc: number; latGoal: number; vocGoal: number; latDoneAt?: string; vocDoneAt?: string; extra?: number; readGoal?: number; read?: number };

/**
 * 읽기 표시(2026-11-27 소유자 결정). 카드가 있는 새 개념은 먼저 읽기 화면에서 읽고 ok(이해했어요)를 누른 다음 날부터 문제로 나온다.
 * later 는 어려워서 나중에 다시 읽기(읽을 차례의 끝으로), skip 은 공부하지 않을 개념(숨김). d 는 한국 날짜, t 는 누른 시각.
 */
export type ReadMark = { k: 'ok' | 'later' | 'skip'; d: string; t: string };
export type StudyState = { v: 1; start: string; cards: Record<string, Card>; days: Record<string, StudyDay>; xp: number; marks?: Record<string, ReadMark> };

/** 문제로 낼 수 있는 개념인가. 카드가 없는 예전 개념과 이미 푼 개념은 늘 열려 있고, 카드가 있는 새 개념은 어제까지 "이해했어요"를 누른 것만 열린다. */
export function isOpen(c: Concept, state: StudyState, today: string): boolean {
  if (!c.card || state.cards[c.id]) return true;
  const m = state.marks?.[c.id];
  return !!m && m.k === 'ok' && m.d < today;
}

/** 읽을 차례: 카드가 있고 아직 안 푼 개념 가운데 이해했어요, 빼기를 누르지 않은 것. 들어온 순서대로, 나중에 다시 읽기는 끝으로. */
export function readQueue(data: StudyData, state: StudyState): Concept[] {
  const list = data.concepts.filter((c) => c.card && !state.cards[c.id] && !['ok', 'skip'].includes(state.marks?.[c.id]?.k ?? ''));
  const key = (c: Concept) => {
    const m = state.marks?.[c.id];
    return `${m ? `1${m.t}` : '0'}|${c.card?.added ?? ''}`;
  };
  return list.map((c, i) => ({ c, i, k: key(c) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i)).map((x) => x.c);
}

/**
 * 읽기 표시 합치기(시트 불러오기, 파일 가져오기). 이해했어요와 빼기는 나중에 다시보다 앞선다(다른 기기의 늦은 "나중에"가 끝낸 읽기를 되돌리지 않게).
 * 같은 무게면 늦게 누른 쪽.
 */
export function mergeMarks(a: Record<string, ReadMark> | undefined, b: Record<string, ReadMark> | undefined): Record<string, ReadMark> {
  const w = (m: ReadMark) => (m.k === 'later' ? 0 : 1);
  const out: Record<string, ReadMark> = { ...(a ?? {}) };
  for (const [id, m] of Object.entries(b ?? {})) {
    if (!m || typeof m.t !== 'string' || !['ok', 'later', 'skip'].includes(m.k)) continue;
    const o = out[id];
    if (!o || w(m) > w(o) || (w(m) === w(o) && m.t > o.t)) out[id] = m;
  }
  return out;
}

/** 그날 "이해했어요"를 누른 개념 수 */
export const readOn = (state: StudyState, date: string): number => Object.values(state.marks ?? {}).filter((m) => m.k === 'ok' && m.d === date).length;

/**
 * 개념을 다른 개념의 하위 요소로 옮기면(concept.was 에 옛 id) 옛 개념의 기억 상태를 새 부모로 옮긴다(2026-11-24 소유자 결정).
 * 부모를 아직 풀지 않았을 때만 옮긴다. 옛 개념이 여럿이면 가장 약한 쪽을 따른다(안정성은 가장 낮게, 복습일은 가장 이르게, 반복과 실수는 더한다).
 * 옛 개념의 상태는 지우지 않는다(풀이 기록과 시트 동기화가 그 id 를 쓴다). 화면은 study.json 에 없는 id 를 보지 않는다.
 */
export function carryWas(data: StudyData, state: StudyState): StudyState {
  let cards: Record<string, Card> | null = null;
  for (const c of data.concepts) {
    if (!c.was?.length || state.cards[c.id]) continue;
    const olds = c.was.map((id) => state.cards[id]).filter(Boolean) as Card[];
    if (!olds.length) continue;
    const pick = <K extends keyof Card>(k: K, f: (a: Card[K], b: Card[K]) => Card[K]) => olds.map((x) => x[k]).reduce(f);
    const asked: Record<string, number> = {};
    for (const o of olds) for (const [k, v] of Object.entries(o.asked ?? {})) asked[k] = (asked[k] ?? 0) + v;
    const firsts = olds.map((o) => o.first).filter(Boolean) as string[];
    cards ??= { ...state.cards };
    cards[c.id] = {
      d: pick('d', (a, b) => Math.max(a, b)),
      s: pick('s', (a, b) => Math.min(a, b)),
      last: pick('last', (a, b) => (a > b ? a : b)),
      due: pick('due', (a, b) => (a < b ? a : b)),
      reps: olds.reduce((n, o) => n + o.reps, 0),
      lapses: olds.reduce((n, o) => n + o.lapses, 0),
      asked,
      ...(firsts.length ? { first: firsts.sort()[0] } : {}),
    };
  }
  return cards ? { ...state, cards } : state;
}

/**
 * 풀이 기록 한 줄. g 는 채점: 1 틀림 · 2 힌트 보고 맞힘 또는 애매함 · 3 맞힘. r 은 틀려서 세션 끝에 다시 나온 문제.
 * id 는 시트로 보낼 때 같은 줄을 한 번만 적는 열쇠(새 줄은 기기 id 와 순번, 예전 줄은 내용의 해시. src/sync.ts 의 rowId).
 */
export type LogRow = { t: string; u: string; k: StudySect; q: string; ok: boolean; n: number; sec: number; g: 1 | 2 | 3; r?: 1; id?: string };

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
    // Research 풀이는 하루 목표와 추가 학습 어디에도 세지 않는다.
    if (row.k === 'rs') continue;
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
  sect: StudySect;
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
  const own = qs.filter((x) => x.cid === c.id && !x.retired && !skip.has(x.id));
  if (own.length === 0) return null;
  const count = (x: LatQuestion) => card?.asked?.[`lv${x.lv}`] ?? 0;
  // 마지막 풀이 뒤에 더한 문제를 먼저 낸다.
  const fresh = (x: LatQuestion) => (isNewQuestion(x, card) ? 0 : 1);
  return own.slice().sort((a, b) => fresh(a) - fresh(b) || count(a) - count(b) || a.lv - b.lv)[0];
}

/** 배운 개념에 마지막 풀이보다 늦게 더한 문제인가. */
const isNewQuestion = (x: LatQuestion, card: Card | undefined): boolean => !!(card && x.added && !x.retired && x.added > kstDate(card.last));

/** 배운 개념 가운데 마지막 풀이 뒤로 문제가 더해진 개념 id. 복습할 때가 된 것으로 본다. */
export function conceptsWithNewQuestions(data: StudyData, state: StudyState): Set<string> {
  const out = new Set<string>();
  for (const x of data.questions) if (isNewQuestion(x, state.cards[x.cid])) out.add(x.cid);
  return out;
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
    // 읽기를 마치지 않아 잠긴 개념은 복습하기로도 내지 않는다(2026-11-27 소유자 결정).
    if (isOpen(focus, state, today)) head.push(focus);
    head.push(...data.concepts.filter((c) => c !== focus && c.node === focus.node && isOpen(c, state, today)).sort(weak));
  } else {
    // 분야(학문, 분과, 주제)를 골라 풀 때는 그 분야 안의 개념만 낸다(2026-11-24 소유자 결정).
    // 복습할 때가 된 개념(문제가 새로 더해진 개념 포함), 새 개념(분과를 번갈아), 나머지를 기억이 약한 순서로.
    const all = conceptsOfNode(data, focusId);
    const grown = conceptsWithNewQuestions(data, state);
    const seen = all.filter((c) => state.cards[c.id]).sort(weak);
    seen.filter((c) => state.cards[c.id].due <= today || grown.has(c.id)).forEach((c) => head.push(c));
    mixByField(data, all.filter((c) => !state.cards[c.id] && isOpen(c, state, today))).forEach((c) => head.push(c));
    seen.filter((c) => !head.includes(c)).forEach((c) => head.push(c));
    return latFrom(data, state, head, count, asked);
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
  const fresh = mixByField(data, data.concepts.filter((c) => !state.cards[c.id] && isOpen(c, state, today)), (d) => lastNew.get(d) ?? '', (d) => learned.get(d) ?? 0);
  const byWeak = seen.slice().sort((a, b) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now));
  const grown = conceptsWithNewQuestions(data, state);
  const due = byWeak.filter((c) => state.cards[c.id].due <= today || grown.has(c.id));
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

/**
 * 돌아보기의 지식 종합 퀴즈(2026-11-24 소유자 승인). 그 기간에 처음 배운 개념을 먼저, 모자라면 그 기간에 푼 개념으로 채워
 * 학문을 번갈아 다섯 개를 고르고, 개념마다 적용, 구분, 특징, 인식 문제 순서로 하나를 낸다. 같은 기간이면 늘 같은 문제다.
 */
export function latPeriodQuiz(data: StudyData, state: StudyState, log: LogRow[], from: string, to: string, id: string, title: string, n = 5): { id: string; title: string; range: string; questions: { q: string; options: string[]; answer: number; explain: string }[] } | null {
  const inRange = (d: string | undefined) => !!d && d >= from && d <= to;
  const byId = new Map(data.concepts.map((c) => [c.id, c]));
  const fresh = data.concepts.filter((c) => inRange(state.cards[c.id]?.first));
  const solved: Concept[] = [];
  for (const r of log) {
    if (r.k !== 'lat' || !inRange(kstDate(r.t))) continue;
    const c = byId.get(r.u);
    if (c && !fresh.includes(c) && !solved.includes(c)) solved.push(c);
  }
  const picks = mixByField(data, fresh).concat(mixByField(data, solved)).slice(0, n);
  const out: { q: string; options: string[]; answer: number; explain: string }[] = [];
  for (const c of picks) {
    const own = data.questions.filter((x) => x.cid === c.id && !x.retired);
    const q = [4, 3, 2, 1].map((lv) => own.find((x) => x.lv === lv && (x.t === 'mc' ? (x.o?.length ?? 0) >= 2 : true))).find(Boolean);
    if (!q) continue;
    const head = q.pre ? `${q.pre}\n${q.q}` : q.q;
    if (q.t === 'ox') out.push({ q: head, options: ['맞다', '틀리다'], answer: q.a ? 0 : 1, explain: q.w ?? '' });
    else out.push({ q: head, options: q.o ?? [], answer: typeof q.a === 'number' ? q.a : 0, explain: q.w ?? '' });
  }
  if (out.length < 3) return null;
  return { id, title, range: `${out.length}문항`, questions: out };
}

// ---------- Research: 분석 중인 기업의 사실 복습 ----------
/**
 * 자료는 docs/data/research.json. 사실 하나가 기억 단위다(id 는 rs-<기업>-<열쇠>). 소유자의 분석 일지에서 뽑고, 일지에 없는 사실은 더하지 않는다.
 * 값이 바뀐 사실은 새 사실로 넣고 옛 사실은 retired 로 물린다(asOf 가 그 값의 기준일).
 */
export type ResearchCompany = { id: string; name: string; ticker: string; ko?: string; sector?: string; note?: string; since?: string };
export type ResearchFact = { id: string; co: string; group: string; q: string; a: string; o: string[]; w: string; asOf: string; added?: string; links?: string[]; retired?: boolean };
export type ResearchData = { version: number; updatedAt?: string; groups?: Record<string, string>; companies: ResearchCompany[]; facts: ResearchFact[] };

export const liveFacts = (rd: ResearchData, co: string): ResearchFact[] => rd.facts.filter((f) => f.co === co && !f.retired);

/** 기업 하나의 오늘 상황: 사실 수, 배운 수, 오늘 복습할 수. */
export function researchStatus(rd: ResearchData, state: StudyState, co: string, today: string): { total: number; seen: number; due: number } {
  const fs = liveFacts(rd, co);
  let seen = 0;
  let due = 0;
  for (const f of fs) {
    const c = state.cards[f.id];
    if (!c) continue;
    seen++;
    if (c.due <= today) due++;
  }
  return { total: fs.length, seen, due };
}

function rsQ(rd: ResearchData, co: ResearchCompany, f: ResearchFact, seed: string): Q {
  const rand = rng(`${seed}:${f.id}`);
  const options = shuffle([f.a, ...f.o.slice(0, 3)], rand);
  const group = rd.groups?.[f.group] ?? f.group;
  // 해설은 "11/21 일지: ..." 처럼 일지 날짜로 시작한다. 날짜가 없으면 기준일을 붙인다.
  const day = `${Number(f.asOf.slice(5, 7))}/${Number(f.asOf.slice(8, 10))}`;
  const explain = f.w.startsWith(day) ? f.w : `${f.w} (${day} 기준)`;
  return { key: `${f.id}:mc`, unit: f.id, sect: 'rs', type: 'mc', kicker: `${co.ticker} · ${group}`, q: f.q, options, answer: options.indexOf(f.a), explain };
}

/**
 * 기업 하나의 Research 세션. 복습할 때가 된 사실(기억이 약한 순서), 새 사실(일지 순서, 묶음을 번갈아), 나머지(약한 순서).
 * weak 는 추가 학습: 오늘 안 나온 사실부터.
 */
export function buildResearch(rd: ResearchData, state: StudyState, co: string, today: string, now: Date, count: number, mode: 'daily' | 'weak' = 'daily', asked: Asked = NONE): Q[] {
  const company = rd.companies.find((c) => c.id === co);
  if (!company) return [];
  const fs = liveFacts(rd, co);
  const weak = (a: ResearchFact, b: ResearchFact) => recall(state.cards[a.id], now) - recall(state.cards[b.id], now);
  const seen = fs.filter((f) => state.cards[f.id]).sort(weak);
  const due = seen.filter((f) => state.cards[f.id].due <= today);
  // 새 사실은 묶음(광산, 사업, 산업 등)을 번갈아 낸다. 같은 묶음 안은 일지 순서.
  const groups = new Map<string, ResearchFact[]>();
  for (const f of fs) if (!state.cards[f.id]) (groups.get(f.group) ?? groups.set(f.group, []).get(f.group)!).push(f);
  const fresh: ResearchFact[] = [];
  for (let i = 0, more = true; more; i++) {
    more = false;
    for (const g of groups.values()) if (g[i]) (fresh.push(g[i]), (more = true));
  }
  const untouched = (f: ResearchFact) => !asked.units.has(f.id);
  const order: ResearchFact[] = [];
  const push = (f: ResearchFact) => void (order.includes(f) || order.push(f));
  if (mode === 'daily') [due, fresh, seen].forEach((l) => l.forEach(push));
  else [due.filter(untouched), fresh, seen.filter(untouched), seen].forEach((l) => l.forEach(push));
  let pickList = order.filter((f) => !asked.keys.has(`${f.id}:mc`));
  // 오늘 모든 사실을 이미 풀었어도 "다시 풀기"는 빈 화면이 되지 않게, 기억이 약한 순서로 다시 묻는다(추가 학습은 그대로 끝난다).
  if (pickList.length === 0 && mode === 'daily') pickList = seen.length ? seen : order;
  return pickList.slice(0, count).map((f) => rsQ(rd, company, f, today));
}
