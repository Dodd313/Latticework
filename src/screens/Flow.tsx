// 시작 화면 다음의 차례: 해금(전체 화면) 다음에 돌아보기(주간, 월간). 앱을 열 때 한 번만 정한다.
//
// - 셸(App.tsx 의 Shell)은 기록을 구독하지 않는다. 기록을 읽어 차례를 정하는 일은 이 파일의 Decide 가 하고,
//   정한 뒤에는 Decide 를 떼어 낸다(그 뒤로는 기록이 바뀌어도 여기서 다시 계산하지 않는다).
// - 자료가 늦으면 앱을 연 뒤 약 3.5초까지만 기다린다. 그 뒤에는 이번에 열 때 띄우지 않는다(쓰는 도중에 덮지 않게).
// - 시험용(웹): 주소 끝에 #noflow 가 있으면 해금 화면, 돌아보기, 홈 띠를 모두 띄우지 않는다.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { warmModel } from '../graph/layout';
import type { LearnedTree, UnlockCard, UnlockPlan } from '../knowledge';
import { CSS_EASE, NATIVE_DRIVER, WEB, motionOff, webAnimate } from '../motion';
import { useNav } from '../nav';
import type { Period } from '../period';
import { STANDALONE, useKnowledge, useRecapDue, useStore } from '../store';
import { useTheme } from '../theme';
import { RecapDeck } from './Recap';
import { UnlockFlow } from './Unlock';

/** 시험용 탈출구(웹): 주소의 #noflow */
export function noFlow(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return /noflow/.test(String((globalThis as any).location?.hash ?? ''));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 차례가 끝났는지(홈 띠는 이것을 기다린다)
// ─────────────────────────────────────────────────────────────

let flowDone = false;
const flowSubs = new Set<() => void>();
function markFlowDone() {
  if (flowDone) return;
  flowDone = true;
  flowSubs.forEach((f) => f());
}
const subscribeFlow = (f: () => void) => {
  flowSubs.add(f);
  return () => {
    flowSubs.delete(f);
  };
};
/** 시작 화면과 해금, 돌아보기가 모두 끝났는지 */
export function useFlowDone(): boolean {
  return useSyncExternalStore(subscribeFlow, () => flowDone, () => flowDone);
}

/** 이 탭 화면이 지금 맨 위에 보이는지(다른 탭, 안쪽 화면, 해금이나 돌아보기에 가려 있지 않은지). App.tsx 가 탭마다 넣는다. */
export const ShownCtx = createContext(true);
export function useShown(): boolean {
  return useContext(ShownCtx);
}

// ─────────────────────────────────────────────────────────────
// 정하기
// ─────────────────────────────────────────────────────────────

type Due = { show: Period; alsoSeen: string[] };
export type FlowPlan = { cards: UnlockCard[]; band: UnlockPlan['band']; tree: LearnedTree | null; recap: Due | null };

const WAIT_MS = 3500;

/** 기록을 읽어 이번에 띄울 것을 한 번 정한다. 정하면 onPlan 을 부르고, 그 뒤로는 부모가 이것을 떼어 낸다. */
function Decide({ onPlan }: { onPlan: (p: FlowPlan) => void }) {
  const s = useStore();
  const k = useKnowledge();
  const due = useRecapDue();
  const ready = STANDALONE ? !!s.studyData && s.status !== 'loading' : s.canSave || s.status === 'offline';
  // 지도 배치는 시작 화면이 떠 있는 동안 한가할 때 미리 계산해 둔다(누른 순간에 계산하지 않게).
  useEffect(() => {
    const tree = k.tree;
    if (!tree) return;
    const ric = (globalThis as any).requestIdleCallback as undefined | ((cb: () => void, o: { timeout: number }) => number);
    if (WEB && ric) {
      const id = ric(() => warmModel(tree), { timeout: 600 });
      return () => (globalThis as any).cancelIdleCallback?.(id);
    }
    const id = setTimeout(() => warmModel(tree), 0);
    return () => clearTimeout(id);
  }, [k.tree?.key]);
  useEffect(() => {
    if (!ready) return;
    onPlan({ cards: k.plan.cards, band: k.plan.band, tree: k.tree, recap: due });
  }, [ready]);
  return null;
}

/**
 * 시작 화면 뒤의 해금과 돌아보기. 탭과 쌓인 화면 위, 시작 화면 아래에 덮는다.
 * splashDone 전에는 덮을 자리만 잡아 두고(바탕색), 시작 화면이 걷히면 움직임을 시작한다.
 */
export function AfterSplash({ splashDone, onOverlay }: { splashDone: boolean; onOverlay: (up: boolean) => void }) {
  const [plan, setPlan] = useState<FlowPlan | null>(null);
  const [step, setStep] = useState<'unlock' | 'recap' | 'end'>('unlock');
  // 해금 다음에 돌아보기가 올 때: 해금 판을 지우지 않고 그 위로 돌아보기가 떠오른다(사이에 홈이 비치지 않게). 다 뜨면 아래 판을 내린다.
  const [under, setUnder] = useState(false);
  const off = useRef(noFlow()).current;
  const decided = useRef(off);
  const nav = useNav();

  const take = useCallback((p: FlowPlan) => {
    if (decided.current) return;
    decided.current = true;
    setPlan(p);
    setStep(p.cards.length && p.tree ? 'unlock' : p.recap ? 'recap' : 'end');
  }, []);

  // 오래 기다리지 않는다: 자료가 늦으면 이번에는 띄우지 않는다.
  useEffect(() => {
    if (off) return;
    const id = setTimeout(() => take({ cards: [], band: null, tree: null, recap: null }), WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  const up = !off && !!plan && step !== 'end';
  useLayoutEffect(() => {
    onOverlay(up);
  }, [up]);
  useEffect(() => {
    if (!splashDone) return;
    if (off || (plan && step === 'end')) markFlowDone();
  }, [splashDone, plan, step]);

  const finishUnlock = useCallback(
    (to?: string | null) => {
      if (to !== undefined) {
        // 보러 가기: 남은 차례(돌아보기)는 다음에 열 때로 미루고 지도로 간다.
        setStep('end');
        nav.showNode(to);
        return;
      }
      if (plan?.recap) setUnder(true);
      setStep((cur) => (cur === 'unlock' ? (plan?.recap ? 'recap' : 'end') : cur));
    },
    [plan, nav],
  );
  const finishRecap = useCallback(() => setStep('end'), []);

  if (off) return null;
  return (
    <>
      {!decided.current || !plan ? <Decide onPlan={take} /> : null}
      {plan && (step === 'unlock' || (step === 'recap' && under)) && plan.tree ? (
        <Overlay key="unlock">
          {(close) => <UnlockFlow cards={plan.cards} band={plan.band} tree={plan.tree!} go={splashDone} onDone={(to) => (to === undefined && plan.recap ? finishUnlock(to) : close(() => finishUnlock(to)))} />}
        </Overlay>
      ) : null}
      {plan && step === 'recap' && plan.recap ? (
        <Overlay key="recap" enter={under} onEntered={() => setUnder(false)}>
          {(close) => <RecapDeck due={plan.recap!} go={splashDone} onDone={() => close(finishRecap)} />}
        </Overlay>
      ) : null}
    </>
  );
}

/** 덮는 판 한 장. 닫을 때 살짝 줄며(0.96배) 사라진 뒤 다음 차례로 넘긴다. */
function Overlay({ children, enter, onEntered }: { children: (close: (then: () => void) => void) => React.ReactNode; enter?: boolean; onEntered?: () => void }) {
  const t = useTheme();
  const ref = useRef<any>(null);
  const v = useRef(new Animated.Value(enter && !motionOff() ? 0 : 1)).current;
  const closing = useRef(false);
  // enter: 다른 판 위로 떠오른다(투명, 0.98배에서). 웹은 브라우저가 맡는다.
  useLayoutEffect(() => {
    if (!enter) return;
    const done = () => onEntered?.();
    if (motionOff()) return done();
    if (WEB) {
      const a = webAnimate(ref, [{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 280, easing: CSS_EASE.out, fill: 'backwards' });
      if (!a) return done();
      a.onfinish = done;
      return;
    }
    Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: NATIVE_DRIVER }).start(done);
  }, []);
  const close = useCallback((then: () => void) => {
    if (closing.current) return;
    closing.current = true;
    if (motionOff()) return then();
    if (WEB) {
      const a = webAnimate(ref, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 260, easing: CSS_EASE.out, fill: 'forwards' });
      if (!a) return then();
      a.onfinish = () => then();
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: NATIVE_DRIVER }).start(() => then());
  }, []);
  const style: any = WEB ? null : { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] };
  const Box: any = WEB ? View : Animated.View;
  return (
    <Box ref={ref} style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: t.card }, style]}>
      {children(close)}
    </Box>
  );
}
