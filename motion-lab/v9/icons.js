// Latti 아이콘 시안 여덟 가지. 100x100 칸 안에 직접 그린 SVG.
// 브라우저에서는 window.LattiIcons, Node 에서는 require('./icons.js') (icons/*.svg 를 쓸 때).
//
// LattiIcons.concepts                       시안 목록 (id, 이름, 생각, 움직임, 색 두 가지)
// LattiIcons.svg(id, { opt, mode, size, small, anim, round, file })
//   mode 'tile'  앱 아이콘 (바탕 + 표식), 'mark' 흰 바탕 위 표식 (시작 화면)
//   small        28px 안팎에서 쓰는 굵은 판 (가는 선과 잔점을 줄인다)
//   anim         움직임에 쓰는 SMIL 을 넣는다 (궤도)
//   round        모서리 22.4% (false 면 1024 원본처럼 꽉 찬 정사각형)
(function (root) {
  let seq = 0;
  const f = (n) => +n.toFixed(2);
  const pt = (cx, cy, r, deg) => [f(cx + r * Math.cos((deg * Math.PI) / 180)), f(cy + r * Math.sin((deg * Math.PI) / 180))];

  const B500 = '#3182f6';
  const W = '#ffffff';

  const concepts = [
    {
      id: 'knot',
      name: '세 고리',
      idea: '세 고리는 둘씩만 보면 서로 떨어져 있는데, 셋이 함께 있으면 풀리지 않아요. 여러 학문이 엮인 지식이에요.',
      motion: '숨 고르듯 120도씩 돌아요. 돌고 나도 같은 모양이에요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '세 가지 파랑', tile: { bg: W, fg: B500, a1: '#90c2ff', a2: '#1b64da', edge: true }, mark: { fg: B500, a1: '#90c2ff', a2: '#1b64da' } },
      ],
      draw(p, c) {
        const R = 15.5;
        const sw = c.small ? 8 : 6.5;
        const g = c.small ? 3.4 : 2.6;
        const cs = [[50, 40.6], [39.17, 59.35], [60.83, 59.35]];
        const col = [p.fg, p.a1 || p.fg, p.a2 || p.fg];
        const over = { 0: 2, 1: 0, 2: 1 }; // 고리 i 를 덮는 고리
        let defs = '';
        let body = '';
        cs.forEach(([x, y], i) => {
          const [ox, oy] = cs[over[i]];
          const m = `${c.uid}k${i}`;
          defs += `<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="${ox}" cy="${oy}" r="${R}" fill="none" stroke="#000" stroke-width="${f(sw + 2 * g)}"/></mask>`;
          body += `<circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${col[i]}" stroke-width="${sw}" mask="url(#${m})"/>`;
        });
        return { defs, body: `<g class="m-spin">${body}</g>` };
      },
    },
    {
      id: 'ell',
      name: '마디 L',
      idea: '다섯 마디를 이어 Latticework 의 L 을 세웠어요. 한 마디에서 다음 마디로 이어 가는 공부예요.',
      motion: '맨 위 마디부터 끝 마디까지 차례로 한 번씩 부풀어요. 신호가 지나가듯이요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '옅은 줄기', tile: { bg: B500, fg: W, a1: '#90c2ff' }, mark: { fg: B500, a1: '#90c2ff' } },
      ],
      draw(p, c) {
        const r = c.small ? 9 : 7.5;
        const sw = c.small ? 6.5 : 5;
        const X = [31, 52, 73];
        const Y = [27, 48, 69];
        const nodes = [[X[0], Y[0]], [X[0], Y[1]], [X[0], Y[2]], [X[1], Y[2]], [X[2], Y[2]]];
        const bar = p.a1 || p.fg;
        let body = `<path d="M${X[0]} ${Y[0]}V${Y[2]}H${X[2]}" fill="none" stroke="${bar}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
        nodes.forEach(([x, y], i) => (body += `<circle class="m-node" style="--i:${i}" cx="${x}" cy="${y}" r="${r}" fill="${p.fg}"/>`));
        return { defs: '', body };
      },
    },
    {
      id: 'window',
      name: '불 켜진 창',
      idea: '네 칸 창살 가운데 한 칸에만 불이 켜져 있어요. 누군가 지금 공부하고 있다는 표시예요.',
      motion: '불이 잠깐 꺼졌다 켜져요. 눈을 깜빡이는 것처럼요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '밤', tile: { bg: '#191f28', fg: W, a1: '#ffd158' }, mark: { fg: '#191f28', a1: '#ffc342' } },
      ],
      draw(p, c) {
        const sw = c.small ? 7.5 : 6;
        const lit = p.a1 || p.fg;
        const pane = `<path class="m-lit" d="M50 25H65A10 10 0 0 1 75 35V50H50Z" fill="${lit}"/>`;
        const frame = `<rect x="25" y="25" width="50" height="50" rx="10" fill="none" stroke="${p.fg}" stroke-width="${sw}"/><path d="M50 25V75M25 50H75" stroke="${p.fg}" stroke-width="${sw}"/>`;
        return { defs: '', body: pane + frame };
      },
    },
    {
      id: 'weave',
      name: '엮은 띠',
      idea: '비스듬한 띠 네 개가 한 번씩 위아래를 바꿔 지나가요. 정원의 격자 울타리, lattice 그 자체예요.',
      motion: '짜임이 살짝 조였다가 풀려요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '두 빛 띠', tile: { bg: B500, fg: W, a1: '#c9e2ff' }, mark: { fg: B500, a1: '#90c2ff' } },
      ],
      draw(p, c) {
        const bw = c.small ? 13 : 11;
        const g = c.small ? 3.2 : 2.6;
        const P = [39, 61];
        const lo = 26;
        const len = 48;
        const H = (y, e = 0) => ({ x: lo - e, y: y - bw / 2 - e, w: len + 2 * e, h: bw + 2 * e });
        const V = (x, e = 0) => ({ x: x - bw / 2 - e, y: lo - e, w: bw + 2 * e, h: len + 2 * e });
        const rect = (r, extra) => `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" rx="${f(bw / 2)}" ${extra}/>`;
        const bands = {
          h1: { r: H(P[0]), under: V(P[1], g), col: p.fg },
          h2: { r: H(P[1]), under: V(P[0], g), col: p.fg },
          v1: { r: V(P[0]), under: H(P[0], g), col: p.a1 || p.fg },
          v2: { r: V(P[1]), under: H(P[1], g), col: p.a1 || p.fg },
        };
        let defs = '';
        let body = '';
        Object.entries(bands).forEach(([k, b]) => {
          const m = `${c.uid}w${k}`;
          defs += `<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${rect(b.under, 'fill="#000"')}</mask>`;
          body += rect(b.r, `fill="${b.col}" mask="url(#${m})"`);
        });
        return { defs, body: `<g class="m-breath"><g transform="rotate(45 50 50)">${body}</g></g>` };
      },
    },
    {
      id: 'hex',
      name: '육각 상자',
      idea: '육각 격자의 한 칸에 세 줄을 그으면 상자가 돼요. 평면의 지식이 입체가 되는 순간이에요.',
      motion: '안쪽 세 줄이 60도씩 돌아, 위에서 본 상자와 아래에서 본 상자가 번갈아 보여요.',
      options: [
        { key: 'a', label: '선', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '면', tile: { bg: B500, fg: W, solid: true, f: ['#ffffff', '#c9e2ff', '#90c2ff'] }, mark: { fg: B500, solid: true, f: ['#90c2ff', '#3182f6', '#1b64da'] } },
      ],
      draw(p, c) {
        const C = [50, 51];
        const R = 27;
        const v = [0, 1, 2, 3, 4, 5].map((k) => pt(C[0], C[1], R, -90 + 60 * k));
        const P = (...a) => a.map(([x, y]) => `${x},${y}`).join(' ');
        if (p.solid) {
          const seam = p.seam || p.bg || '#fff';
          const sw = c.small ? 3.2 : 2.6;
          const faces = [
            [v[5], v[0], v[1], C],
            [C, v[1], v[2], v[3]],
            [v[5], C, v[3], v[4]],
          ];
          const cs = p.f;
          const body = faces
            .map((pts, i) => `<polygon class="m-face" style="--c0:${cs[i]};--c1:${cs[(i + 2) % 3]};--c2:${cs[(i + 1) % 3]}" points="${P(...pts)}" fill="${cs[i]}" stroke="${seam}" stroke-width="${sw}" stroke-linejoin="round"/>`)
            .join('');
          return { defs: '', body };
        }
        const sw = c.small ? 7 : 5.5;
        const hexagon = `<polygon points="${P(...v)}" fill="none" stroke="${p.fg}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        const y = `<g class="m-y"><path d="M${C[0]} ${C[1]}L${v[1][0]} ${v[1][1]}M${C[0]} ${C[1]}L${v[3][0]} ${v[3][1]}M${C[0]} ${C[1]}L${v[5][0]} ${v[5][1]}" stroke="${p.fg}" stroke-width="${sw}" stroke-linecap="round"/></g>`;
        return { defs: '', body: hexagon + y };
      },
    },
    {
      id: 'orbit',
      name: '궤도',
      idea: '한 개념 둘레를 다른 개념이 돌아요. 어제 배운 것이 오늘 배운 것 곁을 지나가요.',
      motion: '작은 점이 궤도를 따라 천천히 돌고, 큰 점 뒤로 숨었다 나와요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '밤하늘', tile: { bg: '#191f28', fg: W, a1: B500, a2: '#ffd158' }, mark: { fg: '#191f28', a1: B500, a2: '#ffc342' } },
      ],
      draw(p, c) {
        const pr = c.small ? 15.5 : 14;
        const rx = 34;
        const ry = 12.5;
        const sw = c.small ? 6 : 4.5;
        const sr = c.small ? 7.5 : 6;
        const g = c.small ? 3.2 : 3;
        const id = c.uid;
        const front = `M${50 - rx} 50A${rx} ${ry} 0 0 0 ${50 + rx} 50`;
        const loop = `M${50 + rx} 50A${rx} ${ry} 0 1 1 ${50 - rx} 50A${rx} ${ry} 0 1 1 ${50 + rx} 50`;
        const stat = [f(50 + rx * Math.cos((35 * Math.PI) / 180)), f(50 + ry * Math.sin((35 * Math.PI) / 180))];
        const defs =
          `<mask id="${id}o1" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#fff"/><circle cx="50" cy="50" r="${f(pr + g)}" fill="#000"/><rect x="-20" y="50" width="140" height="70" fill="#fff"/></mask>` +
          `<mask id="${id}o2" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#fff"/><path d="${front}" fill="none" stroke="#000" stroke-width="${f(sw + 2 * g)}"/></mask>` +
          `<clipPath id="${id}o3" clipPathUnits="userSpaceOnUse"><rect x="-20" y="50" width="140" height="70"/></clipPath>`;
        const sat = (extra) =>
          c.anim
            ? `<circle r="${sr}" fill="${p.a2 || p.fg}" ${extra}><animateMotion dur="7s" repeatCount="indefinite" path="${loop}"/></circle>`
            : `<circle cx="${stat[0]}" cy="${stat[1]}" r="${sr}" fill="${p.a2 || p.fg}" ${extra}/>`;
        const body =
          `<g transform="rotate(-24 50 50)">` +
          `<ellipse cx="50" cy="50" rx="${rx}" ry="${ry}" fill="none" stroke="${p.fg}" stroke-width="${sw}" mask="url(#${id}o1)"/>` +
          sat('') +
          `<circle cx="50" cy="50" r="${pr}" fill="${p.a1 || p.fg}" mask="url(#${id}o2)"/>` +
          `<g clip-path="url(#${id}o3)">${sat('')}</g>` +
          `</g>`;
        return { defs, body };
      },
    },
    {
      id: 'face',
      name: '두 눈',
      idea: '예전 3x3 격자에서 양옆 두 칸만 남아 눈이 됐어요. 격자가 처음으로 이쪽을 봐요.',
      motion: '가끔 두 눈을 깜빡여요. 말을 걸기 직전에요.',
      options: [
        { key: 'a', label: '두 칸만', tile: { bg: B500, fg: W }, mark: { fg: B500 } },
        { key: 'b', label: '흐린 격자', tile: { bg: B500, fg: W, a1: W, grid: 0.22 }, mark: { fg: B500, a1: B500, grid: 0.18 } },
      ],
      draw(p, c) {
        const grid = p.grid && !c.small;
        const cell = grid ? 17 : c.small ? 22 : 19;
        const step = grid ? 22.5 : c.small ? 18 : 17; // 눈 사이 거리의 절반
        const cy = grid ? 50 : 48;
        const rx = f(cell * 0.3);
        const o = 50 - step - cell / 2;
        let body = '';
        if (grid)
          for (let r = 0; r < 3; r++)
            for (let k = 0; k < 3; k++) {
              if (r === 1 && k !== 1) continue;
              body += `<rect x="${f(o + k * step)}" y="${f(o + r * step)}" width="${cell}" height="${cell}" rx="${rx}" fill="${p.a1 || p.fg}" opacity="${p.grid}"/>`;
            }
        body += `<g class="m-eyes">${[0, 2].map((k) => `<rect x="${f(o + k * step)}" y="${f(cy - cell / 2)}" width="${cell}" height="${cell}" rx="${rx}" fill="${p.fg}"/>`).join('')}</g>`;
        return { defs: '', body };
      },
    },
    {
      id: 'link',
      name: '이어 말하기',
      idea: '말풍선 안의 점 세 개가 선으로 이어져 있어요. 말을 거는 것과 개념을 잇는 것이 한 모양이에요.',
      motion: '말하는 중처럼 세 점이 차례로 커져요. 이어진 선을 따라 신호가 지나가요.',
      options: [
        { key: 'a', label: '파랑', tile: { bg: B500, fg: W, ink: B500 }, mark: { fg: B500, ink: W } },
        { key: 'b', label: '흰 바탕', tile: { bg: W, fg: B500, ink: W, edge: true }, mark: { fg: B500, ink: W } },
      ],
      draw(p, c) {
        const dr = c.small ? 6.5 : 5.5;
        const lw = c.small ? 3.6 : 3;
        const X = [35.5, 50, 64.5];
        const y = 46;
        const bubble =
          `<rect x="20" y="24" width="60" height="44" rx="21" fill="${p.fg}"/>` +
          `<path d="M31 60L25.5 76.5L47 66Z" fill="${p.fg}" stroke="${p.fg}" stroke-width="4" stroke-linejoin="round"/>`;
        const line = `<path d="M${X[0]} ${y}H${X[2]}" stroke="${p.ink}" stroke-width="${lw}" stroke-linecap="round"/>`;
        const dots = X.map((x, i) => `<circle class="m-dot" style="--i:${i}" cx="${x}" cy="${y}" r="${dr}" fill="${p.ink}"/>`).join('');
        return { defs: '', body: bubble + line + dots };
      },
    },
  ];

  // 지금 쓰는 3x3 칸 아이콘 (비교용)
  const current = {
    id: 'grid',
    name: '지금',
    draw(p) {
      const c = 22.7;
      const g = 5.7;
      const o = 50 - 1.5 * c - g;
      let body = '';
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) body += `<rect x="${f(o + k * (c + g))}" y="${f(o + r * (c + g))}" width="${c}" height="${c}" rx="${f(c * 0.3)}" fill="${p.fg}"/>`;
      return { defs: '', body };
    },
  };

  function bgFill(bg, uid) {
    if (bg && bg.startsWith('grad:')) {
      const [, a, b] = bg.split(':');
      return { defs: `<linearGradient id="${uid}g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`, fill: `url(#${uid}g)` };
    }
    return { defs: '', fill: bg };
  }

  function svg(id, o = {}) {
    const con = id === 'grid' ? current : concepts.find((x) => x.id === id);
    if (!con) throw new Error('no concept ' + id);
    const opt = id === 'grid' ? { tile: { bg: B500, fg: W }, mark: { fg: B500 } } : con.options.find((x) => x.key === (o.opt || 'a')) || con.options[0];
    const mode = o.mode || 'tile';
    const uid = `li${++seq}`;
    const pal = Object.assign({}, mode === 'tile' ? opt.tile : opt.mark);
    if (mode === 'mark') pal.seam = '#fff';
    const c = { uid, small: !!o.small, anim: !!o.anim };
    const art = con.draw(pal, c);
    let defs = art.defs;
    let bg = '';
    if (mode === 'tile') {
      const b = bgFill(pal.bg, uid);
      defs += b.defs;
      const rx = o.round === false ? 0 : 22.4;
      bg = `<rect width="100" height="100" rx="${rx}" fill="${b.fill}"/>`;
      if (pal.edge && o.round !== false) bg += `<rect x=".35" y=".35" width="99.3" height="99.3" rx="${rx - 0.35}" fill="none" stroke="#000" stroke-opacity=".08" stroke-width=".7"/>`;
    }
    const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
    const cls = o.cls ? ` class="${o.cls}"` : '';
    const head = o.file ? ' xmlns="http://www.w3.org/2000/svg"' : '';
    return `<svg${head} viewBox="0 0 100 100"${size}${cls} data-icon="${id}" role="img" aria-label="${con.name}">${defs ? `<defs>${defs}</defs>` : ''}${bg}${art.body}</svg>`;
  }

  const api = { concepts, current, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LattiIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
