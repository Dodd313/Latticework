const EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const KO = ['일', '월', '화', '수', '목', '금', '토'];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map((v) => Number(v));
  return { y, m, d };
}

function weekdayIndex(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 2026.11.18 WED */
export function stamp(date: string): string {
  const { y, m, d } = parts(date);
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} ${EN[weekdayIndex(date)]}`;
}

/** 11.18 WED */
export function shortStamp(date: string): string {
  const { m, d } = parts(date);
  return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} ${EN[weekdayIndex(date)]}`;
}

/** 11.18 */
export function monthDay(date: string): string {
  const { m, d } = parts(date);
  return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

/** 11월 18일 수요일 */
export function korean(date: string): string {
  const { m, d } = parts(date);
  return `${m}월 ${d}일 ${KO[weekdayIndex(date)]}요일`;
}

/** 한국 시각 기준 오늘 날짜 */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isWeekend(date: string): boolean {
  const w = weekdayIndex(date);
  return w === 0 || w === 6;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map((v) => Number(v));
  return `${y}년 ${m}월`;
}

/** 달력 한 달을 주 단위 배열로. 빈 칸은 null. */
export function monthGrid(key: string): (string | null)[][] {
  const [y, m] = key.split('-').map((v) => Number(v));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(`${key}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAYS_KO = KO;

export function addDays(date: string, delta: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** 그 날짜가 든 주의 월요일부터 금요일까지 */
export function weekdaysOf(date: string): string[] {
  const w = weekdayIndex(date);
  const monday = addDays(date, w === 0 ? -6 : 1 - w);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** 11월 3주차 */
export function weekTitle(date: string): string {
  const monday = weekdaysOf(date)[0];
  const { m, d } = parts(addDays(monday, 3)); // 목요일이 든 달을 그 주의 달로 본다
  return `${m}월 ${Math.ceil(d / 7)}주차`;
}

/** 시각(ISO)을 한국 날짜로 */
export function kstDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const WEEKDAY_SHORT = ['월', '화', '수', '목', '금'];

/** 그 날짜가 든 ISO 주의 이름. 예: 2026-W47 (주간 리뷰 문서 id 와 같다) */
export function isoWeekId(date: string): string {
  const thu = addDays(mondayOf(date), 3); // 목요일이 든 해가 그 주의 해다
  const { y } = parts(thu);
  const start = Date.UTC(y, 0, 1);
  const { m, d } = parts(thu);
  const ordinal = Math.round((Date.UTC(y, m - 1, d) - start) / 86400000) + 1;
  return `${y}-W${String(Math.floor((ordinal - 1) / 7) + 1).padStart(2, '0')}`;
}

/** 그 날짜가 든 주의 월요일 */
export function mondayOf(date: string): string {
  const w = weekdayIndex(date);
  return addDays(date, w === 0 ? -6 : 1 - w);
}

/** a 에서 b 까지 며칠(b - a). 같은 날이면 0 */
export function dayDiff(a: string, b: string): number {
  const p = parts(a);
  const q = parts(b);
  return Math.round((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86400000);
}

/** YYYY-MM (monthKey 와 같다) */
export function monthOf(date: string): string {
  return monthKey(date);
}

/** 그 달(YYYY-MM)의 모든 날짜 */
export function monthDays(key: string): string[] {
  const [y, m] = key.split('-').map((v) => Number(v));
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
}

/** 한국 시각의 시(0~23) */
export function kstHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 9 * 3600 * 1000).getUTCHours();
}

/** 0 일요일 ~ 6 토요일 */
export function weekdayOf(date: string): number {
  return weekdayIndex(date);
}
