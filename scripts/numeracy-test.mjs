// 수리 생성기(src/numeracy.ts) 시험. 앱 소스를 그대로 옮겨 불러와 돌린다.
// 1) selfTest: 분야마다 문제를 만들어 vars 로 답을 따로 다시 계산하고, 표기 왕복, 채점, 문장, 수준 규칙, 기록 다루기를 본다.
// 2) 독립 검산: 문제 문장(q)과 안내(note)만 읽어 답을 다시 계산한다. 생성기의 vars, raw 는 보지 않는다. 분야마다 PER_CHECK(20,000)문제.
//    반올림, 허용 오차, 끊어 쓰기, 채점(정답은 맞고 한 칸 어긋난 답은 틀림)도 함께 본다.
// 3) 난이도: 수준 1, 2 는 암산 수준인지 본다(문장 속 수의 유효숫자, 정확한 답의 소수 자리). 수준마다 문장 속 수의 최대 유효숫자 분포를 찍는다.
// 4) 예시: SAMPLE=30 이면 수준 1 문제를 무작위로 30개 찍는다.
// 5) 조합 수: 수준마다 유형마다 서로 다른 문제 문장이 500 개 아래면 실패(COUNT_T=30000 번 뽑아 센다. 0 이면 건너뛴다).
// 11차 시안(motion-lab/v11/numeracy-gen.js)과의 대조는 2026-11-21 수준 1, 2 를 다시 만들면서 뺐다(시안은 옛 생성기 그대로다).
// 사용: node scripts/numeracy-test.mjs   (PER=2000, PER_CHECK=20000, SAMPLE=0, COUNT_T=30000 이 기본)
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

const per = Number(process.env.PER || 2000);
console.log('1) 자체 시험');
const ok1 = N.selfTest({ log: console.log, per });

// ── 내 수 읽기 (생성기 코드와 따로) ──
const num = (s) => Number(String(s).replace(/,/g, ''));
function kr(s) {
  // "1조 1,620억", "4,100만", "8,368억", "2억 27만", "134조 6,124만 1,073"
  const t = String(s).replace(/[,\s]/g, '');
  const m = t.match(/^(?:([\d.]+)조)?(?:([\d.]+)억)?(?:([\d.]+)만)?([\d.]+)?$/);
  if (!m || !t) throw new Error('kr parse ' + s);
  let v = 0;
  if (m[1]) v += Number(m[1]) * 1e12;
  if (m[2]) v += Number(m[2]) * 1e8;
  if (m[3]) v += Number(m[3]) * 1e4;
  if (m[4]) v += Number(m[4]);
  return v;
}
function myKR(n) {
  // 정준 끊어 쓰기(쉼표 포함)
  const g = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const jo = Math.floor(n / 1e12), ek = Math.floor((n % 1e12) / 1e8), mn = Math.floor((n % 1e8) / 1e4), il = n % 1e4;
  const parts = [];
  if (jo) parts.push(g(jo) + '조');
  if (ek) parts.push(g(ek) + '억');
  if (mn) parts.push(g(mn) + '만');
  if (il) parts.push(g(il));
  return parts.join(' ');
}
const ENX = { million: 1e6, billion: 1e9, trillion: 1e12 };
const KRW = '([\\d,]+(?:조|억|만)?(?: [\\d,]+(?:억|만))*(?: [\\d,]+)?)';
function wonAmt(s) {
  // "1,040만 원" "130,000원" "1조 1,620억 원"
  return kr(s.replace(/ ?원$/, ''));
}
function rate(txt) {
  let m;
  if ((m = txt.match(/^1달러가 ([\d,]+)원$/))) return { c: 'usd', per: 1, r: num(m[1]) };
  if ((m = txt.match(/^100엔이 ([\d,]+)원$/))) return { c: 'jpy', per: 100, r: num(m[1]) };
  if ((m = txt.match(/^1유로가 ([\d,]+)원$/))) return { c: 'eur', per: 1, r: num(m[1]) };
  throw new Error('rate ' + txt);
}
function noteSpec(note) {
  if (!note) return {};
  let m;
  if (note === '반올림해 정수로') return { dp: 0 };
  if ((m = note.match(/^반올림해 소수 (첫째|둘째|셋째) 자리까지$/))) return { dp: { 첫째: 1, 둘째: 2, 셋째: 3 }[m[1]] };
  if ((m = note.match(/^실제 값의 ±([\d.]+)% 안$/))) return { rel: Number(m[1]) / 100 };
  if ((m = note.match(/^±([\d.]+)%p 안$/))) return { abs: Number(m[1]) };
  throw new Error('note ' + note);
}
function halfUp(x, dp) {
  // 문자열로 정확히 반올림(소수 12자리에서 자른 뒤)
  const f = 10 ** dp;
  const s = Math.sign(x);
  return (s * Math.floor(Math.abs(x) * f + 0.5 + 1e-12)) / f;
}

// ── 유형별 풀이 (문장에서) ──
function solve(p) {
  const q = p.q;
  let m;
  const T = p.type;
  const fail = () => { throw new Error('문장 모양이 예상과 다름: ' + q); };
  switch (p.skill + '.' + T) {
    case 'read.d2k':
      m = q.match(/^([\d,]+)원을 조, 억, 만 단위를 넣어 쓰면\?$/) || fail();
      return { v: num(m[1]), unit: '원', form: true };
    case 'read.k2e':
      m = q.match(/^(.+) (원|달러)(은|는) 몇 (million|billion|trillion) (원|달러)\?$/) || fail();
      if (m[2] !== m[5]) throw new Error('화폐 다름');
      if ((m[2] === '원') !== (m[3] === '은')) throw new Error('조사 ' + q);
      return { v: kr(m[1]) / ENX[m[4]], unit: `${m[4]} ${m[2]}` };
    case 'read.e2k':
      m = q.match(/^([\d,.]+) (million|billion|trillion) (원|달러)(을|를) 조, 억, 만 단위를 넣어 쓰면\?$/) || fail();
      if ((m[3] === '원') !== (m[4] === '을')) throw new Error('조사 ' + q);
      return { v: Math.round(num(m[1]) * ENX[m[2]]), unit: m[3], form: true };
  }
  if (p.skill === 'fx') {
    if (/^f2k_/.test(T)) {
      m = q.match(/^(.+?)일 때 (.+?) ?(달러|엔|유로)(은|는) 몇 (원|만 원|억 원|조 원)\?$/) || fail();
      const R = rate(m[1]);
      const cur = { usd: '달러', jpy: '엔', eur: '유로' }[R.c];
      if (cur !== m[3]) throw new Error('화폐 다름 ' + q);
      const amt = kr(m[2]);
      const w = (amt / R.per) * R.r;
      return { v: w / { 원: 1, '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 }[m[5]], unit: m[5] };
    }
    if (/^k2f_/.test(T)) {
      m = q.match(/^(.+?)일 때 (.+? ?원)은 몇 (만 |억 )?(달러|엔|유로)\?$/) || fail();
      const R = rate(m[1]);
      const w = wonAmt(m[2]);
      const f = (w / R.r) * R.per;
      return { v: f / ({ '만 ': 1e4, '억 ': 1e8 }[m[3]] || 1), unit: (m[3] || '') + m[4] };
    }
    switch (T) {
      case 'usdmn2eok':
        m = q.match(/^(.+?)일 때 ([\d,.]+) million 달러는 몇 억 원\?$/) || fail();
        return { v: (num(m[2]) * 1e6 * rate(m[1]).r) / 1e8, unit: '억 원' };
      case 'eok2usdmn':
        m = q.match(/^(.+?)일 때 (.+ 원)은 몇 million 달러\?$/) || fail();
        return { v: wonAmt(m[2]) / rate(m[1]).r / 1e6, unit: 'million 달러' };
      case 'cross_jpy': {
        m = q.match(/^(1달러가 [\d,]+원), (100엔이 [\d,]+원)일 때 (\d)(달러는 몇 엔|만 엔은 몇 달러)\?$/) || fail();
        const won1 = rate(m[1]).r, won100 = rate(m[2]).r;
        if (m[4] === '달러는 몇 엔') return { v: (num(m[3]) * won1) / (won100 / 100), unit: '엔' };
        return { v: (num(m[3]) * 1e4 * (won100 / 100)) / won1, unit: '달러' };
      }
      case 'cross_eur':
        m = q.match(/^(1유로가 [\d,]+원), (1달러가 [\d,]+원)일 때 1유로는 몇 달러\?$/) || fail();
        return { v: rate(m[1]).r / rate(m[2]).r, unit: '달러' };
      case 'valchg_krw': {
        m = q.match(/^환율이 1달러 ([\d,]+)원에서 ([\d,]+)원이 됐다\. 원화 자산을 달러로 환산한 가치는 몇 % (늘었나|줄었나)\?$/) || fail();
        const ch = num(m[1]) / num(m[2]) - 1; // 원화 자산의 달러 가치 = W / 환율
        if ((ch > 0) !== (m[3] === '늘었나')) throw new Error('방향 틀림 ' + q);
        return { v: Math.abs(ch) * 100, unit: '%' };
      }
      case 'valchg_usd': {
        m = q.match(/^환율이 1달러 ([\d,]+)원에서 ([\d,]+)원이 됐다\. 달러 자산을 원화로 환산한 가치는 몇 % (늘었나|줄었나)\?$/) || fail();
        const ch = num(m[2]) / num(m[1]) - 1;
        if ((ch > 0) !== (m[3] === '늘었나')) throw new Error('방향 틀림 ' + q);
        return { v: Math.abs(ch) * 100, unit: '%' };
      }
      case 'ret_krw': {
        m = q.match(/^미국 주식이 달러 기준으로 (\d+)% (올랐|내렸)고, 같은 기간 환율은 1달러 ([\d,]+)원에서 ([\d,]+)원이 됐다\. 원화 기준 수익률은 몇 %\?$/) || fail();
        const s = (m[2] === '올랐' ? 1 : -1) * num(m[1]);
        return { v: ((1 + s / 100) * (num(m[4]) / num(m[3])) - 1) * 100, unit: '%', neg: true };
      }
      case 'ret_usd': {
        m = q.match(/^국내 주식이 원화 기준으로 (\d+)% (올랐|내렸)고, 같은 기간 환율은 1달러 ([\d,]+)원에서 ([\d,]+)원이 됐다\. 달러 기준 수익률은 몇 %\?$/) || fail();
        const s = (m[2] === '올랐' ? 1 : -1) * num(m[1]);
        return { v: ((1 + s / 100) * (num(m[3]) / num(m[4])) - 1) * 100, unit: '%', neg: true };
      }
    }
  }
  if (p.skill === 'ratio') {
    switch (T) {
      case 'margin':
        m = q.match(/^매출 (.+ ?원), 영업이익 (.+ ?원)인 회사의 영업이익률은 몇 %\?$/) || fail();
        return { v: (100 * wonAmt(m[2])) / wonAmt(m[1]), unit: '%' };
      case 'per':
        m = q.match(/^주가 (.+원), EPS\(주당순이익\) (.+원)인 회사의 PER\(주가수익비율\)은 몇 배\?$/) || fail();
        return { v: wonAmt(m[1]) / wonAmt(m[2]), unit: '배' };
      case 'pbr':
        m = q.match(/^시가총액 (.+ 원), 자기자본 (.+ 원)인 회사의 PBR\(주가순자산비율\)은 몇 배\?$/) || fail();
        return { v: wonAmt(m[1]) / wonAmt(m[2]), unit: '배' };
      case 'roe':
        m = q.match(/^순이익 (.+ ?원), 자기자본 (.+ ?원)인 회사의 ROE\(자기자본이익률\)는 몇 %\?$/) || fail();
        return { v: (100 * wonAmt(m[1])) / wonAmt(m[2]), unit: '%' };
      case 'payout':
        m = q.match(/^순이익 (.+ ?원) 가운데 (.+ ?원)을 배당금으로 줬다\. 배당성향은 몇 %\?$/) || fail();
        return { v: (100 * wonAmt(m[2])) / wonAmt(m[1]), unit: '%' };
      case 'pchg': {
        m = q.match(/^주가가 (.+원)에서 (.+원)으로 (올랐|내렸)다\. 몇 % (올랐|내렸)나\?$/) || fail();
        const a = wonAmt(m[1]), b = wonAmt(m[2]);
        if ((b > a) !== (m[3] === '올랐') || m[3] !== m[4]) throw new Error('방향 ' + q);
        return { v: (100 * Math.abs(b - a)) / a, unit: '%' };
      }
      case 'pp': {
        m = q.match(/^(?:기준금리|국고채 금리|예금 금리|대출 금리)가 ([\d.]+)%에서 ([\d.]+)%로 (올랐|내렸)다\. 몇 %p\(퍼센트포인트\) (올랐|내렸)나\?$/) || fail();
        const a = num(m[1]), b = num(m[2]);
        if ((b > a) !== (m[3] === '올랐')) throw new Error('방향 ' + q);
        return { v: Math.abs(b - a), unit: '%p' };
      }
      case 'pp_vs_pct': {
        m = q.match(/^(영업이익률|시장점유율|배당성향)이 ([\d.]+)%에서 ([\d.]+)%로 (올랐|떨어졌)다\. (몇 %p\(퍼센트포인트\)|처음 값에 견줘 몇 %) (올랐|떨어졌)나\?$/) || fail();
        const a = num(m[2]), b = num(m[3]);
        if ((b > a) !== (m[4] === '올랐')) throw new Error('방향 ' + q);
        if (m[5].includes('%p')) return { v: Math.abs(b - a), unit: '%p' };
        return { v: (100 * Math.abs(b - a)) / a, unit: '%' };
      }
      case 'rev_from_margin':
        m = q.match(/^영업이익률이 (\d+)%이고 영업이익이 (.+ 원)이면 매출은 몇 억 원\?$/) || fail();
        return { v: wonAmt(m[2]) / (num(m[1]) / 100) / 1e8, unit: '억 원' };
      case 'price_from_eps': {
        m = q.match(/^순이익 (.+ 원), 발행주식 (.+) 주인 회사의 PER\(주가수익비율\)이 (\d+)배면 주가는 몇 원\?$/) || fail();
        return { v: (wonAmt(m[1]) / kr(m[2])) * num(m[3]), unit: '원' };
      }
      case 'mcap_from_pbr':
        m = q.match(/^자기자본 (.+ 원)인 회사의 PBR\(주가순자산비율\)이 ([\d.]+)배면 시가총액은 몇 억 원\?$/) || fail();
        return { v: (wonAmt(m[1]) * num(m[2])) / 1e8, unit: '억 원' };
      case 'ev_ebitda':
        m = q.match(/^시가총액 (.+ 원), 순차입금 (.+ 원), EBITDA\(상각 전 영업이익\) (.+ 원)인 회사의 EV\(기업가치\)\/EBITDA는 몇 배\?$/) || fail();
        return { v: (wonAmt(m[1]) + wonAmt(m[2])) / wonAmt(m[3]), unit: '배' };
      case 'dupont':
        m = q.match(/^순이익률 (\d+)%, 총자산회전율 ([\d.]+)회, 총자산이 자기자본의 ([\d.]+)배인 회사의 ROE\(자기자본이익률\)는 몇 %\?$/) || fail();
        return { v: num(m[1]) * num(m[2]) * num(m[3]), unit: '%' };
    }
  }
  if (p.skill === 'growth') {
    switch (T) {
      case 'yoy':
      case 'yoy_r': {
        m = q.match(/^작년 (매출|영업이익|순이익) (.+ ?원), 올해 \1 (.+ ?원)이면 전년보다 몇 % (늘었나|줄었나)\?$/) || fail();
        const a = wonAmt(m[2]), b = wonAmt(m[3]);
        if ((b > a) !== (m[4] === '늘었나')) throw new Error('방향 ' + q);
        return { v: (100 * Math.abs(b - a)) / a, unit: '%' };
      }
      case 'r72_years': {
        // 두 배마다 72 ÷ r 년. 네 배는 두 번.
        m = q.match(/^72의 법칙\(72 ÷ 연 수익률\)으로 어림하면, 연 (\d+)%로 불어나는 (.+ ?원)이 (.+ ?원)이 되기까지 몇 년\?$/) || fail();
        const times = Math.log2(wonAmt(m[3]) / wonAmt(m[2]));
        if (Math.abs(times - Math.round(times)) > 1e-9) throw new Error('두 배의 거듭이 아님 ' + q);
        return { v: (times * 72) / num(m[1]), unit: '년' };
      }
      case 'r72_rate': {
        m = q.match(/^72의 법칙\(72 ÷ 연 수익률\)으로 어림하면, (.+ ?원)이 (\d+)년 만에 (.+ ?원)이 된 투자의 연 수익률은 몇 %\?$/) || fail();
        const times = Math.log2(wonAmt(m[3]) / wonAmt(m[1]));
        if (Math.abs(times - Math.round(times)) > 1e-9) throw new Error('두 배의 거듭이 아님 ' + q);
        return { v: (times * 72) / num(m[2]), unit: '%' };
      }
      case 'comp2': {
        const DIV = { 원: 1, '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 };
        const sg = (w) => (/^늘/.test(w) ? 1 : -1);
        m = q.match(/^(매출|영업이익|순이익) (.+ ?원)이 해마다 (\d+)%씩 2년 (늘면|줄면) 몇 (원|만 원|억 원|조 원)\?$/) || fail();
        return { v: (wonAmt(m[2]) * (100 + sg(m[4]) * num(m[3])) ** 2) / 1e4 / DIV[m[5]], unit: m[5] };
      }
      case 'cagr2':
        m = q.match(/^매출이 2년 만에 (.+ ?원)에서 (.+ ?원)이 됐다\. CAGR\(연평균 성장률\)은 몇 %\?$/) || fail();
        return { v: ((wonAmt(m[2]) / wonAmt(m[1])) ** (1 / 2) - 1) * 100, unit: '%' };
      case 'comp3': {
        m = q.match(/^(.+ ?원)을 연 (\d+)% 복리로 3년 굴리면 몇 (원|만 원|억 원|조 원)\?$/) || fail();
        return { v: (wonAmt(m[1]) * (100 + num(m[2])) ** 3) / 1e6 / { 원: 1, '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 }[m[3]], unit: m[3] };
      }
      case 'cagr3':
        m = q.match(/^(.+ ?원)이 3년 만에 (.+ ?원)이 됐다\. 연 복리 수익률은 몇 %\?$/) || fail();
        return { v: ((wonAmt(m[2]) / wonAmt(m[1])) ** (1 / 3) - 1) * 100, unit: '%' };
      case 'cagr_est':
        if ((m = q.match(/^매출이 (\d+)년 만에 ([\d.]+)배가 됐다\. CAGR\(연평균 성장률\)은 약 몇 %\?$/))) return { v: (num(m[2]) ** (1 / num(m[1])) - 1) * 100, unit: '%' };
        m = q.match(/^매출이 (\d+)년 만에 (.+ ?원)에서 (.+ ?원)이 됐다\. CAGR\(연평균 성장률\)은 약 몇 %\?$/) || fail();
        return { v: ((wonAmt(m[3]) / wonAmt(m[2])) ** (1 / num(m[1])) - 1) * 100, unit: '%' };
      case 'mult_est':
        if ((m = q.match(/^연 (\d+)% 복리로 (\d+)년 굴리면 처음 금액의 약 몇 배\?$/))) return { v: (1 + num(m[1]) / 100) ** num(m[2]), unit: '배' };
        m = q.match(/^(.+ ?원)을 연 (\d+)% 복리로 (\d+)년 굴리면 약 몇 (만 원|억 원|조 원)\?$/) || fail();
        return { v: (wonAmt(m[1]) * (1 + num(m[2]) / 100) ** num(m[3])) / { '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 }[m[4]], unit: m[4] };
    }
  }
  if (p.skill === 'pv') {
    switch (T) {
      case 'pv1':
      case 'pv2': {
        const DIV = { 원: 1, '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 };
        if (T === 'pv2' && (m = q.match(/^2년 뒤에 받는 (.+ ?원)의 현재가치가 (.+ ?원)이면 할인율은 연 몇 %\?$/))) return { v: (Math.sqrt(wonAmt(m[1]) / wonAmt(m[2])) - 1) * 100, unit: '%' };
        m = q.match(/^할인율이 연 (\d+)%일 때, (\d)년 뒤에 받는 (.+ ?원)의 현재가치는 몇 (원|만 원|억 원|조 원)\?$/) || fail();
        return { v: (wonAmt(m[3]) * 100 ** num(m[2])) / (100 + num(m[1])) ** num(m[2]) / DIV[m[4]], unit: m[4] };
      }
      case 'perp':
        m = q.match(/^할인율이 연 (\d+)%일 때, 1년 뒤부터 해마다 (.+ ?원)을 영원히 받는 권리의 현재가치는 몇 (원|만 원|억 원|조 원)\?$/) || fail();
        return { v: wonAmt(m[2]) / (num(m[1]) / 100) / { 원: 1, '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 }[m[3]], unit: m[3] };
      case 'perp_g':
        m = q.match(/^1년 뒤에 (.+ 원)을 받고, 그 뒤 해마다 (\d+)%씩 늘려 영원히 받는다\. 할인율이 연 (\d+)%일 때 현재가치는 몇 억 원\?$/) || fail();
        return { v: wonAmt(m[1]) / ((num(m[3]) - num(m[2])) / 100) / 1e8, unit: '억 원' };
      case 'gordon':
        m = q.match(/^내년 주당배당금이 (.+원)이고 그 뒤 해마다 (\d+)%씩 영원히 늘어난다\. 요구수익률이 연 (\d+)%일 때 적정 주가는 몇 원\?$/) || fail();
        return { v: wonAmt(m[1]) / ((num(m[3]) - num(m[2])) / 100), unit: '원' };
      case 'gordon_r':
        m = q.match(/^주가 (.+원), 내년 주당배당금 (.+원)이고 배당이 해마다 (\d+)%씩 영원히 늘어난다고 보면, 이 주가에 담긴 요구수익률은 몇 %\?$/) || fail();
        return { v: (100 * wonAmt(m[2])) / wonAmt(m[1]) + num(m[3]), unit: '%' };
      case 'gordon_g':
        m = q.match(/^주가 (.+원), 내년 주당배당금 (.+원), 요구수익률 연 ([\d.]+)%다\. 배당이 해마다 같은 비율로 영원히 늘어난다고 보면, 이 주가에 담긴 성장률은 몇 %\?$/) || fail();
        return { v: num(m[3]) - (100 * wonAmt(m[2])) / wonAmt(m[1]), unit: '%' };
      case 'deferred_perp': {
        m = q.match(/^할인율이 연 (\d+)%일 때, 2년 뒤부터 해마다 (.+ 원)을 영원히 받는 권리의 현재가치는 몇 억 원\?$/) || fail();
        const r = num(m[1]) / 100;
        // 2,3,4,... 년의 현금흐름을 직접 더해 본다(긴 합)
        let s = 0;
        for (let t = 2; t < 4000; t++) s += wonAmt(m[2]) / (1 + r) ** t;
        return { v: s / 1e8, unit: '억 원', loose: 1e-6 };
      }
      case 'gordon_d0':
        m = q.match(/^올해 주당배당금 (.+원)을 막 지급했고, 배당은 해마다 (\d+)%씩 영원히 늘어난다\. 요구수익률이 연 (\d+)%일 때 적정 주가는 몇 원\?$/) || fail();
        return { v: (wonAmt(m[1]) * (1 + num(m[2]) / 100)) / ((num(m[3]) - num(m[2])) / 100), unit: '원' };
      case 'pv3_est':
        m = q.match(/^할인율이 연 (\d+)%일 때, (\d)년 뒤에 받는 (.+ 원)의 현재가치는 약 몇 억 원\?$/) || fail();
        return { v: wonAmt(m[3]) / (1 + num(m[1]) / 100) ** num(m[2]) / 1e8, unit: '억 원' };
    }
  }
  if (p.skill === 'unit') {
    const BP = 'bp\\(베이시스포인트, 1bp는 0\\.01퍼센트포인트\\)';
    switch (T) {
      case 'pp2bp':
        m = q.match(new RegExp(`^금리 차이 ([\\d.]+)%p\\(퍼센트포인트\\)는 몇 ${BP}\\?$`)) || fail();
        return { v: num(m[1]) * 100, unit: 'bp' };
      case 'bp2pp':
        m = q.match(new RegExp(`^금리 차이 (\\d+)${BP}는 몇 %p\\(퍼센트포인트\\)\\?$`)) || fail();
        return { v: num(m[1]) / 100, unit: '%p' };
      case 'bp_add': {
        m = q.match(new RegExp(`^연 ([\\d.]+)%인 금리가 (\\d+)${BP} (오르면|내리면) 몇 %\\?$`)) || fail();
        return { v: num(m[1]) + ((m[3] === '오르면' ? 1 : -1) * num(m[2])) / 100, unit: '%' };
      }
      case 'fs_mn': {
        m = q.match(/^단위가 백만 원인 재무제표에서 매출 칸의 숫자가 ([\d,]+)이다\. 매출은 몇 (억|조) 원\?$/) || fail();
        return { v: (num(m[1]) * 1e6) / (m[2] === '억' ? 1e8 : 1e12), unit: m[2] + ' 원' };
      }
      case 'fs_th':
        m = q.match(/^단위가 천 원인 재무제표에서 영업이익 칸의 숫자가 ([\d,]+)이다\. 영업이익은 몇 억 원\?$/) || fail();
        return { v: (num(m[1]) * 1e3) / 1e8, unit: '억 원' };
      case 'eok2jo':
        m = q.match(/^단위가 억 원인 표에서 자산총계 칸의 숫자가 ([\d,]+)이다\. 자산총계는 몇 조 원\?$/) || fail();
        return { v: (num(m[1]) * 1e8) / 1e12, unit: '조 원' };
      case 'eok2usdmn':
        m = q.match(/^(.+?)일 때 (.+ 원)은 몇 million 달러\?$/) || fail();
        return { v: wonAmt(m[2]) / rate(m[1]).r / 1e6, unit: 'million 달러' };
      case 'usdmn2eok':
        m = q.match(/^(.+?)일 때 (\d+) million 달러는 몇 억 원\?$/) || fail();
        return { v: (num(m[2]) * 1e6 * rate(m[1]).r) / 1e8, unit: '억 원' };
      case 'eps_calc':
        m = q.match(/^순이익 (.+ 원), 발행주식 (.+) 주인 회사의 EPS\(주당순이익\)는 몇 원\?$/) || fail();
        return { v: wonAmt(m[1]) / kr(m[2]), unit: '원' };
      case 'mcap_jo':
        m = q.match(/^발행주식 (.+) 주, 주가 (.+원)인 회사의 시가총액은 몇 조 원\?$/) || fail();
        return { v: (kr(m[1]) * wonAmt(m[2])) / 1e12, unit: '조 원' };
    }
  }
  if (p.skill === 'est') {
    switch (T) {
      case 'mul':
        m = q.match(/^주가 (.+원)인 주식 ([\d,]+)주를 사면 약 몇 만 원\?$/) || fail();
        return { v: (wonAmt(m[1]) * num(m[2])) / 1e4, unit: '만 원' };
      case 'pct_of':
        m = q.match(/^매출 (.+ 원)의 ([\d.]+)%는 약 몇 억 원\?$/) || fail();
        return { v: (wonAmt(m[1]) * num(m[2])) / 100 / 1e8, unit: '억 원' };
      case 'fx_div':
        m = q.match(/^(.+ 원)을 1달러 ([\d,]+)원에 바꾸면 약 몇 million 달러\?$/) || fail();
        return { v: wonAmt(m[1]) / num(m[2]) / 1e6, unit: 'million 달러' };
      case 'per_share':
        m = q.match(/^순이익 (.+ 원), 발행주식 (.+) 주인 회사의 EPS\(주당순이익\)는 약 몇 원\?$/) || fail();
        return { v: wonAmt(m[1]) / kr(m[2]), unit: '원' };
      case 'pow':
        if ((m = q.match(/^연 (\d+)% 복리로 (\d+)년이면 처음 금액의 약 몇 배\?$/))) return { v: (1 + num(m[1]) / 100) ** num(m[2]), unit: '배' };
        m = q.match(/^(.+ ?원)을 연 (\d+)% 복리로 (\d+)년 두면 약 몇 (만 원|억 원|조 원)\?$/) || fail();
        return { v: (wonAmt(m[1]) * (1 + num(m[2]) / 100) ** num(m[3])) / { '만 원': 1e4, '억 원': 1e8, '조 원': 1e12 }[m[4]], unit: m[4] };
    }
  }
  throw new Error('풀이 없음 ' + p.skill + '.' + T);
}


// ── 2) 독립 검산 ──
console.log('2) 독립 검산(문장만 읽고 다시 계산)');
const PER_CHECK = Number(process.env.PER_CHECK || 20000);
const errs = {};
const add = (k, msg) => {
  (errs[k] = errs[k] || []).length < 4 && errs[k].push(msg);
  errs[k].n = (errs[k].n || 0) + 1;
};
// 문장 속 수: 한글 단위가 섞인 금액(3억 2,000만)은 한 수로 읽는다. 설명 괄호와 72의 법칙 안내는 뺀다.
function numbersIn(q) {
  const t = q
    .replace(/bp\(베이시스포인트, 1bp는 0\.01퍼센트포인트\)/g, 'bp')
    .replace(/72의 법칙\(72 ÷ 연 수익률\)/g, '')
    .replace(/1달러가|1달러 |100엔이|1유로가|1달러는|1유로는|1 (million|billion|trillion)/g, '');
  const outN = [];
  const re = /(?:\d[\d,]*(?:\.\d+)?(?:조|억|만)\s?)+(?:\d[\d,]*(?![\d.%]))?|\d[\d,]*(?:\.\d+)?/g;
  for (const m of t.matchAll(re)) {
    const s = m[0].trim();
    outN.push(/[조억만]/.test(s) ? kr(s) : num(s));
  }
  return outN;
}
function sigDigits(v) {
  const s = String(+Math.abs(v).toPrecision(15));
  const [a, b = ''] = s.split('.');
  return (a + b).replace(/^0+/, '').replace(/0+$/, '').length || 1;
}
// 수준 1, 2 의 상한: 문장 속 수의 유효숫자 3(603,000,000 처럼 사이의 0 도 센다), 정확한 답의 소수 자리 2
const SIG_MAX = () => 3;
const mag = {};
const t0 = Date.now();
let nCheck = 0;
for (const S of N.SKILLS) {
  for (let i = 0; i < PER_CHECK; i++) {
    const lv = (i % 4) + 1;
    const types = S.levels[lv - 1].types;
    const t = types[Math.floor(i / 4) % types.length];
    const p = N.makeProblem(S.id, lv, t, `adv|${S.id}|${i}`);
    nCheck++;
    const key = `${S.id}.${t}@${lv}`;
    let r;
    try {
      r = solve(p);
    } catch (e) {
      add(key, e.message);
      continue;
    }
    const spec = noteSpec(p.note);
    if (r.unit !== p.unit) add(key, `단위 다름 문장=${r.unit} 생성기=${p.unit}`);
    if (spec.dp != null) {
      const fr = (Math.abs(r.v) * 10 ** spec.dp) % 1;
      if (Math.abs(fr - 0.5) < 1e-6) add(key, '반올림 경계 정확히 0.5: ' + p.q);
      const want = halfUp(r.v, spec.dp);
      if (Math.abs(want - p.answer) > 1e-9) add(key, `반올림 답 다름 기대=${want} 생성기=${p.answer} | ${p.q}`);
      if (p.dp !== spec.dp) add(key, `안내 자리=${spec.dp} 채점 자리=${p.dp}`);
      const off = (halfUp(r.v, spec.dp) + 10 ** -spec.dp).toFixed(spec.dp);
      if (N.check(p, off).ok) add(key, '한 칸 어긋난 답이 맞음 ' + off);
    } else if (spec.rel != null || spec.abs != null) {
      if (!p.tol) add(key, '안내는 어림인데 채점은 정확');
      else {
        if ((spec.rel ?? null) !== (p.tol.rel ?? null) || (spec.abs ?? null) !== (p.tol.abs ?? null)) add(key, `허용 범위 안내와 채점 다름 ${JSON.stringify(spec)} ${JSON.stringify(p.tol)}`);
        if (Math.abs(r.v - p.raw) > 1e-9 * Math.max(1, Math.abs(r.v))) add(key, `어림 기준값 다름 ${r.v} ${p.raw}`);
        const lim = spec.rel != null ? Math.abs(r.v) * spec.rel : spec.abs;
        if (!N.check(p, String(+(r.v - lim * 0.95).toFixed(6))).ok && p.input !== 'kr') add(key, '범위 안 아래쪽이 틀림');
        if (!N.check(p, String(+(r.v + lim * 0.95).toFixed(6))).ok && p.input !== 'kr') add(key, '범위 안 위쪽이 틀림');
        if (N.check(p, String(+(r.v + lim * 1.05).toFixed(6))).ok && p.input !== 'kr') add(key, '범위 밖 위쪽이 맞음');
        if (N.check(p, String(+(r.v - lim * 1.05).toFixed(6))).ok && p.input !== 'kr') add(key, '범위 밖 아래쪽이 맞음');
        if (!/약 몇/.test(p.q)) add(key, '어림인데 "약"이 없음');
      }
    } else {
      if (p.tol || p.dp != null) add(key, '안내 없이 반올림 또는 어림 채점');
      const tol = r.loose ? r.loose * Math.abs(r.v) : 1e-9 * Math.max(1, Math.abs(r.v));
      if (Math.abs(r.v - p.answer) > tol) add(key, `정확한 답 다름 기대=${r.v} 생성기=${p.answer} | ${p.q}`);
      const dec = (String(+p.answer.toFixed(9)).split('.')[1] || '').length;
      if (dec > 2 && !(S.id === 'read' && lv >= 3)) add(key, `정확한 답의 소수 자리가 ${dec}: ${p.answer} | ${p.q}`); // 수준 3, 4 의 큰 수 읽기(5.739 trillion)는 읽기라 괜찮다
    }
    if (!r.neg && p.answer < 0) add(key, '음수 답');
    if (p.answer === 0) add(key, '답 0');
    if (r.form) {
      if (!p.form) add(key, '끊어 쓰기 문제인데 form 아님');
      const mine = myKR(r.v);
      const shownNum = p.show.replace(/ ?(원|달러)$/, '');
      if (mine !== shownNum) add(key, `보여 주는 끊어 쓰기 다름 ${mine} / ${p.show}`);
      if (!N.check(p, mine).ok) add(key, `정준 표기가 틀림 ${mine}`);
      if (!N.check(p, mine.replace(/[ ,]/g, '')).ok) add(key, `띄어쓰기 없는 정준 표기가 틀림 ${mine}`);
      if (N.check(p, String(r.v)).ok && r.v >= 1e4) add(key, '끊지 않은 숫자가 맞음');
    } else {
      const ans = spec.dp != null ? halfUp(r.v, spec.dp).toFixed(spec.dp) : spec.rel != null || spec.abs != null ? String(+r.v.toFixed(4)) : String(+r.v.toFixed(9));
      const c = N.check(p, ans);
      if (!c.ok) add(key, `내 답이 틀림 "${ans}" ${c.reason} | ${p.q}`);
      if (p.input === 'kr' && !spec.rel && Number.isInteger(+ans) && +ans > 0 && !N.check(p, myKR(Math.round(r.v))).ok) add(key, `한글 단위로 쓴 답이 틀림 ${myKR(Math.round(r.v))}`);
    }
    if (!r.form && !p.q.includes('몇 ' + p.unit)) add(key, `묻는 단위가 문장에 없음 ${p.unit}`);
    // 난이도
    const sigs = numbersIn(p.q).map(sigDigits);
    const mx = Math.max(0, ...sigs);
    const mk = `${S.id}@${lv}`;
    const st = (mag[mk] = mag[mk] || { n: 0, dig: {} });
    st.n++;
    st.dig[mx] = (st.dig[mx] || 0) + 1;
    if (lv <= 2) {
      if (mx > SIG_MAX(S.id, lv)) add(key, `수준 ${lv} 인데 앞자리가 ${mx}개인 수: ${p.q}`);
      if (p.dp != null && p.dp > 2) add(key, `수준 ${lv} 인데 소수 ${p.dp}자리`);
    } else if (S.id !== 'read' && mx > 4) add(key, `수준 ${lv} 인데 앞자리가 ${mx}개인 수: ${p.q}`);
  }
}
const ks = Object.keys(errs);
console.log(`  ${nCheck}문제 (분야마다 ${PER_CHECK}), ${Date.now() - t0}ms, 오류 묶음 ${ks.length}`);
for (const k of ks) console.log('  ' + k, errs[k].n, '\n     ' + errs[k].join('\n     '));
console.log('3) 문장 속 수의 최대 유효숫자 분포(수준마다)');
for (const S of N.SKILLS) console.log('  ' + S.id.padEnd(7) + [1, 2, 3, 4].map((lv) => `${lv}: ${JSON.stringify(mag[`${S.id}@${lv}`]?.dig ?? {})}`).join('  '));

// ── 5) 조합 수 ──
// 소유자 결정(2026-11-21): 난이도는 그대로 두고, 자주 풀어도 답을 외울 수 없게 숫자를 넓힌다.
// 수준마다 유형마다 COUNT_T(30,000)번 뽑아 서로 다른 문제 문장과 서로 다른 답을 센다. 문장이 500 개 아래면 실패.
// 1,000 문장과 100 답을 넘으면 거기서 멈추고 "+"를 붙인다(시간을 아끼려고). 답이 100 아래인 유형은 적어 두기만 한다:
// 수준 1 의 비율(친한 %가 답), CAGR, 72의 법칙처럼 답이 몇 가지로 정해진 유형이다. COUNT_T=0 이면 건너뛴다.
const COUNT_T = Number(process.env.COUNT_T ?? 30000);
let countFail = 0;
if (COUNT_T > 0) {
  console.log(`5) 조합 수(수준마다 유형마다 최대 ${COUNT_T}번 뽑아 센 서로 다른 문장/답, 문장 500 아래면 실패)`);
  const t5 = Date.now();
  const fewAns = [];
  for (const S of N.SKILLS) {
    for (let lv = 1; lv <= S.levels.length; lv++) {
      const row = [];
      for (const t of [...new Set(S.levels[lv - 1].types)]) {
        const qs = new Set();
        const as = new Set();
        let i = 0;
        for (; i < COUNT_T && !(qs.size >= 1000 && as.size >= 100); i++) {
          const p = N.makeProblem(S.id, lv, t, `count|${i}`);
          qs.add(p.q);
          as.add(p.tol ? p.raw : p.answer);
        }
        const done = i < COUNT_T ? '+' : '';
        row.push(`${t} ${qs.size}${done}/${as.size}${done}`);
        if (qs.size < 500) {
          countFail++;
          console.log(`  실패: ${S.id}.${t}@${lv} 문장 ${qs.size}`);
        }
        if (as.size < 100) fewAns.push(`${S.id}.${t}@${lv} ${as.size}`);
      }
      console.log(`  ${S.id.padEnd(7)}${lv}: ${row.join('  ')}`);
    }
  }
  console.log(`  답이 100 가지 아래(답이 몇 가지로 정해진 유형): ${fewAns.join(', ')}`);
  console.log(`  ${Date.now() - t5}ms, ${countFail ? '실패 ' + countFail + '건' : '통과'}`);
}

// ── 4) 수준 1 예시 ──
const SAMPLE = Number(process.env.SAMPLE || 0);
if (SAMPLE) {
  console.log(`4) 수준 1 예시 ${SAMPLE}개`);
  const R = N.makeRng(process.env.SEED || 'sample');
  for (let i = 0; i < SAMPLE; i++) {
    const S = N.SKILLS[i % N.SKILLS.length];
    const t = R.pick(S.levels[0].types);
    const p = N.makeProblem(S.id, 1, t, `sample|${R.int(0, 1e9)}`);
    console.log(`  ${String(i + 1).padStart(2)}. ${p.q}${p.note ? ` (${p.note})` : ''}  답 ${p.show}`);
  }
}
process.exit(ok1 && ks.length === 0 && countFail === 0 ? 0 : 1);
