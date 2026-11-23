// 배운 지식의 나무와 해금. 화면 없이 계산만 한다(React, react-native 를 쓰지 않는다).
//
// 소유자 결정(2026-11-20): 개념은 처음 답한 날(card.first)부터 배운 것으로 센다. 개념을 자료에 넣은 날은 쓰지 않는다.
// 학문과 분과는 그 아래 개념 가운데 가장 먼저 배운 날에 생긴다. 주제는 그 아래 개념을 3개 배운 날에 생기고,
// 그 전까지 그 개념들은 주제의 윗마디(분과)에 바로 달린다.
import { dayDiff, kstDate } from './dates';
import { Card, Concept, StudyData, TaxNode, TaxRank } from './study';

export type LRank = TaxRank | 'concept';

/** 배운 나무의 마디 하나. at 은 생긴 날, count 는 아래에 달린 배운 개념 수(개념 자신은 1). */
export type LNode = {
  id: string;
  ko: string;
  short: string;
  en?: string;
  rank: LRank;
  parent: string | null;
  disc: string;
  color: string;
  domain?: string;
  at: string;
  kids: string[];
  count: number;
};

/** key 는 모양(마디 id 와 윗마디)만으로 정해지는 이름. 모양이 같으면 지도 배치를 다시 하지 않는다. */
export type LearnedTree = { nodes: Map<string, LNode>; discs: string[]; concepts: string[]; key: string };

export const TOPIC_MIN = 3;
const GREY = '#8b95a1';
const DEPTH: Record<LRank, number> = { discipline: 0, branch: 1, topic: 2, concept: 3 };

// ---------- 분류 찾아보기 ----------

export type TaxIndex = {
  node: Map<string, TaxNode>;
  concept: Map<string, Concept>;
  /** 개념이 달린 마디까지의 길: 학문부터 그 개념의 마디까지 */
  pathOf(conceptId: string): TaxNode[];
  /** 개념 id 나 마디 id 의 학문 */
  discOf(id: string): TaxNode | null;
  /** 개념 id 나 마디 id 의 분과 */
  branchOf(id: string): TaxNode | null;
};

const indexCache = new WeakMap<StudyData, TaxIndex>();

export function taxIndex(data: StudyData): TaxIndex {
  const hit = indexCache.get(data);
  if (hit) return hit;
  const node = new Map((data.nodes ?? []).map((n) => [n.id, n]));
  const concept = new Map(data.concepts.map((c) => [c.id, c]));
  const chainOfNode = (id: string | null | undefined): TaxNode[] => {
    const out: TaxNode[] = [];
    let n = id ? node.get(id) : undefined;
    for (let guard = 0; n && guard < 12; guard++) {
      out.unshift(n);
      n = n.parent ? node.get(n.parent) : undefined;
    }
    return out;
  };
  const paths = new Map<string, TaxNode[]>();
  const chainOf = (id: string): TaxNode[] => {
    const c = concept.get(id);
    if (c) {
      let p = paths.get(id);
      if (!p) paths.set(id, (p = chainOfNode(c.node)));
      return p;
    }
    return chainOfNode(id);
  };
  const idx: TaxIndex = {
    node,
    concept,
    pathOf: (id) => (concept.has(id) ? chainOf(id) : []),
    discOf: (id) => chainOf(id).find((n) => n.rank === 'discipline') ?? null,
    branchOf: (id) => chainOf(id).find((n) => n.rank === 'branch') ?? null,
  };
  indexCache.set(data, idx);
  return idx;
}

// ---------- 배운 나무 ----------

/** 처음 답한 날. 예전 기록이라 first 가 없으면 마지막으로 푼 날로 본다. */
export function firstOf(card: Card | undefined): string {
  if (!card) return '';
  return card.first ?? kstDate(card.last);
}

/** 기억 상태(cards)로 배운 나무를 만든다. 분류(nodes)가 없는 자료면 null. */
export function learnedTree(data: StudyData, cards: Record<string, Card>): LearnedTree | null {
  if (!data.nodes || data.nodes.length === 0) return null;
  const idx = taxIndex(data);
  const learned = data.concepts
    .map((c) => ({ c, at: firstOf(cards[c.id]) }))
    .filter((x) => !!x.at && idx.node.has(x.c.node))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));

  // 마디마다 그 아래 배운 개념(배운 순서).
  const under = new Map<string, { c: Concept; at: string }[]>();
  for (const x of learned) {
    for (const n of idx.pathOf(x.c.id)) {
      let list = under.get(n.id);
      if (!list) under.set(n.id, (list = []));
      list.push(x);
    }
  }
  // 생긴 마디와 그 날.
  const at = new Map<string, string>();
  for (const [id, list] of under) {
    const n = idx.node.get(id)!;
    if (n.rank === 'topic') {
      if (list.length >= TOPIC_MIN) at.set(id, list[TOPIC_MIN - 1].at);
    } else at.set(id, list[0].at);
  }
  // 생긴 윗마디 가운데 가장 가까운 것.
  const liveParent = (id: string | null): string | null => {
    let n = id ? idx.node.get(id) : undefined;
    for (let guard = 0; n && guard < 12; guard++) {
      if (at.has(n.id)) return n.id;
      n = n.parent ? idx.node.get(n.parent) : undefined;
    }
    return null;
  };

  const nodes = new Map<string, LNode>();
  const discOfNode = (id: string) => idx.discOf(id);
  for (const n of data.nodes) {
    const when = at.get(n.id);
    if (!when) continue;
    const d = discOfNode(n.id);
    nodes.set(n.id, {
      id: n.id,
      ko: n.ko,
      short: n.short ?? n.ko,
      en: n.en,
      rank: n.rank,
      parent: liveParent(n.parent),
      disc: d?.id ?? n.id,
      color: d?.color ?? GREY,
      domain: d?.domain,
      at: when,
      kids: [],
      count: under.get(n.id)?.length ?? 0,
    });
  }
  for (const x of learned) {
    const d = idx.discOf(x.c.id);
    nodes.set(x.c.id, {
      id: x.c.id,
      ko: x.c.name,
      short: x.c.name,
      en: x.c.en,
      rank: 'concept',
      parent: liveParent(x.c.node),
      disc: d?.id ?? '',
      color: d?.color ?? GREY,
      domain: d?.domain,
      at: x.at,
      kids: [],
      count: 1,
    });
  }
  const order = (a: LNode, b: LNode) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorted = [...nodes.values()].sort(order);
  for (const n of sorted) if (n.parent) nodes.get(n.parent)?.kids.push(n.id);
  const discs = sorted.filter((n) => n.rank === 'discipline').map((n) => n.id);
  const concepts = learned.map((x) => x.c.id);
  const key = [...nodes.values()]
    .map((n) => `${n.id}>${n.parent ?? ''}`)
    .sort()
    .join('|');
  return { nodes, discs, concepts, key };
}

// ---------- 해금 ----------

export type UnlockKind = 'major' | 'minor' | 'sparkle';

/** 해금 하나. id 는 마디 id(개념이면 개념 id). by 는 그 마디를 연 개념, batch 는 같은 날 같은 학문에서 생긴 묶음. */
export type UnlockEvent = { id: string; nodeId: string; rank: LRank; kind: UnlockKind; at: string; by: string; byName: string; disc: string; batch: string; nth?: number };

const KIND: Record<LRank, UnlockKind> = { discipline: 'major', branch: 'minor', topic: 'sparkle', concept: 'sparkle' };

/** 배운 나무의 모든 마디와 개념을 해금으로. 날짜, 등급, id 순서. */
export function unlockEvents(tree: LearnedTree | null): UnlockEvent[] {
  if (!tree) return [];
  // 마디 아래 배운 개념(배운 순서)
  const conceptsUnder = (id: string): LNode[] => {
    const out: LNode[] = [];
    const walk = (nid: string) => {
      const n = tree.nodes.get(nid);
      if (!n) return;
      if (n.rank === 'concept') out.push(n);
      n.kids.forEach(walk);
    };
    walk(id);
    return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  const nth = new Map(tree.discs.map((id, i) => [id, i + 1]));
  const out: UnlockEvent[] = [];
  for (const n of tree.nodes.values()) {
    let by: LNode | undefined;
    if (n.rank === 'concept') by = n;
    else {
      const list = conceptsUnder(n.id);
      // 주제는 그 주제를 만든 개념(세 번째로 배운 개념), 그 밖에는 처음 배운 개념
      by = n.rank === 'topic' ? (list.find((c) => c.at === n.at) ?? list[0]) : list[0];
    }
    out.push({
      id: n.id,
      nodeId: n.id,
      rank: n.rank,
      kind: KIND[n.rank],
      at: n.at,
      by: by?.id ?? '',
      byName: by?.ko ?? '',
      disc: n.disc,
      batch: `${n.at}|${n.disc}`,
      ...(n.rank === 'discipline' ? { nth: nth.get(n.id) } : null),
    });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : DEPTH[a.rank] - DEPTH[b.rank] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/**
 * 해금 카드. missed 는 오래(14일 넘게) 못 본 해금을 한 장으로, major 는 학문 하나(lights 는 같은 묶음의 분과),
 * more 는 넷째 학문부터 한 장(lights 는 그 학문들과 같은 묶음의 분과. 볼 때 함께 본 것으로 적는다).
 */
export type UnlockCard = { type: 'missed'; items: UnlockEvent[] } | { type: 'major'; item: UnlockEvent; lights: UnlockEvent[] } | { type: 'more'; items: UnlockEvent[]; lights?: UnlockEvent[] };

/** cards 는 시작 화면 뒤 전체 화면, band 는 홈 위쪽 띠(가장 최근 분과와 나머지 수). */
export type UnlockPlan = { cards: UnlockCard[]; band: { item: UnlockEvent; more: number; all: UnlockEvent[] } | null };

/** 아직 안 본 해금으로 보여 줄 차례를 정한다(시안 unlock.html 의 plan()). 주제와 개념은 카드를 만들지 않는다. */
export function unlockPlan(events: UnlockEvent[], seen: Record<string, string> | undefined, today: string, windowDays = 14): UnlockPlan {
  const unseen = events.filter((e) => e.kind !== 'sparkle' && !(seen && seen[e.id]));
  const old: UnlockEvent[] = [];
  const fresh: UnlockEvent[] = [];
  for (const e of unseen) (dayDiff(e.at, today) > windowDays ? old : fresh).push(e);
  const cards: UnlockCard[] = [];
  if (old.length) cards.push({ type: 'missed', items: old });
  const majors = fresh.filter((e) => e.kind === 'major');
  const inBatch = new Set(majors.map((m) => m.batch));
  const minors = fresh.filter((e) => e.kind === 'minor');
  majors.slice(0, 3).forEach((m) => cards.push({ type: 'major', item: m, lights: minors.filter((e) => e.batch === m.batch) }));
  if (majors.length > 3) {
    const rest = majors.slice(3);
    const batches = new Set(rest.map((m) => m.batch));
    cards.push({ type: 'more', items: rest, lights: minors.filter((e) => batches.has(e.batch)) });
  }
  const bands = minors.filter((e) => !inBatch.has(e.batch));
  const band = bands.length ? { item: bands[bands.length - 1], more: bands.length - 1, all: bands } : null;
  return { cards, band };
}

/**
 * 예전 id 로 본 해금을 새 id 에도 옮겨 적는다. 마디의 was 에 예전 id 가 있으면, 그 예전 id 를 본 날을 새 id 를 본 날로 본다.
 * 지도에서 본 마디 목록(mapIds)도 같은 방법으로 넓힌다.
 */
export function carrySeen<T extends Record<string, string> | undefined>(seen: T, nodes: { id: string; was?: string[] }[] | undefined): T {
  if (!seen || !nodes?.length) return seen;
  let out: Record<string, string> | null = null;
  for (const n of nodes) {
    if (!n.was?.length || seen[n.id]) continue;
    const at = n.was.map((w) => seen[w]).filter(Boolean).sort()[0];
    if (at) (out ??= { ...seen })[n.id] = at;
  }
  return (out ?? seen) as T;
}

export function carryIds(ids: string[] | undefined, nodes: { id: string; was?: string[] }[] | undefined): string[] | undefined {
  if (!ids || !nodes?.length) return ids;
  const has = new Set(ids);
  const add = nodes.filter((n) => !has.has(n.id) && n.was?.some((w) => has.has(w))).map((n) => n.id);
  return add.length ? [...ids, ...add] : ids;
}

/**
 * 지도에서 반짝일 것: since(지도를 마지막으로 본 날) 뒤에 생긴 마디와 개념, 그리고 그날 생겼지만 지도를 볼 때(sinceIds)는 없던 것.
 * since 가 없으면 오늘 생긴 것.
 */
export function freshSince(events: UnlockEvent[], since: string | undefined, today: string, sinceIds?: string[]): Set<string> {
  const out = new Set<string>();
  // sinceIds 가 없는 예전 기록이면 그날 것은 모두 본 것으로 둔다.
  const known = sinceIds ? new Set(sinceIds) : null;
  for (const e of events) if (since ? e.at > since || (!!known && e.at === since && !known.has(e.id)) : e.at === today) out.add(e.id);
  return out;
}

/** 그날 생긴 마디와 개념의 id(지도를 본 때의 기록용) */
export function idsOn(events: UnlockEvent[], date: string): string[] {
  return events.filter((e) => e.at === date).map((e) => e.id).sort();
}
