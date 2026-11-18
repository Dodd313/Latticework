// 하루치 앱 데이터(days/{날짜} 문서)를 구글 드라이브에 올릴 문서용 HTML로 바꾼다.
// 사용: node scripts/day-to-html.mjs <day.json> > out.html
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LINK = { continue: '이어짐', reverse: '뒤집힘', cross: '함께 볼 기사', pattern: '비슷한 전례' };
const VERDICT = { hit: '맞음', miss: '빗나감', open: '미정' };

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const day = raw.data ?? raw;
const out = [];
out.push(`<h1>${esc(day.date)} 시사</h1>`);
out.push(`<p>오늘 읽을 경제 뉴스 ${day.articles.length}건입니다. 앱: <a href="https://dodd313.github.io/Latticework/">Latticework 시사</a></p>`);

for (const a of day.articles) {
  out.push(`<h2>${esc(a.title)}</h2>`);
  out.push(`<p>${esc(a.category)} · ${esc(a.source)} · <a href="${esc(a.url)}">원문 전체 보기</a></p>`);
  if (a.summary?.length) out.push('<h3>요약</h3><ul>' + a.summary.map((s) => `<li>${esc(s)}</li>`).join('') + '</ul>');
  if (a.body?.length) out.push('<h3>본문 정리</h3>' + a.body.map((p) => `<p>${esc(p)}</p>`).join(''));
  const past = (a.links ?? []).filter((l) => l.kind !== 'new');
  if (past.length)
    out.push('<h3>전에 읽은 기사와의 연결</h3><ul>' + past.map((l) => `<li><b>${LINK[l.kind] ?? l.kind}</b>${l.refTitle ? ` · ${esc(l.refDate ?? '')} ${esc(l.refTitle)}` : ''}: ${esc(l.text)}</li>`).join('') + '</ul>');
}

if (day.followups?.length) {
  out.push('<h2>지난 기사 다시 보기</h2><ul>' + day.followups.map((f) => `<li><b>${VERDICT[f.verdict] ?? f.verdict}</b> · ${esc(f.refDate)} ${esc(f.refTitle)}: ${esc(f.text)}</li>`).join('') + '</ul>');
}
process.stdout.write(out.join('\n'));
