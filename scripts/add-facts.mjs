// Research 사실(분석 중인 기업의 사실 카드)을 docs/data/research.json 에 더한다. 수집함 처리가 분석 일지의 새 줄을 넣을 때 쓴다(2026-11-24 소유자 결정).
// 사용: node scripts/add-facts.mjs <입력.json> [--dry]
// 입력 모양: { "added": "YYYY-MM-DD", "companies": [기업], "items": [사실] }
//   기업: { id(영어 소문자), name, ticker, ko?, sector?, note?, since? }. 처음 분석하는 기업만 넣는다. 이미 있는 id 는 건너뛴다.
//   사실: { key, co, group, q, a, o(오답 3개), w, asOf, links?, replaces? }
//     group: mine 광산 · product 사업 · peer 경쟁사 · industry 산업 · thesis 투자 논지 (research.json 의 groups)
//     q 는 한 가지만 묻는다. a 는 정답, o 는 일지에 비추어 분명히 틀린 오답 3개. w 는 "11/24 일지: ..." 로 시작하는 해설 한 문장.
//     asOf 는 그 값의 기준일(일지 날짜). links 는 관련 지식 개념 id(study.json 에 있어야 한다).
//     replaces: 값이 바뀐 사실이면 옛 사실 id. 옛 사실은 지우지 않고 retired 로 물린다.
// 원칙: 일지에 적힌 사실만 넣는다. 바깥 자료로 고치거나 덧붙이지 않는다(공시와 다르면 보고에만 적는다). 검사에 하나라도 걸리면 아무것도 쓰지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'docs/data/research.json');
const raw = readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const concepts = new Set(JSON.parse(readFileSync(join(root, 'docs/data/study.json'), 'utf8')).concepts.map((c) => c.id));
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dry = process.argv.includes('--dry');
const problems = [];
const bad = (where, why) => problems.push(`${where}: ${why}`);
const TEXT_BAD = /[—→⇒]|->|https?:\/\//;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!DATE.test(String(input.added ?? ''))) bad('입력', 'added 는 YYYY-MM-DD');

const cos = new Map(data.companies.map((c) => [c.id, c]));
const addCo = [];
for (const c of input.companies ?? []) {
  if (cos.has(c.id)) continue;
  if (!/^[a-z0-9-]+$/.test(c.id ?? '')) bad(`기업 ${c.id}`, 'id 는 영어 소문자, 숫자, 하이픈');
  if (!c.name || !c.ticker) bad(`기업 ${c.id}`, 'name 과 ticker 가 있어야 한다');
  for (const t of [c.name, c.ko, c.sector, c.note]) if (t && TEXT_BAD.test(t)) bad(`기업 ${c.id}`, `줄표, 화살표, 주소: ${t.slice(0, 40)}`);
  cos.set(c.id, c);
  addCo.push({ id: c.id, name: c.name, ticker: c.ticker, ko: c.ko, sector: c.sector, note: c.note, since: c.since ?? input.added });
}
const ids = new Set(data.facts.map((f) => f.id));
const byId = new Map(data.facts.map((f) => [f.id, f]));
const addF = [];
const retire = new Set();
for (const [i, it] of (input.items ?? []).entries()) {
  const where = `사실 ${i + 1} ${it.key ?? ''}`;
  if (!cos.has(it.co)) bad(where, `없는 기업 ${it.co}`);
  if (!data.groups?.[it.group]) bad(where, `모르는 묶음 ${it.group}`);
  const key = String(it.key ?? '').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!key) bad(where, 'key 가 없다');
  const id = `rs-${it.co}-${key}`;
  if (ids.has(id)) bad(where, `이미 있는 사실 id ${id}`);
  ids.add(id);
  if (!it.q || !it.a || !it.w) bad(where, 'q, a, w 가 있어야 한다');
  if (!Array.isArray(it.o) || it.o.length !== 3) bad(where, '오답은 3개');
  else if (new Set([it.a, ...it.o]).size !== 4) bad(where, '정답과 오답 4개가 서로 달라야 한다');
  if (!DATE.test(String(it.asOf ?? ''))) bad(where, 'asOf 는 YYYY-MM-DD');
  for (const t of [it.q, it.a, it.w, ...(it.o ?? [])]) if (t && TEXT_BAD.test(t)) bad(where, `줄표, 화살표, 주소: ${String(t).slice(0, 40)}`);
  for (const l of it.links ?? []) if (!concepts.has(l)) bad(where, `없는 개념 id ${l}`);
  if (it.replaces) {
    const old = byId.get(it.replaces);
    if (!old || old.co !== it.co) bad(where, `바꿀 옛 사실 ${it.replaces} 가 그 기업에 없다`);
    else if (old.retired) bad(where, `${it.replaces} 는 이미 물린 사실이다. 그것을 바꾼 지금 살아 있는 사실 id 를 적는다`);
    else if (retire.has(it.replaces)) bad(where, `같은 입력에서 ${it.replaces} 를 두 번 바꾼다`);
    else retire.add(it.replaces);
  }
  addF.push({ id, co: it.co, group: it.group, q: it.q, a: it.a, o: it.o, w: it.w, asOf: it.asOf, added: input.added, links: it.links ?? [], ...(it.replaces ? { replaces: it.replaces } : {}) });
}
if (problems.length) {
  console.log(`검사 실패 ${problems.length}건. 아무것도 쓰지 않았다.`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
data.companies.push(...JSON.parse(JSON.stringify(addCo)));
for (const f of data.facts) if (retire.has(f.id)) f.retired = true;
data.facts.push(...addF);
data.updatedAt = input.added;
console.log(`기업 ${addCo.length}, 사실 ${addF.length}, 물린 사실 ${retire.size} 추가${dry ? ' (시험, 쓰지 않음)' : ''}`);
if (!dry) writeFileSync(path, JSON.stringify(data) + (raw.endsWith('\n') ? '\n' : ''));
