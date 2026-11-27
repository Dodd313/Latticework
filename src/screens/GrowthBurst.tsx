// 일일 학습에서 "이해했어요"를 누른 순간 띄우는 부분 지도(2026-11-27 소유자 결정).
// 그 개념이 속한 분과(분과가 없으면 학문) 무리를 확대해 보이고, 새 점(과 이 개념으로 처음 생긴 윗마디)이 돋은 뒤 고리가 한 번 퍼진다.
// 새 점은 흐리게(아직 문제를 안 풀었다), 이미 배운 개념은 기억이 단단한 만큼 짙게 그린다. 지도 탭(KnowledgeGraph)과 같은 진하기 규칙.
import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Cam, Mem, baseK, clamp, fitBox, nodeFit } from '../graph/camera';
import { GraphView, Pulse, RevealStep } from '../graph/GraphView';
import { GNode, getModel, subtree } from '../graph/layout';
import { TOPIC_MIN, learnedTree } from '../knowledge';
import { motionOff } from '../motion';
import { useKnowledge, useStore } from '../store';
import { StudyData, StudyState, recall } from '../study';

/**
 * 카드를 읽는 동안, 이해했어요를 누른 뒤의 지도 모양을 틈틈이 미리 계산해 둔다(getModel 캐시). 누른 순간의 멈춤을 없앤다.
 */
export function prewarmBurst(data: StudyData | null, state: StudyState, id: string, today: string): () => void {
  if (!data) return () => {};
  const g = globalThis as any;
  const run = () => {
    const tree = learnedTree(data, state.cards, { ...(state.marks ?? {}), [id]: { k: 'ok', d: today, t: '' } });
    if (tree) getModel(tree);
  };
  const h = g.requestIdleCallback ? g.requestIdleCallback(run, { timeout: 1500 }) : setTimeout(run, 300);
  return () => (g.requestIdleCallback && g.cancelIdleCallback ? g.cancelIdleCallback(h) : clearTimeout(h));
}

export function GrowthBurst({ id, width, height, delay = 500 }: { id: string; width: number; height: number; delay?: number }) {
  const { tree } = useKnowledge();
  const cards = useStore().study.cards;
  // 지도 배치는 누른 순간이 아니라 한 프레임 뒤 급하지 않은 일로 꺼낸다(렉 개선). 대개 Read 화면이 카드를 읽는 동안 미리 데워 두어 캐시에 있다.
  const [go, setGo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => startTransition(() => setGo(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const M = useMemo(() => (go && tree ? getModel(tree) : null), [go, tree]);
  const scene = useMemo(() => {
    const n = M?.N.get(id);
    if (!M || !n) return null;
    // 이 개념으로 처음 생긴 윗마디: 그 마디를 연 개념이 이 개념인 것(주제는 배운 개념이 TOPIC_MIN 개가 된 날, 나머지는 첫 개념의 날에 생긴다).
    const opener = (p: GNode): string | undefined => {
      const cs = subtree(p)
        .filter((x) => x.kind === 'concept')
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return cs[p.kind === 'topic' ? TOPIC_MIN - 1 : 0]?.id;
    };
    const born: GNode[] = [n];
    for (let p = n.parent; p; p = p.parent) {
      if (p.at === n.at && opener(p) === id) born.push(p);
      else break;
    }
    const K0 = baseK(M, width, height);
    let cam: Cam;
    let group: GNode[];
    if (n.scope) {
      // 배운 개념이 많아 고리(소우주)로 접힌 무리 안이면, 그 고리가 열리도록 고리를 화면에 채운다.
      cam = nodeFit(n.scope, width, height, K0);
      group = [n.scope, ...subtree(n.scope)];
    } else {
      // 보일 무리: 이 개념의 분과(없으면 학문). 학문 점도 함께 넣어 어디에 붙었는지 보인다.
      let scope: GNode = n.parent ?? n;
      while (scope.kind !== 'branch' && scope.kind !== 'disc' && scope.parent) scope = scope.parent;
      group = subtree(scope).filter((x) => x.scope === scope.scope);
      const pts = group.concat(scope.parent ? [scope.parent] : []);
      const box = { x0: Math.min(...pts.map((p) => p.wx)) - 24, x1: Math.max(...pts.map((p) => p.wx)) + 24, y0: Math.min(...pts.map((p) => p.wy)) - 24, y1: Math.max(...pts.map((p) => p.wy)) + 24 };
      cam = fitBox(box, width, height, { x: 48, y: 56 });
      cam.k = clamp(cam.k, K0, 3.2 * K0);
      if (scope.parent) group = group.concat(scope.parent);
    }
    // 위 마디부터 차례로 돋는다
    const order = new Map<string, RevealStep>();
    born
      .slice()
      .reverse()
      .forEach((x, i) => order.set(x.id, { t: i * 260, d: x.kind === 'concept' ? 520 : 440, mode: 'grow' }));
    const last = (born.length - 1) * 260 + 520;
    const pulses: Pulse[] = [{ id, delay: delay + last, r: 24, d: 1100, key: `burst:${id}` }];
    const focus = new Set<string>(group.map((x) => x.id));
    // 다시 그려져도 돋는 움직임이 처음부터 다시 걸리지 않게 한 번만 만든다.
    const reveal = motionOff() ? null : { order, t0Delay: delay };
    return { cam, K0, reveal, pulses: motionOff() ? [] : pulses, focus };
  }, [M, id, width, height, delay]);
  const now = useMemo(() => new Date(), [id]);
  const mem = useCallback(
    (nid: string): Mem | undefined => {
      const c = cards[nid];
      if (!c) return { studied: true, strength: 0, due: false, amount: 0 };
      const R = recall(c, now);
      return { studied: true, strength: clamp((R * Math.log(1 + c.s)) / Math.log(1 + 60), 0, 1), due: false, amount: c.reps * 3 };
    },
    [cards, now],
  );
  if (!M || !scene) return <View aria-hidden style={{ width, height }} />;
  return (
    <View aria-hidden style={{ width, height, overflow: 'hidden' }}>
      <GraphView
        model={M}
        width={width}
        height={height}
        cam={scene.cam}
        K0={scene.K0}
        mem={mem}
        dotScale={1.35}
        labels
        focus={scene.focus}
        forceLabels
        dimTo={0.18}
        reveal={scene.reveal}
        pulses={scene.pulses}
      />
    </View>
  );
}
