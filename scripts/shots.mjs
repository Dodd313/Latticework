// 로컬 확인: 휴대폰 크기로 각 화면을 띄워 그림으로 남기고, 콘솔 오류를 모은다.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('../out/', import.meta.url).pathname;
const shots = new URL('../shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// 예시 기사의 날짜를 오늘과 어제로 옮겨서 연속 기록과 목표 달성 화면을 확인한다.
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let body = readFileSync(join(root, path === '/' ? 'index.html' : path));
    if (path === '/preview.html') body = Buffer.from(body.toString('utf8').replaceAll('2026-03-30', kst(0)).replaceAll('2026-02-26', kst(-1)));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('없음');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const scheme = process.argv[2] === 'dark' ? 'dark' : 'light';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, locale: 'ko-KR' });
const page = await ctx.newPage();
// 저녁 퀴즈는 한국 시각 18시에 열린다. 확인할 때는 화면 안의 시계를 오늘 20시로 옮긴다.
const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
const offset = (20 - kstNow.getUTCHours()) * 3600 * 1000;
await page.addInitScript((off) => {
  const Real = Date;
  class Shifted extends Real {
    constructor(...args) {
      if (args.length === 0) super(Real.now() + off);
      else super(...args);
    }
    static now() {
      return Real.now() + off;
    }
  }
  window.Date = Shifted;
}, offset);
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const snap = async (name) => {
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(shots, `${scheme}-${name}.png`) });
};
const tap = (label) => page.getByLabel(label, { exact: true }).last().click();

await page.goto(`${base}/preview-empty.html`);
await page.waitForTimeout(900);
await snap('00-empty');

await page.goto(`${base}/preview.html`);
await page.waitForTimeout(1200);
await snap('01-today');

await tap('뉴스 열기');
await snap('01b-news');
await page.getByText('원/달러 환율 1,521.1원, 2009년 3월 이후 가장 높았다').last().click();
await snap('02-article-top');
for (const [i, y] of [[1, 760], [5, 9999]]) {
  await page.evaluate((yy) => {
    const els = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible');
    const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) el.scrollTop = yy;
  }, y);
  await snap(`03-article-scroll-${i}`);
}
const readState = await page.evaluate(() => JSON.stringify(window.__LW_DOCS__['data/users/u_localpreview0000000000/progress'] ?? null));
await tap('뒤로(으)로 돌아가기');
await snap('04-news-after-read');

// 두 번째 기사까지 읽으면 목표 달성 화면이 뜬다.
await page.getByText('중동 긴장에 코스피 2.97% 하락, 5,277.30 마감').last().click();
await page.waitForTimeout(700);
await tap('읽음 표시');
await snap('05-goal-reached');
await page.waitForTimeout(3200);
await tap('뒤로(으)로 돌아가기');
await tap('저녁 퀴즈 풀기');
await snap('05c-day-quiz');
await page.getByText('수입 물가를 더 자극할 수 있어서').click();
await snap('05d-day-quiz-answered');
await tap('홈(으)로 돌아가기');
await tap('홈(으)로 돌아가기');
await snap('05e-today-done');

await tap('기록');
await snap('06-archive');
// 달력에서 오늘을 누르면 그날 기록이 아래에서 올라온다.
await page.getByLabel(/^\d+월 \d+일 .요일$/).last().click();
await snap('06b-archive-day');
await tap('닫기');
await page.waitForTimeout(400);
await tap('리뷰');
await snap('07-review');
await tap('홈');
await tap('설정');
await snap('09-settings');
await tap('기록 내보내기');
await snap('10-settings-export');

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ scheme, errors, readState, horizontalOverflow: overflow, writes: await page.evaluate(() => window.__LW_WRITES__ ?? 0) }, null, 2));
await browser.close();
server.close();
