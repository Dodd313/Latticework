// 4차 시안 공통. 불꽃은 직접 그리지 않고 Google Noto 애니메이션 이모지(CC BY 4.0)를 lottie-web 으로 재생한다.
(function () {
  const cache = {};
  const L = (window.LT = {});

  /** Lottie 하나를 붙인다. opts: loop, autoplay, speed */
  L.load = async (container, name, opts = {}) => {
    if (!cache[name]) cache[name] = fetch(`assets/${name}.json`).then((r) => r.json());
    const data = await cache[name];
    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: opts.loop ?? true,
      autoplay: opts.autoplay ?? true,
      animationData: JSON.parse(JSON.stringify(data)),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
    anim.setSpeed((opts.speed ?? 1) * ML.rate);
    return new Promise((res) => (anim.isLoaded ? res(anim) : anim.addEventListener('DOMLoaded', () => res(anim))));
  };

  /** 느리게 단추가 Lottie 에도 걸리게. */
  const all = [];
  const orig = L.load;
  L.load = async (...a) => {
    const an = await orig(...a);
    all.push(an);
    return an;
  };
  L.syncRate = () => all.forEach((a) => a.setSpeed(ML.rate));
  L.destroyAll = () => {
    all.forEach((a) => a.destroy());
    all.length = 0;
  };
})();
