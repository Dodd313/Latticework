// 지식 카드를 드라이브 학습 문서(HTML)로 바꾼다. 디자인은 소유자가 고른 드라이브 논리학/증명 문서를 따른다(2026-11-23).
// 사용: node scripts/cards-to-doc.mjs <입력.json> > out.html  그다음 create_file(contentMimeType text/html)로 올리면 구글 문서가 된다.
// 입력: { field: "자원·원자재 경제", discipline: "경제학", source: "원자료 이름", made: "YYYY-MM-DD", groups: [{ path, cards: [카드] }] }
// 디자인 요소(증명 문서에서 가져옴): 회색 작은 분야명과 메타 줄, 24pt 굵은 개념 이름, 기울인 회색 부제와 굵은 밑줄,
// 얇은 검은 테두리의 정의 상자, "1 특징" 꼴의 번호 소제목, 옅은 회색 바탕의 예제, 끝의 작은 기울인 회색 출처 줄. 글꼴 Noto Sans KR.
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const F = "font-family:'Noto Sans KR',Arial,sans-serif;";
const INK = '#171C26';
const GREY = '#5E6B78';
const SHADE = '#F3F5F7';
const P = (style, html) => `<p style="${F}margin:0;line-height:1.5;${style}">${html}</p>`;
const LI = (html, style = '') => `<li style="${F}font-size:11pt;line-height:1.5;margin:0 0 2pt 0;${style}">${html}</li>`;
const H3 = (n, t) => `<h3 style="${F}font-size:12pt;font-weight:bold;color:${INK};margin:16pt 0 4pt 0;line-height:1.5;">${n ? `${n} ` : ''}${esc(t)}</h3>`;
const LV = { 1: '인식', 2: '특징', 3: '구분', 4: '적용' };
const rule = (html) => `<table style="width:100%;border-collapse:collapse;margin:0 0 12pt 0;"><tr><td style="border:none;border-bottom:1.5pt solid ${INK};padding:0 0 8pt 0;">${P(`font-size:10pt;font-style:italic;color:${GREY};`, html)}</td></tr></table>`;
const diffs = [];
const out = [];
const answers = [];

out.push(`<h1 style="${F}font-size:11pt;font-weight:bold;color:${GREY};margin:0 0 4pt 0;line-height:1.5;">${esc(doc.field)}</h1>`);
out.push(P(`font-size:9pt;color:${GREY};`, `분야: ${esc(doc.discipline)} · 원자료: ${esc(doc.source)} · 수정: ${esc(doc.made)}`));

let n = 0;
for (const g of doc.groups) {
  for (const c of g.cards) {
    n++;
    out.push(`<h2 style="${F}font-size:24pt;font-weight:bold;color:${INK};margin:28pt 0 2pt 0;line-height:1.4;">${esc(c.name)}</h2>`);
    const sub = [c.abbr ? null : c.en || c.full, c.ko && c.ko !== c.name ? c.ko : null, g.path].filter(Boolean).map(esc).join(' · ');
    // 부제와 굵은 밑줄: 문단 테두리는 구글 문서에서 옅은 선으로 바뀌어, 아래 테두리만 있는 한 칸 표로 그린다.
    out.push(rule(sub));
    // 정의 상자: 머리 칸(정의)과 본문 칸, 바깥 테두리만 1pt
    out.push(`<table style="width:100%;border-collapse:collapse;margin:4pt 0 4pt 0;"><tr><td style="border:1pt solid ${INK};border-bottom:none;padding:8pt 12pt 0 12pt;">${P('font-size:9pt;font-weight:bold;', '정의')}</td></tr><tr><td style="border:1pt solid ${INK};border-top:none;padding:2pt 12pt 8pt 12pt;">${P('font-size:11pt;', esc(c.def))}</td></tr></table>`);
    let k = 0;
    if (c.traits?.length) {
      out.push(H3(++k, '특징'));
      out.push(`<ul style="margin:0;">${c.traits.map((t) => LI(esc(t))).join('')}</ul>`);
    }
    if (c.measure) {
      out.push(H3(++k, '측정 기준'));
      out.push(P('font-size:11pt;', esc(c.measure)));
    }
    if (c.example) {
      out.push(H3(++k, '예제'));
      out.push(`<table style="width:100%;border-collapse:collapse;"><tr><td style="background-color:${SHADE};padding:8pt 12pt;border:none;">${P('font-size:11pt;', esc(c.example))}</td></tr></table>`);
    }
    for (const sb of c.sub ?? []) {
      out.push(H3(null, `하위 요소: ${sb.name}`));
      out.push(P('font-size:11pt;', esc(sb.def)));
      if (sb.traits?.length) out.push(`<ul style="margin:0;">${sb.traits.map((t) => LI(esc(t))).join('')}</ul>`);
    }
    if (c.contrast?.length) {
      out.push(H3(null, '유사 개념과의 구분'));
      out.push(`<ul style="margin:0;">${c.contrast.map((x) => LI(`${esc(x.with)}: ${esc(x.diff)}`)).join('')}</ul>`);
    }
    if (c.analogy) out.push(P(`font-size:10pt;color:${GREY};margin-top:8pt;`, `비유. ${esc(c.analogy)}`));
    if (c.questions?.length) {
      out.push(H3(null, '확인 문제'));
      out.push('<ol style="margin:0;">');
      for (const q of c.questions) {
        const opts = q.t === 'mc' && q.o ? `<ol type="a" style="margin:2pt 0 4pt 0;">${q.o.map((o) => LI(esc(o), 'font-size:10.5pt;')).join('')}</ol>` : `<p style="${F}margin:2pt 0 4pt 0;font-size:10.5pt;color:${GREY};">O 또는 X</p>`;
        out.push(LI(`<span style="color:${GREY};font-size:9pt;">${LV[q.lv] ?? ''}</span> ${esc(q.q)}${opts}`));
        const ans = q.t === 'ox' ? (q.a ? 'O' : 'X') : `${'abcd'[q.a]}. ${q.o?.[q.a] ?? ''}`;
        answers.push({ n, name: c.name, lv: q.lv, ans, w: q.w });
      }
      out.push('</ol>');
    }
    const src = (c.src ?? []).slice(0, 4).map((s) => `<a href="${esc(s.url)}" style="color:${GREY};">${esc(s.title)}</a>`).join(', ');
    if (src) out.push(P(`font-size:9pt;font-style:italic;color:${GREY};margin-top:14pt;`, `출처: ${src}`));
    if (c.docDiff?.length) diffs.push({ name: c.name, items: c.docDiff });
  }
}

if (answers.length) {
  out.push(`<h2 style="${F}font-size:24pt;font-weight:bold;color:${INK};margin:36pt 0 2pt 0;line-height:1.4;">정답과 해설</h2>`);
  out.push(rule('문제를 모두 푼 뒤에 맞춰 본다.'));
  let cur = '';
  for (const a of answers) {
    if (a.name !== cur) {
      cur = a.name;
      out.push(H3(null, a.name));
    }
    out.push(P('font-size:10.5pt;margin:0 0 4pt 0;', `<b>${LV[a.lv] ?? a.lv} ${esc(a.ans)}</b><br>${esc(a.w)}`));
  }
}
// 원자료와 출처가 다르게 말한 점은 공부 흐름을 끊지 않게 문서 맨 끝에 모은다.
if (diffs.length) {
  out.push(`<h2 style="${F}font-size:24pt;font-weight:bold;color:${INK};margin:36pt 0 2pt 0;line-height:1.4;">원자료 대조</h2>`);
  out.push(rule('원자료(수집함 자료)와 출처가 다르게 말한 점. 카드에는 출처 쪽을 따랐다.'));
  for (const d of diffs) {
    out.push(H3(null, d.name));
    out.push(`<ul style="margin:0;">${d.items.map((t) => LI(esc(t), `font-size:10pt;color:${GREY};`)).join('')}</ul>`);
  }
}
process.stdout.write(`<html><head><meta charset="utf-8"><title>${esc(doc.field)}</title></head><body style="${F}color:${INK};">${out.join('\n')}</body></html>`);
