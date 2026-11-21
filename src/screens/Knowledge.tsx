// 지식 탭: 제목 "지식"과 나눔 단추(Latticework / 뉴스 / 단어장). 시안 motion-lab/v8/knowledge.html, v9/graph-a.html.
import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { CSS_EASE, WEB, motionOff, webAnimate } from '../motion';
import { useNavTab, useNodeRequest } from '../nav';
import { useTheme } from '../theme';
import { Segmented, T } from '../ui';
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
        <Segmented items={SEGS} value={seg} onChange={setSeg} />
      </View>
      <View style={{ flex: 1 }}>
        {pane('graph', <KnowledgeGraph active={tabOn && seg === 'graph'} />)}
        {pane('news', <KnowledgeNews />)}
        {pane('vocab', <KnowledgeVocab />)}
      </View>
    </View>
  );
}
