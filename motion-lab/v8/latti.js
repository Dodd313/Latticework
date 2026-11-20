// Latti: 앱이 직접 말을 건네는 작은 기하 표식과 말풍선, 그리고 페르소나 문구 고르기.
// 브라우저에서는 window.Latti, Node 에서는 require('./latti.js') 로 쓴다 (아침 작업이 문구를 검사할 때).
//
// Latti.mount(el, { size, mood, shape: 'square'|'circle', side })
// Latti.say(el, text, { side, tone, size, float, stay, ms, mood })  말풍선이 스프링으로 나온다
// Latti.hush(el)                                                      말풍선을 거둔다
// Latti.mood(el, 'idle'|'happy'|'cheer'|'think'|'sleep')              칸이 움직여 표정을 만든다 (600ms 안)
// Latti.lines.load(...src) / use(json) / pick(situation, ctx, opts) / choose(...) / lint(text) / fill(t, ctx)
(function (root) {
  const hasDom = typeof document !== 'undefined';
  const reduce = hasDom && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OUT = 'cubic-bezier(.22,1,.36,1)';
  const IN = 'cubic-bezier(.55,0,1,.45)';
  const INOUT = 'cubic-bezier(.65,0,.35,1)';
  const SP = () => root.TDS_SPRING || {};
  const spring = (name, fb) => (SP()[name] ? SP()[name].ease : fb);
  const springMs = (name, fb) => (SP()[name] ? SP()[name].ms : fb);
  const BOUNCE = 'linear(0, .009, .035 2.1%, .141 4.4%, .723 12.9%, .938 16.7%, 1.017 19.4%, 1.067, 1.077 24.6%, 1.067 27.3%, 1.019 34.4%, .996 39.4%, .991 45.4%, 1.001 61.6%, 1)';
  const rate = () => (root.ML && root.ML.rate) || 1;

  function A(el, kf, o) {
    if (!el || !el.animate) return null;
    const opts = Object.assign({ duration: 240, easing: OUT, fill: 'none' }, o);
    if (reduce) {
      opts.duration = 1;
      opts.delay = 0;
    }
    const an = el.animate(kf, opts);
    an.playbackRate = rate();
    return an;
  }
  const done = (an) => (an ? an.finished.catch(() => {}) : Promise.resolve());

  /* ───────── 표식 ───────── */

  // 칸 번호: 0 1 2 / 3 4 5 / 6 7 8. 바깥 고리는 시계 방향으로 돈다.
  const RING = [0, 1, 2, 5, 8, 7, 6, 3];
  const ROW = (i) => (i / 3) | 0;
  const COL = (i) => i % 3;

  function mount(el, o = {}) {
    const size = o.size || 40;
    const shape = o.shape || 'square';
    const c = shape === 'circle' ? size * 0.18 : size * 0.227;
    const g = shape === 'circle' ? size * 0.05 : size * 0.057;
    el.classList.add('latti');
    el.dataset.side = o.side || 'right';
    const mark = document.createElement('span');
    mark.className = `lt-mark ${shape}`;
    mark.style.cssText = `--lt-s:${size}px;--lt-c:${c.toFixed(2)}px;--lt-g:${g.toFixed(2)}px`;
    mark.innerHTML = '<i></i>'.repeat(9);
    mark.dataset.mood = 'idle';
    el.querySelectorAll('.lt-mark, .lt-say').forEach((x) => x.remove());
    el.prepend(mark);
    el._lt = { mark, cells: [...mark.children], bubble: null, mood: 'idle', timer: 0, anims: [] };
    if (o.mood && o.mood !== 'idle') mood(el, o.mood, { instant: true });
    return el;
  }

  function stopCells(st) {
    st.anims.forEach((a) => a && a.cancel());
    st.anims = [];
  }

  /** 표정 바꾸기. 상태는 CSS(data-mood)가 들고, 움직임은 그 사이를 한 번 잇는다. */
  function mood(el, m, o = {}) {
    const st = el._lt;
    if (!st) return Promise.resolve();
    const prev = st.mood;
    st.mood = m;
    st.mark.dataset.mood = m;
    if (o.instant || reduce) return Promise.resolve();
    stopCells(st);
    const cells = st.cells;
    const push = (a) => (st.anims.push(a), a);
    let last = null;
    if (prev === 'sleep' && m !== 'sleep') {
      // 깨기: 납작했던 칸이 위에서부터 차례로 펴진다.
      cells.forEach((c, i) => (last = push(A(c, [{ transform: 'scaleY(.28)' }, { transform: 'scaleY(1)' }], { duration: 420, delay: ROW(i) * 50, easing: spring('medium', BOUNCE), fill: 'backwards' }))));
    }
    if (prev === 'think' && m !== 'think') {
      cells.forEach((c, i) => i !== 4 && push(A(c, [{ opacity: 0.42 }, { opacity: 1 }], { duration: 200, easing: 'ease' })));
    }
    if (m === 'happy') {
      // 왼쪽 위에서 오른쪽 아래로 한 번 물결.
      cells.forEach((c, i) => (last = push(A(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.24)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 300, delay: (ROW(i) + COL(i)) * 45, easing: INOUT }))));
    } else if (m === 'cheer') {
      // 몸이 한 번 움츠렸다 튀고, 칸은 가운데에서 바깥으로 부푼다.
      push(A(st.mark, [{ transform: 'scale(1)' }, { transform: 'scale(.9)', offset: 0.25 }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 560, easing: 'ease-out' }));
      cells.forEach((c, i) => {
        const ring = i === 4 ? 0 : i % 2 ? 1 : 2;
        last = push(A(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 320, delay: 120 + ring * 60, easing: INOUT }));
      });
    } else if (m === 'think') {
      // 바깥 고리가 시계 방향으로 한 칸씩 숨을 죽이고, 가운데만 남는다.
      RING.forEach((ci, k) => (last = push(A(cells[ci], [{ opacity: 1 }, { opacity: 0.42 }], { duration: 200, delay: k * 45, easing: 'ease', fill: 'backwards' }))));
    } else if (m === 'sleep') {
      cells.forEach((c, i) => (last = push(A(c, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.28)' }], { duration: 420, delay: ROW(i) * 60, easing: INOUT, fill: 'backwards' }))));
    }
    return done(last);
  }

  /** 말하기 전에 한 번 깜빡인다. 잠든 표정이면 하지 않는다. */
  function blink(el) {
    const st = el._lt;
    if (!st || reduce || st.mood === 'sleep') return;
    st.cells.forEach((c) => st.anims.push(A(c, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.18)', offset: 0.45 }, { transform: 'scaleY(1)' }], { duration: 200, easing: INOUT })));
  }

  const ORIGIN = { right: '0% 50%', left: '100% 50%', top: '50% 100%', bottom: '50% 0%' };

  /** 말풍선. 이미 떠 있으면 글자만 바꾼다. */
  function say(el, text, o = {}) {
    const st = el._lt;
    if (!st) return Promise.resolve();
    clearTimeout(st.timer);
    const side = o.side || el.dataset.side || 'right';
    el.dataset.side = side;
    let b = st.bubble;
    let p;
    if (b && b.isConnected && b.dataset.on === '1') {
      p = swap(b, text);
    } else {
      if (b) b.remove();
      b = document.createElement('span');
      b.className = ['lt-say', `at-${side}`, o.tone || 'grey', o.size || 'm', o.float ? 'float' : ''].join(' ').trim();
      b.innerHTML = '<span class="lt-t"></span>';
      b.firstChild.textContent = text;
      b.dataset.on = '1';
      st.bubble = b;
      el.append(b);
      b.style.transformOrigin = ORIGIN[side];
      A(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: o.delay || 0, easing: 'ease', fill: 'backwards' });
      p = done(A(b, [{ transform: 'scale(.55)' }, { transform: 'scale(1)' }], { duration: springMs('bounce', 520), delay: o.delay || 0, easing: spring('bounce', BOUNCE), fill: 'backwards' }));
    }
    if (o.mood) mood(el, o.mood);
    else blink(el);
    if (!o.stay) st.timer = setTimeout(() => hush(el), ((o.ms || 2200 + text.length * 70) + (o.delay || 0)) / rate());
    return p;
  }

  /** 떠 있는 말풍선의 글자만 바꾼다. 옛 글자는 위로 빠지고, 폭은 새 글자에 맞춰 줄거나 는다. */
  async function swap(b, text) {
    const t = b.firstChild;
    if (t.textContent === text) return;
    const w0 = b.offsetWidth;
    const h0 = b.offsetHeight;
    await done(A(t, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 120, easing: IN, fill: 'forwards' }));
    t.textContent = text;
    const w1 = b.offsetWidth;
    const h1 = b.offsetHeight;
    A(b, [{ width: w0 + 'px', height: h0 + 'px' }, { width: w1 + 'px', height: h1 + 'px' }], { duration: 260, easing: OUT });
    t.getAnimations().forEach((a) => a.cancel());
    return done(A(t, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, delay: 60, easing: OUT, fill: 'backwards' }));
  }

  function hush(el) {
    const st = el._lt;
    if (!st || !st.bubble) return Promise.resolve();
    clearTimeout(st.timer);
    const b = st.bubble;
    b.dataset.on = '0';
    st.bubble = null;
    return done(A(b, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 160, easing: IN, fill: 'forwards' })).then(() => b.remove());
  }

  /* ───────── 문구 ───────── */

  const lines = (function () {
    const RULES = { maxLen: 22, noRepeatDays: 3, todayBoost: 3, lowerTierShare: 0.3, sessionAvoid: 8 };
    let persona = null;
    let bank = [];
    let today = [];
    const recent = [];
    let memHist = {};
    const HKEY = 'latti.hist.v1';

    function add(j) {
      if (!j) return;
      if (j.persona) persona = j.persona;
      if (j.rules) Object.assign(RULES, j.rules);
      if (j.bank) bank = bank.concat(j.bank.map((l) => Object.assign({ src: 'bank' }, l)));
      if (j.today && j.today.lines) {
        const d = j.today.date;
        today = today.concat(j.today.lines.map((l) => Object.assign({ src: 'today', from: d, until: l.until || j.today.until || d }, l)));
      }
    }
    function use(...js) {
      bank = [];
      today = [];
      js.forEach(add);
      return api;
    }
    /** 여러 곳에서 읽어 합친다. 상시 문구(저장소)와 오늘 문구(아침 작업)를 따로 둘 수 있다. 못 읽은 곳은 건너뛴다. */
    async function load(...srcs) {
      const got = await Promise.all(srcs.map((s) => (typeof s === 'string' ? fetch(s, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : s)));
      use(...got.filter(Boolean));
      return got;
    }

    /* 기록: 어떤 줄을 언제 보였는지. 기기 안에만 남는다. */
    function hist() {
      try {
        if (typeof localStorage !== 'undefined') return JSON.parse(localStorage.getItem(HKEY) || '{}');
      } catch (e) {}
      return memHist;
    }
    function record(id, text) {
      const h = hist();
      const now = Date.now();
      h[id] = now;
      for (const k in h) if (now - h[k] > 30 * 864e5) delete h[k];
      memHist = h;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(HKEY, JSON.stringify(h));
      } catch (e) {}
      recent.push(text);
      while (recent.length > RULES.sessionAvoid) recent.shift();
    }
    function clear() {
      memHist = {};
      recent.length = 0;
      try {
        localStorage.removeItem(HKEY);
        Object.keys(sessionStorage).filter((k) => k.startsWith('latti.m.')).forEach((k) => sessionStorage.removeItem(k));
      } catch (e) {}
    }

    /* 상황에서 저절로 나오는 값 */
    const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    function derive(c0) {
      const c = Object.assign({}, c0);
      const now = c.now ? new Date(c.now) : new Date();
      if (c.hour == null) c.hour = now.getHours();
      if (!c.date) c.date = ymd(now);
      const h = c.hour;
      if (!c.part) c.part = h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 22 ? 'evening' : 'night';
      const wd = new Date(c.date + 'T12:00:00').getDay();
      if (!c.day) c.day = DAYS[wd];
      if (c.weekend == null) c.weekend = wd === 0 || wd === 6;
      if (c.acc == null && c.total > 0 && c.right != null) c.acc = Math.round((c.right / c.total) * 100);
      if (c.left == null && c.totalParts != null && c.doneParts != null) c.left = c.totalParts - c.doneParts;
      return c;
    }

    /* 조건: 3, ">=3", "3..9", "%5", "a|b" (또는), ">=10&%5" (그리고), true/false, 배열(모두) */
    function atom(a, cv) {
      const n = Number(cv);
      let m;
      if ((m = a.match(/^(>=|<=|!=|>|<|=)(-?\d+(?:\.\d+)?)$/))) {
        if (!Number.isFinite(n)) return false;
        const v = +m[2];
        return { '>=': n >= v, '<=': n <= v, '!=': n !== v, '>': n > v, '<': n < v, '=': n === v }[m[1]];
      }
      if ((m = a.match(/^(-?\d+)\.\.(-?\d+)$/))) return Number.isFinite(n) && n >= +m[1] && n <= +m[2];
      if ((m = a.match(/^%(\d+)$/))) return Number.isFinite(n) && n % +m[1] === 0;
      return String(cv) === a;
    }
    function test(v, cv) {
      if (Array.isArray(v)) return v.every((x) => test(x, cv));
      if (typeof v === 'boolean') return !!cv === v;
      if (cv === undefined || cv === null) return false;
      if (typeof v === 'number') return Number(cv) === v;
      return String(v).split('|').some((alt) => alt.split('&').every((x) => atom(x.trim(), cv)));
    }

    /* 조사: 앞말의 마지막 소리를 보고 고른다 */
    const PAIRS = [['을', '를'], ['이', '가'], ['은', '는'], ['과', '와'], ['으로', '로'], ['이에요', '예요'], ['이라', '라'], ['이랑', '랑'], ['이나', '나'], ['이죠', '죠']];
    function final(word) {
      const s = String(word);
      for (let i = s.length - 1; i >= 0; i--) {
        const ch = s[i];
        const code = ch.charCodeAt(0);
        if (code >= 0xac00 && code <= 0xd7a3) {
          const j = (code - 0xac00) % 28;
          return { has: j !== 0, rieul: j === 8 };
        }
        if (ch === '%') return { has: false, rieul: false }; // 퍼센트
        if (/[0-9]/.test(ch)) {
          const d = +ch;
          // 끝자리 0 은 십·백·천·만·영 모두 받침이 있다.
          return { has: [0, 1, 3, 6, 7, 8].includes(d), rieul: [1, 7, 8].includes(d) };
        }
        if (/[A-Za-z]/.test(ch)) {
          let k = i;
          while (k > 0 && /[A-Za-z]/.test(s[k - 1])) k--;
          const run = s.slice(k, i + 1);
          const acronym = run === run.toUpperCase();
          const L = ch.toLowerCase();
          if (acronym) return { has: 'lmnr'.includes(L), rieul: 'lr'.includes(L) }; // 엘 엠 엔 알
          if (run.toLowerCase().endsWith('ng')) return { has: true, rieul: false };
          return { has: 'lmn'.includes(L), rieul: L === 'l' }; // 영어 낱말은 어림값이다
        }
      }
      return { has: false, rieul: false };
    }
    function josa(word, p) {
      const pair = PAIRS.find((x) => x.includes(p));
      if (!pair) return p;
      const f = final(word);
      if (pair[0] === '으로') return f.has && !f.rieul ? '으로' : '로';
      return f.has ? pair[0] : pair[1];
    }
    const num = (v) => (Number.isInteger(v) ? (Math.abs(v) >= 10000 ? v.toLocaleString('ko-KR') : String(v)) : String(Math.round(v * 10) / 10));
    /** {key} 와 {key|조사} 를 채운다. 값이 하나라도 없으면 null. */
    function fill(t, c) {
      let ok = true;
      const out = t.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (_, k, p) => {
        const v = c[k];
        if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) {
          ok = false;
          return '';
        }
        const s = typeof v === 'number' ? num(v) : String(v);
        // 읽는 소리가 글자와 다른 이름(WACC 는 '왝')은 ctx 에 {key}Read 로 소리를 함께 준다.
        return p ? s + josa(c[k + 'Read'] || s, p) : s;
      });
      return ok ? out : null;
    }
    const len = (s) => [...s].length;

    /** 상황에 맞는 줄 하나를 고른다. { id, text, src, tier } 또는 null. */
    function choose(sit, ctx0 = {}, o = {}) {
      const mkey = o.moment ? 'latti.m.' + o.moment : null;
      if (mkey && !o.fresh) {
        try {
          const hit = sessionStorage.getItem(mkey);
          if (hit) return JSON.parse(hit);
        } catch (e) {}
      }
      const c = derive(ctx0);
      const H = hist();
      const now = o.now || Date.now();
      const rng = o.rng || Math.random;
      const pool = today.filter((l) => c.date >= l.from && c.date <= l.until).concat(bank);
      const cands = [];
      for (const l of pool) {
        const ss = Array.isArray(l.s) ? l.s : [l.s];
        if (!ss.includes(sit)) continue;
        if (l.when && !Object.keys(l.when).every((k) => test(l.when[k], c[k]))) continue;
        const text = fill(l.t, c);
        if (!text || len(text) > RULES.maxLen) continue;
        cands.push({ l, text, p: l.p || 0 });
      }
      if (!cands.length) return null;
      const maxP = Math.max(...cands.map((x) => x.p));
      const tier = cands.filter((x) => x.p >= maxP - 1);
      const cut = now - RULES.noRepeatDays * 864e5;
      const last = recent[recent.length - 1];
      let fresh = tier.filter((x) => !(H[x.l.id] > cut) && !recent.includes(x.text));
      if (!fresh.length) {
        // 다 최근에 보였다: 가장 오래전에 보인 두 줄 가운데서 고르되 바로 앞 줄은 피한다.
        const top = tier.filter((x) => x.p === maxP && x.text !== last);
        fresh = (top.length ? top : tier).slice().sort((a, b) => (H[a.l.id] || 0) - (H[b.l.id] || 0)).slice(0, 2);
      }
      const wOf = (x) => (x.l.w || 1) * (x.l.src === 'today' ? RULES.todayBoost : 1);
      const hi = fresh.filter((x) => x.p === maxP);
      const lo = fresh.filter((x) => x.p < maxP);
      const group = hi.length && lo.length ? (rng() < RULES.lowerTierShare ? lo : hi) : hi.length ? hi : lo;
      let r = rng() * group.reduce((s, x) => s + wOf(x), 0);
      let pick = group[group.length - 1];
      for (const x of group) if ((r -= wOf(x)) <= 0) { pick = x; break; }
      const res = { id: pick.l.id, text: pick.text, src: pick.l.src, tier: pick.p };
      if (!o.dry) record(pick.l.id, pick.text);
      if (mkey) {
        try {
          sessionStorage.setItem(mkey, JSON.stringify(res));
        } catch (e) {}
      }
      return res;
    }
    const pick = (sit, ctx, o) => {
      const r = choose(sit, ctx, o);
      return r ? r.text : null;
    };

    /** 문구 검사. 아침 작업이 새 줄을 쓰고 나서 돌린다. 빈 배열이면 통과. */
    function lint(t, o = {}) {
      const out = [];
      const plain = t.replace(/\{[^}]+\}/g, '');
      if (/더\s*풀기/.test(t)) out.push('금지어: 더 풀기');
      if (/[—–]/.test(t)) out.push('긴 줄표');
      if (/[→←⇒⇐↑↓➜]|->|=>/.test(t)) out.push('화살표');
      if ((t.match(/!/g) || []).length > 1) out.push('느낌표 둘 이상');
      if (/\p{Extended_Pictographic}/u.test(t)) out.push('이모지');
      if (!/(요|죠|까요|나요)[.!?]?$/.test(t.trim())) out.push('해요체 끝맺음 아님');
      if (/누르|눌러|탭하|스와이프|화면|버튼|아래쪽|위쪽|표시돼|의미해요|뜻해요/.test(plain)) out.push('화면 설명');
      if (/왜 안|안 왔|놓쳤|게을|실망/.test(plain)) out.push('죄책감');
      if (!o.allowLatin && /[A-Za-z]/.test(plain.replace(/Latticework|Latti/g, ''))) out.push('영어');
      if (!/\{/.test(t) && len(t) > RULES.maxLen) out.push(`${len(t)}자`);
      return out;
    }

    const api = {
      add,
      use,
      load,
      choose,
      pick,
      fill,
      josa,
      lint,
      derive,
      clear,
      rules: RULES,
      get persona() {
        return persona;
      },
      all: () => today.concat(bank),
      get bank() {
        return bank;
      },
      get today() {
        return today;
      },
    };
    return api;
  })();

  const Latti = { mount, say, hush, mood, blink, lines };
  if (typeof module === 'object' && module.exports) module.exports = Latti;
  else root.Latti = Latti;
})(typeof window !== 'undefined' ? window : globalThis);
