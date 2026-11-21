// Latti: 앱이 건네는 한 줄. 작은 표식(지금은 앱 아이콘)과 말풍선, 그리고 그 순간의 한 줄을 고르는 훅.
// 한 화면에 한 줄만 둔다. 기사나 문제를 읽는 동안에는 말하지 않는다.
// 문구 고르기는 src/lattiLines.ts, 문구 자료는 store 의 latti(docs/data/latti.json).
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, Text, View, ViewStyle } from 'react-native';
import { LattiCtx, LattiPick, choose, rngOf, sentences, still } from './lattiLines';

export type { LattiCtx } from './lattiLines';
import type { LattiData } from './lattiTypes';
import { WEB, motionOff, spring, webTween } from './motion';
import { useStore } from './store';
import { useTheme } from './theme';
import { AppMark, T } from './ui';

// ─────────────────────────────────────────────────────────────
// 한 줄 고르기
// ─────────────────────────────────────────────────────────────

/** 문구를 고를 때 쓰는 store 조각. 화면은 useStore() 에서 꺼내 넘긴다. */
export type LattiSource = { latti: LattiData | null; lattiHist: () => Record<string, number>; noteLatti: (id: string) => void };

type Said = { text: string | null; latti: boolean };
type Kept = { id: string; text: string; n: number };
// 순간(moment)마다 고른 줄. 다시 그리거나 화면을 다시 열어도 같은 순간이면 같은 줄이다.
// 다만 그 줄의 조건이 더는 맞지 않거나 채운 숫자가 바뀌면 그 순간 안에서 새로 고른다(지난 숫자를 보이지 않게).
const kept = new Map<string, Kept>();
const KEPT_CAP = 300;
// 이번에 막 보인 문장들. 같은 문장이 연달아 나오지 않게 한다(latti.json rules.sessionAvoid 만큼).
const recent: string[] = [];

/**
 * 그 순간의 한 줄. sit 이 여럿이면 앞에서부터 맞는 줄이 있는 첫 상황을 쓴다.
 * moment 가 같고 그 줄이 여전히 맞으면 늘 같은 줄이고, 난수도 moment 로 정해진다(같은 기록이면 같은 줄이 나온다).
 * Latti 문구가 없거나 맞는 줄이 없으면 fallback(예전 응원 문장)을 쓴다(Claude 링크 빌드, 처음 열었는데 받지 못했을 때).
 */
export function lattiSay(src: LattiSource, sit: string | string[], ctx: LattiCtx, moment: string | null, fallback?: () => string | null): Said {
  const data = src.latti;
  if (moment == null) return { text: null, latti: !!data };
  const old = () => ({ text: fallback?.() ?? null, latti: !!data });
  if (!data) return old();
  const now = Date.now();
  const hit = kept.get(moment);
  if (hit && hit.id) {
    const again = still(data, hit.id, sit, ctx, now);
    if (again === hit.text) return { text: again, latti: true };
  }
  // 처음이거나 지난번에 맞는 줄이 없었으면 같은 난수로, 고른 줄이 더는 맞지 않으면 다음 난수로 고른다.
  const n = hit ? (hit.id ? hit.n + 1 : hit.n) : 0;
  let pick: LattiPick | null = null;
  try {
    pick = choose(data, sit, ctx, { rng: rngOf(n ? `${moment}#${n}` : moment), now, hist: src.lattiHist(), recent });
  } catch {
    pick = null;
  }
  kept.set(moment, { id: pick?.id ?? '', text: pick?.text ?? '', n });
  if (kept.size > KEPT_CAP) kept.delete(kept.keys().next().value as string);
  if (!pick) return old();
  src.noteLatti(pick.id);
  recent.push(pick.text);
  const keep = data.rules?.sessionAvoid ?? 8;
  while (recent.length > keep) recent.shift();
  return { text: pick.text, latti: true };
}

/** 그 순간의 한 줄과, 그 줄이 Latti 문구인지(아니면 예전 응원 문장). */
export function useLattiSay(sit: string | string[], ctx: LattiCtx, moment: string | null, fallback?: () => string | null): Said {
  const { latti, lattiHist, noteLatti } = useStore();
  return lattiSay({ latti, lattiHist, noteLatti }, sit, ctx, moment, fallback);
}

/** 그 순간의 한 줄(없으면 null). */
export function useLattiLine(sit: string | string[], ctx: LattiCtx, moment: string | null, fallback?: () => string | null): string | null {
  return useLattiSay(sit, ctx, moment, fallback).text;
}

// ─────────────────────────────────────────────────────────────
// 표식과 말풍선
// ─────────────────────────────────────────────────────────────

/**
 * Latti 의 얼굴: 앱 표식(세 면 상자). 윗면은 늘 파랑, 옆면은 글자색이라 밝은 바탕에서 검정, 어두운 바탕에서 흰색이다.
 * 40 px 아래에서는 틈을 넓힌 작은 판을 쓴다(src/logo.tsx). 로고를 바꿀 때는 이 부품만 고친다.
 */
export function LattiAvatar({ size = 28 }: { size?: number }) {
  return <AppMark size={size} />;
}

export type BubbleTone = 'grey' | 'white' | 'blue';
export type BubbleSize = 's' | 'm' | 'l';
/** 말풍선이 표식의 어느 쪽에 있는지(꼬리는 그 반대편, 표식 쪽을 가리킨다). */
export type BubbleSide = 'right' | 'left' | 'top' | 'bottom';

const SIZE: Record<BubbleSize, { s: number; lh: number; px: number; py: number; r: number; tail: number }> = {
  s: { s: 14, lh: 20, px: 12, py: 7, r: 14, tail: 10 },
  m: { s: 15, lh: 22, px: 14, py: 9, r: 14, tail: 10 },
  l: { s: 17, lh: 25, px: 18, py: 12, r: 20, tail: 12 },
};
const ORIGIN: Record<BubbleSide, string> = { right: '0% 50%', left: '100% 50%', top: '50% 100%', bottom: '50% 0%' };

/**
 * 말풍선. 들어올 때 0.55 배에서 bounce 스프링으로 커지고 0.14초 동안 나타난다(시안 latti.js say).
 * 움직임은 transform 과 opacity 뿐이라 자리를 미리 차지한다(아래 내용이 밀리지 않는다).
 * 글자는 문장마다 한 덩이로 놓아 두 줄이 되면 문장 경계에서 접히게 한다(웹).
 */
export function LattiBubble({ text, tone = 'grey', size = 'm', side = 'right', delay = 0, style }: { text: string; tone?: BubbleTone; size?: BubbleSize; side?: BubbleSide; delay?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const z = SIZE[size];
  const bg = tone === 'blue' ? t.blue : tone === 'white' ? t.card : t.p.grey100;
  const ink = tone === 'blue' ? '#ffffff' : t.body;
  const center = side === 'top' || side === 'bottom';
  const box = useRef<any>(null);
  const txt = useRef<any>(null);
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;

  // 웹: 문장 덩이로 놓아 두 줄을 넘으면(긴 첫 문장) 덩이를 풀어 이어 흐르게 한다(latti.js fitLines).
  useLayoutEffect(() => {
    if (!WEB) return;
    const el = txt.current as HTMLElement | null;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    kids.forEach((k) => (k.style.display = 'inline-block'));
    if (Math.round(el.offsetHeight / z.lh) > 2) kids.forEach((k) => (k.style.display = 'inline'));
  }, [text, size]);

  (WEB ? useLayoutEffect : useEffect)(() => {
    if (motionOff()) {
      v.setValue(1);
      return;
    }
    if (WEB) {
      const el = box.current as HTMLElement | null;
      if (el) el.style.transformOrigin = ORIGIN[side];
      const a = webTween(box, { duration: 140, easing: Easing.ease }, (x) => ({ opacity: x }), { delay });
      const b = webTween(box, { spring: 'bounce' }, (x) => ({ transform: `scale(${0.55 + 0.45 * x})` }), { delay });
      return () => {
        a?.anim.cancel();
        b?.anim.cancel();
      };
    }
    v.setValue(0);
    const a = spring(v, 1, 'bounce', { delay });
    a.start();
    return () => a.stop();
  }, [text]);

  // 꼬리: 표식 쪽 가장자리 가운데의 작은 마름모.
  const half = z.tail / 2;
  const tail: ViewStyle =
    side === 'right'
      ? { left: -3, top: '50%', marginTop: -half }
      : side === 'left'
        ? { right: -3, top: '50%', marginTop: -half }
        : side === 'bottom'
          ? { top: -3, left: '50%', marginLeft: -half }
          : { bottom: -3, left: '50%', marginLeft: -half };
  const shadow: any = tone === 'white' ? (WEB ? { filter: 'drop-shadow(0 1px 1px rgba(0,23,51,0.04)) drop-shadow(0 4px 12px rgba(0,23,51,0.08))' } : { shadowColor: '#001733', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }) : null;
  const motion: any = WEB ? null : { opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] };
  const parts = sentences(text);
  const unit: any = WEB ? { display: 'inline-block', maxWidth: '100%', textWrap: 'balance', verticalAlign: 'top' } : null;
  const Box = WEB ? View : Animated.View;
  return (
    <Box ref={box} testID="latti-bubble" accessibilityRole="text" accessibilityLabel={text} style={[{ flexShrink: 1, minWidth: 0, maxWidth: '100%', borderRadius: z.r, paddingHorizontal: z.px, paddingVertical: z.py, backgroundColor: bg }, shadow, motion, style]}>
      <View aria-hidden pointerEvents="none" style={[{ position: 'absolute', width: z.tail, height: z.tail, borderRadius: 2, backgroundColor: bg, transform: [{ rotate: '45deg' }] }, tail]} />
      <T s={z.s} w="600" lh={z.lh / z.s} c={ink} center={center} style={[{ letterSpacing: size === 'l' ? -0.3 : -0.2 }, WEB ? ({ textWrap: 'balance' } as any) : null]}>
        {WEB ? (
          <TextRef r={txt}>
            {parts.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 ? ' ' : null}
                <T s={z.s} w="600" lh={z.lh / z.s} c={ink} style={unit}>
                  {p}
                </T>
              </React.Fragment>
            ))}
          </TextRef>
        ) : (
          text
        )}
      </T>
    </Box>
  );
}

/** 웹: 안쪽 글자 덩이들을 감싼 요소(span)를 ref 로 잡는다. 줄 수를 재는 데 쓴다. */
function TextRef({ r, children }: { r: React.RefObject<any>; children: React.ReactNode }) {
  return (
    <Text ref={r} testID="latti-text" style={{ display: 'block' } as any}>
      {children}
    </Text>
  );
}

/**
 * Latti 가 한 줄 말한다: 표식과 말풍선. text 가 없으면 아무것도 그리지 않는다.
 * side 'right' 는 표식 오른쪽에 말풍선, 'bottom' 은 표식 아래 가운데에 말풍선.
 */
export function LattiSays({
  text,
  size = 28,
  bubble = 'm',
  tone = 'grey',
  side = 'right',
  delay = 0,
  style,
}: {
  text: string | null | undefined;
  size?: number;
  bubble?: BubbleSize;
  tone?: BubbleTone;
  side?: BubbleSide;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (!text) return null;
  const col = side === 'top' || side === 'bottom';
  const dir = side === 'right' ? 'row' : side === 'left' ? 'row-reverse' : side === 'bottom' ? 'column' : 'column-reverse';
  return (
    <View style={[{ flexDirection: dir, alignItems: 'center', gap: col ? 14 : 10, minWidth: 0 }, style]}>
      <LattiAvatar size={size} />
      <LattiBubble text={text} size={bubble} tone={tone} side={side} delay={delay} style={col ? { alignSelf: 'center' } : null} />
    </View>
  );
}
