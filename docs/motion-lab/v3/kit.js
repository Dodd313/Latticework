// 3차 시안 공통 도구. ../shared.js(ML), ../v2/kit.js(LW), springs.js(TDS_SPRING) 다음에 읽는다.
(function () {
  const S = window.TDS_SPRING;
  const K = (window.K = window.K3 = {});

  /** Toss 스프링으로 움직이기. name: quick, medium, bounce, basic, rapid, large, small, slow */
  K.spring = (el, kf, name = 'quick', o = {}) => ML.a(el, kf, Object.assign({ duration: S[name].ms, easing: S[name].ease }, o));

  /** 누름 상태. 단추와 선택지에 .down 을 붙였다 뗀다. */
  K.press = (el, onTbtnScale = true) => {
    const isT = el.classList.contains('tbtn');
    el.addEventListener('pointerdown', () => {
      if (el.classList.contains('off')) return;
      el.classList.add('down');
      if (isT && onTbtnScale) K.spring(el, [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }], 'quick');
    });
    const up = () => {
      if (!el.classList.contains('down')) return;
      el.classList.remove('down');
      if (isT && onTbtnScale) K.spring(el, [{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], 'quick');
    };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => el.addEventListener(e, up));
  };

  const OUTER = 'M52 6C60 26 84 40 87 70C90 99 72 116 50 116C28 116 11 100 13 74C15 54 27 44 33 30C38 41 42 47 47 50C46 34 45 20 52 6Z';
  const INNER = 'M51 50C57 64 71 74 71 91C71 106 62 113 50 113C38 113 29 105 29 92C29 80 37 73 41 63C44 71 47 75 50 76C49 66 48 58 51 50Z';
  const CORE = 'M50 84C55 91 60 96 60 102C60 108 55 111 50 111C45 111 40 108 40 103C40 97 45 91 50 84Z';

  /** 불꽃. 꺼진 불꽃과 켜진 불꽃을 겹쳐 두고, 켜질 때 아래에서 위로 드러낸다. */
  K.flame = (size = 120, lit = true) => {
    const w = size * (100 / 120);
    const svg = (cls, o, i, c, hl) => `<svg class="${cls}" viewBox="0 0 100 120" width="${w}" height="${size}" aria-hidden="true" style="position:absolute;inset:0;overflow:visible">
      <path class="out" d="${OUTER}" fill="${o}"/>${hl ? '<path d="M29 62C24 74 24 88 31 98" stroke="rgba(255,255,255,.38)" stroke-width="6" stroke-linecap="round" fill="none"/>' : ''}
      <path class="in" d="${INNER}" fill="${i}"/>${c ? `<path class="core" d="${CORE}" fill="${c}"/>` : ''}</svg>`;
    return `<span class="flame" style="position:relative;display:inline-block;width:${w}px;height:${size}px">
      ${svg('unlit', 'var(--grey300)', 'var(--grey200)', '', false)}
      <span class="litw" style="position:absolute;inset:-20% -20% 0 -20%;clip-path:${lit ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)'}"><span style="position:absolute;left:14.2857%;top:16.6667%;width:${w}px;height:${size}px">${svg('lit', 'var(--orange500)', 'var(--yellow400)', 'var(--yellow50)', true)}</span></span></span>`;
  };

  /** 불꽃이 살아 있게: 안쪽 불이 위아래로, 바깥 불이 좌우로 아주 조금 흔들린다. */
  K.flicker = (fl) => {
    fl.querySelectorAll('.lit .in, .lit .core').forEach((p, k) => {
      p.style.transformBox = 'fill-box';
      p.style.transformOrigin = '50% 100%';
      ML.a(p, [{ transform: 'scale(1,1)' }, { transform: `scale(${k ? 0.92 : 0.96},${k ? 1.1 : 1.06})` }, { transform: 'scale(1.02,.97)' }, { transform: 'scale(1,1)' }], { duration: 1100 + k * 260, iterations: Infinity, easing: 'ease-in-out', fill: 'none' });
    });
    const o = fl.querySelector('.lit .out');
    o.style.transformBox = 'fill-box';
    o.style.transformOrigin = '50% 100%';
    ML.a(o, [{ transform: 'skewX(0) scaleY(1)' }, { transform: 'skewX(-2deg) scaleY(1.02)' }, { transform: 'skewX(1.5deg) scaleY(.99)' }, { transform: 'skewX(0) scaleY(1)' }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out', fill: 'none' });
  };

  /** 불 붙이기: 작게 움츠렸다가 튀어 오르며 아래에서 위로 불이 차오른다. */
  K.ignite = (fl, delay = 0) => {
    const litw = fl.querySelector('.litw');
    K.spring(fl, [{ transform: 'scale(1)' }, { transform: 'scale(.86)' }], 'quick', { delay });
    ML.a(litw, [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, delay: delay + 160, easing: ML.ease.out });
    K.spring(fl, [{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], 'bounce', { delay: delay + 200 });
    setTimeout(() => K.flicker(fl), (delay + 600) / ML.rate);
  };

  /** 불티: 불꽃 위로 작은 점이 떠오르며 사라진다. */
  K.embers = (host, x, y, n = 10, spread = 60) => {
    if (ML.reduce) return;
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i');
      const s = 4 + Math.random() * 5;
      Object.assign(e.style, { position: 'absolute', left: x + (Math.random() - 0.5) * spread + 'px', top: y + 'px', width: s + 'px', height: s + 'px', borderRadius: '50%', background: i % 3 ? 'var(--orange400)' : 'var(--yellow400)', zIndex: 5, pointerEvents: 'none' });
      host.append(e);
      const dx = (Math.random() - 0.5) * 50;
      const dy = -80 - Math.random() * 90;
      ML.a(e, [{ transform: 'translate(0,0) scale(1)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 }], { duration: 900 + Math.random() * 700, delay: Math.random() * 500, easing: 'cubic-bezier(.2,.6,.4,1)' }).finished.then(() => e.remove()).catch(() => {});
    }
  };

  K.check = (s = 16, c = '#fff', w = 3) => `<svg class="chk" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  K.x = (s = 16, c = '#fff', w = 3) => `<svg class="xx" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/></svg>`;
  K.bolt = (s = 18, c = 'var(--yellow500)') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M13.2 2.5L4.8 13.4h6.1l-1.1 8.1 8.4-10.9h-6.1z" fill="${c}"/></svg>`;
  K.flag = (s = 16, c = 'currentColor') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M6 21V4h10l-1.6 3.5L16 11H8v10z" fill="${c}"/></svg>`;
  K.lock = (s = 14, c = 'var(--grey400)') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" fill="${c}"/></svg>`;
  K.note = (s = 22, c = 'currentColor') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 7v1.8h8V10zm0 4v1.8h8V14zm0-8v1.8h5V6z" fill="${c}"/></svg>`;
  K.close = (s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
  K.chev = (s = 16, c = 'var(--grey400)') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  K.smallFlame = (s = 18, lit = true) => `<svg viewBox="0 0 100 120" width="${s * 0.83}" height="${s}" aria-hidden="true"><path d="${OUTER}" fill="${lit ? 'var(--orange500)' : 'var(--grey300)'}"/><path d="${INNER}" fill="${lit ? 'var(--yellow400)' : 'var(--grey200)'}"/></svg>`;

  /** 폭죽 색은 Toss 팔레트에서. */
  K.confetti = (host, x, y, n, spread) => LW.confetti(host, x, y, n, spread);
})();
