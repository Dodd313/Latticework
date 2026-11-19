// 2차 시안 공통 도구. ../shared.js 의 ML 위에 얹는다.
(function () {
  const LW = (window.LW = {});

  LW.icon = {
    bolt: (s = 16, c = 'currentColor') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M13.2 2.5L4.8 13.4h6.1l-1.1 8.1 8.4-10.9h-6.1z" fill="${c}"/></svg>`,
    fire: (s = 16, c = 'currentColor') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M12.4 2.2c.6 3.3 4.9 5.4 4.9 10.6a5.3 5.3 0 0 1-10.6 0c0-2.3 1.1-3.9 2.3-5 0 2.1.9 3.2 2 3.4-.4-3 .2-6.3 1.4-9z" fill="${c}"/></svg>`,
    close: (s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
    check: (s = 24, c = '#fff', w = 3) => `<svg class="chk" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    x: (s = 24, c = '#fff', w = 3) => `<svg class="xx" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/></svg>`,
    book: (s = 22, c = 'currentColor') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" fill="${c}"/></svg>`,
  };

  /** Latticework 표식: 네모 안의 3x3 격자. */
  LW.mark = (s = 64, c = '#191f28', w = 2.4) => {
    const p = (v) => (v / 3) * 48 + 8;
    let d = '';
    for (let i = 0; i < 4; i++) d += `M${p(i)} 8V56M8 ${p(i)}H56`;
    return `<svg class="lwmark" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true"><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="square" fill="none"/></svg>`;
  };

  /** 폭죽. 기쁜 순간에만 쓴다(레벨 업, 연속 기록 고비). */
  LW.confetti = (host, x, y, n = 44, spread = 1) => {
    if (ML.reduce) return;
    const colors = ['#3182f6', '#12b76a', '#ffb020', '#ff7a1a', '#7b61ff', '#f04452'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      const w = 5 + Math.random() * 4;
      Object.assign(el.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: w * (1.4 + Math.random()) + 'px', borderRadius: '2px', background: colors[i % colors.length], zIndex: 80, pointerEvents: 'none' });
      host.append(el);
      const ang = (-90 + (Math.random() - 0.5) * 150 * spread) * (Math.PI / 180);
      const v = 260 + Math.random() * 320;
      const vx = Math.cos(ang) * v;
      const vy = Math.sin(ang) * v;
      const g = 900;
      const T = 1.3 + Math.random() * 0.5;
      const rot = (Math.random() - 0.5) * 1080;
      const kf = [];
      for (let k = 0; k <= 8; k++) {
        const t = (T * k) / 8;
        const drag = 1 - 0.35 * (k / 8);
        kf.push({ transform: `translate(${vx * t * drag}px, ${vy * t * drag + 0.5 * g * t * t}px) rotate(${rot * (k / 8)}deg)`, opacity: k < 6 ? 1 : 1 - (k - 5) / 3 });
      }
      const an = el.animate(kf, { duration: T * 1000, easing: 'linear', fill: 'both' });
      an.playbackRate = ML.rate;
      an.finished.then(() => el.remove()).catch(() => {});
    }
  };

  /** 숫자 굴리기를 위한 자리. */
  LW.pos = (el, host) => {
    const a = el.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height, cx: a.left - b.left + a.width / 2, cy: a.top - b.top + a.height / 2 };
  };

  /** 누름: 0.96배로 들어가고 튕기며 돌아온다. */
  LW.press = (el, s = 0.96) => {
    const cur = () => (getComputedStyle(el).transform === 'none' ? 'scale(1)' : getComputedStyle(el).transform);
    el.addEventListener('pointerdown', () => ML.a(el, [{ transform: cur() }, { transform: `scale(${s})` }], { duration: 90, easing: ML.ease.out }));
    const up = () => ML.a(el, [{ transform: cur() }, { transform: 'scale(1)' }], { duration: 420, easing: ML.ease.spring });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, up));
  };
})();
