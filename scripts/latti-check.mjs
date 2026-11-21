// Latti 하루 묶음 검사. 아침 동기화가 docs/data/latti.json 에 묶음을 덧붙인 뒤 커밋하기 전에 돌린다.
// 사용: node scripts/latti-check.mjs [날짜]   (날짜를 주면 그 묶음만, 없으면 daily 전체)
// 앱과 같은 규칙(src/lattiLines.ts 의 lint)으로 본다. 문제가 있으면 줄마다 이유를 찍고 1 로 끝난다.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

// 앱 소스(확장자 없는 import)를 임시 폴더에 .mjs 로 옮겨 그대로 불러온다.
const out = mkdtempSync(join(tmpdir(), 'latti-'));
for (const name of ['dates', 'lattiTypes', 'lattiLines']) {
  const src = readFileSync(join(root, 'src', `${name}.ts`), 'utf8');
  let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
  writeFileSync(join(out, `${name}.mjs`), js);
}
const { lint } = await import(pathToFileURL(join(out, 'lattiLines.mjs')).href);

const data = JSON.parse(readFileSync(join(root, 'docs/data/latti.json'), 'utf8'));
const only = process.argv[2];
const situations = new Set(Array.isArray(data.situations) ? data.situations : Object.keys(data.situations ?? {}));
const bankIds = new Set((data.bank ?? []).map((l) => l.id));
let bad = 0;
let seen = 0;
for (const batch of data.daily ?? []) {
  if (only && batch.date !== only) continue;
  const ids = new Set();
  for (const line of batch.lines ?? []) {
    seen++;
    const why = [...lint(line.t, data.rules ?? undefined, { allowLatin: true })];
    for (const s of [].concat(line.s ?? [])) if (!situations.has(s)) why.push(`모르는 상황 ${s}`);
    if (!line.id) why.push('id 없음');
    else if (ids.has(line.id) || bankIds.has(line.id)) why.push(`겹치는 id ${line.id}`);
    ids.add(line.id);
    if (why.length) {
      bad++;
      console.log(`${batch.date} ${line.id}: ${line.t}\n  ${why.join(', ')}`);
    }
  }
}
console.log(`검사한 줄 ${seen}, 문제 ${bad}`);
process.exit(bad ? 1 : 0);
