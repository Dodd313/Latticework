// 영단어를 docs/data/study.json 의 vocab 에 더한다. 수집함 처리의 "저장 단계"(영단어 쪽)다.
// 사용: node scripts/add-vocab.mjs <입력.json> [--dry]
// 입력: { "added": "YYYY-MM-DD", "items": [{ term, ko, def, ex, deck: "fin"|"gen"|"toeic", group?, pos?, similar? }] }
// 형식(WORK_STRUCTURE.txt 영단어 형식): term 은 약어면 "약어 (풀네임)", ko 는 뜻(여러 뜻은 쉼표나 세미콜론), def 는 영어 정의 한 문장,
// ex 는 term(괄호 뺀 형태)이 글자 그대로 들어간 영어 예문 한 문장. 어디서 만난 단어인지는 적지 않는다.
// 원칙: 더하기만 한다. 이미 있는 표현(대소문자, 관사, 하이픈, 끝의 s 를 무시하고 같은 것)은 건너뛰고 알린다.
// 형식 검사에 하나라도 걸리면 아무것도 쓰지 않고 1 로 끝난다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'docs/data/study.json');
const raw = readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dry = process.argv.includes('--dry');

const bare = (t) => String(t).replace(/\s*\(.*?\)/g, '').trim();
const norm = (t) => bare(t).toLowerCase().replace(/^(the|a|an) /, '').replace(/-/g, ' ').replace(/’/g, "'").replace(/s\b/g, '').replace(/[?!.]+$/, '').trim();
const have = new Set(data.vocab.map((v) => norm(v.term)));
const TEXT_BAD = /[—→⇒]|->|https?:\/\//;
const DECKS = new Set(['fin', 'gen', 'toeic']);
const next = {};
for (const d of DECKS) next[d] = Math.max(0, ...data.vocab.map((v) => (new RegExp(`^${d === 'toeic' ? 'toe' : d}-(\\d{4})$`).exec(v.id) ?? [])[1]).filter(Boolean).map(Number));

const problems = [];
const skipped = [];
const add = [];
for (const [i, it] of (input.items ?? []).entries()) {
  const where = `단어 ${i + 1} ${it.term ?? ''}`;
  const bad = (why) => problems.push(`${where}: ${why}`);
  if (!it.term || !it.ko || !it.def || !it.ex) { bad('term, ko, def, ex 가 모두 있어야 한다'); continue; }
  if (!DECKS.has(it.deck)) bad(`단어장은 fin, gen, toeic 가운데 하나(지금 ${it.deck})`);
  if (/\n/.test(it.ex) || /^[AB]:/.test(it.ex)) bad('예문은 대화가 아닌 한 문장');
  if (!it.ex.toLowerCase().includes(bare(it.term).toLowerCase())) bad(`예문에 "${bare(it.term)}" 가 그대로 없다`);
  for (const t of [it.term, it.ko, it.def, it.ex, it.similar]) if (t && TEXT_BAD.test(t)) bad(`줄표, 화살표, 주소: ${String(t).slice(0, 40)}`);
  const k = norm(it.term);
  if (have.has(k)) { skipped.push(it.term); continue; }
  have.add(k);
  const pre = it.deck === 'toeic' ? 'toe' : it.deck;
  next[it.deck] += 1;
  const row = { id: `${pre}-${String(next[it.deck]).padStart(4, '0')}`, deck: it.deck, term: it.term.trim(), level: it.deck === 'fin' ? '전문용어' : '일반', ko: it.ko.trim(), def: it.def.trim().replace(/\.$/, ''), ex: it.ex.trim() };
  if (it.group) row.group = it.group;
  if (it.pos) row.pos = it.pos;
  if (it.similar) row.similar = it.similar;
  row.added = input.added;
  add.push(row);
}
if (problems.length) {
  console.log(`검사 실패 ${problems.length}건. 아무것도 쓰지 않았다.`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
data.vocab.push(...add);
console.log(`단어 ${add.length} 추가, 이미 있어 건너뜀 ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}${dry ? ' (시험, 쓰지 않음)' : ''}`);
if (!dry) writeFileSync(path, JSON.stringify(data) + (raw.endsWith('\n') ? '\n' : ''));
