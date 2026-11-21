/*
 * 수리 문제 생성기 (Motion Lab 11차 시안)
 *
 * 기업분석과 재무학에서 자주 쓰는 계산을 분야별로, 같은 수준에서 되풀이해 낸다.
 * - 문제는 씨앗 문자열 하나로 정해진다(같은 씨앗이면 같은 문제). 저장하지 않고 그때그때 만든다.
 * - 수준마다 문제 유형 묶음(6개)과 숫자 범위가 고정이라, 날마다 다른 문제를 풀어도 시간을 견줄 수 있다.
 * - DOM 을 쓰지 않는다. 나중에 src/numeracy.ts 로 그대로 옮길 수 있게 순수 함수만 둔다.
 *
 * 브라우저: <script src="numeracy-gen.js"></script> 뒤 window.NUM
 * Node:     const NUM = require('./numeracy-gen.js')
 * 자체 시험: node motion-lab/v11/numeracy-gen.js --test
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NUM = api;
  if (typeof require === 'function' && typeof module === 'object' && require.main === module && process.argv.includes('--test')) {
    const ok = api.selfTest({ log: console.log, per: Number(process.env.PER || 2000) });
    process.exit(ok ? 0 : 1);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 난수: 씨앗 문자열에서 정해지는 수열 (FNV-1a 해시 + mulberry32)
  // ─────────────────────────────────────────────────────────────
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRng(seed) {
    let a = hash32(String(seed));
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const R = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      step: (lo, hi, st) => lo + st * Math.floor(next() * (Math.floor((hi - lo) / st) + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      sign: () => (next() < 0.5 ? -1 : 1),
      shuffle: (arr) => {
        const b = arr.slice();
        for (let i = b.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [b[i], b[j]] = [b[j], b[i]];
        }
        return b;
      },
    };
    return R;
  }

  // ─────────────────────────────────────────────────────────────
  // 수 다루기와 표기
  // ─────────────────────────────────────────────────────────────
  const clean = (x) => +x.toFixed(9);
  /** 반올림(0.5 는 0 에서 먼 쪽으로). 우리말 "반올림"과 같다. */
  function roundTo(x, dp) {
    const f = Math.pow(10, dp);
    const s = x < 0 ? -1 : 1;
    return clean((s * Math.round(Math.abs(x) * f + 1e-9)) / f);
  }
  /** 반올림 자리에서 0.5 경계에 너무 가까우면 참. 이런 문제는 내지 않는다(계산 순서에 따라 답이 갈릴 수 있다). */
  function nearHalf(x, dp) {
    const y = Math.abs(x) * Math.pow(10, dp);
    const fr = y - Math.floor(y);
    return Math.abs(fr - 0.5) < 0.05;
  }
  function roundSig(x, s) {
    if (x === 0) return 0;
    const e = Math.floor(Math.log10(Math.abs(x))) - s + 1;
    const f = Math.pow(10, e);
    return clean(Math.round(x / f) * f);
  }
  function trimDec(ax) {
    let s = ax.toFixed(6);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  /** 세 자리 쉼표. dp 를 주면 그 자리까지 고정. */
  function fmtNum(x, dp) {
    const neg = x < 0;
    const ax = Math.abs(x);
    const s = dp == null ? trimDec(ax) : ax.toFixed(dp);
    const [i, f] = s.split('.');
    return (neg && +s !== 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }
  const groupComma = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const KR_UNITS = [
    ['조', 12],
    ['억', 8],
    ['만', 4],
  ];
  /** 정수를 조, 억, 만으로 끊어 쓴다. 312323425321 은 "3123억 2342만 5321". comma 면 "3,123억 2,342만 5,321". */
  function fmtKR(n, o = {}) {
    if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error('fmtKR: 정수가 아님 ' + n);
    const neg = n < 0;
    let b = BigInt(Math.abs(n));
    if (b === 0n) return '0';
    const parts = [];
    for (const [u, e] of KR_UNITS) {
      const v = 10n ** BigInt(e);
      const q = b / v;
      if (q > 0n) {
        parts.push((o.comma ? groupComma(q.toString()) : q.toString()) + u);
        b -= q * v;
      }
    }
    if (b > 0n) parts.push(o.comma ? groupComma(b.toString()) : b.toString());
    return (neg ? '-' : '') + parts.join(o.space === false ? '' : ' ');
  }
  /** 뒤에서 네 자리씩 끊은 모습: "3123 2342 5321" */
  function group4(n) {
    const s = String(n);
    const out = [];
    for (let i = s.length; i > 0; i -= 4) out.unshift(s.slice(Math.max(0, i - 4), i));
    return out.join(' ');
  }
  /**
   * 조, 억, 만이 섞인 입력을 읽는다. 쉼표와 띄어쓰기는 무시한다.
   * 돌려주는 것: { value, canonical } 또는 null(읽을 수 없음).
   * canonical: 조 아래 자리는 모두 네 자리 이하의 정수, 단위는 큰 것부터 한 번씩, 빈 자리(0억)와 앞의 0 없음.
   */
  function parseKR(str) {
    if (str == null) return null;
    let s = String(str).replace(/[\s,]/g, '');
    if (!s) return null;
    let neg = false;
    if (s[0] === '-') {
      neg = true;
      s = s.slice(1);
    }
    const EXP = { 조: 12, 억: 8, 만: 4, '': 0 };
    let last = 99;
    let canonical = true;
    let total = 0n;
    let frac = 0;
    let any = false;
    while (s.length) {
      const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(조|억|만)?/);
      if (!m) return null;
      const unit = m[2] || '';
      const e = EXP[unit];
      if (e >= last) return null;
      if (!unit && m[0].length !== s.length) return null;
      last = e;
      const [ip, fp = ''] = m[1].split('.');
      if (fp) canonical = false;
      const digits = BigInt((ip || '0') + fp);
      if (fp.length <= e) total += digits * 10n ** BigInt(e - fp.length);
      else frac += Number(digits) / Math.pow(10, fp.length - e);
      const segVal = Number(ip || '0');
      if (segVal === 0 && !fp) canonical = false;
      if (unit !== '조' && segVal > 9999) canonical = false;
      if (ip.length > 1 && ip[0] === '0') canonical = false;
      s = s.slice(m[0].length);
      any = true;
    }
    if (!any) return null;
    const value = (Number(total) + frac) * (neg ? -1 : 1);
    return { value, canonical };
  }
  const EN = { million: 6, billion: 9, trillion: 12 };
  /** 10 의 거듭제곱을 곱한 값을 정확히(BigInt) 계산한다. */
  function decTimes(numStr, exp) {
    const neg = numStr[0] === '-';
    const t = neg ? numStr.slice(1) : numStr;
    const [ip, fp = ''] = t.split('.');
    const digits = BigInt((ip || '0') + fp);
    const v = fp.length <= exp ? Number(digits * 10n ** BigInt(exp - fp.length)) : Number(digits) / Math.pow(10, fp.length - exp);
    return neg ? -v : v;
  }
  /** 영어 단위: 312300000000 은 "312.3 billion" */
  function fmtEN(n, unit) {
    unit = unit || (n >= 1e12 ? 'trillion' : n >= 1e9 ? 'billion' : 'million');
    return fmtNum(clean(n / Math.pow(10, EN[unit]))) + ' ' + unit;
  }
  function parseEN(s) {
    const m = String(s)
      .trim()
      .match(/^(-?[\d,]*\.?\d+)\s*(million|billion|trillion)$/i);
    if (!m) return null;
    return decTimes(m[1].replace(/,/g, ''), EN[m[2].toLowerCase()]);
  }

  /** 받침에 따라 조사를 고른다. a: 받침 있을 때(은, 을, 이), b: 없을 때(는, 를, 가). */
  function josa(word, a, b) {
    const ch = String(word).replace(/[\s)\]]+$/, '').slice(-1);
    const code = ch.charCodeAt(0);
    let has;
    if (code >= 0xac00 && code <= 0xd7a3) has = (code - 0xac00) % 28 !== 0;
    else if (/[0-9]/.test(ch)) has = '013678'.includes(ch);
    else if (/[LMNRlmnr]/.test(ch)) has = true;
    else has = false;
    return word + (has ? a : b);
  }

  /** 원 금액을 문장에 넣는 모양. 억 넘는 금액과 만 원 단위 금액은 한글 단위로. */
  function won(n) {
    if (n >= 1e6 && n % 1e4 === 0) return fmtKR(n, { comma: true }) + ' 원';
    return fmtNum(n) + '원';
  }
  const eok = (x) => fmtKR(Math.round(x * 1e8), { comma: true }) + ' 원';
  const pct = (x) => fmtNum(x) + '%';
  const ORD = ['', '첫째', '둘째', '셋째', '넷째'];
  const roundNote = (dp) => (dp === 0 ? '반올림해 정수로' : `반올림해 소수 ${ORD[dp]} 자리까지`);
  const joinUnit = (unit) => (!unit ? '' : /^[a-zA-Z]/.test(unit) ? ' ' + unit : unit);

  // ─────────────────────────────────────────────────────────────
  // 문제 모양
  // ─────────────────────────────────────────────────────────────
  // { skill, level, type, seed, q, note, input: 'kr'|'num', form, unit, answer, raw, dp, tol, show, typed, why, vars }
  //  input 'kr' : 조, 억, 만 단추가 있는 자판. form 이면 끊어 쓴 모양까지 맞아야 정답.
  //  dp         : 반올림 자리(문제에 적힌다). 없으면 정확한 값.
  //  tol        : { rel } 또는 { abs }. 어림셈. raw 와의 차이로 채점한다.
  const SKIP = null;
  function exact(o, value) {
    return Object.assign(o, { answer: clean(value), raw: clean(value), dp: null });
  }
  function rounded(o, raw, dp) {
    if (nearHalf(raw, dp)) return SKIP;
    return Object.assign(o, { raw: clean(raw), dp, answer: roundTo(raw, dp), note: roundNote(dp) });
  }
  function approx(o, raw, tol) {
    const note = tol.rel != null ? `실제 값의 ±${fmtNum(tol.rel * 100)}% 안` : `±${fmtNum(tol.abs)}%p 안`;
    return Object.assign(o, { raw: clean(raw), answer: clean(raw), dp: null, tol, note });
  }

  const RATE = {
    usd: (R, lv) => (lv === 1 ? R.pick([1300, 1400, 1500]) : R.step(1300, 1480, 5)),
    jpy: (R, lv) => (lv === 1 ? R.pick([900, 950]) : R.step(880, 990, 5)), // 100엔당 원
    eur: (R) => R.step(1450, 1650, 5),
  };
  const RATE_TXT = {
    usd: (r) => `1달러가 ${fmtNum(r)}원`,
    jpy: (r) => `100엔이 ${fmtNum(r)}원`,
    eur: (r) => `1유로가 ${fmtNum(r)}원`,
  };
  const CUR = { usd: '달러', jpy: '엔', eur: '유로' };
  const PER_UNIT = { usd: 1, jpy: 100, eur: 1 }; // 환율이 몇 단위당인지

  /** 유효숫자 s 개짜리 수를 lo..hi 에서 */
  const sigIn = (R, s, lo, hi) => {
    for (;;) {
      const v = roundSig(R.int(lo, hi), s);
      if (v >= lo && v <= hi) return v;
    }
  };

  // ── 1. 큰 수 읽기 ──────────────────────────────────────────
  const read = {
    d2k(R, lv) {
      let n;
      if (lv === 1) n = R.int(0, 9) * 1e8 + R.int(101, 9999) * 1e4;
      else if (lv === 2) n = R.int(10, 9999) * 1e8 + (R.chance(0.25) ? 0 : R.int(1, 9999)) * 1e4;
      else if (lv === 3) n = R.int(100, 9999) * 1e8 + (R.chance(0.2) ? 0 : R.int(1, 9999)) * 1e4 + R.int(1, 9999);
      else n = R.int(1, 999) * 1e12 + (R.chance(0.3) ? 0 : R.int(1, 9999)) * 1e8 + (R.chance(0.3) ? 0 : R.int(1, 9999)) * 1e4 + R.int(0, 9999);
      const o = { q: `${fmtNum(n)}원을 조, 억, 만 단위를 넣어 쓰면?`, input: 'kr', form: true, unit: '원', vars: { n }, why: `뒤에서부터 네 자리씩 끊으면 ${group4(n)}. 끊은 자리마다 만, 억, 조를 붙인다.` };
      return exact(o, n);
    },
    k2e(R, lv) {
      const cur = R.pick(['원', '달러']);
      let n, en;
      if (lv === 1) [n, en] = [R.int(2, 999) * 1e6, 'million'];
      else if (lv === 2) [n, en] = [R.int(11, 9999) * 1e8, 'billion'];
      else if (lv === 3) [n, en] = [R.int(1, 30) * 1e12 + R.int(1, 99) * 1e10, R.pick(['billion', 'trillion'])];
      else {
        const k = R.int(0, 2);
        if (k === 0) [n, en] = [R.int(101, 9999) * 1e5, 'million'];
        else if (k === 1) [n, en] = [R.int(1, 9) * 1e12 + R.int(1, 9999) * 1e8, 'billion'];
        else [n, en] = [R.int(1, 9) * 1e12 + R.int(1, 999) * 1e9, 'trillion'];
      }
      const x = clean(n / Math.pow(10, EN[en]));
      const base = { million: '1 million은 100만', billion: '1 billion은 10억', trillion: '1 trillion은 1조' }[en];
      const kr = fmtKR(n, { comma: true });
      const o = { q: `${kr} ${josa(cur, '은', '는')} 몇 ${en} ${cur}?`, unit: `${en} ${cur}`, vars: { n, en }, why: `${base}이므로 ${kr}은 ${fmtNum(x)} ${en}.` };
      return exact(o, x);
    },
    e2k(R, lv) {
      const cur = R.pick(['달러', '원']);
      let n, en;
      if (lv === 1) [n, en] = [R.int(2, 999) * 1e6, 'million'];
      else if (lv === 2) [n, en] = [R.int(11, 999) * 1e8, 'billion'];
      else if (lv === 3) [n, en] = R.chance(0.5) ? [R.int(1001, 9999) * 1e8, 'billion'] : [R.int(101, 999) * 1e10, 'trillion'];
      else [n, en] = R.chance(0.5) ? [R.int(101, 9999) * 1e5, 'million'] : [R.int(1001, 9999) * 1e9, 'trillion'];
      const base = { million: '1 million은 100만', billion: '1 billion은 10억', trillion: '1 trillion은 1조' }[en];
      const o = { q: `${fmtEN(n, en)} ${josa(cur, '을', '를')} 조, 억, 만 단위를 넣어 쓰면?`, input: 'kr', form: true, unit: cur, vars: { n, en, x: clean(n / Math.pow(10, EN[en])) }, why: `${base}이므로 ${fmtEN(n, en)}는 ${fmtKR(n, { comma: true })}.` };
      return exact(o, n);
    },
  };

  // ── 2. 환율 환산 ───────────────────────────────────────────
  function f2k(R, lv, c) {
    const r = RATE[c](R, lv);
    const rt = RATE_TXT[c](r);
    if (lv === 1) {
      const amt = c === 'jpy' ? R.int(1, 49) * 2e4 : R.int(1, 99) * 100;
      const w = (amt / PER_UNIT[c]) * r;
      const o = { q: `${rt}일 때 ${josa(c === 'jpy' ? fmtKR(amt, { comma: true }) + ' 엔' : fmtNum(amt) + CUR[c], '은', '는')} 몇 만 원?`, unit: '만 원', input: 'kr', vars: { c, r, amt, out: 'man' }, why: `${fmtNum(amt / PER_UNIT[c])} × ${fmtNum(r)} = ${fmtNum(w)}원.` };
      return exact(o, w / 1e4);
    }
    if (c === 'jpy') {
      const amt = R.int(10, 999) * 1e4;
      const w = (amt / 100) * r;
      const o = { q: `${rt}일 때 ${fmtKR(amt, { comma: true })} 엔은 몇 만 원?`, unit: '만 원', input: 'kr', vars: { c, r, amt, out: 'man' }, why: `${fmtNum(amt / 100)} × ${fmtNum(r)} = ${fmtNum(w)}원.` };
      return rounded(o, w / 1e4, 0);
    }
    const amt = R.int(10, 990) * 1e4;
    const w = amt * r;
    const o = { q: `${rt}일 때 ${fmtKR(amt, { comma: true })} ${CUR[c]}는 몇 억 원?`, unit: '억 원', vars: { c, r, amt, out: 'eok' }, why: `${fmtKR(amt)} × ${fmtNum(r)} = ${fmtNum(w)}원 = ${fmtNum(w / 1e8)}억 원.` };
    return rounded(o, w / 1e8, 1);
  }
  function k2f(R, lv, c) {
    const r = RATE[c](R, lv);
    const rt = RATE_TXT[c](r);
    if (lv === 1) {
      const amt = c === 'jpy' ? R.int(1, 49) * 2e4 : R.int(1, 99) * 100;
      const w = (amt / PER_UNIT[c]) * r;
      if (c === 'jpy') {
        const o = { q: `${rt}일 때 ${won(w)}은 몇 만 엔?`, unit: '만 엔', input: 'kr', vars: { c, r, w, out: 'man' }, why: `${fmtNum(w)} ÷ ${fmtNum(r)} × 100 = ${fmtNum(amt)}엔.` };
        return exact(o, amt / 1e4);
      }
      const o = { q: `${rt}일 때 ${won(w)}은 몇 ${CUR[c]}?`, unit: CUR[c], input: 'kr', vars: { c, r, w, out: 'one' }, why: `${fmtNum(w)} ÷ ${fmtNum(r)} = ${fmtNum(amt)}.` };
      return exact(o, amt);
    }
    const wEok = c === 'usd' ? R.int(1, 500) : R.int(1, 99);
    const w = wEok * 1e8;
    const f = (w / r) * PER_UNIT[c];
    const o = { q: `${rt}일 때 ${eok(wEok)}은 몇 만 ${CUR[c]}?`, unit: `만 ${CUR[c]}`, input: 'kr', vars: { c, r, w, out: 'man' }, why: `${fmtNum(w)} ÷ ${fmtNum(r)}${c === 'jpy' ? ' × 100' : ''} = 약 ${fmtNum(roundTo(f, 0))}${CUR[c]}.` };
    return rounded(o, f / 1e4, 0);
  }
  const fx = {
    f2k_usd: (R, lv) => f2k(R, lv, 'usd'),
    f2k_jpy: (R, lv) => f2k(R, lv, 'jpy'),
    f2k_eur: (R, lv) => f2k(R, lv, 'eur'),
    k2f_usd: (R, lv) => k2f(R, lv, 'usd'),
    k2f_jpy: (R, lv) => k2f(R, lv, 'jpy'),
    k2f_eur: (R, lv) => k2f(R, lv, 'eur'),
    usdmn2eok(R, lv) {
      const r = RATE.usd(R, lv);
      const m = R.int(5, 999);
      const raw = (m * 1e6 * r) / 1e8;
      return rounded({ q: `${RATE_TXT.usd(r)}일 때 ${m} million 달러는 몇 억 원?`, unit: '억 원', vars: { r, m }, why: `${m}00만 × ${fmtNum(r)} = 약 ${fmtNum(roundTo(raw, 1))}억 원.` }, raw, 0);
    },
    eok2usdmn(R, lv) {
      const r = RATE.usd(R, lv);
      const w = R.int(10, 999) * 10;
      const raw = (w * 1e8) / r / 1e6;
      return rounded({ q: `${RATE_TXT.usd(r)}일 때 ${eok(w)}은 몇 million 달러?`, unit: 'million 달러', vars: { r, w }, why: `${fmtNum(w)}억 ÷ ${fmtNum(r)} = 약 ${fmtNum(roundTo(raw * 1e6, 0))}달러.` }, raw, 0);
    },
    cross_jpy(R, lv) {
      const ru = RATE.usd(R, lv);
      const rj = RATE.jpy(R, lv);
      const raw = ru / (rj / 100);
      return rounded({ q: `${RATE_TXT.usd(ru)}, ${RATE_TXT.jpy(rj)}일 때 1달러는 몇 엔?`, unit: '엔', vars: { ru, rj }, why: `1엔은 ${fmtNum(rj / 100)}원이므로 ${fmtNum(ru)} ÷ ${fmtNum(rj / 100)}.` }, raw, 1);
    },
    cross_eur(R, lv) {
      const re = RATE.eur(R);
      const ru = RATE.usd(R, lv);
      const raw = re / ru;
      return rounded({ q: `${RATE_TXT.eur(re)}, ${RATE_TXT.usd(ru)}일 때 1유로는 몇 달러?`, unit: '달러', vars: { re, ru }, why: `${fmtNum(re)} ÷ ${fmtNum(ru)}.` }, raw, 2);
    },
    valchg_krw(R) {
      const r0 = R.step(1250, 1450, 10);
      const r1 = r0 + R.sign() * R.step(20, 150, 10);
      const raw = Math.abs(r0 / r1 - 1) * 100;
      const up = r1 < r0;
      return rounded({ q: `환율이 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 원화 자산을 달러로 환산한 가치는 몇 % ${up ? '늘었나' : '줄었나'}?`, unit: '%', vars: { r0, r1 }, why: `달러 가치는 환율에 반비례한다. ${fmtNum(r0)} ÷ ${fmtNum(r1)} = ${fmtNum(roundTo(r0 / r1, 4))}.` }, raw, 1);
    },
    valchg_usd(R) {
      const r0 = R.step(1250, 1450, 10);
      const r1 = r0 + R.sign() * R.step(20, 150, 10);
      const raw = Math.abs(r1 / r0 - 1) * 100;
      const up = r1 > r0;
      return rounded({ q: `환율이 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 달러 자산을 원화로 환산한 가치는 몇 % ${up ? '늘었나' : '줄었나'}?`, unit: '%', vars: { r0, r1 }, why: `${fmtNum(r1)} ÷ ${fmtNum(r0)} = ${fmtNum(roundTo(r1 / r0, 4))}.` }, raw, 1);
    },
    ret_krw(R) {
      const r0 = R.step(1300, 1500, 100);
      let c = 0;
      while (!c) c = R.int(-8, 8);
      const r1 = (r0 * (100 + c)) / 100;
      let s = 0;
      while (!s) s = R.int(-10, 25);
      const raw = ((100 + s) * (100 + c) - 10000) / 100;
      return rounded({ q: `미국 주식이 달러 기준으로 ${Math.abs(s)}% ${s > 0 ? '올랐' : '내렸'}고, 같은 기간 환율은 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 원화 기준 수익률은 몇 %?`, unit: '%', neg: true, vars: { r0, r1, s }, why: `${fmtNum((100 + s) / 100)} × ${fmtNum(r1 / r0)} = ${fmtNum(clean(((100 + s) * (100 + c)) / 10000))}.` }, raw, 1);
    },
    ret_usd(R) {
      const r0 = R.step(1300, 1500, 100);
      let c = 0;
      while (!c) c = R.int(-8, 8);
      const r1 = (r0 * (100 + c)) / 100;
      let s = 0;
      while (!s) s = R.int(-10, 25);
      const raw = (((100 + s) / 100) * (r0 / r1) - 1) * 100;
      return rounded({ q: `국내 주식이 원화 기준으로 ${Math.abs(s)}% ${s > 0 ? '올랐' : '내렸'}고, 같은 기간 환율은 1달러 ${fmtNum(r0)}원에서 ${fmtNum(r1)}원이 됐다. 달러 기준 수익률은 몇 %?`, unit: '%', neg: true, vars: { r0, r1, s }, why: `${fmtNum((100 + s) / 100)} × ${fmtNum(r0)} ÷ ${fmtNum(r1)} = ${fmtNum(roundTo(((100 + s) / 100) * (r0 / r1), 4))}.` }, raw, 1);
    },
  };

  // ── 3. 비율과 퍼센트 ───────────────────────────────────────
  const METRIC = ['매출', '영업이익', '순이익'];
  const ratio = {
    margin(R, lv) {
      if (lv === 1) {
        const rev = R.int(5, 100) * 100;
        const p = R.int(3, 30);
        const op = (rev * p) / 100;
        return exact({ q: `매출 ${eok(rev)}, 영업이익 ${eok(op)}인 회사의 영업이익률은 몇 %?`, unit: '%', vars: { rev, op }, why: `${fmtNum(op)} ÷ ${fmtNum(rev)} = ${fmtNum(p / 100)}.` }, p);
      }
      const rev = R.int(50, 999) * 10;
      const op = R.int(Math.ceil(rev * 0.03), Math.floor(rev * 0.3));
      return rounded({ q: `매출 ${eok(rev)}, 영업이익 ${eok(op)}인 회사의 영업이익률은 몇 %?`, unit: '%', vars: { rev, op }, why: `${fmtNum(op)} ÷ ${fmtNum(rev)} = ${fmtNum(roundTo(op / rev, 4))}.` }, (op / rev) * 100, 1);
    },
    per(R, lv) {
      if (lv === 1) {
        const eps = R.int(10, 80) * 100;
        const m = R.int(4, 25);
        return exact({ q: `주가 ${won(eps * m)}, EPS(주당순이익) ${won(eps)}인 회사의 PER(주가수익비율)은 몇 배?`, unit: '배', vars: { price: eps * m, eps }, why: `${fmtNum(eps * m)} ÷ ${fmtNum(eps)} = ${m}.` }, m);
      }
      for (;;) {
        const price = R.int(100, 999) * 100;
        const eps = R.int(20, 99) * 100;
        const raw = price / eps;
        if (raw < 3 || raw > 40) continue;
        return rounded({ q: `주가 ${won(price)}, EPS(주당순이익) ${won(eps)}인 회사의 PER(주가수익비율)은 몇 배?`, unit: '배', vars: { price, eps }, why: `${fmtNum(price)} ÷ ${fmtNum(eps)}.` }, raw, 1);
      }
    },
    pbr(R) {
      for (;;) {
        const mcap = R.int(20, 999) * 100;
        const eq = R.int(20, 999) * 100;
        const raw = mcap / eq;
        if (raw < 0.2 || raw > 5) continue;
        return rounded({ q: `시가총액 ${eok(mcap)}, 자기자본 ${eok(eq)}인 회사의 PBR(주가순자산비율)은 몇 배?`, unit: '배', vars: { mcap, eq }, why: `${fmtNum(mcap)} ÷ ${fmtNum(eq)}.` }, raw, 2);
      }
    },
    roe(R, lv) {
      if (lv === 1) {
        const eq = R.int(10, 200) * 100;
        const p = R.int(4, 25);
        const ni = (eq * p) / 100;
        return exact({ q: `순이익 ${eok(ni)}, 자기자본 ${eok(eq)}인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { ni, eq }, why: `${fmtNum(ni)} ÷ ${fmtNum(eq)} = ${fmtNum(p / 100)}.` }, p);
      }
      const eq = R.int(100, 999) * 10;
      const ni = R.int(Math.ceil(eq * 0.02), Math.floor(eq * 0.3));
      return rounded({ q: `순이익 ${eok(ni)}, 자기자본 ${eok(eq)}인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { ni, eq }, why: `${fmtNum(ni)} ÷ ${fmtNum(eq)} = ${fmtNum(roundTo(ni / eq, 4))}.` }, (ni / eq) * 100, 1);
    },
    payout(R, lv) {
      if (lv === 1) {
        const ni = R.int(5, 100) * 100;
        const p = R.step(10, 60, 5);
        const div = (ni * p) / 100;
        return exact({ q: `순이익 ${eok(ni)} 가운데 ${eok(div)}을 배당금으로 줬다. 배당성향은 몇 %?`, unit: '%', vars: { ni, div }, why: `${fmtNum(div)} ÷ ${fmtNum(ni)} = ${fmtNum(p / 100)}.` }, p);
      }
      const ni = R.int(100, 9999);
      const div = R.int(Math.ceil(ni * 0.1), Math.floor(ni * 0.7));
      return rounded({ q: `순이익 ${eok(ni)} 가운데 ${eok(div)}을 배당금으로 줬다. 배당성향은 몇 %?`, unit: '%', vars: { ni, div }, why: `${fmtNum(div)} ÷ ${fmtNum(ni)} = ${fmtNum(roundTo(div / ni, 4))}.` }, (div / ni) * 100, 1);
    },
    pchg(R, lv) {
      if (lv === 1) {
        const p0 = R.int(10, 99) * 1000;
        let g = 0;
        while (!g) g = R.int(-30, 60);
        const p1 = (p0 * (100 + g)) / 100;
        return exact({ q: `주가가 ${won(p0)}에서 ${won(p1)}${g > 0 ? '으로 올랐다. 몇 % 올랐나' : '으로 내렸다. 몇 % 내렸나'}?`, unit: '%', vars: { p0, p1 }, why: `${fmtNum(p1)} ÷ ${fmtNum(p0)} = ${fmtNum((100 + g) / 100)}.` }, Math.abs(g));
      }
      for (;;) {
        const p0 = R.int(100, 999) * 100;
        const p1 = R.int(Math.ceil(p0 * 0.6 / 100), Math.floor(p0 * 1.6 / 100)) * 100;
        if (p1 === p0) continue;
        const raw = Math.abs(p1 / p0 - 1) * 100;
        return rounded({ q: `주가가 ${won(p0)}에서 ${won(p1)}${p1 > p0 ? '으로 올랐다. 몇 % 올랐나' : '으로 내렸다. 몇 % 내렸나'}?`, unit: '%', vars: { p0, p1 }, why: `${fmtNum(p1)} ÷ ${fmtNum(p0)} = ${fmtNum(roundTo(p1 / p0, 4))}.` }, raw, 1);
      }
    },
    pp(R) {
      const r0 = R.step(100, 600, 25);
      let r1 = 0;
      while (r1 <= 0 || r1 === r0) r1 = r0 + R.sign() * R.step(25, 150, 25);
      const up = r1 > r0;
      return exact({ q: `기준금리가 ${pct(r0 / 100)}에서 ${pct(r1 / 100)}로 ${up ? '올랐다' : '내렸다'}. 몇 %p(퍼센트포인트) ${up ? '올랐나' : '내렸나'}?`, unit: '%p', vars: { r0: r0 / 100, r1: r1 / 100 }, why: `두 비율의 차이는 %p로 센다. ${fmtNum(r1 / 100)} 빼기 ${fmtNum(r0 / 100)}.` }, Math.abs(r1 - r0) / 100);
    },
    pp_vs_pct(R, lv) {
      const name = R.pick(['영업이익률', '시장점유율', '배당성향']);
      let r0, r1;
      for (;;) {
        r0 = lv >= 4 ? R.int(50, 400) / 10 : R.int(5, 40);
        r1 = clean(r0 + R.sign() * (lv >= 4 ? R.int(5, 100) / 10 : R.int(1, 10)));
        if (r1 > 0 && r1 !== r0) break;
      }
      const up = r1 > r0;
      const verb = up ? '올랐' : '떨어졌';
      if (R.chance(0.5)) return exact({ q: `${name}이 ${pct(r0)}에서 ${pct(r1)}로 ${verb}다. 몇 %p(퍼센트포인트) ${verb}나?`, unit: '%p', vars: { r0, r1, ask: 'pp' }, why: `두 비율의 차이: ${fmtNum(Math.abs(r1 - r0))}%p.` }, clean(Math.abs(r1 - r0)));
      return rounded({ q: `${name}이 ${pct(r0)}에서 ${pct(r1)}로 ${verb}다. 처음 값에 견줘 몇 % ${verb}나?`, unit: '%', vars: { r0, r1, ask: 'pct' }, why: `차이 ${fmtNum(clean(Math.abs(r1 - r0)))}를 처음 값 ${fmtNum(r0)}로 나눈다.` }, (Math.abs(r1 - r0) / r0) * 100, 1);
    },
    rev_from_margin(R) {
      const rev = R.int(5, 200) * 100;
      const p = R.pick([4, 5, 8, 10, 12, 15, 20, 25]);
      const op = (rev * p) / 100;
      return exact({ q: `영업이익률이 ${p}%이고 영업이익이 ${eok(op)}이면 매출은 몇 억 원?`, unit: '억 원', vars: { p, op }, why: `${fmtNum(op)} ÷ ${fmtNum(p / 100)} = ${fmtNum(rev)}.` }, rev);
    },
    price_from_eps(R) {
      const sh = R.pick([1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000]); // 만 주
      const eps = R.int(5, 80) * 100;
      const ni = (eps * sh) / 1e4; // 억 원
      const m = R.int(5, 20);
      return exact({ q: `순이익 ${eok(ni)}, 발행주식 ${fmtKR(sh * 1e4, { comma: true })}주인 회사의 PER(주가수익비율)이 ${m}배면 주가는 몇 원?`, unit: '원', input: 'kr', vars: { ni, sh, m }, why: `EPS(주당순이익)는 ${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4)} = ${fmtNum(eps)}원. 여기에 ${m}배.` }, eps * m);
    },
    mcap_from_pbr(R) {
      const eq = R.int(5, 500) * 100;
      const b10 = R.int(3, 30);
      return exact({ q: `자기자본 ${eok(eq)}인 회사의 PBR(주가순자산비율)이 ${fmtNum(b10 / 10)}배면 시가총액은 몇 억 원?`, unit: '억 원', input: 'kr', vars: { eq, pbr: b10 / 10 }, why: `${fmtNum(eq)} × ${fmtNum(b10 / 10)}.` }, (eq * b10) / 10);
    },
    ev_ebitda(R) {
      for (;;) {
        const mcap = R.int(50, 999) * 100;
        const nd = R.int(1, 60) * 100;
        const e = R.int(10, 99) * 100;
        const raw = (mcap + nd) / e;
        if (raw < 2 || raw > 30) continue;
        return rounded({ q: `시가총액 ${eok(mcap)}, 순차입금 ${eok(nd)}, EBITDA(상각 전 영업이익) ${eok(e)}인 회사의 EV(기업가치)/EBITDA는 몇 배?`, unit: '배', vars: { mcap, nd, e }, why: `EV는 시가총액에 순차입금을 더한 ${fmtNum(mcap + nd)}억 원. 이를 ${fmtNum(e)}로 나눈다.` }, raw, 1);
      }
    },
    dupont(R) {
      const m = R.int(2, 15);
      const t10 = R.int(5, 20);
      const l10 = R.int(12, 30);
      const raw = (m * t10 * l10) / 100;
      return rounded({ q: `순이익률 ${m}%, 총자산회전율 ${fmtNum(t10 / 10)}회, 총자산이 자기자본의 ${fmtNum(l10 / 10)}배인 회사의 ROE(자기자본이익률)는 몇 %?`, unit: '%', vars: { m, t: t10 / 10, l: l10 / 10 }, why: `${m}% × ${fmtNum(t10 / 10)} × ${fmtNum(l10 / 10)}.` }, raw, 1);
    },
  };

  // ── 4. 성장과 복리 ─────────────────────────────────────────
  const growth = {
    yoy(R) {
      const k = R.pick(METRIC);
      const prev = R.int(2, 90) * 100;
      let g = 0;
      while (!g) g = R.int(-30, 60);
      const cur = (prev * (100 + g)) / 100;
      return exact({ q: `작년 ${k} ${eok(prev)}, 올해 ${k} ${eok(cur)}이면 전년보다 몇 % ${g > 0 ? '늘었나' : '줄었나'}?`, unit: '%', vars: { prev, cur }, why: `${fmtNum(cur)} ÷ ${fmtNum(prev)} = ${fmtNum((100 + g) / 100)}.` }, Math.abs(g));
    },
    yoy_r(R) {
      const k = R.pick(METRIC);
      for (;;) {
        const prev = R.int(100, 9999);
        const cur = Math.round(prev * (1 + R.int(-40, 80) / 100 + (R.next() - 0.5) / 50));
        if (cur === prev || cur <= 0) continue;
        return rounded({ q: `작년 ${k} ${eok(prev)}, 올해 ${k} ${eok(cur)}이면 전년보다 몇 % ${cur > prev ? '늘었나' : '줄었나'}?`, unit: '%', vars: { prev, cur }, why: `${fmtNum(cur)} ÷ ${fmtNum(prev)} = ${fmtNum(roundTo(cur / prev, 4))}.` }, Math.abs(cur / prev - 1) * 100, 1);
      }
    },
    r72_years(R) {
      const r = R.pick([2, 3, 4, 6, 8, 9, 12, 18, 24]);
      return exact({ q: `72의 법칙(72 ÷ 연 수익률)으로 어림하면, 연 ${r}%로 불어나는 돈이 두 배가 되기까지 몇 년?`, unit: '년', vars: { r }, why: `72 ÷ ${r} = ${72 / r}.` }, 72 / r);
    },
    r72_rate(R) {
      const n = R.pick([3, 4, 6, 8, 9, 12, 18]);
      return exact({ q: `72의 법칙(72 ÷ 연 수익률)으로 어림하면, ${n}년 만에 두 배가 된 투자의 연 수익률은 몇 %?`, unit: '%', vars: { n }, why: `72 ÷ ${n} = ${72 / n}.` }, 72 / n);
    },
    comp2(R, lv) {
      const r = R.pick(lv === 1 ? [10, 20, 50] : [10, 20, 30, 40, 50]);
      const base = R.int(1, 50) * 100;
      return exact({ q: `매출 ${eok(base)}이 해마다 ${r}%씩 2년 늘면 몇 억 원?`, unit: '억 원', input: 'kr', vars: { base, r, n: 2 }, why: `${fmtNum(1 + r / 100)}의 제곱은 ${fmtNum(clean((1 + r / 100) ** 2))}. ${fmtNum(base)} × ${fmtNum(clean((1 + r / 100) ** 2))}.` }, (base * (100 + r) ** 2) / 1e4);
    },
    cagr2(R) {
      const r = R.pick([10, 20, 30, 40, 50]);
      const base = R.int(1, 50) * 100;
      const end = (base * (100 + r) ** 2) / 1e4;
      return exact({ q: `매출이 2년 만에 ${eok(base)}에서 ${eok(end)}이 됐다. CAGR(연평균 성장률)은 몇 %?`, unit: '%', vars: { base, end, n: 2 }, why: `${fmtNum(end)} ÷ ${fmtNum(base)} = ${fmtNum(clean(end / base))}, 이는 ${fmtNum(1 + r / 100)}의 제곱.` }, r);
    },
    comp3(R) {
      const r = R.pick([10, 20, 50]);
      const base = R.int(1, 9) * 1000; // 만 원
      const end = (base * (100 + r) ** 3) / 1e6;
      return exact({ q: `${fmtKR(base * 1e4, { comma: true })} 원을 연 ${r}% 복리로 3년 굴리면 몇 만 원?`, unit: '만 원', input: 'kr', vars: { base, r, n: 3 }, why: `${fmtNum(1 + r / 100)}의 세제곱은 ${fmtNum(clean((1 + r / 100) ** 3))}.` }, end);
    },
    cagr3(R) {
      const r = R.pick([10, 20, 50]);
      const base = R.int(1, 9) * 1000;
      const end = (base * (100 + r) ** 3) / 1e6;
      return exact({ q: `${fmtKR(base * 1e4, { comma: true })} 원이 3년 만에 ${fmtKR(end * 1e4, { comma: true })} 원이 됐다. 연 복리 수익률은 몇 %?`, unit: '%', vars: { base, end, n: 3 }, why: `${fmtNum(end)} ÷ ${fmtNum(base)} = ${fmtNum(clean(end / base))}, 이는 ${fmtNum(1 + r / 100)}의 세제곱.` }, r);
    },
    cagr_est(R) {
      for (;;) {
        const m = R.pick([1.5, 2, 2.5, 3, 4, 5]);
        const n = R.int(3, 10);
        const raw = (Math.pow(m, 1 / n) - 1) * 100;
        if (raw < 3 || raw > 40) continue;
        return approx({ q: `매출이 ${n}년 만에 ${fmtNum(m)}배가 됐다. CAGR(연평균 성장률)은 약 몇 %?`, unit: '%', vars: { m, n }, why: `${n}번 곱해 ${fmtNum(m)}가 되는 수를 찾는다. 약 ${fmtNum(roundTo(1 + raw / 100, 3))}.` }, raw, { abs: 1 });
      }
    },
    mult_est(R, lv) {
      for (;;) {
        const r = R.int(3, 15);
        const n = R.int(5, 20);
        const raw = Math.pow(1 + r / 100, n);
        if (raw > 12) continue;
        return approx({ q: `연 ${r}% 복리로 ${n}년 굴리면 처음 금액의 약 몇 배?`, unit: '배', vars: { r, n }, why: `72 ÷ ${r} = ${fmtNum(roundTo(72 / r, 1))}년마다 두 배. 정확히는 ${fmtNum(roundTo(raw, 3))}.` }, raw, { rel: lv >= 4 ? 0.03 : 0.05 });
      }
    },
  };

  // ── 5. 할인과 현재가치 ─────────────────────────────────────
  const pv = {
    pv1(R) {
      const r = R.pick([4, 5, 8, 10, 20, 25]);
      const v = R.int(1, 50) * 100;
      const cf = (v * (100 + r)) / 100;
      return exact({ q: `할인율이 연 ${r}%일 때, 1년 뒤에 받는 ${eok(cf)}의 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, cf, n: 1 }, why: `${fmtNum(cf)} ÷ ${fmtNum(1 + r / 100)}.` }, v);
    },
    pv2(R) {
      const r = R.pick([10, 20]);
      const v = R.int(1, 50) * 100;
      const cf = (v * (100 + r) ** 2) / 1e4;
      return exact({ q: `할인율이 연 ${r}%일 때, 2년 뒤에 받는 ${eok(cf)}의 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, cf, n: 2 }, why: `${fmtNum(cf)} ÷ ${fmtNum(clean((1 + r / 100) ** 2))}.` }, v);
    },
    perp(R) {
      const r = R.pick([2, 4, 5, 8, 10]);
      const v = R.int(1, 99) * 100;
      const cf = (v * r) / 100;
      return exact({ q: `할인율이 연 ${r}%일 때, 1년 뒤부터 해마다 ${eok(cf)}을 영원히 받는 권리의 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, cf }, why: `영구히 같은 돈: ${fmtNum(cf)} ÷ ${fmtNum(r / 100)}.` }, v);
    },
    perp_g(R) {
      const r = R.int(6, 12);
      const g = R.int(1, r - 2);
      const v = R.int(1, 50) * 100;
      const cf = (v * (r - g)) / 100;
      return exact({ q: `1년 뒤에 ${eok(cf)}을 받고, 그 뒤 해마다 ${g}%씩 늘려 영원히 받는다. 할인율이 연 ${r}%일 때 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, g, cf }, why: `${fmtNum(cf)} ÷ (${r}% 빼기 ${g}%) = ${fmtNum(cf)} ÷ ${fmtNum((r - g) / 100)}.` }, v);
    },
    gordon(R) {
      const r = R.int(6, 12);
      const g = R.int(1, r - 2);
      const price = R.int(10, 99) * 1000;
      const d1 = (price * (r - g)) / 100;
      return exact({ q: `내년 주당배당금이 ${won(d1)}이고 그 뒤 해마다 ${g}%씩 영원히 늘어난다. 요구수익률이 연 ${r}%일 때 적정 주가는 몇 원?`, unit: '원', input: 'kr', vars: { d1, g, r }, why: `${fmtNum(d1)} ÷ (${r}% 빼기 ${g}%) = ${fmtNum(d1)} ÷ ${fmtNum((r - g) / 100)}.` }, price);
    },
    gordon_r(R) {
      const price = R.int(10, 99) * 1000;
      const y = R.pick([2, 2.5, 3, 4, 5, 6]);
      const d1 = (price * y) / 100;
      const g = R.int(1, 6);
      return exact({ q: `주가 ${won(price)}, 내년 주당배당금 ${won(d1)}이고 배당이 해마다 ${g}%씩 영원히 늘어난다고 보면, 이 주가에 담긴 요구수익률은 몇 %?`, unit: '%', vars: { price, d1, g }, why: `배당수익률 ${fmtNum(d1)} ÷ ${fmtNum(price)} = ${fmtNum(y)}%에 성장률 ${g}%를 더한다.` }, clean(y + g));
    },
    gordon_g(R) {
      const price = R.int(10, 99) * 1000;
      const y = R.pick([2, 2.5, 3, 4, 5, 6]);
      const d1 = (price * y) / 100;
      const g = R.int(1, 6);
      const r = clean(y + g);
      return exact({ q: `주가 ${won(price)}, 내년 주당배당금 ${won(d1)}, 요구수익률 연 ${fmtNum(r)}%다. 배당이 해마다 같은 비율로 영원히 늘어난다고 보면, 이 주가에 담긴 성장률은 몇 %?`, unit: '%', vars: { price, d1, r }, why: `요구수익률 ${fmtNum(r)}%에서 배당수익률 ${fmtNum(y)}%를 뺀다.` }, g);
    },
    deferred_perp(R) {
      const r = R.pick([10, 20]);
      const v = R.int(1, 50) * 100;
      const cf = (v * r * (100 + r)) / 1e4;
      return exact({ q: `할인율이 연 ${r}%일 때, 2년 뒤부터 해마다 ${eok(cf)}을 영원히 받는 권리의 현재가치는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, cf }, why: `1년 뒤 시점의 가치는 ${fmtNum(cf)} ÷ ${fmtNum(r / 100)} = ${fmtNum(clean(cf / (r / 100)))}. 이를 1년 할인한다.` }, v);
    },
    gordon_d0(R) {
      for (;;) {
        const d0 = R.int(5, 50) * 100;
        const g = R.pick([2, 4, 5, 10]);
        const d1 = (d0 * (100 + g)) / 100;
        const s = R.int(2, 8);
        const r = g + s;
        if (r > 15) continue;
        const price = (d1 * 100) / s;
        if (price !== Math.round(price) || price % 10 !== 0) continue;
        return exact({ q: `올해 주당배당금 ${won(d0)}을 막 지급했고, 배당은 해마다 ${g}%씩 영원히 늘어난다. 요구수익률이 연 ${r}%일 때 적정 주가는 몇 원?`, unit: '원', input: 'kr', vars: { d0, g, r }, why: `내년 배당은 ${fmtNum(d0)} × ${fmtNum(1 + g / 100)} = ${fmtNum(d1)}원. 이를 ${fmtNum(s / 100)}로 나눈다.` }, price);
      }
    },
    pv3_est(R) {
      const r = R.int(3, 12);
      const n = R.int(3, 5);
      const cf = R.int(1, 99) * 100;
      const raw = cf / Math.pow(1 + r / 100, n);
      return approx({ q: `할인율이 연 ${r}%일 때, ${n}년 뒤에 받는 ${eok(cf)}의 현재가치는 약 몇 억 원?`, unit: '억 원', vars: { r, n, cf }, why: `${fmtNum(1 + r / 100)}의 ${n}제곱은 약 ${fmtNum(roundTo(Math.pow(1 + r / 100, n), 3))}.` }, raw, { rel: 0.02 });
    },
  };

  // ── 6. 단위 환산 ───────────────────────────────────────────
  const BP = 'bp(베이시스포인트, 1bp는 0.01퍼센트포인트)';
  const unit = {
    pp2bp(R) {
      const bp = R.step(5, 300, 5);
      return exact({ q: `금리 차이 ${fmtNum(bp / 100)}%p(퍼센트포인트)는 몇 ${BP}?`, unit: 'bp', vars: { pp: bp / 100 }, why: `1%p는 100bp.` }, bp);
    },
    bp2pp(R) {
      const bp = R.step(5, 300, 5);
      return exact({ q: `금리 차이 ${bp}${BP}는 몇 %p(퍼센트포인트)?`, unit: '%p', vars: { bp }, why: `100bp가 1%p.` }, bp / 100);
    },
    bp_add(R) {
      const r0 = R.step(100, 600, 5);
      let r1 = 0;
      while (r1 <= 0) r1 = r0 + R.sign() * R.step(5, 150, 5);
      const up = r1 > r0;
      return exact({ q: `연 ${pct(r0 / 100)}인 금리가 ${Math.abs(r1 - r0)}${BP} ${up ? '오르면' : '내리면'} 몇 %?`, unit: '%', vars: { r0: r0 / 100, d: (r1 - r0) } , why: `${Math.abs(r1 - r0)}bp는 ${fmtNum(Math.abs(r1 - r0) / 100)}%p.` }, r1 / 100);
    },
    fs_mn(R, lv) {
      const v = lv <= 2 ? R.int(1e4, 999999) : R.int(1e5, 9999999);
      return rounded({ q: `단위가 백만 원인 재무제표에서 매출 칸의 숫자가 ${fmtNum(v)}이다. 매출은 몇 억 원?`, unit: '억 원', input: 'kr', vars: { v, scale: 1e6 }, why: `1억은 백만의 100배. ${fmtNum(v)} ÷ 100.` }, v / 100, 0);
    },
    fs_th(R) {
      const v = R.int(1, 9999) * 1e4;
      return exact({ q: `단위가 천 원인 재무제표에서 영업이익 칸의 숫자가 ${fmtNum(v)}이다. 영업이익은 몇 억 원?`, unit: '억 원', vars: { v, scale: 1e3 }, why: `1억은 천의 10만 배. ${fmtNum(v)} ÷ 100,000.` }, v / 1e5);
    },
    eok2jo(R) {
      const v = R.int(1000, 99999);
      return exact({ q: `단위가 억 원인 표에서 자산총계 칸의 숫자가 ${fmtNum(v)}이다. 자산총계는 몇 조 원?`, unit: '조 원', vars: { v, scale: 1e8 }, why: `1조는 1만 억. ${fmtNum(v)} ÷ 10,000.` }, v / 1e4);
    },
    eok2usdmn(R) {
      for (;;) {
        const r = R.step(1300, 1500, 50);
        const m = R.int(10, 999);
        const w = (m * r) / 100;
        if (w !== Math.round(w)) continue;
        return exact({ q: `${RATE_TXT.usd(r)}일 때 ${eok(w)}은 몇 million 달러?`, unit: 'million 달러', vars: { r, w }, why: `${fmtNum(w)}억 ÷ ${fmtNum(r)} = ${fmtNum(m * 1e6)}달러.` }, m);
      }
    },
    usdmn2eok(R) {
      for (;;) {
        const r = R.step(1300, 1500, 50);
        const m = R.int(10, 999);
        const w = (m * r) / 100;
        if (w !== Math.round(w)) continue;
        return exact({ q: `${RATE_TXT.usd(r)}일 때 ${m} million 달러는 몇 억 원?`, unit: '억 원', input: 'kr', vars: { r, m }, why: `${m}00만 × ${fmtNum(r)} = ${fmtNum(w)}억 원.` }, w);
      }
    },
    eps_calc(R) {
      const sh = R.pick([1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000]);
      const eps = R.int(5, 80) * 100;
      const ni = (eps * sh) / 1e4;
      return exact({ q: `순이익 ${eok(ni)}, 발행주식 ${fmtKR(sh * 1e4, { comma: true })}주인 회사의 EPS(주당순이익)는 몇 원?`, unit: '원', input: 'kr', vars: { ni, sh }, why: `${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4)}.` }, eps);
    },
    mcap_jo(R) {
      for (;;) {
        const sh = R.int(1000, 99999); // 만 주
        const price = R.int(10, 999) * 100;
        const raw = (sh * 1e4 * price) / 1e12;
        if (raw < 0.1 || raw > 500) continue;
        const o = rounded({ q: `발행주식 ${fmtKR(sh * 1e4, { comma: true })}주, 주가 ${won(price)}인 회사의 시가총액은 몇 조 원?`, unit: '조 원', vars: { sh, price }, why: `${fmtKR(sh * 1e4)} × ${fmtNum(price)} = ${fmtNum(sh * 1e4 * price)}원.` }, raw, 1);
        if (o) return o;
      }
    },
  };

  // ── 7. 어림셈 ─────────────────────────────────────────────
  const SIG = [0, 2, 3, 4, 4];
  const TOL = [0, 0.1, 0.05, 0.05, 0.03];
  const est = {
    mul(R, lv) {
      const s = SIG[lv];
      const price = sigIn(R, s, 1000, 99999);
      const q = sigIn(R, s, 100, 9999);
      const raw = (price * q) / 1e4;
      return approx({ q: `주가 ${won(price)}인 주식 ${fmtNum(q)}주를 사면 약 몇 만 원?`, unit: '만 원', vars: { price, qty: q }, why: `${fmtNum(roundSig(price, 2))} × ${fmtNum(roundSig(q, 2))}처럼 앞자리로 어림한다.` }, raw, { rel: TOL[lv] });
    },
    pct_of(R, lv) {
      const s = SIG[lv];
      const base = sigIn(R, s, 1000, 99999); // 억 원
      const p = lv === 1 ? R.int(2, 30) : roundSig(R.int(11, 299) / 10, Math.min(s, 3));
      const raw = (base * p) / 100;
      return approx({ q: `매출 ${eok(base)}의 ${pct(p)}는 약 몇 억 원?`, unit: '억 원', vars: { base, p }, why: `1%는 ${fmtNum(roundTo(base / 100, 1))}억 원. 여기에 ${fmtNum(p)}를 곱한다.` }, raw, { rel: TOL[lv] });
    },
    fx_div(R, lv) {
      const s = SIG[lv];
      const w = sigIn(R, s, 100, 9999); // 억 원
      const r = lv === 1 ? R.step(1300, 1500, 100) : R.step(1300, 1480, 5);
      const raw = (w * 1e8) / r / 1e6;
      return approx({ q: `${eok(w)}을 1달러 ${fmtNum(r)}원에 바꾸면 약 몇 million 달러?`, unit: 'million 달러', vars: { w, r }, why: `1억 원은 약 ${fmtNum(roundTo(1e8 / r / 1e3, 0))}천 달러. ${fmtNum(w)}억 ÷ ${fmtNum(r)}.` }, raw, { rel: TOL[lv] });
    },
    per_share(R, lv) {
      const s = SIG[lv];
      const ni = sigIn(R, s, 100, 9999); // 억 원
      const sh = sigIn(R, s, 1000, 50000); // 만 주
      const raw = (ni * 1e8) / (sh * 1e4);
      return approx({ q: `순이익 ${eok(ni)}, 발행주식 ${fmtKR(sh * 1e4, { comma: true })}주인 회사의 EPS(주당순이익)는 약 몇 원?`, unit: '원', vars: { ni, sh }, why: `${fmtNum(ni)}억 ÷ ${fmtKR(sh * 1e4)}. 억을 만으로 나누면 1만 원 단위가 된다.` }, raw, { rel: TOL[lv] });
    },
    pow(R, lv) {
      for (;;) {
        const r = R.int(3, 15);
        const n = R.int(5, 20);
        const raw = Math.pow(1 + r / 100, n);
        if (raw > 12) continue;
        return approx({ q: `연 ${r}% 복리로 ${n}년이면 처음 금액의 약 몇 배?`, unit: '배', vars: { r, n }, why: `72의 법칙으로 ${fmtNum(roundTo(72 / r, 1))}년마다 두 배.` }, raw, { rel: TOL[lv] });
      }
    },
  };

  // ─────────────────────────────────────────────────────────────
  // 분야와 수준
  // ─────────────────────────────────────────────────────────────
  // target: 그 수준에서 올라가려면 넘어야 하는 중앙값(초). 처음 정한 값이고, 2주 써 본 뒤 고친다.
  const SKILLS = [
    {
      id: 'read', name: '큰 수 읽기', gen: read,
      levels: [
        { types: ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'], target: 10 },
        { types: ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'], target: 12 },
        { types: ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'], target: 14 },
        { types: ['d2k', 'd2k', 'k2e', 'k2e', 'e2k', 'e2k'], target: 16 },
      ],
    },
    {
      id: 'fx', name: '환율 환산', gen: fx,
      levels: [
        { types: ['f2k_usd', 'k2f_usd', 'f2k_usd', 'k2f_usd', 'f2k_jpy', 'k2f_jpy'], target: 12 },
        { types: ['f2k_usd', 'k2f_usd', 'f2k_jpy', 'k2f_jpy', 'f2k_eur', 'k2f_eur'], target: 18 },
        { types: ['usdmn2eok', 'eok2usdmn', 'cross_jpy', 'cross_eur', 'f2k_usd', 'k2f_jpy'], target: 22 },
        { types: ['valchg_krw', 'valchg_usd', 'ret_krw', 'ret_usd', 'cross_jpy', 'usdmn2eok'], target: 28 },
      ],
    },
    {
      id: 'ratio', name: '비율과 퍼센트', gen: ratio,
      levels: [
        { types: ['margin', 'per', 'roe', 'payout', 'pchg', 'pp'], target: 12 },
        { types: ['margin', 'per', 'pbr', 'roe', 'pchg', 'pp_vs_pct'], target: 18 },
        { types: ['rev_from_margin', 'price_from_eps', 'mcap_from_pbr', 'payout', 'pchg', 'pp_vs_pct'], target: 20 },
        { types: ['ev_ebitda', 'dupont', 'price_from_eps', 'pp_vs_pct', 'mcap_from_pbr', 'roe'], target: 25 },
      ],
    },
    {
      id: 'growth', name: '성장과 복리', gen: growth,
      levels: [
        { types: ['yoy', 'yoy', 'r72_years', 'r72_rate', 'comp2', 'comp2'], target: 12 },
        { types: ['yoy_r', 'yoy_r', 'comp2', 'cagr2', 'r72_years', 'comp3'], target: 18 },
        { types: ['yoy_r', 'comp3', 'cagr2', 'cagr3', 'r72_rate', 'mult_est'], target: 20 },
        { types: ['cagr_est', 'cagr_est', 'mult_est', 'mult_est', 'comp3', 'yoy_r'], target: 25 },
      ],
    },
    {
      id: 'pv', name: '할인과 현재가치', gen: pv,
      levels: [
        { types: ['pv1', 'pv1', 'pv1', 'perp', 'perp', 'perp'], target: 12 },
        { types: ['pv2', 'pv1', 'perp', 'gordon', 'gordon', 'perp_g'], target: 18 },
        { types: ['gordon_r', 'gordon_g', 'gordon', 'pv2', 'perp_g', 'deferred_perp'], target: 22 },
        { types: ['gordon_d0', 'deferred_perp', 'gordon_r', 'gordon_g', 'pv3_est', 'pv3_est'], target: 28 },
      ],
    },
    {
      id: 'unit', name: '단위 환산', gen: unit,
      levels: [
        { types: ['pp2bp', 'bp2pp', 'bp_add', 'pp2bp', 'bp2pp', 'bp_add'], target: 8 },
        { types: ['fs_mn', 'fs_th', 'eok2jo', 'bp_add', 'fs_mn', 'fs_th'], target: 12 },
        { types: ['eok2usdmn', 'usdmn2eok', 'fs_mn', 'eps_calc', 'bp_add', 'eok2jo'], target: 15 },
        { types: ['mcap_jo', 'eps_calc', 'eok2usdmn', 'usdmn2eok', 'fs_mn', 'bp_add'], target: 20 },
      ],
    },
    {
      id: 'est', name: '어림셈', gen: est,
      levels: [
        { types: ['mul', 'mul', 'pct_of', 'pct_of', 'fx_div', 'per_share'], target: 8 },
        { types: ['mul', 'mul', 'pct_of', 'pct_of', 'fx_div', 'per_share'], target: 10 },
        { types: ['mul', 'pct_of', 'fx_div', 'per_share', 'pow', 'pct_of'], target: 12 },
        { types: ['mul', 'pct_of', 'fx_div', 'per_share', 'pow', 'pct_of'], target: 12 },
      ],
    },
  ];
  const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
  const ORDER = SKILLS.map((s) => s.id);
  const SET_SIZE = 6;

  function finish(p) {
    // 자판: 끊어 쓰기 문제와 답의 단위가 맨 화폐(원, 달러, 엔, 유로)인 문제만 조, 억, 만 단추를 쓴다.
    p.input = p.form || /^(원|달러|엔|유로)$/.test(p.unit) ? 'kr' : 'num';
    p.form = !!p.form;
    p.note = p.note || '';
    p.tol = p.tol || null;
    p.show = showOf(p);
    p.typed = typedOf(p);
    return p;
  }
  function showOf(p) {
    if (p.tol) return '약 ' + fmtNum(roundSig(p.raw, 3)) + joinUnit(p.unit);
    if (p.form) return fmtKR(p.answer, { comma: true }) + joinUnit(p.unit);
    return fmtNum(p.answer, p.dp != null ? p.dp : undefined) + joinUnit(p.unit);
  }
  /** 정답을 자판으로 누른 모양(시험과 자동 풀이용). */
  function typedOf(p) {
    if (p.tol) return String(roundSig(p.raw, 4));
    if (p.form) return fmtKR(p.answer, { space: false });
    if (p.dp != null) return p.answer.toFixed(p.dp);
    return (p.answer < 0 ? '-' : '') + trimDec(Math.abs(p.answer));
  }

  /** 문제 하나. 같은 (분야, 수준, 유형, 씨앗)이면 언제나 같은 문제. */
  function makeProblem(skill, level, type, seed) {
    const S = SKILL[skill];
    const fn = S.gen[type];
    if (!fn) throw new Error(`유형 없음: ${skill}.${type}`);
    for (let k = 0; k < 200; k++) {
      const R = makeRng(`${seed}#${k}`);
      const p = fn(R, level);
      if (p) return finish(Object.assign(p, { skill, level, type, seed }));
    }
    throw new Error(`문제를 못 만듦: ${skill}.${type}`);
  }

  /** 한 분야 한 세트(6문제). 유형 묶음은 수준마다 고정이고 순서만 섞는다. */
  function makeSet(skill, level, seedKey, n = SET_SIZE) {
    const S = SKILL[skill];
    const lv = Math.max(1, Math.min(S.levels.length, level));
    const types = S.levels[lv - 1].types;
    const R = makeRng(`${seedKey}|${skill}|${lv}|order`);
    const order = R.shuffle(types).slice(0, n);
    const seen = new Set();
    return order.map((t, i) => {
      let p;
      for (let k = 0; ; k++) {
        p = makeProblem(skill, lv, t, `${seedKey}|${skill}|${lv}|${i}|${k}`);
        if (!seen.has(p.q)) break;
      }
      seen.add(p.q);
      return p;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 채점
  // ─────────────────────────────────────────────────────────────
  /**
   * reason: ok, empty, parse, wrong, sign(부호만 다름), round(반올림 자리만 다름), scale(자릿수가 10 의 거듭제곱만큼 다름), form(값은 맞고 끊어 쓰기가 틀림)
   */
  function check(p, input) {
    const s = String(input == null ? '' : input).trim();
    if (!s) return { ok: false, reason: 'empty' };
    let v;
    let canonical = true;
    if (p.input === 'kr') {
      const r = parseKR(s);
      if (!r) return { ok: false, reason: 'parse' };
      v = r.value;
      canonical = r.canonical;
    } else {
      const t = s.replace(/,/g, '');
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, reason: 'parse' };
      v = Number(t);
    }
    const close = (a, b) => Math.abs(a - b) <= 1e-9 + 1e-13 * Math.abs(b);
    const scaled = (a, b) => {
      if (!a || !b) return false;
      const l = Math.log10(Math.abs(a / b));
      return Math.abs(l - Math.round(l)) < 1e-9 && Math.round(l) !== 0 && a / b > 0;
    };
    if (p.tol) {
      const lim = p.tol.rel != null ? Math.abs(p.raw) * p.tol.rel : p.tol.abs;
      if (Math.abs(v - p.raw) <= lim + 1e-9) return { ok: true, reason: 'ok', value: v };
      if (Math.abs(-v - p.raw) <= lim) return { ok: false, reason: 'sign', value: v };
      const l = Math.log10(Math.abs(v / p.raw));
      if (v && Math.round(l) !== 0 && Math.abs(v / Math.pow(10, Math.round(l)) - p.raw) <= lim) return { ok: false, reason: 'scale', value: v };
      return { ok: false, reason: 'wrong', value: v };
    }
    if (close(v, p.answer)) {
      if (p.form && !canonical) return { ok: false, reason: 'form', value: v };
      return { ok: true, reason: 'ok', value: v };
    }
    if (p.answer !== 0 && close(v, -p.answer)) return { ok: false, reason: 'sign', value: v };
    if (p.dp != null && Math.abs(v - p.raw) < Math.pow(10, -p.dp)) return { ok: false, reason: 'round', value: v };
    if (scaled(v, p.answer)) return { ok: false, reason: 'scale', value: v };
    return { ok: false, reason: 'wrong', value: v };
  }
  const REASON = {
    sign: '부호가 반대예요',
    round: '반올림 자리를 다시 보세요',
    scale: '자릿수가 달라요',
    form: '만 단위 아래는 네 자리까지 끊어 써요',
    parse: '단위 순서를 다시 보세요',
  };

  // ─────────────────────────────────────────────────────────────
  // 기록과 수준
  // ─────────────────────────────────────────────────────────────
  const median = (xs) => {
    const a = xs.filter((x) => x != null).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  /**
   * 한 분야 한 세트를 기록 한 줄로 줄인다. 문제는 남기지 않는다.
   * items: [{ ms, ok }]  돌려주는 것: { n, ok, med, best, sum } (초, 소수 첫째 자리)
   * med 와 best 는 맞힌 문제의 시간만 쓴다(빨리 찍고 틀린 것이 기록을 당기지 않게).
   */
  function summarize(items) {
    const r1 = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
    const okT = items.filter((i) => i.ok).map((i) => i.ms);
    return {
      n: items.length,
      ok: okT.length,
      med: r1(median(okT)),
      best: okT.length ? r1(Math.min(...okT)) : null,
      sum: r1(items.reduce((a, i) => a + i.ms, 0)),
    };
  }
  const RULE = { upWindow: 3, upAcc: 0.9, downWindow: 2, downAcc: 0.6 };
  /**
   * 다음 세트의 수준. sessions 는 이 분야의 기록(오래된 것부터). 지금 수준에서 이어진 기록만 본다.
   * 올림: 이 수준에서 3세트 이상, 최근 3세트 정답률 90% 이상, 최근 3세트 중앙값들의 중앙값이 목표 시간 이하.
   * 내림: 최근 2세트가 모두 정답률 60% 미만.
   * 그 밖에는 그대로.
   */
  function judge(skill, level, sessions) {
    const S = SKILL[skill];
    const run = [];
    for (let i = sessions.length - 1; i >= 0 && sessions[i].lv === level; i--) run.unshift(sessions[i]);
    const target = S.levels[level - 1].target;
    const acc = (ss) => ss.reduce((a, s) => a + s.ok, 0) / Math.max(1, ss.reduce((a, s) => a + s.n, 0));
    const last3 = run.slice(-RULE.upWindow);
    const med3 = median(last3.map((s) => s.med));
    const info = { target, run: run.length, acc3: last3.length ? acc(last3) : null, med3 };
    if (run.length >= RULE.downWindow && level > 1) {
      const last2 = run.slice(-RULE.downWindow);
      if (last2.every((s) => s.ok / s.n < RULE.downAcc)) return Object.assign(info, { next: level - 1, change: -1 });
    }
    if (run.length >= RULE.upWindow && level < S.levels.length && acc(last3) >= RULE.upAcc && med3 != null && med3 <= target) return Object.assign(info, { next: level + 1, change: 1 });
    return Object.assign(info, { next: level, change: 0 });
  }
  /** 그 수준의 최고 기록(세트 중앙값이 가장 짧았던 세트). */
  function personalBest(sessions, skill, level) {
    let best = null;
    for (const s of sessions) if (s.k === skill && s.lv === level && s.med != null && s.ok / s.n >= 0.8 && (!best || s.med < best.med)) best = s;
    return best;
  }
  /** 오늘의 두 분야. 7 분야가 이틀씩 돌아 한 주에 분야마다 두 번. */
  function dailyPair(date) {
    const [y, m, d] = date.split('-').map(Number);
    const day = Math.floor(Date.UTC(y, m - 1, d) / 864e5);
    const i = (((2 * day) % 7) + 7) % 7;
    return [ORDER[i], ORDER[(i + 1) % 7]];
  }

  // ─────────────────────────────────────────────────────────────
  // 자체 시험
  // ─────────────────────────────────────────────────────────────
  // 답을 생성기와 따로 다시 계산한다(vars 만 보고). 반올림과 허용 오차는 여기서 따로 적용한다.
  const SOLVE = {
    'read.d2k': (v) => v.n,
    'read.k2e': (v) => v.n / Math.pow(10, EN[v.en]),
    'read.e2k': (v) => v.x * Math.pow(10, EN[v.en]),
    'fx.f2k': (v) => ((v.amt / PER_UNIT[v.c]) * v.r) / (v.out === 'man' ? 1e4 : 1e8),
    'fx.k2f': (v) => ((v.w * PER_UNIT[v.c]) / v.r) / (v.out === 'man' ? 1e4 : 1),
    'fx.usdmn2eok': (v) => (v.m * v.r) / 100,
    'fx.eok2usdmn': (v) => (v.w * 100) / v.r,
    'fx.cross_jpy': (v) => (v.ru * 100) / v.rj,
    'fx.cross_eur': (v) => v.re / v.ru,
    'fx.valchg_krw': (v) => Math.abs(v.r0 - v.r1) / v.r1 * 100,
    'fx.valchg_usd': (v) => Math.abs(v.r1 - v.r0) / v.r0 * 100,
    'fx.ret_krw': (v) => ((1 + v.s / 100) * v.r1 / v.r0 - 1) * 100,
    'fx.ret_usd': (v) => ((1 + v.s / 100) * v.r0 / v.r1 - 1) * 100,
    'ratio.margin': (v) => (100 * v.op) / v.rev,
    'ratio.per': (v) => v.price / v.eps,
    'ratio.pbr': (v) => v.mcap / v.eq,
    'ratio.roe': (v) => (100 * v.ni) / v.eq,
    'ratio.payout': (v) => (100 * v.div) / v.ni,
    'ratio.pchg': (v) => (100 * Math.abs(v.p1 - v.p0)) / v.p0,
    'ratio.pp': (v) => Math.abs(v.r1 - v.r0),
    'ratio.pp_vs_pct': (v) => (v.ask === 'pp' ? Math.abs(v.r1 - v.r0) : (100 * Math.abs(v.r1 - v.r0)) / v.r0),
    'ratio.rev_from_margin': (v) => (100 * v.op) / v.p,
    'ratio.price_from_eps': (v) => ((v.ni * 1e8) / (v.sh * 1e4)) * v.m,
    'ratio.mcap_from_pbr': (v) => v.eq * v.pbr,
    'ratio.ev_ebitda': (v) => (v.mcap + v.nd) / v.e,
    'ratio.dupont': (v) => v.m * v.t * v.l,
    'growth.yoy': (v) => (100 * Math.abs(v.cur - v.prev)) / v.prev,
    'growth.yoy_r': (v) => (100 * Math.abs(v.cur - v.prev)) / v.prev,
    'growth.r72_years': (v) => 72 / v.r,
    'growth.r72_rate': (v) => 72 / v.n,
    'growth.comp2': (v) => v.base * Math.pow(1 + v.r / 100, v.n),
    'growth.cagr2': (v) => (Math.pow(v.end / v.base, 1 / v.n) - 1) * 100,
    'growth.comp3': (v) => v.base * Math.pow(1 + v.r / 100, v.n),
    'growth.cagr3': (v) => (Math.pow(v.end / v.base, 1 / v.n) - 1) * 100,
    'growth.cagr_est': (v) => (Math.exp(Math.log(v.m) / v.n) - 1) * 100,
    'growth.mult_est': (v) => Math.exp(v.n * Math.log(1 + v.r / 100)),
    'pv.pv1': (v) => v.cf / Math.pow(1 + v.r / 100, v.n),
    'pv.pv2': (v) => v.cf / Math.pow(1 + v.r / 100, v.n),
    'pv.perp': (v) => v.cf / (v.r / 100),
    'pv.perp_g': (v) => v.cf / ((v.r - v.g) / 100),
    'pv.gordon': (v) => v.d1 / ((v.r - v.g) / 100),
    'pv.gordon_r': (v) => (100 * v.d1) / v.price + v.g,
    'pv.gordon_g': (v) => v.r - (100 * v.d1) / v.price,
    'pv.deferred_perp': (v) => v.cf / (v.r / 100) / (1 + v.r / 100),
    'pv.gordon_d0': (v) => (v.d0 * (1 + v.g / 100)) / ((v.r - v.g) / 100),
    'pv.pv3_est': (v) => v.cf * Math.pow(1 + v.r / 100, -v.n),
    'unit.pp2bp': (v) => v.pp * 100,
    'unit.bp2pp': (v) => v.bp / 100,
    'unit.bp_add': (v) => v.r0 + v.d / 100,
    'unit.fs_mn': (v) => (v.v * v.scale) / 1e8,
    'unit.fs_th': (v) => (v.v * v.scale) / 1e8,
    'unit.eok2jo': (v) => (v.v * v.scale) / 1e12,
    'unit.eok2usdmn': (v) => (v.w * 1e8) / v.r / 1e6,
    'unit.usdmn2eok': (v) => (v.m * 1e6 * v.r) / 1e8,
    'unit.eps_calc': (v) => (v.ni * 1e8) / (v.sh * 1e4),
    'unit.mcap_jo': (v) => (v.sh * 1e4 * v.price) / 1e12,
    'est.mul': (v) => (v.price * v.qty) / 1e4,
    'est.pct_of': (v) => (v.base * v.p) / 100,
    'est.fx_div': (v) => (v.w * 1e8) / v.r / 1e6,
    'est.per_share': (v) => (v.ni * 1e8) / (v.sh * 1e4),
    'est.pow': (v) => Math.pow(1 + v.r / 100, v.n),
  };
  const solveKey = (p) => `${p.skill}.${p.type.replace(/^(f2k|k2f)_(usd|jpy|eur)$/, '$1')}`;

  const GLOSS = [
    ['PER', /PER\(/],
    ['PBR', /PBR\(/],
    ['ROE', /ROE\(/],
    ['EPS', /EPS\(/],
    ['EBITDA', /EBITDA\(/],
    ['EV', /EV\(/],
    ['CAGR', /CAGR\(/],
    ['bp', /bp\(/],
    ['%p', /%p\(퍼센트포인트\)|퍼센트포인트/],
  ];
  const BAD_JOSA = /(원|엔|만|억|조)(는|를|가|와|로)(?=[\s?.,]|$)|(러|로|%)(은|을|이|으로)(?=[\s?.,]|$)/;
  /** 문장 검사. 돌려주는 것은 문제 목록(빈 목록이면 통과). */
  function lint(p) {
    const out = [];
    const q = p.q;
    if (/[—–→←⇒…]/.test(q + p.note + p.why)) out.push('금지 문자');
    if (!q.endsWith('?')) out.push('물음표로 끝나지 않음');
    const asks = (q.match(/몇|얼마/g) || []).length;
    if (p.form ? asks !== 0 || !q.endsWith('쓰면?') : asks !== 1) out.push('묻는 말이 하나가 아님');
    if (q.length > 120) out.push('문장이 김 ' + q.length);
    if (/  /.test(q)) out.push('빈칸 두 개');
    if (/\d{5,}/.test(q.replace(/\d{1,3}(,\d{3})+/g, ''))) out.push('쉼표 없는 큰 수');
    if (BAD_JOSA.test(q)) out.push('조사 ' + q.match(BAD_JOSA)[0]);
    for (const [ac, re] of GLOSS) {
      const has = ac === 'EV' ? /EV(?!\w)/.test(q.replace(/EV\/EBITDA/g, 'X')) || /EV\(/.test(q) : q.includes(ac);
      if (has && !re.test(q)) out.push('약어 설명 없음 ' + ac);
    }
    if (p.input === 'num' && p.unit && !q.includes('몇 ' + p.unit)) out.push('단위가 문장에 없음 ' + p.unit);
    if (p.input === 'kr' && !p.form && p.unit && !q.includes('몇 ' + p.unit)) out.push('단위가 문장에 없음 ' + p.unit);
    if (p.form && !q.includes('조, 억, 만 단위')) out.push('끊어 쓰기 지시 없음');
    if (p.dp != null && !/반올림/.test(p.note)) out.push('반올림 안내 없음');
    if (p.dp == null && /반올림/.test(p.note)) out.push('필요 없는 반올림 안내');
    if (p.tol && !/±/.test(p.note)) out.push('허용 오차 안내 없음');
    if (p.tol && !/약 몇/.test(q)) out.push('어림 문제에 약이 없음');
    if (!p.tol && /약 몇/.test(q)) out.push('정확한 문제에 약');
    if (p.dp != null && nearHalf(p.raw, p.dp)) out.push('반올림 경계');
    if (!p.neg && p.answer < 0) out.push('음수 답');
    if (!Number.isFinite(p.answer) || Math.abs(p.answer) > 9e15) out.push('답 범위');
    if (p.answer === 0) out.push('답이 0');
    return out;
  }

  function selfTest(o = {}) {
    const log = o.log || (() => {});
    const PER = o.per || 2000;
    let fail = 0;
    const bad = (msg) => {
      if (fail < 40) log('  실패: ' + msg);
      fail++;
    };
    const t0 = Date.now();

    // 1) 표기 왕복
    const R = makeRng('fmt');
    for (let i = 0; i < 20000; i++) {
      const d = R.int(1, 16);
      let n = R.int(0, 9);
      for (let k = 1; k < d; k++) n = n * 10 + R.int(0, 9);
      if (R.chance(0.3)) n = Math.round(n / 1e4) * 1e4;
      if (!Number.isSafeInteger(n)) continue;
      const a = parseKR(fmtKR(n));
      if (!a || a.value !== n || (n > 0 && !a.canonical)) bad(`fmtKR 왕복 ${n} ${fmtKR(n)}`);
      const b = parseKR(fmtKR(n, { comma: true, space: false }));
      if (!b || b.value !== n) bad(`fmtKR 쉼표 왕복 ${n}`);
      if (Number(fmtNum(n).replace(/,/g, '')) !== n) bad(`fmtNum 왕복 ${n}`);
      if (n >= 1e6) {
        const m = roundSig(n, R.int(1, 4));
        if (m >= 1e6 && m < 1e15 && parseEN(fmtEN(m)) !== m) bad(`fmtEN 왕복 ${m} ${fmtEN(m)} ${parseEN(fmtEN(m))}`);
      }
    }
    if (fmtKR(312323425321) !== '3123억 2342만 5321') bad('예시 312,323,425,321');
    if (fmtKR(1e8) !== '1억') bad('1억');
    if (parseEN('100 million') !== 1e8) bad('1억 = 100 million');
    if (fmtEN(1e8) !== '100 million') bad('1억 표기');
    if (parseKR('31232342만5321').canonical) bad('끊어 쓰기 검사');
    if (parseKR('3억5조') !== null) bad('단위 순서 검사');
    if (parseKR('0.5조').value !== 5e11) bad('소수 조');

    // 2) 분야마다 2,000문제: 독립 계산, 채점, 문장
    const stats = {};
    for (const S of SKILLS) {
      const st = (stats[S.id] = { n: 0, distinct: new Set(), lint: 0 });
      for (let i = 0; i < PER; i++) {
        const lv = (i % S.levels.length) + 1;
        const types = S.levels[lv - 1].types;
        const t = types[i % types.length];
        const p = makeProblem(S.id, lv, t, `test|${i}`);
        st.n++;
        st.distinct.add(p.q);
        const key = solveKey(p);
        const fn = SOLVE[key];
        if (!fn) {
          bad(`풀이 없음 ${key}`);
          continue;
        }
        const raw = fn(p.vars);
        if (Math.abs(raw - p.raw) > 1e-6 * Math.max(1, Math.abs(raw))) bad(`독립 계산 다름 ${key} ${raw} ${p.raw} | ${p.q}`);
        if (p.dp != null) {
          if (roundTo(raw, p.dp) !== p.answer) bad(`반올림 다름 ${key} ${raw} ${p.answer}`);
        } else if (!p.tol && Math.abs(raw - p.answer) > 1e-9 * Math.max(1, Math.abs(raw))) bad(`정확한 답 다름 ${key}`);
        if (!p.tol && !p.dp && p.input === 'kr' && Math.round(p.answer) !== p.answer) bad(`한글 단위 답이 정수가 아님 ${key} ${p.answer}`);
        // 채점: 정답은 맞고, 한 칸 어긋난 답은 틀린다
        const c = check(p, p.typed);
        if (!c.ok) bad(`정답이 틀림 ${key} "${p.typed}" ${c.reason} | ${p.q}`);
        if (p.input === 'kr' || p.form) {
          const sp = check(p, p.form ? fmtKR(p.answer, { comma: true }) : fmtNum(p.answer));
          if (!sp.ok) bad(`쉼표와 띄어쓰기 답이 틀림 ${key}`);
        }
        if (p.tol) {
          const lim = p.tol.rel != null ? Math.abs(p.raw) * p.tol.rel : p.tol.abs;
          if (!check(p, String(p.raw + lim * 0.9)).ok) bad(`허용 오차 안이 틀림 ${key}`);
          if (check(p, String(p.raw + lim * 1.3)).ok) bad(`허용 오차 밖이 맞음 ${key}`);
        } else {
          const stepv = p.dp != null ? Math.pow(10, -p.dp) : Number.isInteger(p.answer) ? 1 : Math.pow(10, -((String(p.answer).split('.')[1] || '').length));
          const off = clean(p.answer + stepv);
          if (check(p, p.input === 'kr' && p.form ? fmtKR(off, { space: false }) : String(off)).ok) bad(`한 칸 어긋난 답이 맞음 ${key} ${off}`);
          if (p.form && check(p, String(p.answer)).ok && p.answer >= 1e4) bad(`끊어 쓰지 않은 답이 맞음 ${key}`);
        }
        // 보여 주는 정답이 다시 읽힌다
        const shownNum = p.show.replace(/^약 /, '').replace(new RegExp(joinUnit(p.unit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '');
        const back = p.form ? parseKR(shownNum) && parseKR(shownNum).value : Number(shownNum.replace(/,/g, ''));
        if (!p.tol && back !== p.answer) bad(`보이는 정답이 다름 ${key} ${p.show}`);
        const issues = lint(p);
        if (issues.length) {
          st.lint++;
          bad(`문장 ${key} [${issues.join(', ')}] ${p.q} / ${p.note}`);
        }
      }
    }
    // 3) 같은 씨앗은 같은 세트, 세트마다 유형 묶음은 같다
    for (const S of SKILLS) {
      for (let lv = 1; lv <= S.levels.length; lv++) {
        const a = JSON.stringify(makeSet(S.id, lv, '2026-11-21'));
        const b = JSON.stringify(makeSet(S.id, lv, '2026-11-21'));
        if (a !== b) bad(`세트가 매번 다름 ${S.id} ${lv}`);
        const want = S.levels[lv - 1].types.slice().sort().join();
        for (const day of ['2026-11-22', '2026-12-01', '2027-01-15']) {
          const set = makeSet(S.id, lv, day);
          if (set.map((p) => p.type).sort().join() !== want) bad(`유형 묶음 다름 ${S.id} ${lv}`);
          if (new Set(set.map((p) => p.q)).size !== set.length) bad(`세트 안 중복 ${S.id} ${lv}`);
        }
      }
    }
    // 4) 하루 두 분야: 한 주에 분야마다 두 번
    const cnt = {};
    for (let d = 15; d < 22; d++) dailyPair(`2026-11-${d}`).forEach((k) => (cnt[k] = (cnt[k] || 0) + 1));
    if (ORDER.some((k) => cnt[k] !== 2)) bad('하루 두 분야 순환 ' + JSON.stringify(cnt));
    // 5) 수준 규칙
    const ss = (lv, ok, med, n = 6) => ({ k: 'fx', lv, n, ok, med });
    if (judge('fx', 2, [ss(2, 6, 10), ss(2, 6, 11), ss(2, 5, 12)]).change !== 1) bad('올림 규칙');
    if (judge('fx', 2, [ss(2, 6, 10), ss(2, 6, 30), ss(2, 6, 25)]).change !== 0) bad('느리면 그대로');
    if (judge('fx', 2, [ss(1, 6, 5), ss(2, 6, 10), ss(2, 6, 10)]).change !== 0) bad('이 수준 3세트 전에는 그대로');
    if (judge('fx', 2, [ss(2, 3, 10), ss(2, 2, 12)]).change !== -1) bad('내림 규칙');
    if (judge('fx', 1, [ss(1, 1, 10), ss(1, 2, 12)]).change !== 0) bad('1 아래로 내려가지 않음');
    const sm = summarize([{ ms: 8200, ok: true }, { ms: 12000, ok: true }, { ms: 3000, ok: false }, { ms: 10100, ok: true }]);
    if (sm.med !== 10.1 || sm.best !== 8.2 || sm.ok !== 3 || sm.n !== 4) bad('세트 요약 ' + JSON.stringify(sm));

    for (const S of SKILLS) log(`  ${S.name.padEnd(8, ' ')} ${stats[S.id].n}문제, 서로 다른 문제 ${stats[S.id].distinct.size}, 문장 경고 ${stats[S.id].lint}`);
    log(fail ? `실패 ${fail}건` : `통과 (${Date.now() - t0}ms)`);
    return fail === 0;
  }

  return {
    SKILLS,
    SKILL,
    ORDER,
    SET_SIZE,
    RULE,
    REASON,
    makeRng,
    makeProblem,
    makeSet,
    check,
    summarize,
    judge,
    personalBest,
    dailyPair,
    median,
    fmtNum,
    fmtKR,
    parseKR,
    fmtEN,
    parseEN,
    group4,
    roundTo,
    roundSig,
    lint,
    selfTest,
  };
});
