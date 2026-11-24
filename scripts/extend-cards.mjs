// 이미 앱에 있는 개념을 키운다. 수집함의 새 지식이 기존 개념의 하위 요소이거나 내용을 보태는 것일 때 쓴다(2026-11-24 소유자 결정).
// 사용: node scripts/extend-cards.mjs <입력.json> [--dry]
// 입력 모양: { "added": "2026-11-25", "items": [{ "id": "<개념 id>", "sub": [하위 요소], "traits": [특징], "src": [출처], "questions": [문제], "retire": [{ "id": "<문제 id>", "why": "..." }] }] }
//   sub: { name, en?, abbr?, full?, def, traits?, src } (add-cards 와 같은 형식). 같은 이름의 하위 요소가 이미 있으면 멈춘다.
//   traits: 카드 특징에 더할 문장(합쳐 4개를 넘으면 멈춘다). src: 카드 출처에 더할 { title, url }.
//   questions: 새 문제(형식은 add-cards 와 같다). id 는 <개념 id>-x<날짜 숫자>-<번호>. added 가 붙어 마지막 풀이 뒤라면 앱이 그 개념을 복습에 올리고 이 문제를 먼저 낸다.
//   retire: 틀렸거나 바뀐 내용의 문제를 물린다(retired: true). 지우지 않는다. 물린 문제를 갈음할 문제를 questions 에 함께 넣는다.
// 원칙: 더하기와 물리기만 한다. 정의(def)와 이름은 고치지 않는다(바꿀 일이면 소유자에게 보고한다). 검사에 하나라도 걸리면 아무것도 쓰지 않고 1 로 끝난다.
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
const TEXT_BAD = /[—→⇒]|->|https?:\/\//;
const added = String(input.added ?? '');
if (!/^\d{4}-\d{2}-\d{2}$/.test(added)) bad('입력', 'added 는 YYYY-MM-DD');
const stamp = added.replace(/-/g, '');

const byId = new Map(data.concepts.map((c) => [c.id, c]));
const qById = new Map(data.questions.map((q) => [q.id, q]));
const questionIds = new Set(data.questions.map((q) => q.id));
const addQ = [];
const edits = [];
let subs = 0;
let retired = 0;

for (const [i, it] of (input.items ?? []).entries()) {
  const c = byId.get(it.id);
  const where = `항목 ${i + 1} ${it.id}`;
  if (!c) { bad(where, '없는 개념 id'); continue; }
  const card = JSON.parse(JSON.stringify(c.card ?? null));
  if (!card) { bad(where, '카드가 없는 개념(예전 개념)은 키우지 않는다'); continue; }
  for (const sb of it.sub ?? []) {
    if (!sb.name || !sb.def) bad(where, '하위 요소에 name 과 def 가 있어야 한다');
    if (sb.abbr && sb.name !== `${sb.abbr} (${sb.full})`) bad(where, `하위 요소 이름은 "${sb.abbr} (${sb.full})" 꼴`);
    if (!Array.isArray(sb.src) || !sb.src.length) bad(where, `하위 요소 ${sb.name} 에 출처가 없다`);
    if ((card.sub ?? []).some((x) => x.name === sb.name)) bad(where, `이미 있는 하위 요소 ${sb.name}`);
    for (const t of [sb.name, sb.def, ...(sb.traits ?? [])]) if (t && TEXT_BAD.test(t)) bad(where, `하위 요소에 줄표, 화살표, 주소: ${String(t).slice(0, 40)}`);
    card.sub = [...(card.sub ?? []), { name: sb.name, en: sb.en, abbr: sb.abbr, full: sb.full, def: sb.def, traits: sb.traits, src: (sb.src ?? []).map((s) => ({ title: s.title, url: s.url })) }];
    subs++;
  }
  for (const t of it.traits ?? []) if (TEXT_BAD.test(t)) bad(where, `특징에 줄표, 화살표, 주소: ${t.slice(0, 40)}`);
  if (it.traits?.length) card.traits = [...card.traits, ...it.traits];
  if (card.traits.length > 4) bad(where, `특징이 ${card.traits.length}개가 된다(최대 4). 넘치는 내용은 하위 요소로 넣는다`);
  for (const s of it.src ?? []) if (!card.src.some((x) => x.url === s.url)) card.src.push({ title: s.title, url: s.url });

  const retire = new Set();
  for (const r of it.retire ?? []) {
    const q = qById.get(r.id);
    if (!q || q.cid !== c.id) bad(where, `물릴 문제 ${r.id} 가 이 개념의 문제가 아니다`);
    else if (!r.why) bad(where, `문제 ${r.id} 를 물리는 이유가 없다`);
    else retire.add(r.id);
  }
  const qs = it.questions ?? [];
  let nth = 0;
  for (const q of qs) {
    const qw = `${where} 새 문제 ${q.lv}`;
    if (![1, 2, 3, 4].includes(q.lv)) bad(qw, '단계는 1~4');
    if (!q.q || !q.w) bad(qw, '문제나 해설이 비었다');
    for (const t of [q.q, q.h, q.w, ...(q.o ?? [])]) if (t && TEXT_BAD.test(t)) bad(qw, `줄표, 화살표, 주소: ${String(t).slice(0, 40)}`);
    if (q.t === 'mc') {
      if (!Array.isArray(q.o) || q.o.length !== 4 || new Set(q.o).size !== 4) bad(qw, '보기는 서로 다른 4개');
      if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) bad(qw, '정답 번호는 0~3');
    } else if (q.t === 'ox') {
      if (typeof q.a !== 'boolean') bad(qw, 'O/X 정답은 true 나 false');
    } else bad(qw, `모르는 형식 ${q.t}`);
    let qid;
    do qid = `${c.id}-x${stamp}-${++nth}`; while (questionIds.has(qid));
    questionIds.add(qid);
    const out = { id: qid, cid: c.id, lv: q.lv, t: q.t, q: q.q };
    if (q.t === 'mc') out.o = q.o;
    out.a = q.a;
    if (q.h) out.h = q.h;
    out.w = q.w;
    out.added = added;
    addQ.push(out);
  }
  // 하위 요소를 더하면 그 구분이나 적용 문제가 꼭 함께 들어와야 복습된다.
  if ((it.sub ?? []).length && !qs.some((q) => q.lv >= 3)) bad(where, '하위 요소를 더할 때는 구분이나 적용(단계 3, 4) 문제를 함께 넣는다');
  const live = data.questions.filter((q) => q.cid === c.id && !q.retired && !retire.has(q.id)).length + qs.length;
  if (live > 12) bad(where, `살아 있는 문제가 ${live}개가 된다(최대 12). 겹치는 옛 문제를 retire 로 물린다`);
  if (live < 4) bad(where, `살아 있는 문제가 ${live}개뿐이다(최소 4)`);
  edits.push({ c, card, retire });
  retired += retire.size;
}

if (problems.length) {
  console.log(`검사 실패 ${problems.length}건. 아무것도 쓰지 않았다.`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
for (const { c, card, retire } of edits) {
  c.card = JSON.parse(JSON.stringify(card));
  for (const q of data.questions) if (retire.has(q.id)) q.retired = true;
}
data.questions.push(...addQ);
data.updatedAt = added;
console.log(`개념 ${edits.length}개를 키움: 하위 요소 ${subs}, 새 문제 ${addQ.length}, 물린 문제 ${retired}${dry ? ' (시험, 쓰지 않음)' : ''}`);
if (!dry) writeFileSync(path, JSON.stringify(data) + (raw.endsWith('\n') ? '\n' : ''));
