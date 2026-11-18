// 앱 전체가 공유하는 데이터 모양.
// 매일 아침 정리 작업이 이 모양 그대로 저장소에 쓰고, 화면은 읽기만 한다.

export type RelevanceAxes = {
  price: number; // 가격 영향 경로, 30점 만점
  scope: number; // 영향 범위, 20점 만점
  persistence: number; // 지속성, 20점 만점
  pricedIn: number; // 시장 반영 정도, 15점 만점
  linkage: number; // 지난 기록과의 연결, 15점 만점
};

export const AXIS_MAX: RelevanceAxes = { price: 30, scope: 20, persistence: 20, pricedIn: 15, linkage: 15 };

export const AXIS_LABEL: Record<keyof RelevanceAxes, string> = {
  price: '가격 영향 경로',
  scope: '영향 범위',
  persistence: '지속성',
  pricedIn: '시장 반영 정도',
  linkage: '지난 기록과의 연결',
};

export type Stance = 'positive' | 'negative' | 'mixed' | 'watch';

export type LinkKind = 'continue' | 'reverse' | 'cross' | 'pattern' | 'new';

export type Verdict = 'hit' | 'miss' | 'open';

export type ArticleLink = {
  kind: LinkKind;
  refDate?: string;
  refArticleId?: string;
  refTitle?: string;
  text: string;
};

export type Article = {
  id: string;
  date: string; // YYYY-MM-DD
  category: string; // 예: "거시 · 환율"
  title: string;
  gist: string;
  source: string;
  url: string;
  publishedAt?: string;
  minutes: number;
  relevance: { total: number; axes: RelevanceAxes; reason?: string };
  summary: string[];
  numbers: { value: string; label: string }[];
  impact: { target: string; stance: Stance; label: string; text: string }[];
  trap?: string;
  chain: string[];
  links: ArticleLink[];
  lattice?: { models: string[]; text: string };
  counter?: string;
  trackers: string[];
  checkDate?: string;
  glossary: { term: string; def: string }[];
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

export type UserData = {
  read: Record<string, string>; // 기사 id → 읽은 시각
  memos: Record<string, Memo>;
  settings: Settings;
  quiz: Record<string, Record<string, number>>; // 복습 id → 문항 번호 → 고른 보기
};

export const EMPTY_USER: UserData = {
  read: {},
  memos: {},
  settings: { market: 'kr' },
  quiz: {},
};
