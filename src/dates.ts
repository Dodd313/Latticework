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
