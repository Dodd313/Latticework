// 지식 카드 묶음(JSON)을 구글 드라이브 문서용 HTML 로 바꾼다. create_file(contentMimeType text/html)로 올리면 구글 문서가 된다.
// 사용: node scripts/cards-to-html.mjs <cards.json> > out.html
// cards.json 모양: { title, source, made, textbooks: [{학문, 책}], groups: [{ path, cards: [카드] }], words: [{term, why}], dropped: [{what, why}], unverified: [문장] }
// 카드 모양은 WORK_STRUCTURE.txt 의 [지식 카드 형식] 과 같다.
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];
const LV = { 1: '인식', 2: '특징', 3: '구분', 4: '적용' };
const total = doc.groups.reduce((n, g) => n + g.cards.length, 0);

out.push(`<h1>${esc(doc.title)}</h1>`);
out.push(`<p>원자료: ${esc(doc.source)}. 만든 날: ${esc(doc.made)}. 개념 카드 ${total}장, 개념마다 문제 4개.</p>`);
if (doc.note) out.push(`<p>${esc(doc.note)}</p>`);

out.push('<h2>분류 위치</h2>');
out.push('<table border="1" cellpadding="4"><tr><th>학문 &gt; 분과 &gt; 주제</th><th>개념</th></tr>');
for (const g of doc.groups) out.push(`<tr><td>${esc(g.path)}</td><td>${g.cards.map((c) => esc(c.name)).join('<br>')}</td></tr>`);
out.push('</table>');
if (doc.textbooks?.length) {
  out.push('<h3>분류 근거가 된 기준 개론서</h3><ul>');
  for (const t of doc.textbooks) out.push(`<li>${esc(t.discipline)}: ${esc(t.book)}</li>`);
  out.push('</ul>');
}
if (doc.words?.length) {
  out.push('<h3>지식이 아니라 단어로 보낸 것</h3><ul>');
  for (const w of doc.words) out.push(`<li>${esc(w.term)}: ${esc(w.why)}</li>`);
  out.push('</ul>');
}
if (doc.dropped?.length) {
  out.push('<h3>넣지 않은 것</h3><ul>');
  for (const d of doc.dropped) out.push(`<li>${esc(d.what)}: ${esc(d.why)}</li>`);
  out.push('</ul>');
}

for (const g of doc.groups) {
  out.push(`<h2>${esc(g.path)}</h2>`);
  for (const c of g.cards) {
    out.push(`<h3>${esc(c.name)}${c.ko && c.abbr ? ` · ${esc(c.ko)}` : ''}</h3>`);
    out.push(`<p><b>정의</b> ${esc(c.def)}</p>`);
    if (c.traits?.length) out.push('<p><b>특징</b></p><ul>' + c.traits.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>');
    if (c.measure) out.push(`<p><b>측정 기준</b> ${esc(c.measure)}</p>`);
    if (c.contrast?.length) out.push('<p><b>구분</b></p><ul>' + c.contrast.map((x) => `<li>${esc(x.with)}: ${esc(x.diff)}</li>`).join('') + '</ul>');
    if (c.example) out.push(`<p><b>예시</b> ${esc(c.example)}</p>`);
    if (c.analogy) out.push(`<p><b>비유</b> ${esc(c.analogy)}</p>`);
    if (c.questions?.length) {
      out.push('<p><b>문제</b></p><ol>');
      for (const q of c.questions) {
        const ans = q.t === 'ox' ? (q.a ? 'O' : 'X') : q.o?.[q.a];
        const opts = q.t === 'mc' && q.o ? '<ul>' + q.o.map((o) => `<li>${esc(o)}</li>`).join('') + '</ul>' : '';
        out.push(`<li>${LV[q.lv] ?? q.lv}: ${esc(q.q)}${opts}<p>정답: ${esc(ans)}. ${esc(q.w)}</p></li>`);
      }
      out.push('</ol>');
    }
    if (c.merged?.length) out.push(`<p><b>합친 원자료 항목</b> ${c.merged.map(esc).join(', ')}</p>`);
    if (c.docDiff?.length) out.push('<p><b>원자료와 출처가 다르게 말한 점</b></p><ul>' + c.docDiff.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>');
    if (c.src?.length) out.push('<p><b>출처</b></p><ul>' + c.src.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a>${s.opened === false ? ' (검색 요약으로만 확인)' : ''}</li>`).join('') + '</ul>');
  }
}
if (doc.unverified?.length) {
  out.push('<h2>확인하지 못한 것</h2><ul>');
  for (const u of doc.unverified) out.push(`<li>${esc(u)}</li>`);
  out.push('</ul>');
}
process.stdout.write(`<html><head><meta charset="utf-8"></head><body>${out.join('\n')}</body></html>`);
