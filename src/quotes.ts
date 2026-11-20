/** 홈 맨 위 투자자의 문장. 문장과 말한 사람의 영문 이름만 보여 준다. */
export type Quote = { text: string; by: string };

export const QUOTES: Quote[] = [
  { text: '사실들이 이론의 격자 위에 엮여 있지 않으면, 쓸 수 있는 형태로 가진 것이 아니다.', by: 'Charlie Munger' },
  { text: '남들이 탐욕스러울 때 두려워하고, 남들이 두려워할 때만 탐욕스러워지려 한다.', by: 'Warren Buffett' },
  { text: '가격은 내는 것이고, 가치는 얻는 것이다.', by: 'Warren Buffett' },
  { text: '무엇을 가졌는지, 왜 가졌는지 알라.', by: 'Peter Lynch' },
  { text: '앞면이 나오면 이기고, 뒷면이 나와도 크게 잃지 않는다.', by: 'Mohnish Pabrai' },
  { text: '투자는 지적 정직함의 문제다. 아는 것을 알고, 무엇보다 모르는 것을 알아야 한다.', by: 'Li Lu' },
];

/** 그해의 몇 번째 날인지로 첫 문장을 고른다. date 는 'YYYY-MM-DD'. */
export function quoteIndexFor(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
  return ((day % QUOTES.length) + QUOTES.length) % QUOTES.length;
}
