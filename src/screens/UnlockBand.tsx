// 홈 위쪽의 분과 해금 띠. 새 분과가 생겼을 때(같은 날 새 학문과 함께 생긴 분과는 해금 화면이 맡는다).
//
// 띠는 늘 하나다. 여럿이면 가장 최근 분과를 그리고 제목 옆에 "외 N" 만 붙인다(나머지는 지식 탭의 점이 맡는다).
// 처음 보일 때 본 것으로 적고, 이번에 앱을 연 동안은 "계속"을 누를 때까지 남는다.
// 띠가 떠 있는 동안 홈 오늘 카드의 Latti 한 줄은 쉰다(한 화면에 한 줄).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Cam } from '../graph/camera';
import { GraphView, Pulse, Reveal, RevealStep } from '../graph/GraphView';
import { GNode, getModel, subtree } from '../graph/layout';
import type { UnlockPlan } from '../knowledge';
import { useLattiLine } from '../latti';
import { CSS_EASE, Rise, WEB, motionOff, webAnimate } from '../motion';
import { useNav } from '../nav';
import { useKnowledge, useStore } from '../store';
import { useTheme } from '../theme';
import { T, Tap } from '../ui';
import { noFlow, useFlowDone, useShown } from './Flow';
import { inkOf, rgbaOf } from './Unlock';

type Band = NonNullable<UnlockPlan['band']>;

// 이번에 앱을 연 동안 붙든 띠와 닫은 띠
let held: Band | null = null;
let closed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const snap = () => (closed ? null : held);

/** 지금 홈에 둘 띠. 홈이 보이고 시작 화면 뒤 차례가 끝났을 때 처음 잡는다. */
export function useHomeBand(): Band | null {
  const { plan } = useKnowledge();
  const shown = useShown();
  const done = useFlowDone();
  const { markSeen } = useStore();
  const cur = useSyncExternalStore(subscribe, snap, snap);
  const next = plan.band;
  useEffect(() => {
    if (!shown || !done || !next || noFlow()) return;
    if (held && !closed && held.item.id === next.item.id) return;
    if (held && !closed) return;
    held = next;
    closed = false;
    emit();
    markSeen(
      'unlock',
      next.all.map((u) => u.id),
    );
  }, [shown, done, next]);
  return cur;
}

function closeBand() {
  closed = true;
  emit();
}

const SN = 96;

/** 띠 안의 작은 지도: 부모 학문과 새 분과(그 개념까지)가 들어오게 맞춘다. 새 분과의 실이 뻗고 고리가 한 번 퍼진다. */
function Snippet({ band }: { band: Band }) {
  const { tree } = useKnowledge();
  const M = useMemo(() => (tree ? getModel(tree) : null), [tree?.key]);
  const scene = useMemo(() => {
    if (!M) return null;
    const b = M.N.get(band.item.nodeId);
    if (!b) return null;
    const d = b.disc;
    const sub = subtree(b);
    const pts: GNode[] = [...sub, d];
    const x0 = Math.min(...pts.map((p) => p.wx)) - 10;
    const x1 = Math.max(...pts.map((p) => p.wx)) + 10;
    const y0 = Math.min(...pts.map((p) => p.wy)) - 10;
    const y1 = Math.max(...pts.map((p) => p.wy)) + 10;
    const k = Math.min(SN / (x1 - x0), SN / (y1 - y0)) * 0.86;
    const cam: Cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k };
    const order = new Map<string, RevealStep>();
    sub.forEach((x, i) => order.set(x.id, { t: (x.depth - b.depth) * 320 + i * 60, d: 560, mode: 'grow' }));
    const reveal: Reveal = { order, t0Delay: 760 };
    const pulses: Pulse[] = [{ id: b.id, delay: 900, r: 22, d: 1000, key: `band:${b.id}` }];
    return { cam, K0: k * 0.9, focus: new Set([...sub.map((x) => x.id), d.id]), reveal, pulses };
  }, [M, band.item.nodeId]);
  const t = useTheme();
  return (
    <View aria-hidden style={{ width: SN, height: SN, borderRadius: 16, backgroundColor: t.layer, overflow: 'hidden' }}>
      {M && scene ? <GraphView model={M} width={SN} height={SN} cam={scene.cam} K0={scene.K0} labels={false} dotScale={0.8} focus={scene.focus} dimTo={0.35} reveal={motionOff() ? null : scene.reveal} pulses={scene.pulses} /> : null}
    </View>
  );
}

export function UnlockBand({ band }: { band: Band }) {
  const t = useTheme();
  const nav = useNav();
  const { tree } = useKnowledge();
  const dark = t.mode === 'dark';
  const node = tree?.nodes.get(band.item.nodeId);
  const disc = tree?.nodes.get(band.item.disc);
  const color = disc?.color ?? t.p.grey500;
  const names = useMemo(() => {
    if (!tree) return [] as string[];
    const out: string[] = [];
    const walk = (id: string) => {
      const n = tree.nodes.get(id);
      if (!n) return;
      if (n.rank === 'concept' && n.at === band.item.at) out.push(n.ko);
      n.kids.forEach(walk);
    };
    walk(band.item.nodeId);
    return out;
  }, [tree, band.item.nodeId]);
  const line = useLattiLine('unlock', { rank: 'branch', field: node?.ko ?? '', parent: disc?.ko ?? '', first: band.item.byName }, `unlock:band:${band.item.id}`);

  // 웹: 띠의 높이가 0 에서 펼쳐지고(시트 곡선 440ms), 안쪽은 살짝 내려오며 나타난다. 닫을 때는 접힌다.
  const wrap = useRef<any>(null);
  const inner = useRef<any>(null);
  useLayoutEffect(() => {
    if (!WEB || motionOff()) return;
    const el = inner.current as HTMLElement | null;
    const h = el?.offsetHeight ?? 0;
    const a = webAnimate(wrap, [{ height: '0px', marginBottom: '-12px' }, { height: `${h}px`, marginBottom: '0px' }], { duration: 440, delay: 320, easing: CSS_EASE.sheet, fill: 'backwards' });
    const b = webAnimate(inner, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 360, delay: 400, easing: CSS_EASE.out, fill: 'backwards' });
    return () => {
      a?.cancel();
      b?.cancel();
    };
  }, []);
  const dismiss = () => {
    if (!WEB || motionOff()) return closeBand();
    const el = wrap.current as HTMLElement | null;
    const h = el?.offsetHeight ?? 0;
    const a = webAnimate(wrap, [{ height: `${h}px`, opacity: 1, marginBottom: '0px' }, { height: '0px', opacity: 0, marginBottom: '-12px' }], { duration: 300, easing: CSS_EASE.sheet, fill: 'forwards' });
    if (a) a.onfinish = closeBand;
    else closeBand();
  };
  const body = (
      <View ref={inner} testID="unlock-band" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.card, borderRadius: 20, paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 16 }}>
        <Snippet band={band} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T s={13} w="700" lh={19 / 13} c={inkOf(color, dark)} lines={1}>
            {disc?.ko ?? ''}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T s={18} w="700" lh={26 / 18} c={t.ink} lines={1} style={{ letterSpacing: -0.3, flexShrink: 1 }}>
              {node?.ko ?? band.item.byName}
            </T>
            {band.more > 0 ? (
              <T s={14} w="600" c={t.mute} mono>
                {`외 ${band.more}`}
              </T>
            ) : null}
          </View>
          {line ? (
            <T s={14} w="500" lh={20 / 14} c={t.p.grey700} style={{ marginTop: 1 }}>
              {line}
            </T>
          ) : null}
          {names.length ? (
            <T s={13} w="500" lh={18 / 13} c={t.mute} lines={1} style={{ marginTop: 4 }}>
              {names.join(' · ')}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <Tap onPress={dismiss} label="계속" style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.p.grey100, justifyContent: 'center' }}>
              <T s={14} w="600" c={t.p.grey700}>
                계속
              </T>
            </Tap>
            <Tap
              onPress={() => {
                closeBand();
                nav.showNode(band.item.nodeId);
              }}
              label="보러 가기" style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: rgbaOf(color, dark ? 0.22 : 0.12), justifyContent: 'center' }}>
              <T s={14} w="600" c={inkOf(color, dark)}>
                보러 가기
              </T>
            </Tap>
          </View>
        </View>
      </View>
  );
  return WEB ? (
    <View ref={wrap} style={{ overflow: 'hidden' }}>
      {body}
    </View>
  ) : (
    <Rise delay={200}>{body}</Rise>
  );
}
