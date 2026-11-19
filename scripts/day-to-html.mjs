// 하루치 앱 데이터(days/{날짜} 문서)를 구글 드라이브에 올릴 문서용 HTML로 바꾼다.
// 사용: node scripts/day-to-html.mjs <day.json> > out.html
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const day = raw.data ?? raw;
const out = [];
out.push(`<h1>${esc(day.date)} 시사</h1>`);
out.push(`<p>오늘 읽을 뉴스 ${day.articles.length}건입니다. 앱: <a href="https://dodd313.github.io/Latticework/">Latticework</a></p>`);

for (const a of day.articles) {
  out.push(`<h2>${esc(a.title)}</h2>`);
  out.push(`<p>${esc(a.source)} · <a href="${esc(a.url)}">기사 원문 보기</a></p>`);
  if (a.summary?.length) out.push('<h3>요약</h3><ul>' + a.summary.map((s) => `<li>${esc(s)}</li>`).join('') + '</ul>');
  if (a.body?.length) out.push('<h3>본문 정리</h3>' + a.body.map((p) => `<p>${esc(p)}</p>`).join(''));
  const past = (a.links ?? []).filter((l) => l.kind !== 'new' && l.refTitle);
  if (past.length) out.push('<h3>관련 기사</h3><ul>' + past.map((l) => `<li><b>${esc(l.refDate ?? '')} ${esc(l.refTitle)}</b>: ${esc(l.text)}</li>`).join('') + '</ul>');
}

process.stdout.write(out.join('\n'));
