// 앱 전체가 공유하는 데이터 모양.
// 매일 아침 정리 작업이 이 모양 그대로 저장소에 쓰고, 화면은 읽기만 한다.

export type LinkKind = 'continue' | 'reverse' | 'cross' | 'pattern' | 'new';

export type Verdict = 'hit' | 'miss' | 'open';

export type ArticleLink = {
  kind?: LinkKind; // 예전 자료에만 있다. 'new' 는 연결 없음을 뜻했다
  refDate?: string;
  refArticleId?: string;
  refTitle?: string;
  text: string;
};

/** 저녁에 푸는 기억 확인 문항. 수치가 아니라 구조를 묻는다. */
export type QuizItem = { q: string; options: string[]; answer: number; explain: string };

export type Article = {
  id: string;
  date: string; // YYYY-MM-DD
  category?: string; // 예전 자료에만 있다. 화면에는 쓰지 않는다
  title: string;
  gist: string;
  source: string;
  url: string;
  publishedAt?: string;
  minutes: number;
  summary: string[]; // 요약 3문장
  body?: string[]; // 본문 정리. 문단 단위. 원문을 옮겨 적지 않고 내용을 풀어 쓴다
  links: ArticleLink[];
  quiz?: QuizItem[]; // 저녁 퀴즈. 기사 한 건에 2문항
  trackers?: string[]; // 화면에는 안 보인다. 2주 뒤 점검에만 쓴다
  checkDate?: string;
  threadId?: string;
  threadName?: string;
  threadOrder?: number;
  isNewThread?: boolean;
};

export type Followup = {
  refDate: string;
  refArticleId?: string;
  refTitle: string;
  verdict: Verdict;
  text: string;
  threadId?: string;
};

export type Day = {
  date: string;
  articles: Article[];
  followups?: Followup[];
  note?: string;
};

export type ThreadEntryKind = 'start' | 'continue' | 'reverse' | 'cross' | 'pattern' | 'check';

export type ThreadEntry = {
  date: string;
  articleId?: string;
  kind: ThreadEntryKind;
  title: string;
  note?: string;
  verdict?: Verdict;
};

export type Thread = {
  id: string;
  name: string;
  startedAt: string;
  status: 'active' | 'closed';
  indicator?: { label: string; value: string; asOf: string };
  entries: ThreadEntry[];
  nextCheck?: { date: string; text: string };
  updatedAt?: string;
};

export type ReviewQuestion = {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  refArticleId?: string;
  refDate?: string;
  threadName?: string;
};

export type Review = {
  id: string; // 예: 2026-W47
  title: string;
  range: string;
  questions: ReviewQuestion[];
  threadSummary?: string;
};

export type Market = 'kr' | 'both' | 'us';

export type Settings = {
  market: Market;
};

export type Memo = { text: string; updatedAt: string };

/** 하루 목표(그날 기사를 모두 읽기)의 기록. 달력에 그대로 남는다. */
export type DayRecord = {
  total: number; // 그날 발행된 기사 수
  read: number; // 읽은 기사 수
  doneAt?: string; // 마지막 기사를 읽어 목표를 채운 시각
};

/** 읽은 기사의 제목과 날짜. 기사 묶음 파일이 최근 날짜만 남겨도 지식 탭의 뉴스 목록이 이어진다. t 제목 · d 날짜 · u 원문 주소 · s 출처 */
export type NewsLogEntry = { t: string; d: string; u?: string; s?: string };

/** 퀴즈 점수. r 맞힌 수 · a 답한 수 · n 문항 수. 퀴즈가 기사 묶음에서 빠진 뒤에도 남는다. */
export type QuizScore = { r: number; a: number; n: number };

/**
 * 이미 보여 준 것. unlocks 노드 id → 보여 준 시각, recaps 'w:<월요일>' 또는 'm:<YYYY-MM>' → 보여 준 시각,
 * map 지식 탭의 Latticework 지도를 마지막으로 본 날(YYYY-MM-DD. 반짝임의 기준),
 * mapIds 그때 이미 있던 그날 생긴 마디와 개념(같은 날 지도를 본 뒤에 배운 것도 반짝이게).
 */
export type SeenState = { unlocks: Record<string, string>; recaps: Record<string, string>; map?: string; mapIds?: string[] };

export type UserData = {
  read: Record<string, string>; // 기사 id → 읽은 시각
  daily: Record<string, DayRecord>; // 날짜 → 그날의 목표 기록
  memos: Record<string, Memo>;
  settings: Settings;
  quiz: Record<string, Record<string, number>>; // 복습 id → 문항 번호 → 고른 보기
  newsLog: Record<string, NewsLogEntry>; // 기사 id → 읽을 때의 제목과 날짜
  scores: Record<string, QuizScore>; // 복습 id → 점수
  seen: SeenState;
};

export const EMPTY_USER: UserData = {
  read: {},
  daily: {},
  memos: {},
  settings: { market: 'kr' },
  quiz: {},
  newsLog: {},
  scores: {},
  seen: { unlocks: {}, recaps: {} },
};
