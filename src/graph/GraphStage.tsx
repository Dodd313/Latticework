// 지도 무대: 끌기, 두 손가락 확대, 휠, 누르기, 카메라 비행.
//
// 장면(GraphView)은 정해진 카메라 하나로만 그린다. 손을 움직이는 동안과 날아가는 동안에는 다시 그리지 않고,
// 장면을 담은 상자만 옮기고 늘린다(웹은 요소의 transform 을 직접 쓰거나 브라우저 움직임에 맡기고, 앱은 Animated).
// 손을 떼거나 비행이 끝나면 카메라를 한 번 정해(React 한 번) 그 카메라로 다시 그리고, 같은 장면에서 상자를 제자리로 돌린다.
// 배율이 바뀐 경우에는 예전 장면을 복사해 위에 두었다가 서서히 걷어 내, 점 크기와 이름이 바뀌는 순간이 튀지 않게 한다.
import React, { forwardRef, startTransition, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import { WEB, motionOff } from '../motion';
import { Cam, camTransform, clamp, flightOf, project, toWorld, zoomAt, bound, PNode } from './camera';
import { GraphView, GraphViewProps } from './GraphView';

export type FlyOpts = { ms?: number; min?: number; lin?: boolean; delay?: number; done?: () => void };
export type GraphStageHandle = {
  flyTo: (to: Cam, o?: FlyOpts) => void;
  jump: (to: Cam) => void;
  /** 지금 화면에 보이는 카메라(손을 움직이거나 날아가는 중이면 그 순간) */
  live: () => Cam;
  committed: () => Cam;
};

type Props = Omit<GraphViewProps, 'cam' | 'proj'> & {
  K0: number;
  initial: Cam;
  /** 누른 자리(무대 안 px)와 그 순간의 카메라 */
  onTap?: (px: number, py: number, cam: Cam) => void;
  /** 카메라를 정할 때마다(손을 뗀 뒤, 비행이 끝난 뒤) */
  onCommit?: (cam: Cam, proj: Map<string, PNode>) => void;
  interactive?: boolean;
};

const same = (a: Cam, b: Cam) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.k - b.k) < 1e-9;
const css = (s: { s: number; tx: number; ty: number }) => `translate(${s.tx.toFixed(2)}px, ${s.ty.toFixed(2)}px) scale(${s.s.toFixed(5)})`;

export const GraphStage = forwardRef<GraphStageHandle, Props>(function GraphStage(props, ref) {
  return WEB ? <StageWeb {...props} handle={ref} /> : <StageNative {...props} handle={ref} />;
});

type InnerProps = Props & { handle: React.ForwardedRef<GraphStageHandle> };

function useViewProps(p: InnerProps, cam: Cam, proj: Map<string, PNode>) {
  const { K0, initial, onTap, onCommit, interactive, handle, ...rest } = p;
  void K0;
  void initial;
  void onTap;
  void onCommit;
  void interactive;
  void handle;
  return { ...rest, cam, proj, K0: p.K0 };
}

// ─────────────────────────────────────────────────────────────
// 웹
// ─────────────────────────────────────────────────────────────

type Flight = { t0: number; delay: number; ms: number; at: (t: number) => Cam; to: Cam; ghost: HTMLElement | null; anims: Animation[]; landed: boolean; done?: () => void };

function StageWeb(p: InnerProps) {
  const { model: M, width: W, height: H, K0 } = p;
  const [cam, setCam] = useState<Cam>(p.initial);
  // scene: 지금 화면에 그려 둔 장면의 카메라, want: 마지막으로 정한 카메라, live: 지금 보이는 카메라
  const scene = useRef<Cam>(p.initial);
  const want = useRef<Cam>(p.initial);
  const live = useRef<Cam>(p.initial);
  const outer = useRef<any>(null);
  const inner = useRef<any>(null);
  const ghosts = useRef<any>(null);
  const flight = useRef<Flight | null>(null);
  const fadeGhost = useRef<HTMLElement | null>(null);
  const coast = useRef<{ id: number; vx: number; vy: number } | null>(null);
  const wheelT = useRef<any>(null);
  const pr = useRef(p);
  pr.current = p;
  const dims = useRef({ W, H, K0, M });
  dims.current = { W, H, K0, M };

  const proj = useMemo(() => project(M, cam, W, H, K0, p.dotScale ?? 1, p.mem), [M, cam, W, H, K0, p.dotScale, p.mem]);

  const el = () => inner.current as HTMLElement | null;
  const applyLive = () => {
    const e = el();
    if (!e) return;
    const { W: w, H: h } = dims.current;
    e.style.transform = same(live.current, scene.current) ? '' : css(camTransform(scene.current, live.current, w, h));
  };
  /** 지금 장면을 복사해 위에 둔다(정한 카메라로 다시 그리는 동안, 그리고 바뀌는 순간을 부드럽게 넘기는 데 쓴다) */
  const ghost = (): HTMLElement | null => {
    const e = el();
    const host = ghosts.current as HTMLElement | null;
    if (!e || !host) return null;
    const g = e.cloneNode(true) as HTMLElement;
    g.querySelectorAll('[data-n],[data-e],[data-l]').forEach((x) => {
      x.removeAttribute('data-n');
      x.removeAttribute('data-e');
      x.removeAttribute('data-l');
    });
    g.style.position = 'absolute';
    g.style.left = '0px';
    g.style.top = '0px';
    g.style.opacity = '';
    host.appendChild(g);
    return g;
  };
  /** 카메라를 정한다. 다시 그리기는 급하지 않은 일로(끊어 가며) 해, 누른 순간과 손을 뗀 순간에 화면이 멈추지 않게 한다 */
  const request = (c: Cam, urgent = false) => {
    want.current = c;
    const go = () => {
      const { W: w, H: h, K0: k0, M: m } = dims.current;
      pr.current.onCommit?.(c, project(m, c, w, h, k0, pr.current.dotScale ?? 1, pr.current.mem));
      setCam(c);
    };
    if (urgent) go();
    else startTransition(go);
  };
  const commit = (fade: boolean) => {
    const c = live.current;
    if (same(c, scene.current) && same(c, want.current)) {
      applyLive();
      return;
    }
    if (fade && !motionOff() && Math.abs(Math.log(c.k / scene.current.k)) > 0.015) {
      fadeGhost.current?.remove();
      fadeGhost.current = ghost();
    }
    request(c);
  };
  /** 비행과 미끄러짐을 멈추고, 그 순간 자리를 live 에 둔다 */
  const halt = () => {
    if (coast.current) {
      cancelAnimationFrame(coast.current.id);
      coast.current = null;
    }
    const f = flight.current;
    if (!f) return;
    flight.current = null;
    live.current = f.at(clamp((performance.now() - f.t0 - f.delay) / f.ms, 0, 1));
    f.anims.forEach((a) => {
      a.onfinish = null;
      a.cancel();
    });
    f.ghost?.remove();
    const e = el();
    if (e) e.style.opacity = '';
    applyLive();
  };
  const finish = (f: Flight) => {
    if (flight.current !== f) return;
    flight.current = null;
    // 장면 상자의 움직임만 걷는다(예전 장면 복사본은 사라지는 움직임이 끝나면 스스로 빠진다)
    const e = el();
    f.anims.forEach((a) => {
      if ((a.effect as KeyframeEffect | null)?.target === e) a.cancel();
    });
    live.current = f.to;
    applyLive();
    f.done?.();
  };
  /** 비행 중에 새 장면이 그려졌다: 그 장면을 같은 길에 올려 이어 날고, 예전 장면은 걷어 낸다 */
  const land = (f: Flight) => {
    const e = el();
    if (!e) return;
    f.landed = true;
    const { W: w, H: h } = dims.current;
    const n = Math.max(2, Math.ceil(f.ms / 16.67) + 1);
    const fi: Keyframe[] = [];
    for (let i = 0; i < n; i++) fi.push({ transform: css(camTransform(f.to, f.at(i / (n - 1)), w, h)) });
    e.style.transform = '';
    const now = performance.now();
    const a = e.animate(fi, { duration: f.ms, delay: f.delay, easing: 'linear', fill: 'both' });
    a.currentTime = now - f.t0;
    const wait = Math.max(0, f.t0 + f.delay + f.ms * 0.35 - now);
    const fin = e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: wait, easing: 'ease', fill: 'backwards' });
    e.style.opacity = '';
    f.anims.push(a, fin);
    if (f.ghost) {
      const g = f.ghost;
      const out = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: wait + 120, easing: 'ease', fill: 'forwards' });
      out.onfinish = () => g.remove();
      f.anims.push(out);
    }
    a.onfinish = () => finish(f);
  };

  // 정한 카메라로 다시 그린 직후(그리기 전): 날고 있으면 새 장면을 길에 올리고, 아니면 상자를 지금 자리로
  useLayoutEffect(() => {
    scene.current = cam;
    const f = flight.current;
    if (f && f.to === cam && !f.landed) {
      land(f);
      return;
    }
    applyLive();
    const g = fadeGhost.current;
    if (g) {
      fadeGhost.current = null;
      const a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease', fill: 'forwards' });
      a.onfinish = () => g.remove();
    }
  }, [cam]);

  const flyTo = useCallback((to: Cam, o: FlyOpts = {}) => {
    halt();
    const e = el();
    if (motionOff() || !e) {
      live.current = to;
      request(to, true);
      o.done?.();
      return;
    }
    const { W: w, H: h } = dims.current;
    const fl = flightOf(live.current, to, w, h, o);
    // 지금 장면의 복사본이 먼저 날아가고, 새 장면은 그려지는 대로 같은 길에 올라 넘겨받는다
    const g = ghost();
    const base = scene.current;
    const n = Math.max(2, Math.ceil(fl.ms / 16.67) + 1);
    const fg: Keyframe[] = [];
    for (let i = 0; i < n; i++) fg.push({ transform: css(camTransform(base, fl.at(i / (n - 1)), w, h)) });
    const f: Flight = { t0: performance.now(), delay: o.delay ?? 0, ms: fl.ms, at: fl.at, to, ghost: g, anims: [], landed: false, done: o.done };
    if (g) {
      f.anims.push(g.animate(fg, { duration: fl.ms, delay: f.delay, easing: 'linear', fill: 'both' }));
      e.style.opacity = '0';
    }
    flight.current = f;
    live.current = to;
    request(to);
  }, []);
  const jump = useCallback((to: Cam) => {
    halt();
    live.current = to;
    request(to, true);
  }, []);
  useImperativeHandle(p.handle, () => ({ flyTo, jump, live: () => (flight.current ? flight.current.at(clamp((performance.now() - flight.current.t0 - flight.current.delay) / flight.current.ms, 0, 1)) : live.current), committed: () => want.current }), []);

  // 손: 끌기, 두 손가락, 휠, 두 번 누르기
  useEffect(() => {
    const box = outer.current as HTMLElement | null;
    if (!box || p.interactive === false) return;
    box.style.touchAction = 'none';
    const ie = el();
    if (ie) ie.style.transformOrigin = '0 0';
    const ptrs = new Map<number, { x: number; y: number }>();
    let gest: any = null;
    let lastMv = 0;
    let vx = 0;
    let vy = 0;
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = box.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const D = () => dims.current;
    const down = (ev: PointerEvent) => {
      if (ev.button > 0) return;
      try {
        box.setPointerCapture(ev.pointerId);
      } catch {
        // 붙잡지 못해도 움직임은 받는다
      }
      halt();
      const q = local(ev);
      ptrs.set(ev.pointerId, q);
      if (ptrs.size === 1) gest = { mode: 'tap', start: q, last: q, t0: performance.now() };
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        gest = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    };
    const move = (ev: PointerEvent) => {
      if (!ptrs.has(ev.pointerId) || !gest) return;
      const q = local(ev);
      ptrs.set(ev.pointerId, q);
      const { W: w, H: h, K0: k0, M: m } = D();
      if (gest.mode === 'pinch' && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const wpt = toWorld(live.current, gest.m.x, gest.m.y, w, h);
        const k = live.current.k * (d / Math.max(1, gest.d));
        const c = bound({ x: wpt.x, y: wpt.y, k }, m, w, h, k0);
        live.current = bound({ x: wpt.x - (mid.x - w / 2) / c.k, y: wpt.y - (mid.y - h / 2) / c.k, k: c.k }, m, w, h, k0);
        gest.d = d;
        gest.m = mid;
        gest.zoomed = true;
        applyLive();
        return;
      }
      if (gest.mode === 'tap' && Math.hypot(q.x - gest.start.x, q.y - gest.start.y) > 6) {
        gest.mode = 'pan';
        box.style.cursor = 'grabbing';
      }
      if (gest.mode === 'pan') {
        const dx = q.x - gest.last.x;
        const dy = q.y - gest.last.y;
        const c = live.current;
        live.current = bound({ x: c.x - dx / c.k, y: c.y - dy / c.k, k: c.k }, m, w, h, k0);
        const now = performance.now();
        const dt = Math.max(8, now - lastMv);
        lastMv = now;
        vx = (dx / dt) * 16;
        vy = (dy / dt) * 16;
        applyLive();
      }
      gest.last = q;
    };
    const startCoast = () => {
      const step = () => {
        const s = coast.current;
        if (!s) return;
        const { W: w, H: h, K0: k0, M: m } = D();
        const c = live.current;
        live.current = bound({ x: c.x - s.vx / c.k, y: c.y - s.vy / c.k, k: c.k }, m, w, h, k0);
        s.vx *= 0.9;
        s.vy *= 0.9;
        applyLive();
        if (Math.hypot(s.vx, s.vy) < 0.15) {
          coast.current = null;
          commit(false);
          return;
        }
        s.id = requestAnimationFrame(step);
      };
      coast.current = { id: requestAnimationFrame(step), vx, vy };
    };
    const up = (ev: PointerEvent) => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      box.style.cursor = '';
      if (!gest) return;
      if (gest.mode === 'tap' && ptrs.size === 0) {
        gest = null;
        commit(false);
        const q = local(ev);
        pr.current.onTap?.(q.x, q.y, live.current);
        return;
      }
      if (ptrs.size === 1 && gest.mode === 'pinch') {
        const q = [...ptrs.values()][0];
        gest = { mode: 'pan', start: q, last: q, zoomed: true };
        return;
      }
      if (ptrs.size === 0) {
        const zoomed = !!gest.zoomed;
        const pan = gest.mode === 'pan';
        gest = null;
        if (pan && !zoomed && performance.now() - lastMv < 60 && Math.hypot(vx, vy) > 0.5 && !motionOff()) startCoast();
        else commit(zoomed);
      }
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      halt();
      const q = local(ev);
      const { W: w, H: h, K0: k0, M: m } = D();
      live.current = zoomAt(live.current, q.x, q.y, Math.exp(-ev.deltaY * 0.0022), m, w, h, k0);
      applyLive();
      clearTimeout(wheelT.current);
      wheelT.current = setTimeout(() => commit(true), 180);
    };
    const dbl = (ev: MouseEvent) => {
      const q = local(ev);
      const { W: w, H: h, K0: k0, M: m } = D();
      const c = zoomAt(live.current, q.x, q.y, 2.2, m, w, h, k0);
      flyTo(c);
    };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', wheel, { passive: false });
    box.addEventListener('dblclick', dbl);
    return () => {
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      box.removeEventListener('wheel', wheel);
      box.removeEventListener('dblclick', dbl);
      clearTimeout(wheelT.current);
      if (coast.current) cancelAnimationFrame(coast.current.id);
    };
  }, [p.interactive]);

  const vp = useViewProps(p, cam, proj);
  return (
    <View ref={outer} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <View ref={inner} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        <GraphView {...vp} width={W} height={H} />
      </View>
      <View ref={ghosts} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 앱(iOS, Android): PanResponder 와 Animated(네이티브 드라이버)
// ─────────────────────────────────────────────────────────────

function StageNative(p: InnerProps) {
  const { model: M, width: W, height: H, K0 } = p;
  const [cam, setCam] = useState<Cam>(p.initial);
  const committed = useRef<Cam>(p.initial);
  const live = useRef<Cam>(p.initial);
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const flying = useRef<{ a: Animated.CompositeAnimation; at: (t: number) => Cam; ms: number; t0: number } | null>(null);
  const [flyStyle, setFlyStyle] = useState<any>(null);
  const pr = useRef(p);
  pr.current = p;
  const dims = useRef({ W, H, K0, M });
  dims.current = { W, H, K0, M };
  const origin = useRef({ x: 0, y: 0 });
  const outer = useRef<any>(null);

  const proj = useMemo(() => project(M, cam, W, H, K0, p.dotScale ?? 1, p.mem), [M, cam, W, H, K0, p.dotScale, p.mem]);
  // 앱의 transform 은 가운데 기준이다: p' = c + s(p - c) + t 이므로 t = (정한 x - 지금 x) * 지금 k
  const applyLive = () => {
    const c = committed.current;
    const l = live.current;
    tx.setValue((c.x - l.x) * l.k);
    ty.setValue((c.y - l.y) * l.k);
    sc.setValue(l.k / c.k);
  };
  const announce = (c: Cam) => {
    const { W: w, H: h, K0: k0, M: m } = dims.current;
    pr.current.onCommit?.(c, project(m, c, w, h, k0, pr.current.dotScale ?? 1, pr.current.mem));
  };
  const commit = () => {
    if (same(live.current, committed.current)) return;
    committed.current = live.current;
    announce(live.current);
    setCam(live.current);
  };
  useLayoutEffect(() => {
    tx.setValue(0);
    ty.setValue(0);
    sc.setValue(1);
    setFlyStyle(null);
  }, [cam]);
  const halt = () => {
    const f = flying.current;
    if (f) {
      f.a.stop();
      flying.current = null;
      live.current = f.at(clamp((Date.now() - f.t0) / f.ms, 0, 1));
      setFlyStyle(null);
      applyLive();
    }
  };
  const flyTo = useCallback((to: Cam, o: FlyOpts = {}) => {
    halt();
    const { W: w, H: h } = dims.current;
    if (motionOff()) {
      live.current = committed.current = to;
      announce(to);
      setCam(to);
      o.done?.();
      return;
    }
    const fl = flightOf(live.current, to, w, h, o);
    const n = 24;
    const ins: number[] = [];
    const ox: number[] = [];
    const oy: number[] = [];
    const os: number[] = [];
    const c0 = committed.current;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = fl.at(t);
      ins.push(t);
      ox.push((c0.x - c.x) * c.k);
      oy.push((c0.y - c.y) * c.k);
      os.push(c.k / c0.k);
    }
    prog.setValue(0);
    setFlyStyle({
      transform: [{ translateX: prog.interpolate({ inputRange: ins, outputRange: ox }) }, { translateY: prog.interpolate({ inputRange: ins, outputRange: oy }) }, { scale: prog.interpolate({ inputRange: ins, outputRange: os }) }],
    });
    const a = Animated.timing(prog, { toValue: 1, duration: fl.ms, delay: o.delay ?? 0, easing: Easing.linear, useNativeDriver: true });
    flying.current = { a, at: fl.at, ms: fl.ms, t0: Date.now() + (o.delay ?? 0) };
    a.start(({ finished }) => {
      if (!finished) return;
      flying.current = null;
      live.current = to;
      committed.current = to;
      announce(to);
      setCam(to);
      o.done?.();
    });
  }, []);
  const jump = useCallback((to: Cam) => {
    halt();
    live.current = committed.current = to;
    announce(to);
    setCam(to);
  }, []);
  useImperativeHandle(p.handle, () => ({ flyTo, jump, live: () => live.current, committed: () => committed.current }), []);

  const responder = useMemo(() => {
    let gest: any = null;
    const touchesOf = (e: any) => (e.nativeEvent.touches ?? []).map((t: any) => ({ x: t.pageX - origin.current.x, y: t.pageY - origin.current.y }));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => pr.current.interactive !== false,
      onMoveShouldSetPanResponder: () => pr.current.interactive !== false,
      onPanResponderGrant: (e) => {
        halt();
        outer.current?.measureInWindow?.((x: number, y: number) => (origin.current = { x, y }));
        const ts = touchesOf(e);
        gest = { start: { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, moved: false, d: 0, m: null, last: { dx: 0, dy: 0 }, t0: Date.now(), zoomed: false };
        if (ts.length >= 2) gest.d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y);
      },
      onPanResponderMove: (e, g) => {
        if (!gest) return;
        const { W: w, H: h, K0: k0, M: m } = dims.current;
        const ts = touchesOf(e);
        if (ts.length >= 2) {
          const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y);
          const mid = { x: (ts[0].x + ts[1].x) / 2, y: (ts[0].y + ts[1].y) / 2 };
          if (!gest.d || !gest.m) {
            gest.d = d;
            gest.m = mid;
            return;
          }
          const wpt = toWorld(live.current, gest.m.x, gest.m.y, w, h);
          const k = live.current.k * (d / Math.max(1, gest.d));
          const c = bound({ x: wpt.x, y: wpt.y, k }, m, w, h, k0);
          live.current = bound({ x: wpt.x - (mid.x - w / 2) / c.k, y: wpt.y - (mid.y - h / 2) / c.k, k: c.k }, m, w, h, k0);
          gest.d = d;
          gest.m = mid;
          gest.zoomed = true;
          gest.moved = true;
          applyLive();
          return;
        }
        gest.m = null;
        if (Math.hypot(g.dx, g.dy) > 6) gest.moved = true;
        if (!gest.moved) return;
        const dx = g.dx - gest.last.dx;
        const dy = g.dy - gest.last.dy;
        gest.last = { dx: g.dx, dy: g.dy };
        const c = live.current;
        live.current = bound({ x: c.x - dx / c.k, y: c.y - dy / c.k, k: c.k }, m, w, h, k0);
        applyLive();
      },
      onPanResponderRelease: () => {
        const g = gest;
        gest = null;
        if (g && !g.moved) {
          commit();
          pr.current.onTap?.(g.start.x, g.start.y, live.current);
          return;
        }
        commit();
      },
      onPanResponderTerminate: () => {
        gest = null;
        commit();
      },
    });
  }, []);

  const vp = useViewProps(p, cam, proj);
  return (
    <View ref={outer} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} {...responder.panHandlers}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H }, flyStyle ?? { transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]}>
        <GraphView {...vp} width={W} height={H} />
      </Animated.View>
    </View>
  );
}
