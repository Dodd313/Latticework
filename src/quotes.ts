/** 홈 맨 위 투자자의 문장. 화면에는 우리말 문장과 말한 사람의 영문 이름만 보여 준다. */
import { QUOTE_BANK } from './quoteBank';

export type Quote = { text: string; by: string };

export const QUOTES: Quote[] = QUOTE_BANK.map((q) => ({ text: q.ko, by: q.by }));

/** 하루에 보여 주는 문장 수. 누르면 이 안에서 다음 문장으로 넘어간다. */
export const QUOTES_PER_DAY = 3;

/** 문자열에서 고정된 32비트 수를 만든다(FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let order: number[] | null = null;

/** 문장 묶음을 한 번 섞어 둔 순서. 원문 기준이라 문장이 늘어도 기존 문장끼리의 앞뒤는 그대로다. */
function shuffled(): number[] {
  if (!order) {
    order = QUOTE_BANK.map((q, i) => [hash(q.en + '|' + q.by), i] as const)
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]);
  }
  return order;
}

/** 그날의 문장들. 날마다 다음 몇 개로 넘어가서 전체를 다 돌기 전에는 같은 문장이 다시 나오지 않는다. date 는 'YYYY-MM-DD'. */
export function quotesFor(date: string): Quote[] {
  const [y, m, d] = date.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const ord = shuffled();
  const n = ord.length;
  const k = Math.min(QUOTES_PER_DAY, n);
  const start = (((day * k) % n) + n) % n;
  return Array.from({ length: k }, (_, j) => QUOTES[ord[(start + j) % n]]);
}
