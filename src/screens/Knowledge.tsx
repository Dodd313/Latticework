// 지식 탭: 제목 "지식"과 나눔 단추(Latticework / 뉴스 / 단어장). 시안 motion-lab/v8/knowledge.html, v9/graph-a.html.
import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { CSS_EASE, WEB, motionOff, spring, webAnimate, webTween } from '../motion';
import { useNavTab, useNodeRequest } from '../nav';
import { useTheme } from '../theme';
import { T, Tap } from '../ui';
import { KnowledgeGraph } from './KnowledgeGraph';
import { KnowledgeNews } from './KnowledgeNews';
import { KnowledgeVocab } from './KnowledgeVocab';

export type Seg = 'graph' | 'news' | 'vocab';
const SEGS: { key: Seg; label: string }[] = [
  { key: 'graph', label: 'Latticework' },
  { key: 'news', label: '뉴스' },
  { key: 'vocab', label: '단어장' },
];
const SEG_KEY = 'lw.knowledge.seg';

/** 보는 사람마다 마지막에 고른 칸(웹 브라우저에만, 없으면 Latticework) */
function readSeg(): Seg {
  if (Platform.OS !== 'web') return 'graph';
  try {
    const v = localStorage.getItem(SEG_KEY);
    return v === 'news' || v === 'vocab' ? v : 'graph';
  } catch {
    return 'graph';
  }
}
function saveSeg(s: Seg) {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(SEG_KEY, s);
  } catch {
    // 기억하지 못해도 된다
  }
}

// 숨긴 칸. 웹은 자리를 계산해 둔 채 감춘다(display: none 이면 다시 보일 때 목록 전체의 자리를 한꺼번에 다시 잰다).
const HIDDEN: any = WEB ? { visibility: 'hidden', pointerEvents: 'none' } : { display: 'none' };

// 이미 따른 "그 마디로" 요청(지식 탭이 다시 만들어져도 같은 요청을 두 번 따르지 않게)
let segHandled = 0;

export function KnowledgeScreen() {
  const t = useTheme();
  const tab = useNavTab();
  const req = useNodeRequest();
  const [seg, setSegState] = useState<Seg>(() => (req.seq > segHandled ? 'graph' : readSeg()));
  const [seen, setSeen] = useState<Record<Seg, boolean>>(() => ({ graph: false, news: false, vocab: false }));
  const from = useRef<Seg>(seg);
  const setSeg = (s: Seg) => {
    from.current = seg;
    setSegState(s);
    saveSeg(s);
  };
  if (!seen[seg]) setSeen((v) => ({ ...v, [seg]: true }));
  // 해금의 "보러 가기": 지도 칸으로
  useEffect(() => {
    if (req.seq <= segHandled) return;
    segHandled = req.seq;
    if (seg !== 'graph') setSeg('graph');
  }, [req.seq]);

  const tabOn = tab === 'knowledge';
  // 웹: 탭을 연 뒤 한가할 때 아직 안 연 칸(뉴스, 단어장)을 숨긴 채 미리 그려 둔다(나눠 그리기).
  // 그래서 나눔 단추를 처음 누를 때 목록을 통째로 그리는 긴 작업이 손잡이 움직임을 막지 않는다.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!WEB || !tabOn || warm) return;
    const w = window as any;
    let idle = 0;
    const timer = setTimeout(() => {
      const go = () => startTransition(() => setWarm(true));
      if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout: 2000 });
      else go();
    }, 1400);
    return () => {
      clearTimeout(timer);
      if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
    };
  }, [tabOn, warm]);
  const panes = useRef<Record<Seg, any>>({ graph: null, news: null, vocab: null });
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!WEB || motionOff()) return;
    const i = SEGS.findIndex((s) => s.key === seg);
    const j = SEGS.findIndex((s) => s.key === from.current);
    const a = webAnimate({ current: panes.current[seg] }, [{ opacity: 0, transform: `translateX(${(i > j ? 1 : -1) * 14}px)` }, { opacity: 1, transform: 'translateX(0px)' }], { duration: 260, easing: CSS_EASE.out });
    return () => a?.cancel();
  }, [seg]);

  const pane = (key: Seg, node: React.ReactNode) =>
    seen[key] || seg === key || warm ? (
      <View key={key} ref={(r) => void (panes.current[key] = r)} aria-hidden={seg !== key} style={[StyleSheet.absoluteFill, seg === key ? null : HIDDEN]}>
        {node}
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <View style={{ paddingTop: 12, paddingHorizontal: 20, height: 106, backgroundColor: t.card, zIndex: 2 }}>
        <T s={26} w="700" lh={35 / 26} role="heading" level={1}>
          지식
        </T>
        <Segmented value={seg} onChange={setSeg} />
      </View>
      <View style={{ flex: 1 }}>
        {pane('graph', <KnowledgeGraph active={tabOn && seg === 'graph'} />)}
        {pane('news', <KnowledgeNews />)}
        {pane('vocab', <KnowledgeVocab />)}
      </View>
    </View>
  );
}

/** 나눔 단추: 회색 바탕(모서리 12) 위 흰 손잡이가 고른 칸으로 미끄러진다(quick 스프링) */
function Segmented({ value, onChange }: { value: Seg; onChange: (s: Seg) => void }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const i = SEGS.findIndex((s) => s.key === value);
  const cell = w > 0 ? (w - 6) / SEGS.length : 0;
  const thumb = useRef<any>(null);
  const prev = useRef(i);
  const nativeX = useRef(new Animated.Value(i)).current;
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = i;
    if (from === i || !cell) {
      nativeX.setValue(i);
      return;
    }
    if (WEB) {
      if (motionOff()) return;
      const tw = webTween(thumb, { spring: 'quick' }, (v) => ({ transform: `translateX(${((v - i) * cell).toFixed(2)}px)` }), { from, to: i });
      return () => tw?.anim.cancel();
    }
    spring(nativeX, i, 'quick').start();
  }, [i, cell]);
  const shadow: any = Platform.OS === 'web' ? { boxShadow: t.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,23,51,.06), 0 3px 10px rgba(0,23,51,.06)' } : { shadowColor: '#001733', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 };
  const thumbBg = t.mode === 'dark' ? t.p.grey300 : t.card;
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginTop: 10, height: 40, padding: 3, borderRadius: 12, backgroundColor: t.p.grey100, flexDirection: 'row' }}>
      {cell ? (
        WEB ? (
          <View ref={thumb} style={[{ position: 'absolute', top: 3, bottom: 3, left: 3 + i * cell, width: cell, borderRadius: 9, backgroundColor: thumbBg }, shadow]} />
        ) : (
          <Animated.View style={[{ position: 'absolute', top: 3, bottom: 3, left: 3, width: cell, borderRadius: 9, backgroundColor: thumbBg, transform: [{ translateX: nativeX.interpolate({ inputRange: [0, 1], outputRange: [0, cell] }) }] }, shadow]} />
        )
      ) : null}
      {SEGS.map((s) => {
        const on = s.key === value;
        return (
          <Tap key={s.key} role="tab" selected={on} label={s.label} press="none" onPress={() => !on && onChange(s.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <T s={15} w="600" c={on ? t.ink : t.mute} lh={1.4} style={{ letterSpacing: -0.2 }}>
              {s.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}
