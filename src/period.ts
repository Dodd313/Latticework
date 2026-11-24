// 주간, 월간 돌아보기(recap)의 기간과 숫자. 화면 없이 계산만 한다(React, react-native 를 쓰지 않는다).
//
// 보여 주는 때(2026-11-20 소유자 결정):
// - 주간: 그 주 토요일 0시(한국 시각)부터 일요일까지. 못 봤으면 다음 주 월요일에도(지난주를 보여 준다). 화~금은 없다.
// - 월간: 다음 달 1일부터 7일까지.
// - 기간마다 한 번만(seen.recaps). 아무것도 안 한 기간은 건너뛴다. 둘 다 볼 때가 되면 월간을 보여 주고 주간도 본 것으로 적는다.
import { addDays, dayDiff, isoWeekId, kstDate, mondayOf, monthDays, monthOf, shiftMonth, weekTitle, weekdayOf } from './dates';
import { firstOf, taxIndex, learnedTree } from './knowledge';
import { LogRow, StudyData, StudyState, levelOf, vocKind, xpFor } from './study';
import { Day, Review, UserData } from './types';
import { NumState, numPeriod } from './numeracy';

export type Period = {
  kind: 'week' | 'month';
  key: string; // 'w:<월요일>' 또는 'm:YYYY-MM'
  from: string;
  to: string;
  label: string; // '11월 3주' 또는 '11월'
  weekId?: string; // 주간이면 ISO 주 이름(주간 종합 퀴즈의 id)
};

export function weekPeriod(date: string): Period {
  const monday = mondayOf(date);
  return { kind: 'week', key: `w:${monday}`, from: monday, to: addDays(monday, 6), label: weekTitle(monday).replace(/차$/, ''), weekId: isoWeekId(monday) };
}

export function monthPeriod(key: string): Period {
  const all = monthDays(key);
  return { kind: 'month', key: `m:${key}`, from: all[0], to: all[all.length - 1], label: `${Number(key.slice(5, 7))}월` };
}

/** 오늘 보여 줄 돌아보기. active 가 false 인 기간(아무것도 안 함)은 건너뛴다. alsoSeen 은 함께 본 것으로 적을 열쇠. */
export function recapDue(today: string, seen: Record<string, string> | undefined, active: (p: Period) => boolean): { show: Period; alsoSeen: string[] } | null {
  const was = (p: Period) => !!(seen && seen[p.key]);
  const wd = weekdayOf(today);
  let week: Period | null = null;
  if (wd === 6 || wd === 0) week = weekPeriod(today);
  else if (wd === 1) week = weekPeriod(addDays(today, -7));
  if (week && was(week)) week = null;
  const dom = Number(today.slice(8, 10));
  let month: Period | null = dom <= 7 ? monthPeriod(shiftMonth(monthOf(today), -1)) : null;
  if (month && was(month)) month = null;
  if (month && active(month)) return { show: month, alsoSeen: week ? [week.key] : [] };
  if (week && active(week)) return { show: week, alsoSeen: [] };
  return null;
}

/** from 부터 min(to, today) 까지의 날짜 */
export function periodDates(p: Period, today: string): string[] {
  const end = p.to < today ? p.to : today;
  const n = dayDiff(p.from, end);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(p.from, i));
}

export type PeriodStats = {
  period: Period;
  dates: string[];
  doneDays: number;
  extra: number;
  streak: number;
  lat: {
    solved: number;
    discs: {
      id: string;
      ko: string;
      color: string;
      solved: number;
      branches: { id: string; ko: string; added: number; solved: number; names: string[]; groups: { topic: string | null; names: string[] }[] }[];
    }[];
    newConcepts: string[];
    newest?: string;
    newDiscs: string[];
  };
  voc: { added: number; words: number; phrases: number; terms: string[]; reviewed: number; total: number };
  news: {
    read: number;
    days: number;
    quizRight: number;
    quizAnswered: number;
    titles: { id: string; title: string; date: string }[];
    weekly: { id: string; right: number; total: number; taken: boolean } | null;
    weeklyTaken: number;
  };
  /** gained 는 Latticework, 영단어의 경험치(돌아보기에 보이는 수). all 은 Research 를 더한 전체(레벨 막대의 시작점 계산용). */
  xp: { gained: number; all: number; level: number; levelFrom: number };
  /** 수리: 세트 수, 문제 수, 맞힌 수, 같은 분야 같은 수준에서 첫 세트 대비 마지막 세트 중앙값 변화율(%)의 중앙값 */
  num: { sets: number; n: number; ok: number; change: number | null };
};

export type PeriodInput = {
  today: string;
  days: Day[];
  user: UserData;
  study: StudyState;
  data: StudyData | null;
  log: LogRow[];
  reviews: Review[];
  statusOf: (d: string) => string;
  extraOf: (d: string) => number;
  streak: number;
  num?: NumState | null;
};

/** 퀴즈 하나의 점수: 저장된 점수가 있으면 그것, 없으면 고른 답과 문항으로 센다. */
export function quizScore(user: UserData, id: string, questions: { answer: number }[] | null): { right: number; answered: number; total: number } | null {
  const s = user.scores?.[id];
  if (s) return { right: s.r, answered: s.a, total: s.n };
  const ans = user.quiz?.[id];
  if (!ans || !questions) return null;
  let right = 0;
  let answered = 0;
  questions.forEach((q, i) => {
    const a = ans[String(i)];
    if (a === undefined) return;
    answered += 1;
    if (a === q.answer) right += 1;
  });
  return answered ? { right, answered, total: questions.length } : null;
}

const cmpAt = (a: { at: string; id: string }, b: { at: string; id: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function periodStats(p: Period, input: PeriodInput): PeriodStats {
  const { today, days, user, study, data, log, reviews, statusOf, extraOf, streak } = input;
  const dates = periodDates(p, today);
  const from = p.from;
  const to = dates.length ? dates[dates.length - 1] : p.from;
  const inRange = (d: string) => !!d && d >= from && d <= to;
  const doneDays = dates.filter((d) => statusOf(d) === 'done').length;
  const extra = dates.reduce((n, d) => n + (extraOf(d) || 0), 0);

  // 틀려서 다시 나온 문제는 세지 않는다. 표시(r)가 없던 예전 기록은 같은 날 같은 문제가 또 나온 줄로 가린다
  // (하루 안에서는 이미 낸 문제를 다시 내지 않으므로, 같은 날 두 번째 줄은 다시 나온 문제다).
  const asked = new Set<string>();
  const rows = log.filter((r) => {
    const d = kstDate(r.t);
    if (!inRange(d)) return false;
    const k = `${d}|${r.k}|${r.q}`;
    const again = !!r.r || asked.has(k);
    asked.add(k);
    return !again;
  });

  // Latticework
  const latRows = rows.filter((r) => r.k === 'lat');
  const lat: PeriodStats['lat'] = { solved: latRows.length, discs: [], newConcepts: [], newDiscs: [] };
  if (data && data.nodes && data.nodes.length) {
    const idx = taxIndex(data);
    const tree = learnedTree(data, study.cards);
    type B = PeriodStats['lat']['discs'][number]['branches'][number];
    const discs = new Map<string, PeriodStats['lat']['discs'][number]>();
    const discRow = (id: string) => {
      let d = discs.get(id);
      if (!d) {
        const n = idx.node.get(id)!;
        discs.set(id, (d = { id, ko: n.ko, color: n.color ?? '#8b95a1', solved: 0, branches: [] }));
      }
      return d;
    };
    const branchRow = (discId: string, id: string): B => {
      const d = discRow(discId);
      let b = d.branches.find((x) => x.id === id);
      if (!b) d.branches.push((b = { id, ko: idx.node.get(id)?.ko ?? '', added: 0, solved: 0, names: [], groups: [] }));
      return b;
    };
    // 배운 학문은 이번 기간에 안 풀었어도 한 줄(회색)로 남긴다.
    for (const id of tree?.discs ?? []) if ((tree!.nodes.get(id)!.at ?? '') <= to) discRow(id);
    for (const r of latRows) {
      const d = idx.discOf(r.u);
      if (!d) continue;
      discRow(d.id).solved += 1;
      const b = idx.branchOf(r.u);
      if (b) branchRow(d.id, b.id).solved += 1;
    }
    const fresh = data.concepts
      .map((c) => ({ id: c.id, c, at: firstOf(study.cards[c.id]) }))
      .filter((x) => inRange(x.at))
      .sort(cmpAt);
    for (const x of fresh) {
      const d = idx.discOf(x.id);
      lat.newConcepts.push(x.c.name);
      if (!d) continue;
      const path = idx.pathOf(x.id);
      const b = path.find((n) => n.rank === 'branch') ?? d;
      const row = branchRow(d.id, b.id);
      row.added += 1;
      row.names.push(x.c.name);
      const topic = path.find((n) => n.rank === 'topic');
      const tname = topic ? topic.ko : null;
      let g = row.groups.find((y) => y.topic === tname);
      if (!g) row.groups.push((g = { topic: tname, names: [] }));
      g.names.push(x.c.name);
    }
    lat.newest = lat.newConcepts[lat.newConcepts.length - 1];
    lat.newDiscs = (tree?.discs ?? []).filter((id) => inRange(tree!.nodes.get(id)!.at)).map((id) => tree!.nodes.get(id)!.ko);
    lat.discs = [...discs.values()].sort((a, b) => b.solved - a.solved || (tree ? tree.discs.indexOf(a.id) - tree.discs.indexOf(b.id) : 0));
    for (const d of lat.discs) d.branches.sort((a, b) => b.added - a.added || b.solved - a.solved);
  } else if (data) {
    lat.newConcepts = data.concepts
      .map((c) => ({ id: c.id, c, at: firstOf(study.cards[c.id]) }))
      .filter((x) => inRange(x.at))
      .sort(cmpAt)
      .map((x) => x.c.name);
    lat.newest = lat.newConcepts[lat.newConcepts.length - 1];
  }

  // 영단어
  const voc: PeriodStats['voc'] = { added: 0, words: 0, phrases: 0, terms: [], reviewed: rows.filter((r) => r.k === 'voc').length, total: 0 };
  if (data) {
    const learned = data.vocab.filter((v) => !!study.cards[v.id]);
    voc.total = learned.length;
    const added = learned
      .map((v) => ({ id: v.id, v, at: firstOf(study.cards[v.id]) }))
      .filter((x) => inRange(x.at))
      .sort(cmpAt);
    voc.added = added.length;
    for (const x of added) {
      if (vocKind(x.v) === '구문') voc.phrases += 1;
      else voc.words += 1;
      voc.terms.push(x.v.term);
    }
  }

  // 뉴스: 읽은 기사, 읽은 날, 저녁 퀴즈, 주간 종합 퀴즈
  const readIds = Object.entries(user.read ?? {}).filter(([, at]) => inRange(kstDate(at)));
  const readDays = new Set(readIds.map(([, at]) => kstDate(at)));
  const articleOf = new Map<string, { title: string; date: string }>();
  for (const d of days) for (const a of d.articles) articleOf.set(a.id, { title: a.title, date: d.date });
  const titles = readIds
    .map(([id, at]) => {
      const e = user.newsLog?.[id];
      const a = articleOf.get(id);
      return { id, title: e?.t ?? a?.title ?? '', date: e?.d ?? a?.date ?? kstDate(at), at };
    })
    .filter((x) => x.title)
    .sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : a.date < b.date ? 1 : -1))
    .map(({ id, title, date }) => ({ id, title, date }));
  let quizRight = 0;
  let quizAnswered = 0;
  for (const date of dates) {
    const day = days.find((d) => d.date === date);
    const qs = day ? day.articles.flatMap((a) => a.quiz ?? []) : null;
    const s = quizScore(user, `day-${date}`, qs && qs.length ? qs : null);
    if (!s) continue;
    quizRight += s.right;
    quizAnswered += s.answered;
  }
  const weeklyOf = (weekId: string) => {
    const rv = reviews.find((r) => r.id === weekId) ?? null;
    const s = quizScore(user, weekId, rv ? rv.questions : null);
    if (!rv && !s) return null;
    const total = s?.total ?? rv?.questions.length ?? 0;
    return { id: weekId, right: s?.right ?? 0, total, taken: !!s && s.answered >= total && total > 0 };
  };
  let weekly: PeriodStats['news']['weekly'] = null;
  let weeklyTaken = 0;
  if (p.kind === 'week' && p.weekId) {
    weekly = weeklyOf(p.weekId);
    weeklyTaken = weekly?.taken ? 1 : 0;
  } else {
    // 그 달에 목요일이 든 주들
    const seenWeeks = new Set<string>();
    for (const d of monthDays(p.from.slice(0, 7))) {
      const id = isoWeekId(d);
      if (seenWeeks.has(id) || addDays(mondayOf(d), 3).slice(0, 7) !== p.from.slice(0, 7)) continue;
      seenWeeks.add(id);
      if (weeklyOf(id)?.taken) weeklyTaken += 1;
    }
  }
  const news = { read: readIds.length, days: readDays.size, quizRight, quizAnswered, titles, weekly, weeklyTaken };

  // 경험치
  // Research 는 선택 과제라 돌아보기의 경험치 수에 넣지 않는다. 레벨은 누적이라 시작 레벨은 전체로 계산한다.
  const all = rows.reduce((n, r) => n + xpFor(r.g), 0);
  const gained = rows.reduce((n, r) => n + (r.k === 'rs' ? 0 : xpFor(r.g)), 0);
  const xp = { gained, all, level: levelOf(study.xp), levelFrom: levelOf(Math.max(0, study.xp - all)) };

  const num = input.num ? numPeriod(input.num, from, to) : { sets: 0, n: 0, ok: 0, change: null };

  return { period: p, dates, doneDays, extra, streak, lat, voc, news, xp, num };
}
