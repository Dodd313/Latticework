// 앱 아이콘을 그려 PNG로 저장한다. 짙은 남색 바탕에 격자(lattice)와 주황 점 하나.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const outDir = new URL('../web/site/icons/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0F1A2A"/>
  <g stroke="#FFFFFF" stroke-width="30" stroke-linecap="round" fill="none">
    <path d="M196 120v272M316 120v272M120 196h272M120 316h272"/>
  </g>
  <circle cx="316" cy="196" r="34" fill="#F0A566" stroke="#0F1A2A" stroke-width="12"/>
</svg>`;

const browser = await chromium.launch();
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
  await page.screenshot({ path: outDir + name, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('아이콘 3개 저장:', outDir);
