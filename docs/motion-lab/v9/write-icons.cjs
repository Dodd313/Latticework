// icons/<id>.svg (첫째 색, 1024 원본, 꽉 찬 정사각형) 와 icons/<id>-b.svg (둘째 색) 를 쓴다.
// 사용: node motion-lab/v9/write-icons.cjs
const fs = require('fs');
const path = require('path');
const L = require('./icons.js');
const dir = path.join(__dirname, 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const c of L.concepts)
  for (const o of c.options) {
    const name = o.key === 'a' ? c.id : `${c.id}-${o.key}`;
    const svg = L.svg(c.id, { opt: o.key, size: 1024, round: false, file: true }).replace(/ class="[^"]*"| style="[^"]*"| data-icon="[^"]*"/g, '');
    fs.writeFileSync(path.join(dir, name + '.svg'), svg + '\n');
  }
console.log(fs.readdirSync(dir).join(' '));
