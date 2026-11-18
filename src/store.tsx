import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Day, EMPTY_USER, Market, Memo, Review, Thread, UserData } from './types';
import { kstDate, todayKST } from './dates';

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

async function loadFeed(): Promise<Feed> {
  const res = await fetch('./data/feed.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('feed ' + res.status);
  return (await res.json()) as Feed;
}

// 기기 안 임시 보관. 연결 전 첫 화면을 채우고, 연결이 안 될 때의 대비책으로만 쓴다.
const CACHE_KEY = 'lw.cache.v1';
const USER_KEY = 'lw.user.v1';

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

type Status = 'loading' | 'live' | 'offline';

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
  answerQuiz: (reviewId: string, index: number, choice: number) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
};

const StoreCtx = createContext<Store | null>(null);

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
  return { read, daily, memos, quiz, settings: { ...a.settings, ...(b.settings ?? {}) } };
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

  const writers = useRef<{ progress?: (b: any) => void; memos?: (b: any) => void; settings?: (b: any) => void; quiz?: (b: any) => void }>({});
  const userRef = useRef(user);
  userRef.current = user;
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
        const refresh = async () => {
          try {
            const feed = await loadFeed();
            if (!alive) return;
            const nextDays = (feed.days ?? []).filter((d) => d && d.date && Array.isArray(d.articles)).sort((a, b) => b.date.localeCompare(a.date));
            const nextThreads = (feed.threads ?? []).filter((t) => t && t.id && Array.isArray(t.entries));
            nextThreads.sort((a, b) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt));
            const nextReviews = (feed.reviews ?? []).filter((r) => r && r.id && Array.isArray(r.questions)).sort((a, b) => b.id.localeCompare(a.id));
            setDays(nextDays);
            setThreads(nextThreads);
            setReviews(nextReviews);
            saveLocal(CACHE_KEY, { days: nextDays.slice(0, 40), threads: nextThreads, reviews: nextReviews.slice(0, 4) });
            setStatus('live');
          } catch {
            if (alive) setStatus('offline');
          }
        };
        void refresh();
        const doc = (globalThis as any).document;
        const onVisible = () => {
          if (doc && doc.visibilityState === 'visible') void refresh();
        };
        doc?.addEventListener?.('visibilitychange', onVisible);
        const timer = setInterval(() => void refresh(), 15 * 60 * 1000);
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
        const refs = { progress: base.doc('progress'), memos: base.doc('memos'), settings: base.doc('settings'), quiz: base.doc('quiz') };
        const [p, m, s, q] = await Promise.all([refs.progress.get(), refs.memos.get(), refs.settings.get(), refs.quiz.get()]);
        if (!alive) return;
        const remote: Partial<UserData> = {
          read: p.exists ? ((p.data() as any).read ?? {}) : {},
          daily: p.exists ? ((p.data() as any).daily ?? {}) : {},
          memos: m.exists ? ((m.data() as any).memos ?? {}) : {},
          settings: s.exists ? (s.data() as any) : undefined,
          quiz: q.exists ? ((q.data() as any).answers ?? {}) : {},
        };
        writers.current = {
          progress: makeWriter(refs.progress),
          memos: makeWriter(refs.memos),
          settings: makeWriter(refs.settings),
          quiz: makeWriter(refs.quiz),
        };
        setCanSave(true);
        setUser((local) => {
          const merged = mergeUser(local, remote);
          saveLocal(USER_KEY, merged);
          // 기기에만 있던 기록이 있으면 저장소에도 올려 둔다.
          if (Object.keys(merged.read).length !== Object.keys(remote.read ?? {}).length) {
            writers.current.progress?.({ read: merged.read, daily: merged.daily, updatedAt: new Date().toISOString() });
          }
          if (Object.keys(merged.memos).length !== Object.keys(remote.memos ?? {}).length) {
            writers.current.memos?.({ memos: merged.memos, updatedAt: new Date().toISOString() });
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

  const commit = useCallback((next: UserData, part: 'progress' | 'memos' | 'settings' | 'quiz') => {
    setUser(next);
    saveLocal(USER_KEY, next);
    const now = new Date().toISOString();
    if (part === 'progress') writers.current.progress?.({ read: next.read, daily: next.daily, updatedAt: now });
    if (part === 'memos') writers.current.memos?.({ memos: next.memos, updatedAt: now });
    if (part === 'settings') writers.current.settings?.({ ...next.settings, updatedAt: now });
    if (part === 'quiz') writers.current.quiz?.({ answers: next.quiz, updatedAt: now });
  }, []);

  // 읽은 기록이나 기사 목록이 바뀌면 날짜별 목표 기록을 맞춰 저장한다.
  useEffect(() => {
    const next = withDaily(userRef.current, days);
    if (next !== userRef.current) commit(next, 'progress');
  }, [days, user.read, commit]);

  const markRead = useCallback(
    (articleId: string, read: boolean) => {
      const cur = userRef.current;
      if (read && cur.read[articleId]) return;
      if (!read && !cur.read[articleId]) return;
      const nextRead = { ...cur.read };
      if (read) nextRead[articleId] = new Date().toISOString();
      else delete nextRead[articleId];
      commit({ ...cur, read: nextRead }, 'progress');
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
    (reviewId: string, index: number, choice: number) => {
      const cur = userRef.current;
      const prev = cur.quiz[reviewId] ?? {};
      if (prev[String(index)] !== undefined) return;
      commit({ ...cur, quiz: { ...cur.quiz, [reviewId]: { ...prev, [String(index)]: choice } } }, 'quiz');
    },
    [commit],
  );

  const exportData = useCallback(() => {
    return JSON.stringify({ app: 'latticework-sisa', version: 1, exportedAt: new Date().toISOString(), data: userRef.current }, null, 2);
  }, []);

  const importData = useCallback(
    (json: string) => {
      try {
        const parsed = JSON.parse(json);
        const incoming = (parsed && parsed.data ? parsed.data : parsed) as Partial<UserData>;
        if (!incoming || typeof incoming !== 'object' || (!incoming.read && !incoming.daily)) return false;
        const merged = mergeUser(userRef.current, incoming);
        setUser(merged);
        saveLocal(USER_KEY, merged);
        const now = new Date().toISOString();
        writers.current.progress?.({ read: merged.read, daily: merged.daily, updatedAt: now });
        writers.current.memos?.({ memos: merged.memos, updatedAt: now });
        writers.current.quiz?.({ answers: merged.quiz, updatedAt: now });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const value: Store = { status, canSave, days, threads, reviews, user, markRead, setMemo, setMarket, answerQuiz, exportData, importData };
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
 * done 그날 안에 모두 읽음 · late 날짜가 지난 뒤에 모두 읽음 · pending 오늘이고 아직 남음 · missed 지난 날인데 못 채움 · none 발행 없음
 */
export type DayStatus = 'done' | 'late' | 'pending' | 'missed' | 'none';

export function dayStatus(day: Day | undefined, user: UserData, today: string = todayKST()): DayStatus {
  if (!day || day.articles.length === 0) return 'none';
  if (dayDone(day, user.read)) {
    const at = user.daily?.[day.date]?.doneAt ?? day.articles.map((a) => user.read[a.id]).sort().pop() ?? '';
    return kstDate(at) <= day.date ? 'done' : 'late';
  }
  return day.date === today ? 'pending' : 'missed';
}

/** 연속으로 목표를 채운 발행일 수. 오늘 것은 아직 남아 있어도 기록을 끊지 않는다. 발행이 없는 주말은 세지도 끊지도 않는다. */
export function streak(days: Day[], user: UserData): number {
  const today = todayKST();
  let n = 0;
  for (const day of days) {
    const st = dayStatus(day, user, today);
    if (st === 'done') n += 1;
    else if (st === 'pending' || st === 'none') continue;
    else break;
  }
  return n;
}

/** 지금까지 가장 길었던 연속 기록 */
export function longestStreak(days: Day[], user: UserData): number {
  const today = todayKST();
  let best = 0;
  let run = 0;
  for (const day of days.slice().reverse()) {
    const st = dayStatus(day, user, today);
    if (st === 'done') run += 1;
    else if (st === 'pending' || st === 'none') continue;
    else run = 0;
    if (run > best) best = run;
  }
  return best;
}

export function findArticle(days: Day[], id: string) {
  for (const day of days) {
    const a = day.articles.find((x) => x.id === id);
    if (a) return a;
  }
  return null;
}
