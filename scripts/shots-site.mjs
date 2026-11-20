// 자체 주소 빌드(docs/)를 휴대폰 크기로 띄워 복습 흐름을 확인한다: 홈, Latticework 5문제, 영단어, 기록,
// 그리고 다시 열었을 때의 해금 화면(시작 화면 다음). 처음 여는 동안은 #noflow 로 해금과 돌아보기를 끈다.
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

// 마침 화면에는 정답률 고리가 있다.
const done = async () => (await page.getByLabel(/^정답률 /).count()) > 0 || ((await has('추가 학습')) && !(await has('확인')));

// 한 세션을 끝까지 푼다. 객관식은 첫 번째 보기를 고르고, 떠올리기는 "알았다"를 누른다.
async function solve(prefix) {
  let shot = 0;
  for (let step = 0; step < 80; step++) {
    await page.waitForTimeout(350);
    if (await done()) break;
    if (await has('답 보기')) {
      if (shot++ < 1) await snap(`${prefix}-think`);
      await tap('답 보기');
      await page.waitForTimeout(300);
      await tap('알았다');
      continue;
    }
    if ((await has('계속')) || (await has('마치기'))) {
      if (shot++ < 3) await snap(`${prefix}-settled-${shot}`);
      await tap((await has('계속')) ? '계속' : '마치기');
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
  await page.waitForTimeout(1600);
  await snap(`${prefix}-summary`);
  // 레벨이 오르면 메달 화면이 덮는다. 닫고 나서 다음 단계로 간다.
  if (await has('확인')) {
    await tap('확인');
    await page.waitForTimeout(400);
  }
}

await page.goto(`${base}/index.html#noflow`);
await page.waitForTimeout(2500);
await snap('01-home');
await tap('Latticework 열기');
await solve('02-lat');
// 추가 학습를 두 번 해도 같은 문제가 되풀이되지 않는지 본다.
await tap('추가 학습');
await solve('02b-lat-more');
await tap('추가 학습');
await solve('02c-lat-more');
await tap('계속');
await snap('03-home-after-lat');
await tap('영단어 열기');
await solve('04-voc');
await tap('추가 학습');
await solve('04b-voc-more');
await tap('계속');
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
// 다시 열면(#noflow 없이) 오늘 처음 푼 개념의 학문이 시작 화면 다음에 해금 화면으로 뜬다. 계속을 눌러 홈까지 간다.
await page.goto(`${base}/index.html`);
await page.waitForTimeout(800);
await page.reload();
await page.waitForTimeout(4200);
const flow = { unlockCards: 0, recap: false };
for (let i = 0; i < 6 && (await page.locator('[data-testid="unlock"]').count()); i++) {
  if (i === 0) await snap('08-unlock');
  flow.unlockCards += 1;
  await tap('계속');
  await page.waitForTimeout(3200);
}
if (await page.locator('[data-testid="recap"]').count()) {
  flow.recap = true;
  await snap('08b-recap');
  await tap('닫기');
  await page.waitForTimeout(800);
}
await snap('09-home-after-flow');
await page.reload();
await page.waitForTimeout(3600);
flow.again = (await page.locator('[data-testid="unlock"]').count()) > 0;

console.log(JSON.stringify({ errors, state, flow }, null, 1));
await browser.close();
server.close();
