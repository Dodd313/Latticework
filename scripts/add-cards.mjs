// 지식 카드를 docs/data/study.json 에 더한다. 수집함 처리의 "저장 단계"다(WORK_STRUCTURE.txt [수집함 자동 처리]).
// 사용: node scripts/add-cards.mjs <입력.json> [--dry]
// 입력 모양: { "added": "2026-11-23", "nodes": [마디], "items": [{ "node": "n:...", "card": 카드 }] }
//   마디: { id, ko, short?, en?, rank: discipline|branch|topic, parent, color?, domain?, was? }. 이미 있는 id 는 건너뛴다(내용이 다르면 멈춘다).
//   카드: WORK_STRUCTURE.txt [지식 카드 형식]. key, name, abbr?, full?, ko?, en?, def, traits, measure?, contrast, example?, analogy?, src, questions(4개).
// 원칙: 더하기만 한다. 이미 있는 개념, 문제, 마디는 고치거나 지우지 않는다. 검사에 하나라도 걸리면 아무것도 쓰지 않고 1 로 끝난다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'docs/data/study.json');
const raw = readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dry = process.argv.includes('--dry');
const problems = [];
const bad = (where, why) => problems.push(`${where}: ${why}`);

const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const RANKS = new Set(['discipline', 'branch', 'topic']);
const newNodes = [];
for (const n of input.nodes ?? []) {
  if (!/^n:[a-z0-9-]+$/.test(n.id)) bad(n.id, '마디 id 는 n:<영어 소문자와 하이픈>');
  if (!RANKS.has(n.rank)) bad(n.id, `모르는 계급 ${n.rank}`);
  const old = nodes.get(n.id);
  if (old) {
    if (old.parent !== n.parent || old.rank !== n.rank) bad(n.id, '이미 있는 마디와 부모나 계급이 다르다');
    continue;
  }
  nodes.set(n.id, n);
  newNodes.push(n);
}
for (const n of newNodes) {
  if (n.rank === 'discipline' ? n.parent !== null : !nodes.has(n.parent)) bad(n.id, `부모 마디 ${n.parent} 가 없다`);
}

const TEXT_BAD = /[—→⇒]|->|https?:\/\//;
const conceptIds = new Set(data.concepts.map((c) => c.id));
const questionIds = new Set(data.questions.map((q) => q.id));
const branchOf = (id) => {
  let n = nodes.get(id);
  for (let g = 0; n && n.rank === 'topic' && g < 8; g++) n = nodes.get(n.parent);
  return n;
};
const addC = [];
const addQ = [];
for (const [i, it] of (input.items ?? []).entries()) {
  const c = it.card ?? {};
  const where = `카드 ${i + 1} ${c.name ?? c.key ?? ''}`;
  const node = nodes.get(it.node);
  if (!node || node.rank === 'discipline') { bad(where, `달 마디 ${it.node} 가 없거나 학문이다`); continue; }
  const br = branchOf(it.node);
  const slug = br?.id.replace(/^n:/, '');
  const key = String(c.key ?? '').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!key) bad(where, 'key 가 없다');
  const id = `${slug}-${key}`;
  if (conceptIds.has(id)) bad(where, `이미 있는 개념 id ${id}`);
  conceptIds.add(id);
  if (!c.name || !c.def) bad(where, 'name 이나 def 가 없다');
  if (c.abbr) {
    if (!c.full) bad(where, '약어 개념인데 full 이 없다');
    else if (c.name !== `${c.abbr} (${c.full})`) bad(where, `이름은 "${c.abbr} (${c.full})" 꼴이어야 한다`);
  }
  // 한글 이름에는 영어 이름이 꼭 있어야 한다. 일일 학습 카드와 드라이브 문서 제목에 "한글 (English)" 로 붙는다(2026-11-27 소유자 결정).
  if (!c.abbr && /[가-힣]/.test(c.name ?? '') && !c.en) bad(where, '한글 이름인데 영어 이름(en)이 없다');
  for (const sb of c.sub ?? []) if (!sb.abbr && /[가-힣]/.test(sb.name ?? '') && !sb.en) bad(where, `하위 요소 ${sb.name} 에 영어 이름(en)이 없다`);
  if (!Array.isArray(c.traits) || c.traits.length < 2 || c.traits.length > 4) bad(where, '특징은 2~4개');
  if (!Array.isArray(c.contrast) || c.contrast.length < 1) bad(where, '구분이 없다');
  if (!Array.isArray(c.src) || c.src.length < 1) bad(where, '출처가 없다');
  const texts = [c.name, c.def, ...(c.traits ?? []), c.measure, ...(c.contrast ?? []).flatMap((x) => [x.with, x.diff]), c.example, c.analogy];
  for (const t of texts) if (t && TEXT_BAD.test(t)) bad(where, `줄표, 화살표, 주소가 글에 있다: ${t.slice(0, 40)}`);
  const qs = c.questions ?? [];
  // 문제는 단계 1~4 가 모두 있어야 하고 4~12개. 하위 요소가 있는 개념은 하위 요소의 구분, 적용 문제를 더 둔다.
  const lvSet = new Set(qs.map((q) => q.lv));
  if (qs.length < 4 || qs.length > 12 || ![1, 2, 3, 4].every((l) => lvSet.has(l)) || qs.some((q) => ![1, 2, 3, 4].includes(q.lv))) bad(where, `문제는 단계 1~4 가 모두 있고 4~12개여야 한다(지금 ${qs.map((q) => q.lv).join(',')})`);
  for (const sb of c.sub ?? []) {
    if (!sb.name || !sb.def) bad(where, '하위 요소에 name 과 def 가 있어야 한다');
    if (sb.abbr && sb.name !== `${sb.abbr} (${sb.full})`) bad(where, `하위 요소 이름은 "${sb.abbr} (${sb.full})" 꼴`);
    for (const t of [sb.name, sb.def, ...(sb.traits ?? [])]) if (t && TEXT_BAD.test(t)) bad(where, `하위 요소에 줄표, 화살표, 주소: ${String(t).slice(0, 40)}`);
  }
  const seenLv = {};
  for (const q of qs) {
    const qw = `${where} 문제 ${q.lv}`;
    if (!q.q || !q.w) bad(qw, '문제나 해설이 비었다');
    for (const t of [q.q, q.h, q.w, ...(q.o ?? [])]) if (t && TEXT_BAD.test(t)) bad(qw, `줄표, 화살표, 주소: ${t.slice(0, 40)}`);
    if (q.t === 'mc') {
      if (!Array.isArray(q.o) || q.o.length !== 4 || new Set(q.o).size !== 4) bad(qw, '보기는 서로 다른 4개');
      if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) bad(qw, '정답 번호는 0~3');
    } else if (q.t === 'ox') {
      if (typeof q.a !== 'boolean') bad(qw, 'O/X 정답은 true 나 false');
    } else bad(qw, `모르는 형식 ${q.t}`);
    const nth = (seenLv[q.lv] = (seenLv[q.lv] ?? 0) + 1);
    const qid = nth === 1 ? `${id}-${q.lv}` : `${id}-${q.lv}-${nth}`;
    if (questionIds.has(qid)) bad(qw, `이미 있는 문제 id ${qid}`);
    questionIds.add(qid);
    const out = { id: qid, cid: id, lv: q.lv, t: q.t, q: q.q };
    if (q.t === 'mc') out.o = q.o;
    out.a = q.a;
    if (q.h) out.h = q.h;
    out.w = q.w;
    if (input.added) out.added = input.added;
    addQ.push(out);
  }
  const concept = { id, name: c.name, en: c.en ?? c.full ?? undefined, node: it.node };
  if (c.abbr) { concept.abbr = c.abbr; concept.full = c.full; }
  concept.card = {
    ko: c.ko, def: c.def, traits: c.traits, measure: c.measure || undefined, contrast: c.contrast, example: c.example || undefined, analogy: c.analogy || undefined,
    src: (c.src ?? []).map((s) => ({ title: s.title, url: s.url })), added: input.added,
    sub: c.sub?.length ? c.sub.map((sb) => ({ name: sb.name, en: sb.en, abbr: sb.abbr, full: sb.full, def: sb.def, traits: sb.traits, src: (sb.src ?? []).map((s) => ({ title: s.title, url: s.url })) })) : undefined,
  };
  addC.push(JSON.parse(JSON.stringify(concept)));
}

if (problems.length) {
  console.log(`검사 실패 ${problems.length}건. 아무것도 쓰지 않았다.`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
data.nodes.push(...newNodes.map((n) => JSON.parse(JSON.stringify(n))));
data.concepts.push(...addC);
data.questions.push(...addQ);
if (input.added) data.updatedAt = input.added;
console.log(`마디 ${newNodes.length}, 개념 ${addC.length}, 문제 ${addQ.length} 추가${dry ? ' (시험, 쓰지 않음)' : ''}`);
if (!dry) writeFileSync(path, JSON.stringify(data) + (raw.endsWith('\n') ? '\n' : ''));
