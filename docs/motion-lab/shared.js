// Motion Lab 공통 도구. 모든 움직임은 Web Animations API 로 만들어 "느리게" 단추로 함께 늦출 수 있다.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ML = (window.ML = { rate: 1, mode: 'new', reduce });

  // 쓰는 곡선은 다섯 개뿐이다.
  ML.ease = {
    out: 'cubic-bezier(.22,1,.36,1)', // 들어오는 것, 대부분의 움직임
    in: 'cubic-bezier(.55,0,1,.45)', // 나가는 것
    inOut: 'cubic-bezier(.65,0,.35,1)', // 자리를 옮기는 것
    sheet: 'cubic-bezier(.32,.72,0,1)', // 화면 전환, 아이폰 시트와 같은 결
    spring: 'linear(0, .009, .035 2.1%, .141 4.4%, .723 12.9%, .938 16.7%, 1.017 19.4%, 1.067, 1.077 24.6%, 1.067 27.3%, 1.019 34.4%, .996 39.4%, .991 45.4%, 1.001 61.6%, 1)',
  };

  /** 한 요소 움직이기. 끝난 뒤 마지막 모습을 그대로 남긴다. */
  ML.a = (el, kf, o = {}) => {
    if (!el) return null;
    const opts = Object.assign({ fill: 'both', easing: ML.ease.out, duration: 240 }, o);
    if (reduce) {
      opts.duration = 1;
      opts.delay = 0;
    }
    const an = el.animate(kf, opts);
    an.playbackRate = ML.rate;
    return an;
  };

  /** 여러 요소를 차례로. step 은 간격(ms). */
  ML.stagger = (els, kf, o = {}, step = 40) => Array.from(els).map((el, i) => ML.a(el, kf, Object.assign({}, o, { delay: (o.delay || 0) + i * step })));

  ML.wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms / ML.rate));
  ML.done = (an) => (an ? an.finished.catch(() => {}) : Promise.resolve());

  /** 요소에 걸린 움직임을 모두 지운다. 다시 그릴 때 쓴다. */
  ML.clear = (root) => root.querySelectorAll('*').forEach((el) => el.getAnimations().forEach((a) => a.cancel()));

  /** 숫자를 세며 올린다. */
  ML.count = (el, from, to, dur = 600, fmt = (v) => String(Math.round(v))) =>
    new Promise((resolve) => {
      if (reduce) {
        el.textContent = fmt(to);
        return resolve();
      }
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, ((now - t0) * ML.rate) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

  /** 글자 바꾸기: 옛 글자는 위로 빠지고 새 글자가 아래에서 올라온다. dir 이 -1 이면 반대로. */
  ML.roll = (el, text, dir = 1, dur = 320) => {
    const old = el.textContent;
    if (old === text) return Promise.resolve();
    el.classList.add('roll');
    el.innerHTML = '';
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = old;
    b.textContent = text;
    b.style.position = 'absolute';
    b.style.left = '0';
    b.style.top = '0';
    el.append(a, b);
    // 폭이 달라지면 새 글자 폭에 맞춘다.
    el.style.width = Math.max(a.offsetWidth, b.offsetWidth) + 'px';
    ML.a(a, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-dir * 100}%)`, opacity: 0 }], { duration: dur, easing: ML.ease.inOut });
    const an = ML.a(b, [{ transform: `translateY(${dir * 100}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: dur, easing: ML.ease.out, delay: 40 });
    return ML.done(an).then(() => {
      el.textContent = text;
      el.style.width = '';
    });
  };

  /** 높이 0 에서 내용 높이까지 펼친다. */
  ML.unfold = (fold, dur = 280) => {
    const inner = fold.firstElementChild;
    const h = inner.offsetHeight;
    const from = fold.offsetHeight;
    const an = ML.a(fold, [{ height: from + 'px' }, { height: h + 'px' }], { duration: dur, easing: ML.ease.out });
    return ML.done(an).then(() => {
      an.cancel();
      fold.style.height = 'auto';
    });
  };

  /** 체크 표시를 그린다. svg 안의 path 하나를 쓴다. */
  ML.drawCheck = (svg, delay = 0, color) => {
    const p = svg.querySelector('path');
    if (color) p.setAttribute('stroke', color);
    const L = p.getTotalLength();
    p.style.strokeDasharray = L;
    ML.a(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 260, delay, easing: ML.ease.out });
    return ML.a(svg, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 460, delay, easing: ML.ease.spring });
  };

  ML.checkSvg = (size = 20, stroke = '#fff', width = 2.4) =>
    `<svg class="chk" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  ML.backSvg = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** 위쪽 실험 막대: 목록, 다시 재생, 느리게, 현재 앱과 제안 비교. */
  ML.bar = ({ title, replay, modes = false, extra = [], home = 'index.html' }) => {
    const bar = document.createElement('div');
    bar.className = 'lab-bar';
    bar.innerHTML = `<a class="home" href="${home}">${ML.backSvg}목록</a><span class="title">${title}</span>`;
    const add = (label, fn, pressed) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', () => fn(b));
      bar.append(b);
      return b;
    };
    if (modes) {
      const cur = add('현재 앱', () => setMode('current'), false);
      const nw = add('제안', () => setMode('new'), true);
      const setMode = (m) => {
        ML.mode = m;
        cur.setAttribute('aria-pressed', String(m === 'current'));
        nw.setAttribute('aria-pressed', String(m === 'new'));
        replay && replay();
      };
    }
    extra.forEach(([label, fn]) => add(label, fn));
    add('느리게', (b) => {
      ML.rate = ML.rate === 1 ? 0.25 : 1;
      b.setAttribute('aria-pressed', String(ML.rate !== 1));
      document.getAnimations().forEach((an) => (an.playbackRate = ML.rate));
    }, false);
    if (replay) add('다시 재생', () => replay());
    document.body.prepend(bar);
  };
})();
