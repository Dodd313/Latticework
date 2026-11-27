import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Day, EMPTY_USER, Market, Memo, NewsLogEntry, QuizScore, Review, SeenState, Thread, UserData } from './types';
import { addDays, kstDate, todayKST } from './dates';
import { Asked, Card, LAT_GOAL, LogRow, Q, ReadMark, ResearchData, StudyData, StudyDay, StudyState, Vocab, daysFromLog, carryWas, duePicker, emptyStudy, mergeMarks, newDayRecord, readOn, readQueue, rebuildFromLog, review, vocKind, withFirsts, xpFor } from './study';
import { LearnedTree, UnlockEvent, UnlockPlan, carryIds, carrySeen, firstOf, freshSince, idsOn, learnedTree, unlockEvents, unlockPlan } from './knowledge';
import { Period, PeriodStats, periodDates, periodStats, recapDue } from './period';
import type { LattiData } from './lattiTypes';
import { DAILY_TOTAL, NumItem, NumResult, NumState, SkillId, addSet, emptyNum, mergeNum, migrateNum, quotaDone } from './numeracy';
import { SheetInfo, SheetRow, SheetSet, Snapshot, SyncConf, backoff, emptyConf, fromSheetRow, hash53, rowId, sheetAll, sheetBeacon, sheetInfo, sheetPost, toSheetRow, toSheetSet, validUrl, withIds } from './sync';

// 저장소 연결.
// 지금은 페이지를 띄운 쪽이 주는 문서 저장소를 쓴다. 기사와 실은 모두가 읽는 공용 문서,
// 읽은 기록과 메모는 사람마다 따로 보관되는 개인 문서다.
// 네이티브 빌드로 옮길 때는 이 파일의 connect와 읽기·쓰기 함수만 바꾸면 된다.

type AnyDb = any;

type Backend = { db: AnyDb | null; uid: string | null };

let backendPromise: Promise<Backend> | null = null;

function connect(): Promise<Backend> {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    const c = (globalThis as any).claude;
    if (!c || typeof c.use !== 'function') return { db: null, uid: null };
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      let uid: string | null = null;
      if (user) {
        try {
          uid = await user.id();
        } catch {
          uid = null;
        }
      }
      return { db: db ?? null, uid };
    } catch {
      return { db: null, uid: null };
    }
  })();
  return backendPromise;
}

/** 자체 주소에 올린 빌드인지. 이때는 저장소 대신 같은 주소의 data/feed.json 을 읽는다. */
export const STANDALONE: boolean = !!(globalThis as any).__LW_STANDALONE__;

type Feed = { generatedAt?: string; days: Day[]; threads: Thread[]; reviews: Review[] };

async function loadStudy(): Promise<StudyData> {
  const res = await fetch('./data/study.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('복습 자료를 받지 못했습니다');
  return (await res.json()) as StudyData;
}

/** Latti 문구(늘 쓰는 줄과 오늘 줄). 자체 주소에서만 받는다. */
/** Research(분석 중인 기업의 사실) 자료. 자체 주소에서만 받는다. */
async function loadResearch(): Promise<ResearchData> {
  const res = await fetch('./data/research.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('research ' + res.status);
  return (await res.json()) as ResearchData;
}

async function loadLatti(): Promise<LattiData> {
  const res = await fetch('./data/latti.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('latti ' + res.status);
  return (await res.json()) as LattiData;
}

/** 기사 묶음 파일의 글 그대로. 지난번과 같으면 풀지도, 화면을 다시 그리지도 않는다. */
async function loadFeedText(): Promise<string> {
  const res = await fetch('./data/feed.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('feed ' + res.status);
  return await res.text();
}

// 기기 안 임시 보관. 연결 전 첫 화면을 채우고, 연결이 안 될 때의 대비책으로만 쓴다.
const CACHE_KEY = 'lw.cache.v1';
const USER_KEY = 'lw.user.v1';
const STUDY_DATA_KEY = 'lw.study.data.v1';
const STUDY_KEY = 'lw.study.state.v1';
const STUDY_LOG_KEY = 'lw.study.log.v1';
const LOG_CAP = 6000;
const LATTI_DATA_KEY = 'lw.latti.data.v1';
const RESEARCH_DATA_KEY = 'lw.research.data.v1';
const NUM_PARTIAL_KEY = 'lw.num.partial.v1';
/** sig 는 그 묶음 문제들의 글(같은 묶음인지 가린다). items 는 이미 답한 문제의 시간과 정답 여부. */
export type NumPartial = { date: string; k: SkillId; lv: number; sig: string; items: NumItem[] };
// 수리 기록(분야마다 한 세트에 한 줄, 분야별 수준, 날짜별 할당). 기기에만 두고 내보내기에 함께 넣는다.
const NUM_KEY = 'lw.num.v1';
// 시트 보내기(src/sync.ts, ops/sheet-sync.gs). 설정(주소, 기기 id, 순번, 보낸 수)과 아직 시트가 받았다고 답하지 않은 줄.
const SYNC_KEY = 'lw.sync.v1';
const SYNC_Q_KEY = 'lw.sync.q.v1';
const SYNC_EVERY = 3 * 60 * 1000;
const SYNC_BATCH_ROWS = 400;
/**
 * 2026-11-21 사용자 결정: 시트로는 학습 기록(영단어, Latticework 풀이와 수리 세트)만 보낸다.
 * 상태 줄에도 학습 기록(날짜별 푼 수, 경험치, 기억 상태 사본, 수리 수준과 할당)만 담고,
 * 읽은 기사, 퀴즈 답, 메모, 본 해금 같은 개인 기록(user)은 뉴스와 지식 저장 구조를 정한 뒤에 다시 넣는다.
 */
const SYNC_USER_STATE = false;
const SYNC_BATCH_SETS = 300;
const BEACON_MAX = 60000;
// Latti 가 한 줄을 보여 준 시각(줄 id → 시각). 기기에만 둔다. 30일 지난 것은 버린다.
const LATTI_HIST_KEY = 'lw.latti.hist.v1';
const LATTI_HIST_DAYS = 30;

function loadLocal<T>(key: string): T | null {
  try {
    const raw = (globalThis as any).localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveLocal(key: string, value: unknown) {
  try {
    (globalThis as any).localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간을 못 쓰는 환경에서는 조용히 넘어간다.
  }
}

// 기기 안 보관은 누른 순간에 하지 않고 조금 뒤(움직임이 끝난 뒤 한가할 때)에 한꺼번에 한다.
// 같은 열쇠에 여러 번 쓰면 마지막 값 하나만 쓴다. 값은 쓰는 순간에 get() 으로 읽으므로 언제나 최신이다.
// 앱을 닫거나 다른 앱으로 넘어가면(pagehide, 화면 숨김) 기다리지 않고 바로 쓴다.
const pendingSaves = new Map<string, () => unknown>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveIdle: number | null = null;
const SAVE_AFTER = 700;

function flushSaves() {
  if (saveTimer) clearTimeout(saveTimer);
  if (saveIdle != null) (globalThis as any).cancelIdleCallback?.(saveIdle);
  saveTimer = null;
  saveIdle = null;
  const items = [...pendingSaves];
  pendingSaves.clear();
  for (const [key, get] of items) saveLocal(key, get());
}

function saveLater(key: string, get: () => unknown) {
  pendingSaves.set(key, get);
  if (saveTimer || saveIdle != null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const ric = (globalThis as any).requestIdleCallback as undefined | ((cb: () => void, o: { timeout: number }) => number);
    if (ric) saveIdle = ric(() => ((saveIdle = null), flushSaves()), { timeout: 2000 });
    else flushSaves();
  }, SAVE_AFTER);
}

try {
  const w = globalThis as any;
  if (w.addEventListener && w.document) {
    w.addEventListener('pagehide', flushSaves);
    w.document.addEventListener('visibilitychange', () => {
      if (w.document.visibilityState === 'hidden') flushSaves();
    });
  }
} catch {
  // 알림을 못 받는 환경이면 정해진 시간에 쓴다.
}

type Status = 'loading' | 'live' | 'offline';

/** 설정 화면이 보는 시트 보내기 상태. pending 은 아직 시트가 받았다고 답하지 않은 줄 수, failing 은 마지막 시도가 실패했는지. */
export type SyncView = { url: string; sent: number; lastAt: string | null; pending: number; failing: boolean };
type SyncQueue = { rows: SheetRow[]; sets: SheetSet[] };

/** 퀴즈 답 하나의 결과. prevRight, prevAnswered 는 이 답 전까지 맞힌 수와 답한 수(점수 칸이 없던 예전 답을 셀 때만 쓴다). */
export type QuizMeta = { right: boolean; total: number; prevRight?: number; prevAnswered?: number };

type Store = {
  status: Status;
  canSave: boolean;
  days: Day[];
  threads: Thread[];
  reviews: Review[];
  user: UserData;
  markRead: (articleId: string, read: boolean) => void;
  setMemo: (articleId: string, text: string) => void;
  setMarket: (market: Market) => void;
  /** meta 를 주면 점수(user.scores)도 함께 적는다. */
  answerQuiz: (reviewId: string, index: number, choice: number, meta?: QuizMeta) => void;
  /** 해금이나 돌아보기를 보여 줬다고 적는다(한 번에 저장). unlock 은 마디 id, recap 은 'w:<월요일>' 또는 'm:YYYY-MM' */
  markSeen: (kind: 'unlock' | 'recap', ids: string[]) => void;
  /** 지식 탭의 Latticework 지도를 오늘 봤다고 적는다(반짝임의 기준) */
  markMapSeen: () => void;
  latti: LattiData | null; // Latti 문구. 없으면 화면은 예전 문구(cheer.ts)를 쓴다
  lattiHist: () => Record<string, number>; // 줄 id → 보여 준 시각. 읽기만 한다
  noteLatti: (id: string) => void; // 한 줄을 보여 줬다고 적는다
  studyLog: () => LogRow[]; // 풀이 기록(읽기만 한다. 바꾸지 않는다)
  studyData: StudyData | null; // 복습 문제와 표현. 자체 주소에서만 받는다
  researchData: ResearchData | null; // Research: 분석 중인 기업과 그 사실. 자체 주소에서만 받는다
  study: StudyState; // 항목별 기억 상태와 날짜별 푼 수
  studyAsked: () => Asked; // 오늘 이미 낸 문제와 항목
  recordStudy: (q: Q, result: { ok: boolean; attempts: number; sec: number; grade: 1 | 2 | 3 }) => void;
  /** 일일 학습 화면의 표시: ok 이해했어요(다음 날부터 문제로 낼 수 있음), later 나중에 다시, skip 빼기 */
  markConcept: (conceptId: string, k: ReadMark['k']) => void;
  num: NumState; // 수리 기록
  /** 수리 한 분야 한 세트를 마쳤다고 적는다. daily 면 오늘 할당으로 센다(할당을 이미 채운 분야면 추가 학습). */
  recordNum: (k: SkillId, lv: number, items: NumItem[], daily: boolean) => NumResult;
  /** 수리 6문제 묶음을 풀다 나간 자리(기기 안에만). 다시 열면 같은 묶음의 남은 문제부터 잇는다. */
  numPartial: () => NumPartial | null;
  saveNumPartial: (p: NumPartial | null) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
  sync: SyncView; // 시트 보내기 상태(보낼 때마다가 아니라 한 번 보내기를 마칠 때 바뀐다)
  /** 웹 앱 주소를 기기에 적는다. 주소가 바뀌면 기기의 기록 전체를 다시 보낼 차례에 넣는다(시트가 같은 줄을 거른다). */
  setSyncUrl: (url: string) => boolean;
  /** 연결 시험: 빈 묶음을 보내 답을 받고, 시트의 개수를 읽는다. 실패면 null. */
  testSync: () => Promise<SheetInfo | null>;
  /** 시트의 개수만 읽는다(불러오기 제안). 실패면 null. */
  probeSheet: () => Promise<SheetInfo | null>;
  /** 시트의 기록을 모두 받아 기기의 기록과 합친다. 기억 상태는 풀이 기록을 다시 풀어 만든다. 실패면 null. */
  restoreFromSheet: () => Promise<{ rows: number; sets: number } | null>;
};

const StoreCtx = createContext<Store | null>(null);

/**
 * 안쪽 화면이 덮고 있거나 보이지 않는 화면(탭, 아래 깔린 화면)용. 기록이 바뀌면 바로 다시 그리지 않고,
 * 맨 위 화면을 먼저 그린 뒤 틈틈이(끊어 가며) 다시 그린다. 누른 순간의 일이 그만큼 가벼워진다.
 * defer 가 false 면(맨 위 화면) 그대로 바로 그린다.
 */
export function StoreDefer({ defer = true, children }: { defer?: boolean; children: React.ReactNode }) {
  const live = useContext(StoreCtx);
  // 가려진 동안은 마지막 값을 붙들어 아예 다시 그리지 않는다(문제 하나 풀 때마다 홈과 기록 탭 전체가 다시 그려지던 렉, 2026-11-27).
  // 다시 보이면 붙든 값으로 먼저 그리고, 새 값은 한 박자 늦게(끊어 가며) 따라잡는다.
  // 가려진 동안은 값이 바뀔 때마다 다시 그리지 않고, 1.2초 동안 더 바뀌지 않으면 한가한 틈에 따라잡는다.
  // 그래서 문제를 연달아 푸는 동안에는 가려진 탭이 그려지지 않고, 돌아올 때는 대개 이미 새 값이라 옛 숫자가 비치지 않는다.
  // 보이는 화면(defer false)은 늘 새 값으로 바로 그린다.
  const [held, setHeld] = useState(live);
  useEffect(() => {
    if (!defer || held === live) return;
    const g = globalThis as any;
    let idle: any = null;
    const timer = setTimeout(() => {
      const run = () => startTransition(() => setHeld(live));
      idle = g.requestIdleCallback ? g.requestIdleCallback(run, { timeout: 1500 }) : setTimeout(run, 0);
    }, 1200);
    return () => {
      clearTimeout(timer);
      if (idle != null) (g.cancelIdleCallback && g.requestIdleCallback ? g.cancelIdleCallback(idle) : clearTimeout(idle));
    };
  }, [defer, live, held]);
  return <StoreCtx.Provider value={defer ? held : live}>{children}</StoreCtx.Provider>;
}

/** 오늘 기록이 아직 진행 전이면(푼 문제 0) 지금 기억 상태로 오늘 분량을 다시 정한다. 읽기 목표와 읽은 수는 남긴다. */
function refreshToday(st: StudyState, data: StudyData | null, today: string): StudyState {
  const rec = st.days[today];
  if (!data || (rec && rec.lat + rec.voc + (rec.extra ?? 0) > 0)) return st;
  const fresh = newDayRecord(data, st, today);
  const day: StudyDay = { ...fresh, ...(rec?.readGoal != null ? { readGoal: rec.readGoal } : {}), ...(rec?.read != null ? { read: rec.read } : {}) };
  return { ...st, days: { ...st.days, [today]: day } };
}

function mergeUser(a: UserData, b: Partial<UserData> | null | undefined): UserData {
  if (!b) return a;
  const read = { ...a.read };
  for (const [k, v] of Object.entries(b.read ?? {})) {
    if (!read[k] || read[k] < v) read[k] = v;
  }
  const memos: Record<string, Memo> = { ...a.memos };
  for (const [k, v] of Object.entries(b.memos ?? {})) {
    if (!memos[k] || memos[k].updatedAt < v.updatedAt) memos[k] = v;
  }
  const quiz = { ...a.quiz };
  for (const [k, v] of Object.entries(b.quiz ?? {})) quiz[k] = { ...(quiz[k] ?? {}), ...v };
  const daily = { ...(a.daily ?? {}) };
  for (const [k, v] of Object.entries(b.daily ?? {})) {
    const cur = daily[k];
    // 같은 날 기록이 둘이면 더 일찍 목표를 채운 쪽을 남긴다.
    if (!cur || (v.doneAt && (!cur.doneAt || v.doneAt < cur.doneAt)) || (!cur.doneAt && !v.doneAt && v.read > cur.read)) daily[k] = v;
  }
  const newsLog: Record<string, NewsLogEntry> = { ...(b.newsLog ?? {}), ...(a.newsLog ?? {}) };
  const scores: Record<string, QuizScore> = { ...(a.scores ?? {}) };
  for (const [k, v] of Object.entries(b.scores ?? {})) {
    if (!scores[k] || v.a > scores[k].a) scores[k] = v;
  }
  const earlier = (x: Record<string, string> | undefined, y: Record<string, string> | undefined) => {
    const out = { ...(x ?? {}) };
    for (const [k, v] of Object.entries(y ?? {})) if (!out[k] || v < out[k]) out[k] = v;
    return out;
  };
  const sa: Partial<SeenState> = a.seen ?? {};
  const sb: Partial<SeenState> = b.seen ?? {};
  const map = sa.map && sb.map ? (sa.map > sb.map ? sa.map : sb.map) : (sa.map ?? sb.map);
  // 지도를 본 날이 같으면 그날 본 것을 합치고, 다르면 늦은 쪽 것을 쓴다.
  // 그날 본 것 목록이 없는 쪽(예전 기록)이 있으면 그날 것은 모두 본 것으로 둔다(목록을 남기지 않는다).
  const same = [sa, sb].filter((x) => !!map && x.map === map);
  const mapIds = same.length && same.every((x) => Array.isArray(x.mapIds)) ? [...new Set(same.flatMap((x) => x.mapIds!))].sort() : undefined;
  const seen: SeenState = { unlocks: earlier(sa.unlocks, sb.unlocks), recaps: earlier(sa.recaps, sb.recaps), ...(map ? { map } : null), ...(mapIds ? { mapIds } : null) };
  return { read, daily, memos, quiz, settings: { ...a.settings, ...(b.settings ?? {}) }, newsLog, scores, seen };
}

/** 읽은 기사의 제목과 날짜를 남긴다(기사 묶음에 있는 것만). 바뀐 것이 없으면 받은 객체를 그대로 돌려준다. */
function withNewsLog(user: UserData, days: Day[]): UserData {
  let log: Record<string, NewsLogEntry> | null = null;
  for (const day of days) {
    for (const a of day.articles) {
      if (!user.read[a.id] || user.newsLog?.[a.id]) continue;
      log ??= { ...(user.newsLog ?? {}) };
      log[a.id] = newsEntry(a, day.date);
    }
  }
  return log ? { ...user, newsLog: log } : user;
}

function newsEntry(a: { title: string; url?: string; source?: string }, date: string): NewsLogEntry {
  const e: NewsLogEntry = { t: a.title, d: date };
  if (a.url) e.u = a.url;
  if (a.source) e.s = a.source;
  return e;
}

/** 읽은 기록으로 날짜별 목표 기록을 맞춘다. 바뀐 것이 없으면 받은 객체를 그대로 돌려준다. */
function withDaily(user: UserData, days: Day[]): UserData {
  const daily = { ...(user.daily ?? {}) };
  let changed = !user.daily;
  for (const day of days) {
    if (!day.articles.length) continue;
    const times = day.articles.map((a) => user.read[a.id]).filter(Boolean) as string[];
    const all = times.length === day.articles.length;
    const cur = daily[day.date];
    const doneAt = all ? (cur?.doneAt ?? times.slice().sort().pop()) : undefined;
    if (!cur || cur.total !== day.articles.length || cur.read !== times.length || cur.doneAt !== doneAt) {
      daily[day.date] = doneAt ? { total: day.articles.length, read: times.length, doneAt } : { total: day.articles.length, read: times.length };
      changed = true;
    }
  }
  return changed ? { ...user, daily } : user;
}

// 문서 하나에는 한 번에 한 건씩만 쓴다. 연달아 들어온 변경은 마지막 값 하나로 합친다.
function makeWriter(ref: any) {
  let busy = false;
  let pending: Record<string, unknown> | null = null;
  const run = async () => {
    if (busy) return;
    busy = true;
    while (pending) {
      const body = pending;
      pending = null;
      try {
        await ref.set(body);
      } catch {
        // 쓰기가 거절돼도 화면은 그대로 둔다. 기기 안 보관본이 남아 있다.
      }
    }
    busy = false;
  };
  return (body: Record<string, unknown>) => {
    pending = body;
    void run();
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const cached = useMemo(() => loadLocal<{ days: Day[]; threads: Thread[]; reviews: Review[] }>(CACHE_KEY), []);
  const [status, setStatus] = useState<Status>('loading');
  const [canSave, setCanSave] = useState(false);
  const [days, setDays] = useState<Day[]>(cached?.days ?? []);
  const [threads, setThreads] = useState<Thread[]>(cached?.threads ?? []);
  const [reviews, setReviews] = useState<Review[]>(cached?.reviews ?? []);
  const [user, setUser] = useState<UserData>(() => mergeUser(EMPTY_USER, loadLocal<UserData>(USER_KEY)));

  const [studyData, setStudyData] = useState<StudyData | null>(() => loadLocal<StudyData>(STUDY_DATA_KEY));
  // 풀이 기록은 메모리에 두고 붙여 쓴다. 처음 필요할 때 한 번만 읽는다(최대 6,000줄).
  const logRef = useRef<LogRow[] | null>(null);
  // 시트 보내기 설정. 기기 id 는 처음 한 번 만든다(주소가 없어도 새 풀이 줄에 id 를 붙인다).
  const syncRef = useRef<SyncConf | null>(null);
  const getConf = useCallback((): SyncConf => {
    if (!syncRef.current) {
      const c = loadLocal<SyncConf>(SYNC_KEY);
      syncRef.current = c && typeof c.device === 'string' && c.device ? { ...emptyConf(), ...c } : emptyConf();
      if (!c) saveLater(SYNC_KEY, () => syncRef.current);
    }
    return syncRef.current;
  }, []);
  // id 가 없는 예전 줄에는 내용의 해시로 id 를 붙인다(어느 기기에서 붙여도 같다).
  // 순번은 기록에 남은 이 기기 id 의 가장 큰 순번 뒤부터 잇는다(설정 저장이 늦어도 같은 id 가 두 번 나오지 않게).
  const getLog = useCallback(() => {
    if (!logRef.current) {
      const raw = loadLocal<LogRow[]>(STUDY_LOG_KEY) ?? [];
      const log = withIds(raw);
      logRef.current = log;
      if (log !== raw) saveLater(STUDY_LOG_KEY, () => logRef.current);
      const conf = getConf();
      const pre = conf.device + '.';
      for (const r of log) if (r.id && r.id.startsWith(pre)) conf.seq = Math.max(conf.seq, Number(r.id.slice(pre.length)) || 0);
    }
    return logRef.current;
  }, []);
  const [study, setStudy] = useState<StudyState>(() => {
    const st = loadLocal<StudyState>(STUDY_KEY);
    if (!st) return emptyStudy(todayKST());
    // 예전 기록: 처음 답한 날(first)이 없는 항목은 풀이 기록으로 한 번 채우고 저장한다.
    if (!st.cards || Object.values(st.cards).every((c) => c.first)) return st;
    const next = withFirsts(st, getLog());
    if (next !== st) saveLater(STUDY_KEY, () => studyRef.current);
    return next;
  });
  const studyRef = useRef(study);
  studyRef.current = study;
  // 하위 요소로 옮긴 개념의 기억 상태를 부모 개념으로 옮긴다(자료가 바뀌거나 기록을 가져온 뒤에도 한 번씩 본다).
  useEffect(() => {
    if (!studyData) return;
    const next = carryWas(studyData, studyRef.current);
    if (next === studyRef.current) return;
    studyRef.current = next;
    setStudy(next);
    saveLater(STUDY_KEY, () => studyRef.current);
  }, [studyData, study]);

  // 수리: 처음 여는 날을 시작일로 적어 둔다(그날부터 하루 목표에 든다. 그 전 날의 기록은 그대로).
  const [num, setNum] = useState<NumState>(() => {
    const today = todayKST();
    const raw = loadLocal<unknown>(NUM_KEY);
    const st = (raw ? migrateNum(raw, today) : null) ?? emptyNum(today);
    if (!raw) saveLater(NUM_KEY, () => numRef.current);
    return st;
  });
  const numRef = useRef(num);
  numRef.current = num;

  const [latti, setLatti] = useState<LattiData | null>(() => loadLocal<LattiData>(LATTI_DATA_KEY));
  const [researchData, setResearchData] = useState<ResearchData | null>(() => loadLocal<ResearchData>(RESEARCH_DATA_KEY));
  const lattiHistRef = useRef<Record<string, number> | null>(null);
  const lattiHist = useCallback(() => {
    if (!lattiHistRef.current) {
      const raw = loadLocal<Record<string, number>>(LATTI_HIST_KEY) ?? {};
      const cut = Date.now() - LATTI_HIST_DAYS * 86400000;
      const kept: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v >= cut) kept[k] = v;
      lattiHistRef.current = kept;
    }
    return lattiHistRef.current;
  }, []);
  const noteLatti = useCallback((id: string) => {
    lattiHistRef.current = { ...lattiHist(), [id]: Date.now() };
    saveLater(LATTI_HIST_KEY, lattiHist);
  }, []);

  const writers = useRef<{ progress?: (b: any) => void; memos?: (b: any) => void; settings?: (b: any) => void; quiz?: (b: any) => void; seen?: (b: any) => void }>({});
  const userRef = useRef(user);
  userRef.current = user;
  const daysRef = useRef(days);
  daysRef.current = days;
  // 화면을 닫을 때 남은 저장을 마친다.
  useEffect(() => () => flushSaves(), []);
  const cacheRef = useRef({ days, threads, reviews });
  cacheRef.current = { days, threads, reviews };

  useEffect(() => {
    let alive = true;
    const unsubs: (() => void)[] = [];

    connect().then(async ({ db, uid }) => {
      if (!alive) return;
      if (!db) {
        if (!STANDALONE) {
          setStatus('offline');
          return;
        }
        // 자체 주소: 기사 묶음 파일을 읽고, 앱으로 돌아올 때마다 새로 받는다.
        let latest = '';
        let lastText = '';
        const refresh = async () => {
          try {
            const text = await loadFeedText();
            if (!alive) return;
            // 지난번에 받은 것과 같으면(대부분의 다시 받기) 아무것도 바꾸지 않는다.
            if (text === lastText) {
              setStatus('live');
              return;
            }
            lastText = text;
            const feed = JSON.parse(text) as Feed;
            const nextDays = (feed.days ?? []).filter((d) => d && d.date && Array.isArray(d.articles)).sort((a, b) => b.date.localeCompare(a.date));
            const nextThreads = (feed.threads ?? []).filter((t) => t && t.id && Array.isArray(t.entries));
            nextThreads.sort((a, b) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt));
            const nextReviews = (feed.reviews ?? []).filter((r) => r && r.id && Array.isArray(r.questions)).sort((a, b) => b.id.localeCompare(a.id));
            latest = nextDays[0]?.date ?? '';
            setDays(nextDays);
            setThreads(nextThreads);
            setReviews(nextReviews);
            saveLater(CACHE_KEY, () => ({ days: nextDays.slice(0, 40), threads: nextThreads, reviews: nextReviews.slice(0, 4) }));
            setStatus('live');
          } catch {
            if (alive) setStatus('offline');
          }
        };
        void refresh();
        loadStudy()
          .then((data) => {
            if (!alive || !data || !Array.isArray(data.concepts)) return;
            setStudyData(data);
            saveLocal(STUDY_DATA_KEY, data);
          })
          .catch(() => {
            // 못 받으면 기기에 남아 있는 자료로 계속 쓴다.
          });
        loadResearch()
          .then((data) => {
            if (!alive || !data || !Array.isArray(data.companies) || !Array.isArray(data.facts)) return;
            setResearchData(data);
            saveLater(RESEARCH_DATA_KEY, () => data);
          })
          .catch(() => {
            // 못 받으면 기기에 남아 있는 자료로 계속 쓴다.
          });
        loadLatti()
          .then((data) => {
            if (!alive || !data || !Array.isArray(data.bank) || !data.rules) return;
            setLatti(data);
            saveLater(LATTI_DATA_KEY, () => data);
          })
          .catch(() => {
            // 못 받으면 기기에 남아 있는 문구로 계속 쓴다.
          });
        const doc = (globalThis as any).document;
        const onVisible = () => {
          if (doc && doc.visibilityState === 'visible') void refresh();
        };
        doc?.addEventListener?.('visibilitychange', onVisible);
        // 오늘 자 기사가 아직 없으면 1분마다 다시 받아, 발행되는 대로 화면에 띄운다. 그 밖에는 15분마다.
        // 기사는 주말과 공휴일에도 매일 나온다(2026-11-21 사용자 결정).
        let ticks = 0;
        const timer = setInterval(() => {
          ticks += 1;
          if (doc && doc.visibilityState !== 'visible') return;
          const today = todayKST();
          const waiting = latest < today;
          if (waiting || ticks % 15 === 0) void refresh();
        }, 60 * 1000);
        unsubs.push(() => {
          doc?.removeEventListener?.('visibilitychange', onVisible);
          clearInterval(timer);
        });
        return;
      }

      const persistCache = () => {
        const c = cacheRef.current;
        saveLocal(CACHE_KEY, { days: c.days.slice(0, 40), threads: c.threads, reviews: c.reviews.slice(0, 4) });
      };

      try {
        unsubs.push(
          db
            .collection('days')
            .orderBy('date', 'desc')
            .limit(200)
            .onSnapshot(
              (snap: any) => {
                if (!alive) return;
                const next = snap.docs.map((d: any) => d.data() as Day).filter((d: Day) => d && d.date && Array.isArray(d.articles));
                setDays(next);
                cacheRef.current = { ...cacheRef.current, days: next };
                persistCache();
                setStatus('live');
              },
              () => alive && setStatus('offline'),
            ),
        );
        unsubs.push(
          db.collection('threads').onSnapshot(
            (snap: any) => {
              if (!alive) return;
              const next = snap.docs.map((d: any) => d.data() as Thread).filter((t: Thread) => t && t.id && Array.isArray(t.entries));
              next.sort((a: Thread, b: Thread) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt));
              setThreads(next);
              cacheRef.current = { ...cacheRef.current, threads: next };
              persistCache();
            },
            () => {},
          ),
        );
        unsubs.push(
          db
            .collection('reviews')
            .orderBy('id', 'desc')
            .limit(12)
            .onSnapshot(
              (snap: any) => {
                if (!alive) return;
                const next = snap.docs.map((d: any) => d.data() as Review).filter((r: Review) => r && r.id && Array.isArray(r.questions));
                setReviews(next);
                cacheRef.current = { ...cacheRef.current, reviews: next };
                persistCache();
              },
              () => {},
            ),
        );
      } catch {
        setStatus('offline');
      }

      if (!uid) return;
      try {
        const base = db.collection('data/users/' + uid);
        const refs = { progress: base.doc('progress'), memos: base.doc('memos'), settings: base.doc('settings'), quiz: base.doc('quiz'), seen: base.doc('seen') };
        const [p, m, s, q, sn] = await Promise.all([refs.progress.get(), refs.memos.get(), refs.settings.get(), refs.quiz.get(), refs.seen.get().catch(() => ({ exists: false }))]);
        if (!alive) return;
        const seenDoc = sn.exists ? ((sn as any).data() as any) : null;
        const remote: Partial<UserData> = {
          read: p.exists ? ((p.data() as any).read ?? {}) : {},
          daily: p.exists ? ((p.data() as any).daily ?? {}) : {},
          newsLog: p.exists ? ((p.data() as any).newsLog ?? {}) : {},
          memos: m.exists ? ((m.data() as any).memos ?? {}) : {},
          settings: s.exists ? (s.data() as any) : undefined,
          quiz: q.exists ? ((q.data() as any).answers ?? {}) : {},
          scores: q.exists ? ((q.data() as any).scores ?? {}) : {},
          seen: seenDoc ? { unlocks: seenDoc.unlocks ?? {}, recaps: seenDoc.recaps ?? {}, ...(seenDoc.map ? { map: seenDoc.map, ...(Array.isArray(seenDoc.mapIds) ? { mapIds: seenDoc.mapIds } : null) } : null) } : { unlocks: {}, recaps: {} },
        };
        writers.current = {
          progress: makeWriter(refs.progress),
          memos: makeWriter(refs.memos),
          settings: makeWriter(refs.settings),
          quiz: makeWriter(refs.quiz),
          seen: makeWriter(refs.seen),
        };
        setCanSave(true);
        setUser((local) => {
          const merged = mergeUser(local, remote);
          saveLocal(USER_KEY, merged);
          // 기기에만 있던 기록이 있으면 저장소에도 올려 둔다.
          const n = (o: object | undefined) => Object.keys(o ?? {}).length;
          if (n(merged.read) !== n(remote.read) || n(merged.newsLog) !== n(remote.newsLog)) {
            writers.current.progress?.({ read: merged.read, daily: merged.daily, newsLog: merged.newsLog, updatedAt: new Date().toISOString() });
          }
          if (n(merged.memos) !== n(remote.memos)) {
            writers.current.memos?.({ memos: merged.memos, updatedAt: new Date().toISOString() });
          }
          // 점수는 답한 수가 더 많은 쪽이 남으므로, 기기 쪽이 더 많이 답한 퀴즈가 있어도 올린다.
          if (n(merged.scores) !== n(remote.scores) || Object.entries(merged.scores).some(([k, v]) => (remote.scores?.[k]?.a ?? -1) < v.a)) {
            writers.current.quiz?.({ answers: merged.quiz, scores: merged.scores, updatedAt: new Date().toISOString() });
          }
          const rs = remote.seen!;
          if (n(merged.seen.unlocks) !== n(rs.unlocks) || n(merged.seen.recaps) !== n(rs.recaps) || merged.seen.map !== rs.map || n(merged.seen.mapIds) !== n(rs.mapIds)) {
            writers.current.seen?.({ ...merged.seen, updatedAt: new Date().toISOString() });
          }
          return merged;
        });
      } catch {
        // 개인 기록을 못 읽으면 기기 안 보관본으로 계속 쓴다.
      }
    });

    return () => {
      alive = false;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // 이미 끊긴 구독은 무시한다.
        }
      });
    };
  }, []);

  const commit = useCallback((next: UserData, part: 'progress' | 'memos' | 'settings' | 'quiz' | 'seen') => {
    userRef.current = next;
    setUser(next);
    saveLater(USER_KEY, () => userRef.current);
    const now = new Date().toISOString();
    if (part === 'progress') writers.current.progress?.({ read: next.read, daily: next.daily, newsLog: next.newsLog, updatedAt: now });
    if (part === 'memos') writers.current.memos?.({ memos: next.memos, updatedAt: now });
    if (part === 'settings') writers.current.settings?.({ ...next.settings, updatedAt: now });
    if (part === 'quiz') writers.current.quiz?.({ answers: next.quiz, scores: next.scores, updatedAt: now });
    if (part === 'seen') writers.current.seen?.({ ...next.seen, updatedAt: now });
  }, []);

  // 읽은 기록이나 기사 목록이 바뀌면 날짜별 목표 기록과 읽은 기사 목록(제목, 날짜)을 맞춰 한 번에 저장한다.
  useEffect(() => {
    const next = withNewsLog(withDaily(userRef.current, days), days);
    if (next !== userRef.current) commit(next, 'progress');
  }, [days, user.read, commit]);

  // 복습 자료가 있으면 오늘의 목표 문항 수를 한 번 정해 둔다.
  const todayStr = todayKST();
  useEffect(() => {
    if (!studyData) return;
    const cur = studyRef.current;
    if (cur.days[todayStr]) return;
    // 하루 분량(예산, 새 항목 수, 회복)은 아침에 한 번 정해 그날 기록에 고정한다(src/study.ts sectPlan).
    const next: StudyState = { ...cur, days: { ...cur.days, [todayStr]: newDayRecord(studyData, cur, todayStr) } };
    studyRef.current = next;
    setStudy(next);
    saveLater(STUDY_KEY, () => studyRef.current);
  }, [studyData, todayStr]);

  // 읽을 개념이 있는 날은 읽기 목표 1개(2026-11-27 소유자 결정). 낮에 새 카드가 들어와도 1로 올린다.
  // 아무것도 읽지 않았는데 읽을 차례가 비면(자료가 바뀌어 빠지는 등) 0으로 되돌린다. 할 일이 없는 목표로 연속 기록이 끊기지 않게.
  useEffect(() => {
    if (!studyData) return;
    const cur = studyRef.current;
    const rec = cur.days[todayStr];
    if (!rec) return;
    const want = readQueue(studyData, cur).length > 0 || (rec.read ?? 0) > 0 ? 1 : 0;
    if ((rec.readGoal ?? 0) === want) return;
    const next: StudyState = { ...cur, days: { ...cur.days, [todayStr]: { ...rec, readGoal: want } } };
    studyRef.current = next;
    setStudy(next);
    saveLater(STUDY_KEY, () => studyRef.current);
  }, [studyData, study.days[todayStr], todayStr]);

  const markConcept = useCallback((conceptId: string, k: ReadMark['k']) => {
    const cur = studyRef.current;
    const now = new Date();
    const today = todayKST();
    // 이해했어요와 빼기는 그날 읽은 수로 센다(지난 날 기록은 표시가 나중에 바뀌어도 그대로).
    const rec = cur.days[today];
    const days = rec && k !== 'later' ? { ...cur.days, [today]: { ...rec, read: (rec.read ?? 0) + 1 } } : cur.days;
    const next: StudyState = { ...cur, days, marks: { ...(cur.marks ?? {}), [conceptId]: { k, d: today, t: now.toISOString() } } };
    studyRef.current = next;
    setStudy(next);
    saveLater(STUDY_KEY, () => studyRef.current);
  }, []);

  const studyDataRef = useRef(studyData);
  studyDataRef.current = studyData;
  const recordStudy = useCallback((q: Q, result: { ok: boolean; attempts: number; sec: number; grade: 1 | 2 | 3 }) => {
    const cur = studyRef.current;
    const now = new Date();
    const today = todayKST();
    const cards = { ...cur.cards };
    // 틀려서 다시 나온 문제는 기억 상태를 또 바꾸지 않는다.
    // 다음 복습 날은 그 구역에서 복습 예정이 가장 적은 날로(간격의 앞뒤 10% 안).
    if (!q.retry) cards[q.unit] = review(cards[q.unit], result.grade, now, today, q.type, duePicker(studyDataRef.current, cur.cards, q.sect, today, q.unit));
    // Research 는 선택 과제라 그날의 하루 목표, 추가 학습 수를 건드리지 않는다. 기억 상태, 경험치, 기록 줄만 남긴다.
    const rs = q.sect === 'rs';
    // 그날 기록이 아직 없으면(자정을 넘겨 푼 경우 등) 아침에 정하는 것과 같은 방식으로 목표를 정한다.
    const sd = studyDataRef.current;
    const day = { ...(cur.days[today] ?? (sd ? newDayRecord(sd, cur, today) : { lat: 0, voc: 0, latGoal: LAT_GOAL, vocGoal: 0 })) };
    // 할당량인지 더 푼 것인지는 답을 저장하는 순간, 그날 기록을 보고 정한다. 다시 나온 문제는 어느 쪽에도 세지 않는다.
    const counts = !rs && !q.retry && (q.sect === 'lat' ? day.lat < day.latGoal : day.voc < day.vocGoal);
    const extra = !rs && !q.retry && !counts;
    if (counts) {
      if (q.sect === 'lat') {
        day.lat += 1;
        if (!day.latDoneAt && day.lat >= day.latGoal) day.latDoneAt = now.toISOString();
      } else {
        day.voc += 1;
        if (!day.vocDoneAt && day.voc >= day.vocGoal) day.vocDoneAt = now.toISOString();
      }
    } else if (extra) {
      // 할당량을 넘겨 더 푼 문제. 달력의 색 짙기에 쓴다.
      day.extra = (day.extra ?? 0) + 1;
    }
    const next: StudyState = { ...cur, cards, days: rs ? cur.days : { ...cur.days, [today]: day }, xp: cur.xp + (q.retry ? 0 : xpFor(result.grade)) };
    studyRef.current = next;
    setStudy(next);
    // 기기 안 보관은 조금 뒤에 한다(답을 확인하는 순간의 움직임을 막지 않게). 앱을 닫으면 바로 쓴다.
    saveLater(STUDY_KEY, () => studyRef.current);
    const log = getLog();
    const conf = getConf();
    conf.seq += 1;
    const row: LogRow = { t: now.toISOString(), u: q.unit, k: q.sect, q: q.key, ok: result.ok, n: result.attempts, sec: Math.round(result.sec), g: result.grade, ...(q.retry ? { r: 1 as const } : null), id: `${conf.device}.${conf.seq}` };
    log.push(row);
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
    saveLater(STUDY_LOG_KEY, getLog);
    saveLater(SYNC_KEY, getConf);
    if (conf.url) enqueue([toSheetRow(row)], []);
  }, []);

  const numPartial = useCallback((): NumPartial | null => loadLocal<NumPartial>(NUM_PARTIAL_KEY), []);
  const saveNumPartial = useCallback((p: NumPartial | null) => saveLocal(NUM_PARTIAL_KEY, p), []);
  const recordNum = useCallback((k: SkillId, lv: number, items: NumItem[], daily: boolean): NumResult => {
    const { state, result } = addSet(numRef.current, todayKST(), k, lv, items, daily, new Date().toISOString());
    numRef.current = state;
    setNum(state);
    saveLater(NUM_KEY, () => numRef.current);
    if (getConf().url) enqueue([], [toSheetSet(result.row)]);
    return result;
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 시트 보내기. 줄은 기록하는 순간 차례(queue)에 넣고, 3분마다(화면이 보일 때), 앱을 열 때, 앱으로 돌아올 때 fetch 로 보낸다.
  // 시트가 { ok: true } 로 답한 줄만 차례에서 뺀다. 화면을 떠날 때는 sendBeacon 으로 한 번 더 던지지만 보냈다고 적지 않는다.
  // 실패하면 1분, 2분, 4분 ... 60분 뒤에 다시 한다. 화면은 기다리지 않는다.
  // ─────────────────────────────────────────────────────────────
  const queueRef = useRef<SyncQueue | null>(null);
  const getQueue = useCallback((): SyncQueue => {
    if (!queueRef.current) {
      const q = loadLocal<SyncQueue>(SYNC_Q_KEY);
      queueRef.current = { rows: Array.isArray(q?.rows) ? q!.rows : [], sets: Array.isArray(q?.sets) ? q!.sets : [] };
    }
    return queueRef.current;
  }, []);
  const viewOf = (): SyncView => {
    const c = getConf();
    const q = getQueue();
    return { url: c.url, sent: c.sent, lastAt: c.lastAt ?? null, pending: c.url ? q.rows.length + q.sets.length : 0, failing: c.fail > 0 };
  };
  const [sync, setSyncView] = useState<SyncView>(() => viewOf());
  const syncBusy = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBeacon = useRef(0);

  /** 차례에 넣는다. 이미 있는 id 는 넣지 않는다. */
  const enqueue = (rows: SheetRow[], sets: SheetSet[]) => {
    const q = getQueue();
    if (rows.length) {
      const have = new Set(q.rows.map((r) => r.id));
      for (const r of rows) if (!have.has(r.id)) (have.add(r.id), q.rows.push(r));
    }
    if (sets.length) {
      const have = new Set(q.sets.map((r) => r.id));
      for (const r of sets) if (!have.has(r.id)) (have.add(r.id), q.sets.push(r));
    }
    saveLater(SYNC_Q_KEY, getQueue);
  };

  /**
   * 오늘의 상태 한 줄(풀이 기록으로 다시 만들 수 없는 것). 지난번에 보낸 것과 같으면 null.
   * 기록이 하나도 없는 기기(새 기기, 지운 뒤)는 보내지 않는다. 빈 상태가 시트의 마지막 상태가 되어 불러오기를 흐리지 않게.
   */
  const snapshotIfChanged = (): { snap: Snapshot; key: string } | null => {
    const c = getConf();
    const st = studyRef.current;
    const nm = numRef.current;
    if (!Object.keys(st.cards).length && !nm.sessions.length && !Object.keys(userRef.current.read).length) return null;
    const body = { v: 1 as const, date: todayKST(), device: c.device, user: SYNC_USER_STATE ? userRef.current : null, study: { start: st.start, days: st.days, xp: st.xp, cards: st.cards, marks: st.marks ?? {} }, num: { start: nm.start, level: nm.level, days: nm.days } };
    const key = hash53(JSON.stringify(body));
    if (key === c.snapKey) return null;
    return { snap: { ...body, at: new Date().toISOString() }, key };
  };

  const flushSync = useCallback(async (force = false) => {
    const c = getConf();
    const url = c.url;
    if (!url || syncBusy.current) return;
    if (!force && Date.now() < c.nextTry) return;
    const q = getQueue();
    let snap = snapshotIfChanged();
    if (!q.rows.length && !q.sets.length && !snap) return;
    syncBusy.current = true;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    try {
      for (let loop = 0; loop < 50; loop++) {
        const rows = q.rows.slice(0, SYNC_BATCH_ROWS);
        const sets = q.sets.slice(0, SYNC_BATCH_SETS);
        if (!rows.length && !sets.length && !snap) break;
        await sheetPost(url, { device: c.device, rows, sets, ...(snap ? { snapshot: snap.snap } : null) });
        if (getConf().url !== url) return; // 그사이 주소를 바꿨으면 이 결과는 버린다
        const done = new Set(rows.map((r) => r.id));
        const doneSets = new Set(sets.map((r) => r.id));
        q.rows = q.rows.filter((r) => !done.has(r.id));
        q.sets = q.sets.filter((r) => !doneSets.has(r.id));
        c.sent += rows.length + sets.length;
        c.lastAt = new Date().toISOString();
        c.fail = 0;
        c.nextTry = 0;
        if (snap) c.snapKey = snap.key;
        snap = null;
        saveLater(SYNC_Q_KEY, getQueue);
        saveLater(SYNC_KEY, getConf);
      }
    } catch {
      if (getConf().url === url) {
        c.fail += 1;
        const wait = backoff(c.fail);
        c.nextTry = Date.now() + wait;
        saveLater(SYNC_KEY, getConf);
        retryTimer.current = setTimeout(() => void flushSync(), wait);
      }
    } finally {
      syncBusy.current = false;
      setSyncView(viewOf());
    }
  }, []);

  /** 화면을 떠날 때 한 번 던진다(64KB 안에서). 시트가 받았는지 알 수 없으므로 차례에서 빼지 않는다. */
  const beaconSync = useCallback(() => {
    const c = getConf();
    if (!c.url || Date.now() - lastBeacon.current < 2000) return;
    const q = getQueue();
    const snap = snapshotIfChanged();
    if (!q.rows.length && !q.sets.length && !snap) return;
    lastBeacon.current = Date.now();
    const rows = q.rows.slice(0, 200);
    const sets = q.sets.slice(0, 100);
    let body: Record<string, unknown> = { device: c.device, rows, sets, ...(snap ? { snapshot: snap.snap } : null) };
    if (JSON.stringify(body).length > BEACON_MAX) body = { device: c.device, rows: rows.slice(0, 100), sets: sets.slice(0, 50) };
    if (JSON.stringify(body).length <= BEACON_MAX) sheetBeacon(c.url, body);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = globalThis as any;
    const doc = w.document;
    const visible = () => !doc || doc.visibilityState === 'visible';
    // 앱을 열 때: 첫 화면을 그린 뒤 조금 있다가 보낸다.
    const first = setTimeout(() => void flushSync(true), 4000);
    const timer = setInterval(() => visible() && void flushSync(), SYNC_EVERY);
    const onVis = () => (visible() ? void flushSync(true) : beaconSync());
    const onHide = () => beaconSync();
    doc?.addEventListener?.('visibilitychange', onVis);
    w.addEventListener?.('pagehide', onHide);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      doc?.removeEventListener?.('visibilitychange', onVis);
      w.removeEventListener?.('pagehide', onHide);
    };
  }, []);

  /** 기기의 기록 전체를 차례에 넣는다(주소를 처음 적거나 바꿨을 때, 가져오기 뒤). */
  const enqueueAll = () => {
    enqueue(getLog().map(toSheetRow), numRef.current.sessions.map(toSheetSet));
  };

  const setSyncUrl = useCallback((raw: string): boolean => {
    const url = raw.trim();
    const c = getConf();
    if (url && !validUrl(url)) return false;
    if (url === c.url) return true;
    c.url = url;
    c.sent = 0;
    c.lastAt = undefined;
    c.snapKey = undefined;
    c.fail = 0;
    c.nextTry = 0;
    queueRef.current = { rows: [], sets: [] };
    if (url) enqueueAll();
    saveLater(SYNC_Q_KEY, getQueue);
    saveLater(SYNC_KEY, getConf);
    setSyncView(viewOf());
    return true;
  }, []);

  const probeSheet = useCallback(async (): Promise<SheetInfo | null> => {
    const url = getConf().url;
    if (!url) return null;
    try {
      return await sheetInfo(url);
    } catch {
      return null;
    }
  }, []);

  const testSync = useCallback(async (): Promise<SheetInfo | null> => {
    const c = getConf();
    if (!c.url) return null;
    try {
      await sheetPost(c.url, { device: c.device, ping: 1, rows: [], sets: [] });
      const info = await sheetInfo(c.url);
      // 연결이 되면 기다리던 줄을 바로 보낸다.
      c.fail = 0;
      c.nextTry = 0;
      void flushSync(true);
      return info;
    } catch {
      return null;
    }
  }, []);

  const restoreFromSheet = useCallback(async (): Promise<{ rows: number; sets: number } | null> => {
    const url = getConf().url;
    if (!url) return null;
    let all;
    try {
      all = await sheetAll(url);
    } catch {
      return null;
    }
    const today = todayKST();
    // 풀이 기록: 시트와 기기의 줄을 id 로 합친다(같은 줄은 한 번).
    const byId = new Map<string, LogRow>();
    for (const x of all.rows) {
      const r = fromSheetRow(x);
      if (r) byId.set(r.id!, r);
    }
    const fromSheet = byId.size;
    for (const r of getLog()) byId.set(rowId(r), r.id ? r : { ...r, id: rowId(r) });
    const merged = [...byId.values()].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    const snaps = all.snapshots.slice().sort((a, b) => (a.date + a.at < b.date + b.at ? -1 : 1));

    // 기억 상태: 합친 기록을 처음부터 다시 푼다. 기기의 것, 다시 푼 것, 상태 줄의 사본 가운데
    // 항목마다 마지막으로 푼 때가 늦은 쪽(같으면 많이 푼 쪽)을 남긴다. 처음 답한 날은 가장 이른 날.
    // 같은 때, 같은 횟수면 먼저 본 쪽을 남기므로 상태 줄의 사본(기기가 실제로 가졌던 값)을 다시 푼 것보다 먼저 본다.
    // 문제 자료(study.json)를 아직 못 받은 때 다시 풀면 개념 문제의 수준을 모르기 때문이다.
    const cur = studyRef.current;
    const rebuilt = rebuildFromLog(merged, studyDataRef.current);
    const cards: Record<string, Card> = { ...cur.cards };
    for (const src of [...snaps.map((x) => x.study?.cards ?? {}), rebuilt.cards]) {
      for (const [id, c] of Object.entries(src)) {
        if (!c || typeof c.last !== 'string' || typeof c.s !== 'number') continue;
        const old = cards[id];
        const first = [old?.first, c.first].filter(Boolean).sort()[0];
        if (!old || c.last > old.last || (c.last === old.last && c.reps > old.reps)) cards[id] = first ? { ...c, first } : c;
        else if (first && first !== old.first) cards[id] = { ...old, first };
      }
    }
    // 날짜별 푼 수: 기기, 시트의 상태 줄 가운데 많이 푼 쪽. 둘 다 없는 날만 풀이 기록으로 센다.
    const total = (d: StudyDay) => d.lat + d.voc + (d.extra ?? 0) + (d.read ?? 0);
    const days: Record<string, StudyDay> = { ...cur.days };
    for (const sn of snaps) for (const [d, v] of Object.entries(sn.study?.days ?? {})) if (v && (!days[d] || total(v) > total(days[d]))) days[d] = v;
    for (const [d, v] of Object.entries(daysFromLog(merged))) if (!days[d]) days[d] = v;
    const starts = [cur.start, rebuilt.start, ...snaps.map((x) => x.study?.start)].filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    const xp = Math.max(cur.xp, rebuilt.xp, ...snaps.map((x) => Number(x.study?.xp) || 0));
    // 읽기 표시: 기기와 상태 줄 가운데 늦게 누른 쪽.
    let marks: Record<string, ReadMark> = { ...(cur.marks ?? {}) };
    for (const sn of snaps) marks = mergeMarks(marks, sn.study?.marks);
    let nextStudy: StudyState = { ...cur, start: starts[0] ?? cur.start, cards, days, xp, marks };
    // 오늘 아직 아무것도 안 풀었으면, 오늘 분량을 불러온 기억 상태로 다시 정한다(빈 기기에서 아침에 정한 분량이 남지 않게). 읽기 목표는 그대로.
    nextStudy = refreshToday(nextStudy, studyDataRef.current, today);
    logRef.current = merged.slice(-LOG_CAP);
    studyRef.current = nextStudy;
    setStudy(nextStudy);
    saveLater(STUDY_LOG_KEY, getLog);
    saveLater(STUDY_KEY, () => studyRef.current);

    // 수리: 세트 줄과 상태 줄(수준, 날짜별 할당)을 기기의 기록과 합친다(같은 세트는 한 번).
    let nm = numRef.current;
    // 수준은 수리를 가장 늦게 푼 기기의 상태를 따른다(그날 할당을 마쳤거나 추가 학습을 한 가장 늦은 날, 같으면 늦게 보낸 것).
    const numActive = (x: Snapshot) => Object.entries(x.num?.days ?? {}).reduce((m, [d, v]) => ((v?.ks?.length || v?.x) && d > m ? d : m), '');
    const lastNum = snaps
      .filter((x) => x.num)
      .sort((a, b) => (numActive(a) + a.at < numActive(b) + b.at ? -1 : 1))
      .pop()?.num;
    const level: Record<string, number> = { ...(lastNum?.level ?? {}) };
    if (!lastNum) for (const x of all.sets) level[x.k] = Number(x.lv) || 1; // 상태 줄이 없으면 분야마다 마지막 세트의 수준
    for (const sn of snaps.length ? snaps : [null]) {
      const n0 = migrateNum({ start: sn?.num?.start ?? lastNum?.start ?? today, level, days: sn?.num?.days ?? {}, sessions: all.sets }, today);
      if (n0) nm = mergeNum(nm, n0);
    }
    numRef.current = nm;
    setNum(nm);
    saveLater(NUM_KEY, () => numRef.current);

    // 개인 기록(읽은 기사, 퀴즈, 본 해금 등): 기기별 마지막 상태를 차례로 합친다.
    let u = userRef.current;
    for (const sn of snaps) if (sn.user) u = mergeUser(u, sn.user);
    if (u !== userRef.current) {
      userRef.current = u;
      setUser(u);
      saveLater(USER_KEY, () => userRef.current);
    }
    flushSaves();
    // 시트에 없던 기기의 줄만 차례에 넣고, 합친 상태를 오늘의 상태 줄로 다시 보낸다.
    const onSheet = new Set(all.rows.map((x) => String(x.id)));
    const setsOnSheet = new Set(all.sets.map((x) => String(x.id)));
    enqueue(
      getLog().filter((r) => !onSheet.has(rowId(r))).map(toSheetRow),
      nm.sessions.map(toSheetSet).filter((x) => !setsOnSheet.has(x.id)),
    );
    void flushSync(true);
    return { rows: fromSheet, sets: all.sets.length };
  }, []);

  const studyAsked = useCallback((): Asked => {
    const today = todayKST();
    const keys = new Set<string>();
    const units = new Set<string>();
    for (const row of getLog()) {
      if (kstDate(row.t) !== today) continue;
      keys.add(row.q);
      units.add(row.u);
    }
    return { keys, units };
  }, []);

  const markRead = useCallback(
    (articleId: string, read: boolean) => {
      const cur = userRef.current;
      if (read && cur.read[articleId]) return;
      if (!read && !cur.read[articleId]) return;
      const nextRead = { ...cur.read };
      const newsLog = { ...(cur.newsLog ?? {}) };
      if (read) {
        nextRead[articleId] = new Date().toISOString();
        const day = daysRef.current.find((d) => d.articles.some((a) => a.id === articleId));
        const a = day?.articles.find((x) => x.id === articleId);
        if (day && a && !newsLog[articleId]) newsLog[articleId] = newsEntry(a, day.date);
      } else {
        delete nextRead[articleId];
        delete newsLog[articleId];
      }
      // 날짜별 목표 기록과 읽은 기사 목록도 같이 맞춰 한 번에 저장한다(따로 맞추면 화면을 두 번 그린다).
      commit(withDaily({ ...cur, read: nextRead, newsLog }, daysRef.current), 'progress');
    },
    [commit],
  );

  const setMemo = useCallback(
    (articleId: string, text: string) => {
      const cur = userRef.current;
      if ((cur.memos[articleId]?.text ?? '') === text) return;
      const memos = { ...cur.memos };
      if (text.trim() === '') delete memos[articleId];
      else memos[articleId] = { text, updatedAt: new Date().toISOString() };
      commit({ ...cur, memos }, 'memos');
    },
    [commit],
  );

  const setMarket = useCallback(
    (market: Market) => {
      const cur = userRef.current;
      if (cur.settings.market === market) return;
      commit({ ...cur, settings: { ...cur.settings, market } }, 'settings');
    },
    [commit],
  );

  const answerQuiz = useCallback(
    (reviewId: string, index: number, choice: number, meta?: QuizMeta) => {
      const cur = userRef.current;
      const prev = cur.quiz[reviewId] ?? {};
      if (prev[String(index)] !== undefined) return;
      let scores = cur.scores;
      if (meta) {
        // 점수를 처음 적는 퀴즈(점수 칸이 생기기 전에 답한 문항이 있으면 그 결과부터)
        const s = cur.scores?.[reviewId] ?? { r: meta.prevRight ?? 0, a: meta.prevAnswered ?? 0, n: meta.total };
        scores = { ...(cur.scores ?? {}), [reviewId]: { r: s.r + (meta.right ? 1 : 0), a: s.a + 1, n: meta.total } };
      }
      commit({ ...cur, quiz: { ...cur.quiz, [reviewId]: { ...prev, [String(index)]: choice } }, scores }, 'quiz');
    },
    [commit],
  );

  const markSeen = useCallback(
    (kind: 'unlock' | 'recap', ids: string[]) => {
      const cur = userRef.current;
      const field = kind === 'unlock' ? 'unlocks' : 'recaps';
      const prev = cur.seen?.[field] ?? {};
      const fresh = ids.filter((id) => id && !prev[id]);
      if (fresh.length === 0) return;
      const now = new Date().toISOString();
      const next = { ...prev };
      for (const id of fresh) next[id] = now;
      const seen: SeenState = { ...(cur.seen ?? EMPTY_USER.seen), [field]: next };
      commit({ ...cur, seen }, 'seen');
    },
    [commit],
  );

  const markMapSeen = useCallback(() => {
    const cur = userRef.current;
    const today = todayKST();
    // 오늘 생긴 것 가운데 지금 본 것을 함께 적는다(오늘 이 뒤에 배운 것은 다음에 열 때 반짝인다).
    const ids = idsOn(eventsFor(treeFor(studyDataRef.current, studyRef.current.cards, studyRef.current.marks)), today);
    const prev = cur.seen?.map === today ? (cur.seen.mapIds ?? ids) : null;
    if (prev && ids.every((id) => prev.includes(id))) return;
    const mapIds = [...new Set([...(prev ?? []), ...ids])].sort();
    commit({ ...cur, seen: { ...(cur.seen ?? EMPTY_USER.seen), map: today, mapIds } }, 'seen');
  }, [commit]);

  const studyLog = useCallback(() => getLog(), []);

  const exportData = useCallback(() => {
    // 버전 4: 수리 기록(num)을 더했다. 가져오기는 2, 3, 4 를 받는다(3 이하에는 num 이 없어 기기의 수리 기록을 그대로 둔다).
    // sync 는 시트 웹 앱 주소(기기와 이 백업에만 둔다). 가져올 때 기기에 주소가 없으면 이것을 쓴다.
    const url = getConf().url;
    return JSON.stringify({ app: 'latticework-sisa', version: 4, exportedAt: new Date().toISOString(), data: userRef.current, study: studyRef.current, studyLog: getLog(), num: numRef.current, ...(url ? { sync: { url } } : null) }, null, 2);
  }, []);

  const importData = useCallback(
    (json: string) => {
      try {
        const parsed = JSON.parse(json);
        const incoming = (parsed && parsed.data ? parsed.data : parsed) as Partial<UserData>;
        if (!incoming || typeof incoming !== 'object' || (!incoming.read && !incoming.daily)) return false;
        // 복습 기록은 더 많이 쌓인 쪽을 남긴다.
        const st0 = parsed && parsed.study ? (parsed.study as StudyState) : null;
        if (st0 && st0.cards && Object.keys(st0.cards).length >= Object.keys(studyRef.current.cards).length) {
          if (Array.isArray(parsed.studyLog)) {
            logRef.current = withIds(parsed.studyLog.slice(-LOG_CAP));
            saveLater(STUDY_LOG_KEY, getLog);
          }
          // 예전 내보내기(버전 2)에는 처음 답한 날이 없다. 풀이 기록으로 채운다.
          // 읽기 표시는 기기 것과 파일 것을 합친다(예전 파일에는 표시가 없다).
          const st = refreshToday({ ...withFirsts(st0, getLog()), marks: mergeMarks(studyRef.current.marks, st0.marks) }, studyDataRef.current, todayKST());
          studyRef.current = st;
          setStudy(st);
          saveLater(STUDY_KEY, () => studyRef.current);
        }
        // 수리 기록은 합친다(기기에서 채운 날도, 파일에서 채운 날도 남는다. 같은 파일을 두 번 가져와도 늘지 않는다).
        // 버전 3 이하에는 num 이 없으므로 기기의 수리 기록을 그대로 둔다.
        const n0 = parsed && parsed.num ? migrateNum(parsed.num, todayKST()) : null;
        if (n0) {
          const merged = mergeNum(numRef.current, n0);
          numRef.current = merged;
          setNum(merged);
          saveLater(NUM_KEY, () => numRef.current);
        }
        const merged = mergeUser(userRef.current, incoming);
        userRef.current = merged;
        setUser(merged);
        saveLater(USER_KEY, () => userRef.current);
        flushSaves();
        const now = new Date().toISOString();
        writers.current.progress?.({ read: merged.read, daily: merged.daily, newsLog: merged.newsLog, updatedAt: now });
        writers.current.memos?.({ memos: merged.memos, updatedAt: now });
        writers.current.quiz?.({ answers: merged.quiz, scores: merged.scores, updatedAt: now });
        writers.current.seen?.({ ...merged.seen, updatedAt: now });
        // 시트 주소: 기기에 없으면 백업의 것을 쓴다. 주소가 있으면 가져온 기록도 시트로 보낸다(시트가 같은 줄을 거른다).
        const backupUrl = typeof parsed?.sync?.url === 'string' ? parsed.sync.url : '';
        if (!getConf().url && backupUrl) setSyncUrl(backupUrl);
        else if (getConf().url) enqueueAll();
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({ status, canSave, days, threads, reviews, user, markRead, setMemo, setMarket, answerQuiz, markSeen, markMapSeen, exportData, importData, studyData, researchData, study, recordStudy, markConcept, studyAsked, studyLog, num, recordNum, numPartial, saveNumPartial, latti, lattiHist, noteLatti, sync, setSyncUrl, testSync, probeSheet, restoreFromSheet }),
    [status, canSave, days, threads, reviews, user, markRead, setMemo, setMarket, answerQuiz, markSeen, markMapSeen, exportData, importData, studyData, researchData, study, recordStudy, markConcept, studyAsked, studyLog, num, recordNum, numPartial, saveNumPartial, latti, lattiHist, noteLatti, sync, setSyncUrl, testSync, probeSheet, restoreFromSheet],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('StoreProvider가 없습니다');
  return s;
}

/** 하루의 기사를 모두 읽었는지 */
export function dayDone(day: Day, read: Record<string, string>): boolean {
  return day.articles.length > 0 && day.articles.every((a) => !!read[a.id]);
}

/**
 * 하루 목표의 상태.
 * done 그날 안에 모두 끝냄 · late 뉴스를 날짜가 지난 뒤에 읽음 · pending 오늘이고 아직 남음 · missed 지난 날인데 못 채움 · none 할 일이 없던 날
 */
export type DayStatus = 'done' | 'late' | 'pending' | 'missed' | 'none';

/**
 * 하루 목표를 이루는 과제 하나. 뉴스는 발행된 날에만, 영단어와 Latticework 는 복습을 시작한 날부터 매일 있다.
 * 수리는 처음 연 날(num.start)부터 매일 12문제(2026-11-21 소유자 결정: 하루 목표와 연속 기록에 든다).
 */
export type GoalPart = { key: 'news' | 'voc' | 'read' | 'lat' | 'num'; done: number; total: number; complete: boolean; late?: boolean };

export function partsOf(date: string, days: Day[], user: UserData, study: StudyState, hasStudy: boolean, today: string, num?: NumState | null): GoalPart[] {
  const parts: GoalPart[] = [];
  const day = days.find((d) => d.date === date);
  // 일일 학습(새 개념 읽기): 그날 읽을 개념이 있었으면 1개. 홈에서 맨 위에 따로 보인다(2026-11-27 소유자 결정).
  if (hasStudy && study.start <= date) {
    const rec = study.days[date];
    const readTotal = rec?.readGoal ?? 0;
    if (readTotal > 0) {
      const done = Math.min(readTotal, rec?.read ?? readOn(study, date));
      parts.push({ key: 'read', done, total: readTotal, complete: done >= readTotal });
    }
  }
  if (day && day.articles.length > 0) {
    const total = day.articles.length;
    const done = day.articles.filter((a) => !!user.read[a.id]).length;
    const at = user.daily?.[date]?.doneAt ?? day.articles.map((a) => user.read[a.id] ?? '').sort().pop() ?? '';
    const onTime = done === total && kstDate(at) <= date;
    parts.push({ key: 'news', done, total, complete: onTime, late: done === total && !onTime });
  }
  if (hasStudy && study.start <= date) {
    const rec = study.days[date];
    const vocTotal = rec ? rec.vocGoal : date === today ? 0 : 1;
    if (vocTotal > 0) parts.push({ key: 'voc', done: rec?.voc ?? 0, total: vocTotal, complete: !!rec && rec.voc >= rec.vocGoal });
    const latTotal = rec ? rec.latGoal : LAT_GOAL;
    if (latTotal > 0) parts.push({ key: 'lat', done: rec?.lat ?? 0, total: latTotal, complete: !!rec && rec.lat >= rec.latGoal });
  }
  if (hasStudy && num && num.start <= date) {
    const done = quotaDone(num, date);
    parts.push({ key: 'num', done, total: DAILY_TOTAL, complete: done >= DAILY_TOTAL });
  }
  return parts;
}

export function statusFromParts(parts: GoalPart[], date: string, today: string): DayStatus {
  if (parts.length === 0) return 'none';
  if (parts.every((p) => p.complete)) return 'done';
  if (date === today) return 'pending';
  if (parts.every((p) => p.complete || p.late)) return 'late';
  return 'missed';
}

/** 화면에서 쓰는 목표 묶음: 날짜별 상태, 연속 기록, 오늘의 과제. */
export function useGoals() {
  const { days, user, study, studyData, num } = useStore();
  const today = todayKST();
  return useMemo(() => {
    const hasStudy = !!studyData;
    const statusOf = (date: string): DayStatus => (date > today ? 'none' : statusFromParts(partsOf(date, days, user, study, hasStudy, today, num), date, today));
    const firstNews = days.length ? days[days.length - 1].date : today;
    const earliest = hasStudy && study.start < firstNews ? study.start : firstNews;
    // 연속 기록: 오늘부터 거슬러 올라가며 센다. 오늘 남은 것과 할 일이 없던 날은 세지도 끊지도 않는다.
    let streak = 0;
    for (let i = 0, date = today; i < 800 && date >= earliest; i++, date = addDays(today, -i)) {
      const st = statusOf(date);
      if (st === 'done') streak += 1;
      else if (st === 'pending' || st === 'none') continue;
      else break;
    }
    let longest = 0;
    let run = 0;
    for (let date = earliest, i = 0; date <= today && i < 800; date = addDays(date, 1), i++) {
      const st = statusOf(date);
      if (st === 'done') run += 1;
      else if (st === 'pending' || st === 'none') continue;
      else run = 0;
      if (run > longest) longest = run;
    }
    const parts = partsOf(today, days, user, study, hasStudy, today, num);
    /** 그날 할당량을 넘겨 더 푼 문제 수(영단어, Latticework, 수리) */
    const extraOf = (date: string): number => (study.days[date]?.extra ?? 0) + (hasStudy ? (num.days[date]?.x ?? 0) : 0);
    return { today, statusOf, extraOf, streak, longest, parts, status: statusFromParts(parts, today, today), hasStudy };
  }, [days, user, study, studyData, num, today]);
}

export function findArticle(days: Day[], id: string) {
  for (const day of days) {
    const a = day.articles.find((x) => x.id === id);
    if (a) return a;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 지식(배운 나무, 해금), 돌아보기, 읽은 기사, 배운 단어
// ─────────────────────────────────────────────────────────────

// 배운 나무는 자료와 기억 상태가 같으면 다시 만들지 않는다(여러 화면이 같이 읽어도 한 번).
let treeMemo: { data: StudyData | null; cards: Record<string, Card> | null; marks: StudyState['marks'] | null; tree: LearnedTree | null } = { data: null, cards: null, marks: null, tree: null };
function treeFor(data: StudyData | null, cards: Record<string, Card>, marks?: StudyState['marks']): LearnedTree | null {
  if (!data) return null;
  if (treeMemo.data === data && treeMemo.cards === cards && treeMemo.marks === (marks ?? null)) return treeMemo.tree;
  const tree = learnedTree(data, cards, marks);
  treeMemo = { data, cards, marks: marks ?? null, tree };
  return tree;
}
const eventsMemo = new WeakMap<LearnedTree, UnlockEvent[]>();
function eventsFor(tree: LearnedTree | null): UnlockEvent[] {
  if (!tree) return [];
  let ev = eventsMemo.get(tree);
  if (!ev) eventsMemo.set(tree, (ev = unlockEvents(tree)));
  return ev;
}

/**
 * 배운 나무와 해금. plan 은 아직 안 본 해금의 차례(전체 화면 카드와 홈 띠), fresh 는 지도에서 반짝일 마디와 개념.
 * 분류가 없는 자료(예전 자료, Claude 링크 빌드)면 tree 는 null 이고 나머지는 비어 있다.
 */
export function useKnowledge(): { data: StudyData | null; tree: LearnedTree | null; events: UnlockEvent[]; plan: UnlockPlan; fresh: Set<string> } {
  const { studyData, study, user } = useStore();
  const today = todayKST();
  const tree = treeFor(studyData, study.cards, study.marks);
  const events = eventsFor(tree);
  const seen = user.seen;
  return useMemo(() => {
    const nodes = studyData?.nodes;
    return { data: studyData, tree, events, plan: unlockPlan(events, carrySeen(seen?.unlocks, nodes), today), fresh: freshSince(events, seen?.map, today, carryIds(seen?.mapIds, nodes)) };
  }, [studyData, tree, events, seen, today]);
}

/** 오늘 보여 줄 돌아보기(주간 또는 월간). 없으면 null. 기간 안에 한 일이 있는지만 가볍게 본다. */
export function useRecapDue(): { show: Period; alsoSeen: string[] } | null {
  const { user, study, num } = useStore();
  const goals = useGoals();
  return useMemo(() => {
    const today = goals.today;
    const reads = Object.values(user.read).map((at) => kstDate(at));
    const active = (p: Period) => {
      const dates = periodDates(p, today);
      if (dates.length === 0) return false;
      const from = dates[0];
      const to = dates[dates.length - 1];
      for (const d of dates) {
        const sd = study.days[d];
        if (sd && sd.lat + sd.voc + (sd.extra ?? 0) > 0) return true;
        if (num.days[d]?.ks.length || num.days[d]?.x) return true;
        if (goals.statusOf(d) === 'done') return true;
      }
      return reads.some((d) => d >= from && d <= to);
    };
    return recapDue(today, user.seen?.recaps, active);
  }, [user.read, user.seen, study.days, num.days, goals]);
}

/** 돌아보기 한 기간의 숫자. 풀이 기록을 읽으므로 돌아보기 화면 안에서만 부른다. */
export function usePeriodStats(p: Period | null): PeriodStats | null {
  const s = useStore();
  const goals = useGoals();
  const key = p?.key ?? '';
  return useMemo(
    () =>
      p
        ? periodStats(p, { today: goals.today, days: s.days, user: s.user, study: s.study, data: s.studyData, log: s.studyLog(), reviews: s.reviews, statusOf: goals.statusOf, extraOf: goals.extraOf, streak: goals.streak, num: s.studyData ? s.num : null })
        : null,
    [key, goals, s.days, s.user, s.study, s.studyData, s.reviews, s.num],
  );
}

/** 읽은 기사 하나. inFeed 면 기사 묶음에 아직 있어 기사 화면으로 열 수 있다. */
export type NewsItem = { id: string; date: string; title: string; url?: string; source?: string; readAt: string; inFeed: boolean };

/** 읽은 기사 전체. 새 날짜부터(같은 날은 늦게 읽은 것부터). 기억 상태는 없다. */
export function useNewsHistory(): NewsItem[] {
  const { user, days } = useStore();
  return useMemo(() => {
    const feed = new Map<string, { date: string; title: string; url?: string; source?: string }>();
    for (const d of days) for (const a of d.articles) feed.set(a.id, { date: d.date, title: a.title, url: a.url, source: a.source });
    const out: NewsItem[] = [];
    for (const [id, readAt] of Object.entries(user.read)) {
      const f = feed.get(id);
      const e = user.newsLog?.[id];
      const title = e?.t ?? f?.title;
      if (!title) continue;
      out.push({ id, date: e?.d ?? f?.date ?? kstDate(readAt), title, url: e?.u ?? f?.url, source: e?.s ?? f?.source, readAt, inFeed: !!f });
    }
    return out.sort((a, b) => (a.date === b.date ? (a.readAt < b.readAt ? 1 : a.readAt > b.readAt ? -1 : 0) : a.date < b.date ? 1 : -1));
  }, [user.read, user.newsLog, days]);
}

/** 배운 표현 하나. first 는 처음 답한 날, reps 는 푼 횟수. */
export type VocabItem = { v: Vocab; kind: '단어' | '구문'; first: string; reps: number };

/** 이미 배운 표현(한 번이라도 답한 것)만. 새로 배운 것부터. */
export function useVocabLearned(): VocabItem[] {
  const { studyData, study } = useStore();
  const cards = study.cards;
  return useMemo(() => {
    if (!studyData) return [];
    const out: VocabItem[] = [];
    for (const v of studyData.vocab) {
      const c = cards[v.id];
      if (!c) continue;
      out.push({ v, kind: vocKind(v), first: firstOf(c), reps: c.reps });
    }
    return out.sort((a, b) => (a.first === b.first ? (cards[a.v.id].last < cards[b.v.id].last ? 1 : -1) : a.first < b.first ? 1 : -1));
  }, [studyData, cards]);
}

/** 그 주(ISO 주 이름)의 주간 종합 퀴즈 */
export function weeklyReviewFor(reviews: Review[], weekId: string): Review | null {
  return reviews.find((r) => r.id === weekId) ?? null;
}
