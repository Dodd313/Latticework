// 수리 생성기(src/numeracy.ts) 자체 시험. 앱 소스를 그대로 옮겨 불러와 돌린다.
// 1) selfTest: 분야마다 문제를 만들어 답을 따로 다시 계산하고, 표기 왕복, 채점, 문장, 수준 규칙, 기록 다루기를 본다.
// 2) 시안 대조: motion-lab/v11/numeracy-gen.js 와 같은 씨앗에서 같은 문제, 같은 세트, 같은 채점이 나오는지 본다.
// 사용: node scripts/numeracy-test.mjs   (PER=2000 이 기본. 대조는 분야, 수준, 유형마다 COMPARE=200 씨앗)
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

const out = mkdtempSync(join(tmpdir(), 'numeracy-'));
const src = readFileSync(join(root, 'src', 'numeracy.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(join(out, 'numeracy.mjs'), js);
const N = await import(pathToFileURL(join(out, 'numeracy.mjs')).href);
const P = require(join(root, 'motion-lab', 'v11', 'numeracy-gen.js'));

const per = Number(process.env.PER || 2000);
console.log('1) 자체 시험');
const ok1 = N.selfTest({ log: console.log, per });

console.log('2) 시안과 대조');
const COMPARE = Number(process.env.COMPARE || 200);
let diff = 0;
let n = 0;
const show = (msg) => diff++ < 20 && console.log('  다름: ' + msg);
const pick = (p) => JSON.stringify({ ...p, vars: p.vars });
for (const S of P.SKILLS) {
  for (let lv = 1; lv <= S.levels.length; lv++) {
    if (N.SKILL[S.id].levels[lv - 1].target !== S.levels[lv - 1].target) show(`목표 시간 ${S.id} ${lv}`);
    for (const type of new Set(S.levels[lv - 1].types)) {
      for (let i = 0; i < COMPARE; i++) {
        const seed = `cmp|${i}`;
        const a = P.makeProblem(S.id, lv, type, seed);
        const b = N.makeProblem(S.id, lv, type, seed);
        n++;
        if (pick(a) !== pick(b)) show(`${S.id}.${type} lv${lv} ${seed}\n    ${a.q}\n    ${b.q}`);
        // 채점: 정답, 쉼표 답, 한 칸 어긋난 답, 부호, 자릿수
        for (const input of [a.typed, '-' + a.typed, a.typed + '0', '1', a.show.replace(/^약 /, '').replace(/[^\d,.조억만-]/g, ''), '3억5조']) {
          const x = P.check(a, input);
          const y = N.check(b, input);
          if (JSON.stringify(x) !== JSON.stringify(y)) show(`채점 ${S.id}.${type} "${input}" ${JSON.stringify(x)} ${JSON.stringify(y)}`);
        }
      }
    }
    for (const day of ['2026-11-21', '2026-11-22|1', '2027-03-01|0']) {
      if (JSON.stringify(P.makeSet(S.id, lv, day)) !== JSON.stringify(N.makeSet(S.id, lv, day))) show(`세트 ${S.id} ${lv} ${day}`);
    }
  }
}
for (let d = 0; d < 400; d++) {
  const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  if (P.dailyPair(date).join() !== N.dailyPair(date).join()) show(`하루 두 분야 ${date}`);
}
console.log(`  문제 ${n}개 대조, 다른 것 ${diff}`);
process.exit(ok1 && diff === 0 ? 0 : 1);
