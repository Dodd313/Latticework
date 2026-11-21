// 앱 아이콘 PNG 를 assets/logo/ 의 SVG 원본에서 그린다. 표식은 세 면 상자(윗면 파랑 #3182f6, 옆면 #191f28, 흰 바탕).
// SVG 원본을 다시 만들 때: python3 -I assets/logo/src/make_logo.py (Inkscape 필요). 그다음 이 스크립트를 돌린다.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('..', import.meta.url).pathname;
const logo = (name) => readFileSync(`${root}assets/logo/${name}.svg`, 'utf8');
const site = `${root}web/site/icons/`;
const assets = `${root}assets/`;
mkdirSync(site, { recursive: true });

// [원본, 저장할 곳, 크기, 바탕]. 바탕이 없으면 투명.
const jobs = [
  // 자체 주소(홈 화면, 탭, 설치)
  ['icon', `${site}apple-touch-icon.png`, 180, '#ffffff'],
  ['icon-tile', `${site}icon-192.png`, 192],
  ['icon-tile', `${site}icon-512.png`, 512],
  ['icon-maskable', `${site}maskable-192.png`, 192, '#ffffff'],
  ['icon-maskable', `${site}maskable-512.png`, 512, '#ffffff'],
  ['favicon-16', `${site}favicon-16.png`, 16],
  ['favicon', `${site}favicon-32.png`, 32],
  ['mark-mono', `${site}badge-96.png`, 96],
  // 네이티브 빌드(app.json)
  ['icon', `${assets}icon.png`, 1024, '#ffffff'],
  ['favicon', `${assets}favicon.png`, 48],
  ['mark', `${assets}splash-icon.png`, 1024],
  ['android-foreground', `${assets}android-icon-foreground.png`, 512],
  [null, `${assets}android-icon-background.png`, 512, '#ffffff'],
  ['android-monochrome', `${assets}android-icon-monochrome.png`, 432],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, path, size, bg] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const inner = name ? logo(name).replace(/<svg /, `<svg style="display:block;width:${size}px;height:${size}px" `) : '';
  await page.setContent(`<html><body style="margin:0;background:${bg ?? 'transparent'}">${inner}</body></html>`);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: !bg });
}
await browser.close();
console.log(`아이콘 ${jobs.length}개 저장`);
