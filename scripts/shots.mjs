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
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const snap = async (name) => {
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(shots, `${scheme}-${name}.png`) });
};
const tap = (label) => page.getByLabel(label, { exact: true }).first().click();

await page.goto(`${base}/preview-empty.html`);
await page.waitForTimeout(900);
await snap('00-empty');

await page.goto(`${base}/preview.html`);
await page.waitForTimeout(1200);
await snap('01-today');

await page.getByText('원/달러 환율 1,521.1원, 2009년 3월 이후 가장 높았다').first().click();
await snap('02-article-top');
const scroller = page.locator('div').filter({ hasText: '요약' }).last();
for (const [i, y] of [[1, 760], [2, 1520], [3, 2280], [4, 3040], [5, 9999]]) {
  await page.evaluate((yy) => {
    const els = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible');
    const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) el.scrollTop = yy;
  }, y);
  await snap(`03-article-scroll-${i}`);
}
void scroller;
const readState = await page.evaluate(() => JSON.stringify(window.__LW_DOCS__['data/users/u_localpreview0000000000/progress'] ?? null));
await tap('뒤로(으)로 돌아가기');
await snap('04-today-after-read');

// 두 번째 기사까지 읽으면 목표 달성 화면이 뜬다.
await page.getByText('중동 긴장에 코스피 2.97% 하락, 5,277.30 마감').first().click();
await page.waitForTimeout(700);
await tap('읽음 표시');
await snap('05-goal-reached');
await page.waitForTimeout(3200);
await tap('뒤로(으)로 돌아가기');
await snap('05b-today-done');

await tap('기록');
await snap('06-archive');
await tap('주간 리뷰');
await snap('07-review');
await page.evaluate(() => {
  const els = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 100 && getComputedStyle(d).overflowY !== 'visible' && d.offsetParent !== null);
  const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (el) el.scrollTop = 9999;
});
await page.getByText('수입 물가가 올라서').click();
await snap('08-review-answered');
await tap('오늘');
await tap('설정');
await snap('09-settings');
await tap('한국 · 미국');
await tap('기록 내보내기');
await snap('10-settings-export');

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ scheme, errors, readState, horizontalOverflow: overflow, writes: await page.evaluate(() => window.__LW_WRITES__ ?? 0) }, null, 2));
await browser.close();
server.close();
