// 일일 학습에서 "이해했어요"를 누른 순간 띄우는 부분 지도(2026-11-27 소유자 결정).
// 그 개념이 속한 분과(분과가 없으면 학문) 무리를 확대해 보이고, 새 점(과 이 개념으로 처음 생긴 윗마디)이 돋은 뒤 고리가 한 번 퍼진다.
// 새 점은 흐리게(아직 문제를 안 풀었다), 이미 배운 개념은 기억이 단단한 만큼 짙게 그린다. 지도 탭(KnowledgeGraph)과 같은 진하기 규칙.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Mem, baseK, clamp, fitBox } from '../graph/camera';
import { GraphView, Pulse, RevealStep } from '../graph/GraphView';
import { GNode, getModel, subtree } from '../graph/layout';
import { motionOff } from '../motion';
import { useKnowledge, useStore } from '../store';
import { recall } from '../study';

export function GrowthBurst({ id, width, height, delay = 500 }: { id: string; width: number; height: number; delay?: number }) {
  const { tree } = useKnowledge();
  const { study } = useStore();
  const M = useMemo(() => (tree ? getModel(tree) : null), [tree]);
  const scene = useMemo(() => {
    const n = M?.N.get(id);
    if (!M || !n) return null;
    // 이 개념으로 처음 생긴 윗마디: 그 아래 배운 개념이 이 개념 하나뿐인 마디
    const born: GNode[] = [n];
    for (let p = n.parent; p; p = p.parent) {
      if (subtree(p).filter((x) => x.kind === 'concept').length === 1) born.push(p);
      else break;
    }
    // 보일 무리: 이 개념의 분과(없으면 학문). 학문 점도 함께 넣어 어디에 붙었는지 보인다.
    let scope: GNode = n.parent ?? n;
    while (scope.kind !== 'branch' && scope.kind !== 'disc' && scope.parent) scope = scope.parent;
    const group = subtree(scope);
    const pts = group.concat(scope.parent ? [scope.parent] : []);
    const box = { x0: Math.min(...pts.map((p) => p.wx)) - 24, x1: Math.max(...pts.map((p) => p.wx)) + 24, y0: Math.min(...pts.map((p) => p.wy)) - 24, y1: Math.max(...pts.map((p) => p.wy)) + 24 };
    const K0 = baseK(M, width, height);
    const cam = fitBox(box, width, height, { x: 48, y: 56 });
    cam.k = clamp(cam.k, K0, 3.2 * K0);
    // 위 마디부터 차례로 돋는다
    const order = new Map<string, RevealStep>();
    born
      .slice()
      .reverse()
      .forEach((x, i) => order.set(x.id, { t: i * 260, d: x.kind === 'concept' ? 520 : 440, mode: 'grow' }));
    const last = (born.length - 1) * 260 + 520;
    const pulses: Pulse[] = [{ id, delay: delay + last, r: 24, d: 1100, key: `burst:${id}` }];
    const focus = new Set<string>([...group.map((x) => x.id), ...(scope.parent ? [scope.parent.id] : [])]);
    return { cam, K0, order, pulses, focus };
  }, [M, id, width, height, delay]);
  const now = useMemo(() => new Date(), [id]);
  const mem = (nid: string): Mem | undefined => {
    const c = study.cards[nid];
    if (!c) return { studied: true, strength: 0, due: false, amount: 0 };
    const R = recall(c, now);
    return { studied: true, strength: clamp((R * Math.log(1 + c.s)) / Math.log(1 + 60), 0, 1), due: false, amount: c.reps * 3 };
  };
  if (!M || !scene) return null;
  const still = motionOff();
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
        reveal={still ? null : { order: scene.order, t0Delay: delay }}
        pulses={still ? [] : scene.pulses}
      />
    </View>
  );
}
