// 지식 탭의 Latticework 지도(시안 motion-lab/v9/graph-a.html, 옵시디언 점).
// 배운 마디와 개념만 보인다. 점은 작고, 선은 부모와 자식 사이뿐이다. 자식이 7개를 넘는 마디는 고리(소우주)로 접힌다.
import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { dayDiff, todayKST } from '../dates';
import { useLater, webTween, WEB, motionOff } from '../motion';
import { useNav, useNodeRequest } from '../nav';
import { useKnowledge, useStore } from '../store';
import { StudyData, StudyState, conceptsOfNode, conceptsWithNewQuestions, isOpen, recall, startsIn } from '../study';
import { useTheme } from '../theme';
import { EmptyState, Icon, PrimaryButton, Sheet, T, Tap } from '../ui';
import { Cam, Mem, PNode, awayFromRoot, baseK, clamp, focusScope, hit, hitDots, kLim, nodeFit, outOf, project, rootFit, subtreeFit } from '../graph/camera';
import { GraphStage, GraphStageHandle } from '../graph/GraphStage';
import { Pulse, Reveal, graphRenders, graphStats, measureText } from '../graph/GraphView';
import { Label, Rect } from '../graph/labels';
import { GNode, GR, GraphModel, LV, chainOf, getModel, hash, subtree } from '../graph/layout';

/** 11월 18일 */
const mdKo = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

// 이미 따른 "그 마디로" 요청
let nodeHandled = 0;
const SHEET_H = 318;

export function KnowledgeGraph({ active }: { active: boolean }) {
  const t = useTheme();
  const { tree, fresh } = useKnowledge();
  const { study, studyData, markMapSeen } = useStore();
  const later = useLater();
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const key = tree && tree.nodes.size ? tree.key : '';
  // 배치는 첫 장면을 그린 뒤에 계산한다(시작 화면이 떠 있는 동안 미리 계산해 두면 바로 나온다).
  const model = useMemo(() => (later.ready && tree && key ? getModel(tree) : null), [later.ready, key]);
  // 마지막 풀이 뒤에 문제가 더해진 개념도 오늘 복습으로 보인다
  const grown = useMemo(() => (studyData ? conceptsWithNewQuestions(studyData, study) : new Set<string>()), [studyData, study]);
  return (
    <View
      style={{ flex: 1, backgroundColor: t.card }}
      onLayout={(e) => {
        // 숨긴 칸(display: none)은 크기가 0 으로 온다. 그때는 지도를 그대로 둔다.
        const W = Math.round(e.nativeEvent.layout.width);
        const H = Math.round(e.nativeEvent.layout.height);
        if (W > 0 && H > 0) setSize((s) => (s && s.W === W && s.H === H ? s : { W, H }));
      }}
    >
      {!key ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <EmptyState title="아직 배운 개념이 없어요" />
        </View>
      ) : model && size && size.W > 0 && size.H > 0 ? (
        <GraphPane key={model.key} model={model} W={size.W} H={size.H} cards={study.cards} state={study} grown={grown} data={studyData} fresh={fresh} active={active} markMapSeen={markMapSeen} />
      ) : null}
    </View>
  );
}

type PaneProps = { model: GraphModel; W: number; H: number; cards: ReturnType<typeof useStore>['study']['cards']; state: StudyState; grown: Set<string>; data: StudyData | null; fresh: Set<string>; active: boolean; markMapSeen: () => void };

function GraphPane({ model: M, W, H, cards, state, grown, data, fresh, active, markMapSeen }: PaneProps) {
  const t = useTheme();
  const nav = useNav();
  const stage = useRef<GraphStageHandle>(null);
  const K0 = useMemo(() => baseK(M, W, H), [M, W, H]);
  const initial = useMemo(() => rootFit(M, W, H), []);
  // 개념 점의 진하기(오늘 기억할 확률 × 안정성)와 오늘 복습
  const memMap = useMemo(() => {
    const now = new Date();
    const today = todayKST();
    const m = new Map<string, Mem>();
    for (const n of M.list) {
      if (n.kind !== 'concept') continue;
      const c = cards[n.id];
      // 일일 학습에서 읽기만 하고 아직 문제를 안 푼 개념: 흐린 점
      if (!c) {
        m.set(n.id, { studied: true, strength: 0, due: false, amount: 0 });
        continue;
      }
      const R = recall(c, now);
      m.set(n.id, { studied: true, strength: clamp((R * Math.log(1 + c.s)) / Math.log(1 + 60), 0, 1), due: c.due <= today || grown.has(n.id), amount: c.reps * 3 });
    }
    return m;
  }, [M, cards, grown]);
  const mem = useCallback((id: string) => memMap.get(id), [memMap]);

  const [pick, setPick] = useState<{ id: string; set?: Set<string> } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [chromeS, setChromeS] = useState<{ C: string | null; away: boolean }>({ C: null, away: false });
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const labelsRef = useRef<Label[]>([]);
  const onLabels = useCallback((l: Label[]) => void (labelsRef.current = l), []);

  // 열 때: 계급 순서로 투명도만 올라온다(0.4초)
  const reveal = useMemo<Reveal | null>(() => {
    if (motionOff()) return null;
    const order = new Map(M.list.map((n) => [n.id, { t: LV[n.kind] * 90 + hash(n.id) * 160, d: 380, mode: 'fade' as const }]));
    return { order, t0Delay: 0 };
  }, []);

  const focus = useMemo(() => {
    const id = sel ?? pick?.id ?? null;
    const n = id ? M.N.get(id) : null;
    if (!n) return null;
    return pick && pick.id === id && pick.set ? pick.set : new Set(chainOf(n));
  }, [sel, pick, M]);

  // 지도는 고른 점과 강조를 한 박자 늦게(끊어 가며) 다시 그린다. 누른 순간에는 시트와 단추가 먼저 움직인다.
  const gFocus = useDeferredValue(focus);
  const gSel = useDeferredValue(sel);
  const C = chromeS.C ? (M.N.get(chromeS.C) ?? null) : null;
  // 위치 표시의 폭(이름이 피해 갈 자리). 그린 뒤에 재지 않고 글자 폭으로 바로 정해 한 번 더 그리지 않는다.
  const crumbW = useMemo(() => {
    if (!C) return 0;
    const show = crumbPath(C);
    const long = show.reduce((s, n) => s + n.ko.length, 0) > 17;
    let w = 36 + 12;
    show.forEach((n, i) => (w += (i ? 14 : 0) + 4 + measureText(long && i < show.length - 1 ? n.short : n.ko, 14, '600')));
    return Math.min(w, W * 0.8);
  }, [C, W]);
  const chrome = useMemo<Rect[]>(() => {
    const out: Rect[] = [];
    if (C) out.push([4, 2, 12 + crumbW + 8, 54]);
    if (chromeS.away) out.push([W - 56, 2, W, 54]);
    return out;
  }, [C, crumbW, chromeS.away, W]);

  const onCommit = useCallback(
    (cam: Cam, P: Map<string, PNode>) => {
      const sc = focusScope(P, M, cam, W, H);
      const away = awayFromRoot(cam, M, W, H);
      setChromeS((s) => (s.C === (sc?.id ?? null) && s.away === away ? s : { C: sc?.id ?? null, away }));
    },
    [M, W, H],
  );

  const select = (n: GNode, cam: Cam) => {
    setSel(n.id);
    setPick(null);
    const [k0, k1] = kLim(M, K0);
    const k = clamp(Math.max(cam.k, (2.7 * K0) / n.sc), k0, k1);
    const ty = Math.max(90, (H - SHEET_H) / 2);
    stage.current?.flyTo({ x: n.wx, y: n.wy + (H / 2 - ty) / k, k }, { min: 520 });
  };

  const onTap = (px: number, py: number, cam: Cam) => {
    const P = project(M, cam, W, H, K0, 1, mem);
    const h = hit(hitDots(P, M), px, py);
    if (!h) {
      if (sel) setSel(null);
      if (pick) setPick(null);
      return;
    }
    const n = h.n;
    const pn = P.get(n.id)!;
    if (h.glyph || (n.collapsed && pn.open < 0.5)) {
      setSel(null);
      setPick(null);
      stage.current?.flyTo(nodeFit(n, W, H, K0));
      return;
    }
    if (n.kind === 'concept') return select(n, cam);
    setSel(null);
    setPick({ id: n.id });
    const f = nodeFit(n, W, H, K0);
    if (cam.k < f.k * 0.8) stage.current?.flyTo(f);
  };
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const onTapStable = useCallback((x: number, y: number, c: Cam) => tapRef.current(x, y, c), []);

  // 지도 칸이 보이게 될 때: 지난번에 본 뒤 새로 생긴 점에 고리가 한 번 퍼지고, 본 날을 적는다
  const sparkled = useRef(false);
  useEffect(() => {
    if (!active) {
      sparkled.current = false;
      setSel(null);
      return;
    }
    if (sparkled.current) return;
    sparkled.current = true;
    if (fresh.size === 0) return;
    const P = project(M, initial, W, H, K0);
    const ids: string[] = [];
    for (const id of fresh) {
      let n = M.N.get(id);
      if (!n) continue;
      // 닫힌 소우주 안이면 그 고리가 퍼진다
      for (let s = n.scope; s; s = s.scope) if ((P.get(s.id)?.open ?? 1) < 0.5) n = s;
      if (!ids.includes(n.id)) ids.push(n.id);
    }
    const stamp = Date.now();
    startTransition(() => setPulses((p) => [...p, ...ids.slice(0, 12).map((id, i) => ({ id, delay: 520 + i * 70, r: 16, d: 900, key: `s:${id}:${stamp}` }))]));
    const tm = setTimeout(markMapSeen, 1600);
    return () => clearTimeout(tm);
  }, [active]);

  // 해금의 "보러 가기": 그 마디로 날아가 그 아래만 진하게 남기고, 고리가 한 번 퍼진다
  const req = useNodeRequest();
  useEffect(() => {
    if (req.seq <= nodeHandled) return;
    nodeHandled = req.seq;
    setSel(null);
    const n = req.id ? M.N.get(req.id) : null;
    if (!n) {
      setPick(null);
      stage.current?.flyTo(rootFit(M, W, H));
      return;
    }
    setPick({ id: n.id, set: new Set([...subtree(n).map((x) => x.id), ...chainOf(n)]) });
    stage.current?.flyTo(subtreeFit(n, M, W, H, K0), {
      delay: 200,
      min: 700,
      done: () => startTransition(() => setPulses((p) => [...p, { id: n.id, delay: 0, r: 26, key: `go:${n.id}:${Date.now()}` }])),
    });
  }, [req.seq]);

  // 시험용 손잡이(웹)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g = globalThis as any;
    g.__LW_GRAPH__ = {
      cam: () => stage.current?.live(),
      committed: () => stage.current?.committed(),
      labels: () => labelsRef.current.map((l) => ({ id: l.id, text: l.text, rc: l.rc })),
      renders: graphRenders,
      stats: graphStats,
      model: () => ({ nodes: M.list.length, concepts: M.list.filter((n) => n.kind === 'concept').length, cols: M.cols.map((c) => c.id), K0 }),
      screen: (id: string) => {
        const c = stage.current?.live();
        const p = c ? project(M, c, W, H, K0, 1, mem).get(id) : null;
        return p ? { x: p.x, y: p.y, r: p.r, open: p.open, v: p.v } : null;
      },
      tap: (id: string) => {
        const c = stage.current?.live();
        const p = c ? project(M, c, W, H, K0, 1, mem).get(id) : null;
        if (c && p) tapRef.current(p.x, p.y, c);
        return !!p;
      },
      fly: (id: string | null) => stage.current?.flyTo(id && M.N.get(id) ? nodeFit(M.N.get(id)!, W, H, K0) : rootFit(M, W, H)),
      crumb: () => chromeRef.current,
      sel: () => selRef.current,
    };
    return () => {
      if (g.__LW_GRAPH__?.model) g.__LW_GRAPH__ = undefined;
    };
  }, [M, W, H, K0, mem]);
  const chromeRef = useRef<string[]>([]);
  const selRef = useRef<string | null>(null);
  selRef.current = sel;
  chromeRef.current = C ? crumbPath(C).map((n) => n.ko) : [];

  const fly = (c: Cam) => {
    setSel(null);
    stage.current?.flyTo(c);
  };
  const selNode = sel ? (M.N.get(sel) ?? null) : null;
  // 학문, 분과, 주제를 고르면 그 분야만 푸는 단추가 뜬다(2026-11-24 소유자 결정). 아직 안 배운 개념도 세되, 읽기를 마치지 않아 잠긴 개념은 빼고 센다.
  const pickNode = pick ? (M.N.get(pick.id) ?? null) : null;
  const pickCount = useMemo(() => {
    if (!pickNode || pickNode.kind === 'concept' || !data) return 0;
    const today = todayKST();
    return conceptsOfNode(data, pickNode.id).filter((c) => isOpen(c, state, today)).length;
  }, [pickNode, data, state]);

  return (
    <View style={{ flex: 1 }}>
      <GraphStage
        ref={stage}
        model={M}
        width={W}
        height={H}
        K0={K0}
        initial={initial}
        mem={mem}
        focus={gFocus}
        forceLabels={!!gFocus}
        chainEdges={!!gFocus}
        dimTo={0.22}
        selected={gSel}
        reveal={reveal}
        pulses={pulses}
        chrome={chrome}
        focusC={C?.id ?? null}
        onTap={onTapStable}
        onCommit={onCommit}
        onLabels={onLabels}
      />
      {/* 위 가장자리가 제목 아래로 부드럽게 사라진다 */}
      <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 14 }, WEB ? ({ backgroundImage: `linear-gradient(${t.card}, ${t.card}00)` } as any) : null]} />
      {C ? <Crumb C={C} onBack={() => fly(outOf(C, M, W, H, K0))} onItem={(n) => {
        if (n === C) return fly(nodeFit(n, W, H, K0));
        const f = nodeFit(n, W, H, K0);
        f.k = Math.min(f.k, 24 / (GR * C.sc));
        fly(f);
      }} /> : null}
      {chromeS.away ? (
        <Tap
          label="지도 전체"
          onPress={() => {
            setPick(null);
            fly(rootFit(M, W, H));
          }}
          style={[{ position: 'absolute', right: 12, top: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }, floatShadow(t.mode)]}
        >
          <Icon name="fit" size={20} color={t.p.grey700} />
        </Tap>
      ) : null}
      {pickNode && pickCount > 0 ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <PrimaryButton
            label={`${pickNode.ko.length <= 10 ? pickNode.ko : pickNode.short || pickNode.ko} 풀기 · 개념 ${pickCount}개`}
            a11yLabel={`${pickNode.ko} 분야만 풀기`}
            onPress={() => {
              setPick(null);
              nav.push({ name: 'study', sect: 'lat', focus: pickNode.id });
            }}
            style={floatShadow(t.mode)}
          />
        </View>
      ) : null}
      <Sheet clear open={!!selNode} onClose={() => setSel(null)}>
        {selNode ? <ConceptSheet n={selNode} card={cards[selNode.id]} locked={(() => {
          // 일일 학습에서 오늘 이해했어요를 누른 개념은 아직 문제로 낼 수 없다. 복습하기 대신 문제가 시작될 때를 안내한다.
          const c = data?.concepts.find((x) => x.id === selNode.id);
          const today = todayKST();
          return c && data && !isOpen(c, state, today) ? startsIn(data, state, today, c.id) : null;
        })()} onStudy={() => {
          setSel(null);
          nav.push({ name: 'study', sect: 'lat', focus: selNode.id });
        }} /> : null}
      </Sheet>
    </View>
  );
}

function floatShadow(mode: string): any {
  if (Platform.OS === 'web') return { boxShadow: mode === 'dark' ? '0 0 0 1px rgba(255,255,255,.08)' : '0 0 0 1px rgba(0,23,51,.05), 0 3px 12px rgba(0,23,51,.08)' };
  return { shadowColor: '#001733', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 };
}

/** 위치 표시에 보이는 길: 학문부터 그 소우주까지(뒤쪽 셋) */
function crumbPath(C: GNode): GNode[] {
  const path: GNode[] = [];
  for (let p: GNode | null = C; p; p = p.parent) path.unshift(p);
  return path.length > 3 ? path.slice(-3) : path;
}

/** 위치 표시: 뒤로 단추와 학문부터 지금 소우주까지의 이름. 이름을 누르면 그 무리로 */
function Crumb({ C, onBack, onItem }: { C: GNode; onBack: () => void; onItem: (n: GNode) => void }) {
  const t = useTheme();
  const ref = useRef<any>(null);
  const show = crumbPath(C);
  const long = show.reduce((s, n) => s + n.ko.length, 0) > 17;
  useEffect(() => {
    if (!WEB || motionOff()) return;
    const tw = webTween(ref, { spring: 'quick' }, (v) => ({ opacity: v, transform: `translateY(${(-6 * (1 - v)).toFixed(2)}px) scale(${(0.96 + 0.04 * v).toFixed(4)})` }));
    return () => tw?.anim.cancel();
  }, []);
  return (
    <View
      ref={ref}
      style={[{ position: 'absolute', left: 12, top: 10, maxWidth: '80%', height: 36, borderRadius: 18, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', paddingRight: 12, overflow: 'hidden' }, floatShadow(t.mode)]}
    >
      <Tap label="뒤로" press="dim" onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={20} color={t.p.grey700} sw={2.3} />
      </Tap>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
        {show.map((n, i) => {
          const last = i === show.length - 1;
          return (
            <React.Fragment key={n.id}>
              {i ? (
                <T s={14} w="500" c={t.p.grey300} style={{ width: 14, textAlign: 'center' }}>
                  /
                </T>
              ) : null}
              <Tap label={n.ko} press="dim" onPress={() => onItem(n)} style={last ? { flexShrink: 1, minWidth: 0 } : null}>
                <T s={14} w="600" c={last ? t.ink : t.mute} lines={1} style={{ paddingHorizontal: 2 }}>
                  {long && !last ? n.short : n.ko}
                </T>
              </Tap>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

/** 개념 시트: 옅은 길, 이름, 영어 이름, 반복 · 기억 · 다음 복습, 복습하기 */
function ConceptSheet({ n, card, locked, onStudy }: { n: GNode; card: ReturnType<typeof useStore>['study']['cards'][string] | undefined; locked?: number | null; onStudy: () => void }) {
  const t = useTheme();
  const path: string[] = [];
  for (let p = n.parent; p; p = p.parent) path.unshift(p.ko);
  const today = todayKST();
  const R = card ? recall(card, new Date()) : 0;
  const k = card ? dayDiff(today, card.due) : 0;
  const due = !!card && k <= 0;
  const next = !card ? '문제 전' : k <= 0 ? '오늘' : k === 1 ? '내일' : mdKo(card.due);
  const cells: [string, string, boolean][] = [
    ['반복', `${card?.reps ?? 0}회`, false],
    ['기억', `${Math.round(R * 100)}%`, false],
    ['다음 복습', next, due],
  ];
  return (
    <View>
      <T s={13} w="500" c={t.faint} lines={1} lh={18 / 13} style={{ marginBottom: 6 }}>
        {path.join(' · ')}
      </T>
      <T s={22} w="700" lh={31 / 22}>
        {n.ko}
      </T>
      {n.en && n.en !== n.ko ? (
        <T s={14} c={t.mute} lh={20 / 14} style={{ marginTop: 2 }}>
          {n.en}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
        {cells.map(([a, b, hot]) => (
          <View key={a} style={{ flex: 1, backgroundColor: t.layer, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
            <T s={13} w="600" c={t.mute} lh={18 / 13}>
              {a}
            </T>
            <T s={18} w="700" c={hot ? t.orangeText : t.ink} mono lines={1} lh={26 / 18} style={{ marginTop: 2 }}>
              {b}
            </T>
          </View>
        ))}
      </View>
      {locked ? (
        <T s={15} w="600" c={t.mute} center lh={22 / 15} style={{ marginTop: 22 }}>
          {locked <= 1 ? '내일부터 문제로 나와요' : `약 ${locked}일 뒤부터 문제로 나와요`}
        </T>
      ) : (
        <PrimaryButton label="복습하기" onPress={onStudy} style={{ marginTop: 18 }} />
      )}
    </View>
  );
}
