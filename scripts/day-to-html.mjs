// 하루치 앱 데이터(days/{날짜} 문서)를 구글 드라이브에 올릴 문서용 HTML로 바꾼다.
// 사용: node scripts/day-to-html.mjs <day.json> > out.html
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const AXES = [
  ['price', '가격 영향 경로', 30],
  ['scope', '영향 범위', 20],
  ['persistence', '지속성', 20],
  ['pricedIn', '시장 반영 정도', 15],
  ['linkage', '지난 기록과의 연결', 15],
];
const LINK = { continue: '이어짐', reverse: '뒤집힘', cross: '교차', pattern: '반복 패턴', new: '새 실 시작' };
const VERDICT = { hit: '맞음', miss: '빗나감', open: '미정' };

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const day = raw.data ?? raw;
const out = [];
out.push(`<h1>${esc(day.date)} 시사</h1>`);
out.push(`<p>주식투자 관련도로 고른 경제 뉴스 ${day.articles.length}건입니다. 앱: <a href="https://claude.ai/artifact/WpHC549vSuf6D5WaYYj2Qo">Latticework 시사</a></p>`);

for (const a of day.articles) {
  out.push(`<h2>${esc(a.title)}</h2>`);
  out.push(`<p>${esc(a.category)} · ${esc(a.source)} · <a href="${esc(a.url)}">원문 보기</a></p>`);
  out.push(`<p><b>투자 관련도 ${a.relevance.total}/100</b>${a.relevance.reason ? ` · ${esc(a.relevance.reason)}` : ''}</p>`);
  out.push('<table border="1" cellpadding="4">' + AXES.map(([k, label, max]) => `<tr><td>${label}</td><td>${a.relevance.axes?.[k] ?? 0}/${max}</td></tr>`).join('') + '</table>');
  if (a.threadName) out.push(`<p>실: ${esc(a.threadName)}${a.isNewThread ? ' (새 실 시작)' : a.threadOrder ? ` (${a.threadOrder}번째)` : ''}</p>`);
  if (a.summary?.length) out.push('<h3>3줄 요약</h3><ol>' + a.summary.map((s) => `<li>${esc(s)}</li>`).join('') + '</ol>');
  if (a.numbers?.length) out.push('<h3>핵심 숫자</h3><table border="1" cellpadding="4">' + a.numbers.map((n) => `<tr><td><b>${esc(n.value)}</b></td><td>${esc(n.label)}</td></tr>`).join('') + '</table>');
  if (a.impact?.length) out.push('<h3>시장에 미치는 영향</h3><ul>' + a.impact.map((i) => `<li><b>${esc(i.target)}</b> [${esc(i.label)}] ${esc(i.text)}</li>`).join('') + '</ul>');
  if (a.trap) out.push(`<h3>바로 반응하면 생기는 함정</h3><p>${esc(a.trap)}</p>`);
  if (a.chain?.length) out.push('<h3>왜 중요한가</h3><ol>' + a.chain.map((c) => `<li>${esc(c)}</li>`).join('') + '</ol>');
  if (a.links?.length)
    out.push('<h3>지난 기록과의 연결</h3><ul>' + a.links.map((l) => `<li><b>${LINK[l.kind] ?? l.kind}</b>${l.refTitle ? ` · ${esc(l.refDate ?? '')} ${esc(l.refTitle)}` : ''}: ${esc(l.text)}</li>`).join('') + '</ul>');
  if (a.lattice) out.push(`<h3>Latticework 관점</h3><p><b>${a.lattice.models.map(esc).join(', ')}</b></p><p>${esc(a.lattice.text)}</p>`);
  if (a.counter) out.push(`<h3>반론 한 줄</h3><p>${esc(a.counter)}</p>`);
  if (a.trackers?.length) out.push('<h3>추적 지표</h3><ul>' + a.trackers.map((t) => `<li>${esc(t)}</li>`).join('') + `</ul>${a.checkDate ? `<p>점검일: ${esc(a.checkDate)}</p>` : ''}`);
  if (a.glossary?.length) out.push('<h3>용어</h3><ul>' + a.glossary.map((g) => `<li><b>${esc(g.term)}</b>: ${esc(g.def)}</li>`).join('') + '</ul>');
}

if (day.followups?.length) {
  out.push('<h2>추적 지표 점검</h2><ul>' + day.followups.map((f) => `<li><b>${VERDICT[f.verdict] ?? f.verdict}</b> · ${esc(f.refDate)} ${esc(f.refTitle)}: ${esc(f.text)}</li>`).join('') + '</ul>');
}
process.stdout.write(out.join('\n'));
