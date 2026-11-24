// 지식 카드의 출처 인용문이 그 주소의 원문에 실제로 있는지 코드로 대조한다(WORK_STRUCTURE.txt [잘못된 정보 막기] 장치 2).
// 모델이 인용을 지어내거나 출처를 잘못 옮기는 것을 막는다. 뜻이 맞는지(인용이 주장을 뒷받침하는지)는 검증 에이전트가 본다.
// 사용: node scripts/check-quotes.mjs <카드.json> [--report]
//   카드.json: add-cards.mjs 입력({ items: [{ card }] }) 또는 카드 배열. 카드의 src[] 에 { url, quote } 가 있어야 한다.
// 판정: 카드마다 외부 출처 인용이 하나 이상 원문에서 확인되어야 하고, 확인되지 않은 외부 인용이 하나도 없어야 통과다.
//   소유자 드라이브 자료(drive.google.com, docs.google.com)는 출처가 아니라 원자료라 대조하지 않고 따로 센다.
//   걸린 카드는 그 인용과 인용이 받치던 문장을 빼거나 다른 출처로 바꾼 뒤 다시 돌린다. --report 는 결과만 찍고 늘 0 으로 끝난다.
// 받기는 curl 로 한다(이 환경의 프록시 설정을 그대로 쓴다). PDF 는 pdftotext 로 글자를 뽑는다.
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const report = process.argv.includes('--report');
const cards = Array.isArray(input) ? input : (input.items ?? []).map((x) => x.card ?? x);
const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
const cache = new Map();

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? ' ');
// 글자와 숫자만 남겨 비교한다. 태그를 지우며 생기는 빈칸, 따옴표와 줄표 모양, 대소문자 차이를 없앤다. 위키백과식 각주 번호([1])도 지운다.
const norm = (s) =>
  decode(s)
    .normalize('NFKC')
    .replace(/\[\s*\d+\s*\]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

function fetchText(url) {
  if (cache.has(url)) return cache.get(url);
  let text = '';
  try {
    const f = join(dir, `p${cache.size}`);
    const type = execFileSync('curl', ['-sSL', '-m', '30', '--max-filesize', '15000000', '-A', 'Mozilla/5.0 (compatible; LatticeworkCheck/1.0)', '-o', f, '-w', '%{content_type}', url], { encoding: 'utf8' });
    if (/pdf/i.test(type) || url.toLowerCase().endsWith('.pdf')) text = execFileSync('pdftotext', ['-q', f, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    else
      text = readFileSync(f, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
  } catch {
    text = '';
  }
  const out = norm(text);
  cache.set(url, out);
  return out;
}

const OWN = /^https:\/\/(drive|docs)\.google\.com\//;
let failedCards = 0;
const lines = [];
for (const c of cards) {
  let ok = 0;
  let own = 0;
  const bad = [];
  for (const s of c.src ?? []) {
    if (!s.quote) continue;
    if (OWN.test(s.url)) {
      own++;
      continue;
    }
    const page = fetchText(s.url);
    // 인용 안의 "..." 나 "…"(생략)으로 나눈 조각이 모두 순서대로 원문에 있으면 확인으로 본다.
    const parts = s.quote.split(/\s*(?:\.\.\.|…)\s*/).map(norm).filter((p) => p.length >= 8);
    let at = 0;
    const found =
      page &&
      parts.length > 0 &&
      parts.every((p) => {
        const i = page.indexOf(p, at);
        if (i < 0) return false;
        at = i + p.length;
        return true;
      });
    if (found) ok++;
    else bad.push(`${page ? '원문에 없음' : '페이지를 못 받음'}: ${s.url} :: "${s.quote.slice(0, 60)}"`);
  }
  const pass = ok > 0 && bad.length === 0;
  if (!pass) failedCards++;
  lines.push(`${pass ? '통과' : '걸림'} ${c.name ?? c.key}: 확인 ${ok}${bad.length ? `, 문제 ${bad.length}` : ''}${own ? `, 소유자 자료 ${own}(대조 안 함)` : ''}${ok === 0 && !bad.length ? ', 확인된 외부 출처 없음' : ''}`);
  for (const b of bad) lines.push(`   - ${b}`);
}
console.log(lines.join('\n'));
console.log(`카드 ${cards.length}장 가운데 걸림 ${failedCards}장`);
process.exit(report ? 0 : failedCards ? 1 : 0);
