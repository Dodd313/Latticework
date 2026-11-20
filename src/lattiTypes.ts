// Latti 문구 자료(docs/data/latti.json)의 모양. 고르는 일은 src/latti.ts 가 한다.

/** 한 줄. s 는 상황 열쇠(여럿 가능), t 는 문장({slot}, {slot|조사}), when 은 조건, p 는 우선 단계, w 는 무게, until 은 쓸 수 있는 마지막 날 */
export type LattiLine = { id: string; s: string | string[]; t: string; when?: Record<string, unknown>; p?: number; w?: number; until?: string };

export type LattiRules = {
  maxLen: number;
  maxSentences: number;
  maxSentenceLen: number;
  noRepeatDays: number;
  todayBoost: number;
  lowerTierShare: number;
  sessionAvoid: number;
};

/** 하루 묶음. 아침 예약 작업이 그날 날짜로 쓰는 줄. date 부터(줄의 until 이나 묶음의 until 까지) 쓴다. */
export type LattiToday = { date: string; by?: string; until?: string; lines: LattiLine[] };

export type LattiData = {
  version: number;
  about?: string;
  persona?: Record<string, unknown>;
  rules: LattiRules;
  situations?: Record<string, string>;
  slots?: string;
  bank: LattiLine[];
  /** 하루 묶음 목록. 아침 예약 작업이 날마다 끝에 하나씩 덧붙인다(같은 날짜가 있으면 바꾼다). */
  daily?: LattiToday[];
  /** 예전 모양(묶음 하나). 지금도 읽는다. */
  today?: LattiToday | null;
};
