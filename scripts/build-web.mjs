// 웹 빌드: Expo로 묶은 뒤, 올릴 파일(out/index.html, out/app.js)과
// 로컬 확인용 파일(out/preview.html)을 만든다.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = join(root, 'out');

rmSync(dist, { recursive: true, force: true });
execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' } });

const jsDir = join(dist, '_expo', 'static', 'js', 'web');
const bundle = readdirSync(jsDir).find((f) => f.endsWith('.js'));
if (!bundle) throw new Error('묶음 파일을 찾지 못했습니다');

mkdirSync(out, { recursive: true });
copyFileSync(join(jsDir, bundle), join(out, 'app.js'));

const page = readFileSync(join(root, 'web', 'page.html'), 'utf8');
writeFileSync(join(out, 'index.html'), page);

// 로컬 확인용: 올릴 때 씌워지는 문서 틀을 흉내 내고, 예시 데이터와 가짜 저장소를 끼운다.
const seedPath = join(root, 'web', 'sample-data.json');
const seed = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : '{"days":[],"threads":[],"reviews":[]}';
const mock = readFileSync(join(root, 'web', 'mock-claude.js'), 'utf8');
const skeleton =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
for (const [name, data] of [
  ['preview.html', seed],
  ['preview-empty.html', '{"days":[],"threads":[],"reviews":[]}'],
]) {
  writeFileSync(join(out, name), `${skeleton}<script>window.__LW_SEED__=${data};</script><script>${mock}</script>${page}</body></html>`);
}

// 자체 주소용(GitHub Pages): docs/ 폴더. data/ 는 건드리지 않는다.
const docs = join(root, 'docs');
mkdirSync(join(docs, 'data'), { recursive: true });
copyFileSync(join(out, 'app.js'), join(docs, 'app.js'));
const build = createHash('sha1').update(readFileSync(join(out, 'app.js'))).digest('hex').slice(0, 10);
const site = join(root, 'web', 'site');
writeFileSync(join(docs, 'index.html'), readFileSync(join(site, 'index.html'), 'utf8').replace('__BUILD__', build));
copyFileSync(join(site, 'sw.js'), join(docs, 'sw.js'));
copyFileSync(join(site, 'manifest.webmanifest'), join(docs, 'manifest.webmanifest'));
cpSync(join(site, 'icons'), join(docs, 'icons'), { recursive: true });
writeFileSync(join(docs, '.nojekyll'), '');
if (!existsSync(join(docs, 'data', 'feed.json'))) writeFileSync(join(docs, 'data', 'feed.json'), '{"days":[],"threads":[],"reviews":[]}\n');

console.log(`완료: out/index.html, out/app.js (${Math.round(readFileSync(join(out, 'app.js')).length / 1024)}KB), docs/ (빌드 ${build})`);
