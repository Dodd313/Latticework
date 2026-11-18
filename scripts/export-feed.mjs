// 앱 데이터베이스에서 받은 문서들(ArtifactData 의 out_dir 결과)을 자체 주소용 묶음 파일 하나로 만든다.
// 사용: node scripts/export-feed.mjs <받은 폴더> <출력 파일>
//   받은 폴더 아래에 days/*.json, threads/*.json, reviews/*.json 이 있어야 한다.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [dbDir, outFile] = process.argv.slice(2);
if (!dbDir || !outFile) {
  console.error('사용: node scripts/export-feed.mjs <받은 폴더> <출력 파일>');
  process.exit(1);
}
const load = (name) => {
  const dir = join(dbDir, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .map((d) => d.data ?? d);
};
const days = load('days').filter((d) => d.date && Array.isArray(d.articles)).sort((a, b) => b.date.localeCompare(a.date));
const threads = load('threads').filter((t) => t.id && Array.isArray(t.entries));
const reviews = load('reviews').filter((r) => r.id && Array.isArray(r.questions)).sort((a, b) => b.id.localeCompare(a.id));
if (days.length === 0) {
  console.error('기사가 한 건도 없어 쓰지 않습니다.');
  process.exit(2);
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), days, threads, reviews }) + '\n');
console.log(`묶음 저장: 날짜 ${days.length}, 실 ${threads.length}, 복습 ${reviews.length} → ${outFile}`);
