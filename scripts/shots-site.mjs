// 자체 주소 빌드(docs/)를 휴대폰 크기로 띄워 복습 흐름을 확인한다: 홈, Latticework 5문제, 영단어, 기록.
// 사용: node scripts/shots-site.mjs
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../docs/', import.meta.url).pathname;
const shots = new URL('../shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = readFileSync(join(root, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('없음');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'ko-KR', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const snap = async (name) => {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(shots, `site-${name}.png`) });
};
const has = async (label) => (await page.getByLabel(label, { exact: true }).count()) > 0 && (await page.getByLabel(label, { exact: true }).first().isVisible());
const tap = (label) => page.getByLabel(label, { exact: true }).last().click();

// 한 세션을 끝까지 푼다. 객관식은 첫 번째 보기를 고르고, 떠올리기는 "알았다"를 누른다.
async function solve(prefix) {
  let shot = 0;
  for (let step = 0; step < 80; step++) {
    await page.waitForTimeout(350);
    if (await has('더 풀기')) break;
    if (await has('답 보기')) {
      if (shot++ < 1) await snap(`${prefix}-think`);
      await tap('답 보기');
      await page.waitForTimeout(300);
      await tap('알았다');
      continue;
    }
    if ((await has('다음')) || (await has('마치기'))) {
      if (shot++ < 3) await snap(`${prefix}-settled-${shot}`);
      await tap((await has('다음')) ? '다음' : '마치기');
      continue;
    }
    if (await has('확인')) {
      const options = page.locator('[role="radiogroup"] [role="button"]:not([aria-disabled="true"])');
      if ((await options.count()) > 0) await options.first().click();
      await page.waitForTimeout(150);
      if (shot === 0) await snap(`${prefix}-question`);
      await tap('확인');
      continue;
    }
  }
  await snap(`${prefix}-summary`);
}

await page.goto(`${base}/index.html`);
await page.waitForTimeout(2500);
await snap('01-home');
await tap('Latticework 열기');
await solve('02-lat');
// 더 풀기를 두 번 해도 같은 문제가 되풀이되지 않는지 본다.
await tap('더 풀기');
await solve('02b-lat-more');
await tap('더 풀기');
await solve('02c-lat-more');
await tap('오늘로 돌아가기');
await snap('03-home-after-lat');
await tap('영단어 열기');
await solve('04-voc');
await tap('더 풀기');
await solve('04b-voc-more');
await tap('오늘로 돌아가기');
await snap('05-home-after-voc');
await tap('기록');
await snap('06-record');
const state = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lw.study.state.v1') || '{}');
  const log = JSON.parse(localStorage.getItem('lw.study.log.v1') || '[]');
  const count = {};
  const units = {};
  for (const r of log) {
    count[r.q] = (count[r.q] || 0) + 1;
    units[r.k] = units[r.k] || new Set();
    units[r.k].add(r.u);
  }
  const repeats = Object.entries(count).filter(([, n]) => n > 2).length;
  const twice = Object.entries(count).filter(([, n]) => n === 2).length;
  return { repeatsOver2: repeats, askedTwice: twice, distinctQuestions: Object.keys(count).length, latUnits: units.lat ? units.lat.size : 0, vocUnits: units.voc ? units.voc.size : 0, days: s.days, cards: Object.keys(s.cards || {}).length, xp: s.xp, log: log.length, sample: Object.values(s.cards || {}).slice(0, 2) };
});
console.log(JSON.stringify({ errors, state }, null, 1));
await browser.close();
server.close();
