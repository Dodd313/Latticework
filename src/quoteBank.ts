/** 투자자 문장 모음. 출처를 확인한 문장만 둔다. source 와 url 은 화면에 쓰지 않고 확인용으로만 남긴다. */
export type BankQuote = { by: string; ko: string; en: string; source: string; url: string };

export const QUOTE_BANK: BankQuote[] = [
  { by: 'Charlie Munger', ko: '사실들이 이론의 격자 위에 엮여 있지 않으면, 쓸 수 있는 형태로 가진 것이 아니다.', en: "If the facts don't hang together on a latticework of theory, you don't have them in a usable form.", source: 'A Lesson on Elementary Worldly Wisdom, USC Business School, 1994', url: '' },
  { by: 'Warren Buffett', ko: '남들이 탐욕스러울 때 두려워하고, 남들이 두려워할 때만 탐욕스러워지려 한다.', en: 'We simply attempt to be fearful when others are greedy and to be greedy only when others are fearful.', source: 'Berkshire Hathaway shareholder letter, 1986', url: 'https://www.berkshirehathaway.com/letters/1986.html' },
  { by: 'Warren Buffett', ko: '가격은 내는 것이고, 가치는 얻는 것이다.', en: 'Price is what you pay; value is what you get.', source: 'Berkshire Hathaway shareholder letter, 2008', url: 'https://www.berkshirehathaway.com/letters/2008ltr.pdf' },
  // 아래 셋은 기존 문장. 출처 검증이 끝나면 확인된 문장으로 바꾼다.
  { by: 'Peter Lynch', ko: '무엇을 가졌는지, 왜 가졌는지 알라.', en: 'Know what you own, and know why you own it.', source: '미확인', url: '' },
  { by: 'Mohnish Pabrai', ko: '앞면이 나오면 이기고, 뒷면이 나와도 크게 잃지 않는다.', en: "Heads, I win; tails, I don't lose much.", source: 'The Dhandho Investor, 2007', url: '' },
  { by: 'Li Lu', ko: '투자는 지적 정직함의 문제다. 아는 것을 알고, 무엇보다 모르는 것을 알아야 한다.', en: 'Li Lu intellectual honesty (unverified)', source: '미확인', url: '' },
];
