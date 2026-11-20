import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { HEAT_RING, heatColor, heatInk } from './heat';
import { EASE_OUT, EASE_SHEET, MView, NATIVE_DRIVER, Tween, WEB, lerp, motionOff, spring, tweenStop, usePop, webShake, webTween } from './motion';
import { FONT_SANS, TYPE, Theme, TypeStep, useTheme } from './theme';

// ─────────────────────────────────────────────────────────────
// 글자
// ─────────────────────────────────────────────────────────────

type Weight = '400' | '500' | '600' | '700' | '800';

type TProps = {
  s?: number; // 글자 크기
  w?: Weight;
  c?: string;
  type?: TypeStep; // Toss 글자 단계(t1~t7). 크기와 줄 높이를 함께 정한다
  mono?: boolean; // 숫자 폭 맞춤(tabular-nums)
  lh?: number; // 줄 높이 배수
  center?: boolean;
  lines?: number;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  role?: 'heading';
  level?: 1 | 2 | 3;
};

// 한글은 낱말 중간에서 끊기지 않게 한다.
const KOREAN_WRAP = Platform.OS === 'web' ? ({ wordBreak: 'keep-all', overflowWrap: 'anywhere' } as any) : null;
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export function T({ s, w = '400', c, type, mono, lh, center, lines, style, children, role, level }: TProps) {
  const t = useTheme();
  const a11y = role === 'heading' ? ({ accessibilityRole: 'header', 'aria-level': level ?? 2 } as any) : null;
  const size = s ?? (type ? TYPE[type][0] : 15);
  const lineHeight = lh != null ? Math.round(size * lh) : type && s == null ? TYPE[type][1] : Math.round(size * (size >= 26 ? 1.35 : size >= 20 ? 1.45 : 1.5));
  return (
    <Text
      {...a11y}
      numberOfLines={lines}
      style={[
        {
          fontFamily: FONT_SANS,
          fontSize: size,
          fontWeight: w,
          color: c ?? t.ink,
          lineHeight,
          textAlign: center ? 'center' : undefined,
          letterSpacing: size >= 24 ? -0.5 : size >= 19 ? -0.3 : 0,
        },
        mono ? TABULAR : null,
        KOREAN_WRAP,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * 문제 본문용 글자. <sub>…</sub> 와 <sup>…</sup> 만 아래첨자와 위첨자로 그리고, 그 밖의 태그는 지운다.
 */
export function Rich({ children, ...rest }: Omit<TProps, 'children'> & { children?: string }) {
  const text = String(children ?? '');
  const size = rest.s ?? (rest.type ? TYPE[rest.type][0] : 15);
  const parts: React.ReactNode[] = [];
  const re = /<(sub|sup)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const clean = (x: string) => x.replace(/<[^>]+>/g, '');
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(clean(text.slice(last, m.index)));
    parts.push(
      <Text key={parts.length} style={[{ fontSize: Math.round(size * 0.7) }, Platform.OS === 'web' ? ({ position: 'relative', top: m[1] === 'sub' ? '0.3em' : '-0.45em' } as any) : null]}>
        {clean(m[2])}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(clean(text.slice(last)));
  return <T {...rest}>{parts}</T>;
}

// ─────────────────────────────────────────────────────────────
// 아이콘
// ─────────────────────────────────────────────────────────────

export type IconName =
  | 'home'
  | 'today'
  | 'threads'
  | 'archive'
  | 'review'
  | 'gear'
  | 'back'
  | 'next'
  | 'external'
  | 'search'
  | 'check'
  | 'down'
  // 새 디자인
  | 'homeFill'
  | 'calFill'
  | 'reviewFill'
  | 'close'
  | 'x'
  | 'chev'
  | 'prev'
  | 'bolt'
  | 'note'
  | 'news'
  | 'word'
  | 'lattice'
  | 'flag'
  | 'lock';

export function Icon({ name, size = 24, color, bold, sw: swIn }: { name: IconName; size?: number; color?: string; bold?: boolean; sw?: number }) {
  const t = useTheme();
  const c = color ?? t.ink;
  const sw = swIn ?? (bold ? 2.2 : 1.8);
  const common = { fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const solid = { fill: c };
  let body: React.ReactNode = null;
  let box = 24;
  switch (name) {
    case 'home':
      body = (
        <>
          <Path d="M4 11.2L12 4.5l8 6.7" {...common} />
          <Path d="M6 10v9.5h4.2v-5.2h3.6v5.2H18V10" {...common} />
        </>
      );
      break;
    case 'today':
      body = (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={3} {...common} />
          <Path d="M8 9h8M8 13h8M8 17h4" {...common} />
        </>
      );
      break;
    case 'threads':
      body = (
        <>
          <Circle cx={6} cy={6} r={2.5} {...common} />
          <Circle cx={18} cy={10} r={2.5} {...common} />
          <Circle cx={8} cy={18} r={2.5} {...common} />
          <Path d="M8.4 6.8l7.2 2.4M16 11.6l-6 5" {...common} />
        </>
      );
      break;
    case 'archive':
      body = (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={3} {...common} />
          <Path d="M4 10h16M9 3v4M15 3v4" {...common} />
        </>
      );
      break;
    case 'review':
      body = (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M8.5 12.2l2.4 2.4 4.6-5" {...common} />
        </>
      );
      break;
    case 'gear':
      body = (
        <>
          <Path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h10M20 17h0" {...common} />
          <Circle cx={16} cy={7} r={2.4} {...common} />
          <Circle cx={10} cy={12} r={2.4} {...common} />
          <Circle cx={17} cy={17} r={2.4} {...common} />
        </>
      );
      break;
    case 'back':
      body = <Path d="M14.5 5.5L8 12l6.5 6.5" {...common} />;
      break;
    case 'prev':
      body = <Path d="M14.5 5.5L8 12l6.5 6.5" {...common} strokeWidth={swIn ?? 2.2} />;
      break;
    case 'next':
      body = <Path d="M9.5 5.5L16 12l-6.5 6.5" {...common} />;
      break;
    case 'chev':
      body = <Path d="M9 5l7 7-7 7" {...common} strokeWidth={swIn ?? 2.4} />;
      break;
    case 'external':
      body = <Path d="M9 6h9v9M18 6L7 17" {...common} />;
      break;
    case 'search':
      body = (
        <>
          <Circle cx={11} cy={11} r={6.5} {...common} />
          <Path d="M16 16l4 4" {...common} />
        </>
      );
      break;
    case 'check':
      body = <Path d="M5 12.5l4.5 4.5L19 7.5" {...common} />;
      break;
    case 'down':
      body = <Path d="M12 4v15M6.5 13.5L12 19l5.5-5.5" {...common} />;
      break;
    case 'close':
    case 'x':
      body = <Path d="M6 6l12 12M18 6L6 18" {...common} strokeWidth={swIn ?? (name === 'close' ? 2.4 : 3)} />;
      break;
    case 'homeFill':
      body = <Path d="M12 3.6l8.6 7.2-1.3 1.5-.8-.7V20.5h-5.2v-5.4h-2.6v5.4H5.5v-8.9l-.8.7-1.3-1.5z" {...solid} />;
      break;
    case 'calFill':
      body = <Path d="M7 2.5h2v2h6v-2h2v2h1a3 3 0 0 1 3 3V9H3V7.5a3 3 0 0 1 3-3h1zM3 11h18v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" {...solid} />;
      break;
    case 'reviewFill':
      body = (
        <>
          <Circle cx={12} cy={12} r={9.5} {...solid} />
          <Path d="M8.3 12.2l2.6 2.6 4.8-5.2" fill="none" stroke={t.card} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      break;
    case 'bolt':
      body = <Path d="M13.2 2.5L4.8 13.4h6.1l-1.1 8.1 8.4-10.9h-6.1z" {...solid} />;
      break;
    case 'note':
      body = <Path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 7v1.8h8V10zm0 4v1.8h8V14zm0-8v1.8h5V6z" {...solid} fillRule="evenodd" />;
      break;
    case 'news':
      body = <Path d="M4 4.5h12.5v15H6.5A2.5 2.5 0 0 1 4 17zM18 8h2v9.5a2 2 0 0 1-4 0V8zM7 8h6.5v2H7zm0 4h6.5v1.6H7zm0 3.4h4.5V17H7z" {...solid} fillRule="evenodd" />;
      break;
    case 'word':
      body = <Path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" {...solid} />;
      break;
    case 'flag':
      body = <Path d="M6 21V4h10l-1.6 3.5L16 11H8v10z" {...solid} />;
      break;
    case 'lock':
      body = <Path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" {...solid} fillRule="evenodd" />;
      break;
    case 'lattice': {
      // Latticework 표식: 4×4 격자선
      box = 64;
      const p = (v: number) => (v / 3) * 48 + 8;
      let d = '';
      for (let i = 0; i < 4; i++) d += `M${p(i)} 8V56M8 ${p(i)}H56`;
      body = <Path d={d} fill="none" stroke={c} strokeWidth={swIn ?? 6} strokeLinecap="square" />;
      break;
    }
  }
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        {body}
      </Svg>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 누름
// ─────────────────────────────────────────────────────────────

// 웹에서는 눌림과 색 바뀜이 툭 끊기지 않게 짧은 전환을 건다.
const SOFT: any =
  Platform.OS === 'web'
    ? { transitionProperty: 'transform, opacity, filter, background-color, border-color, color', transitionDuration: '150ms', transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    : null;
// Toss 눌림: 7% 어둡게. 웹은 모양을 그대로 따르는 밝기 필터, 기기에서는 투명도로 대신한다.
const DIM: any = Platform.OS === 'web' ? { filter: 'brightness(0.93)' } : { opacity: 0.86 };

/** 누를 때의 반응. scale: 0.96배 + 7% 어둡게(단추) · soft: 0.98배 + 어둡게(큰 카드, 줄) · dim: 어둡게만 · none: 없음 */
export type Press = 'scale' | 'soft' | 'dim' | 'none';
const PRESSED: Record<Press, any> = {
  scale: [{ transform: [{ scale: 0.96 }] }, DIM],
  soft: [{ transform: [{ scale: 0.98 }] }, DIM],
  dim: DIM,
  none: null,
};

export function Tap({
  onPress,
  onLongPress,
  label,
  hint,
  children,
  style,
  disabled,
  selected,
  role = 'button',
  nativeID,
  press = 'scale',
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  label?: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  selected?: boolean;
  role?: 'button' | 'tab' | 'link';
  nativeID?: string;
  press?: Press;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected }}
      style={({ pressed }) => [SOFT, disabled ? { opacity: 0.4 } : null, style, pressed && !disabled ? PRESSED[press] : null]}
    >
      {children}
    </Pressable>
  );
}

/** 바깥 사이트로 나가는 링크. 웹에서는 진짜 링크로 그려야 새 탭이 열린다. */
export function ExtLink({ url, children, style, label }: { url: string; children: React.ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  if (Platform.OS === 'web') {
    const linkProps = { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } as any;
    return (
      <View {...linkProps} accessibilityRole="link" accessibilityLabel={label} style={[{ cursor: 'pointer' } as any, style]}>
        {children}
      </View>
    );
  }
  return (
    <Tap role="link" label={label} onPress={() => void Linking.openURL(url)} style={style}>
      {children}
    </Tap>
  );
}

// ─────────────────────────────────────────────────────────────
// 카드
// ─────────────────────────────────────────────────────────────

/**
 * 흰 카드(모서리 20, 안쪽 20). title 을 주면 머리 줄(20 굵게, 오른쪽 aside 회색 15, chevron)을 그린다.
 * onPress 를 주면 카드 전체가 눌린다.
 */
export function Box({
  children,
  style,
  title,
  aside,
  chevron,
  onPress,
  label,
  tone = 'card',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  title?: string;
  aside?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  label?: string;
  tone?: 'card' | 'blue' | 'inverse' | 'layer';
}) {
  const t = useTheme();
  const bg = tone === 'blue' ? t.blueWeak : tone === 'inverse' ? t.blue : tone === 'layer' ? t.layer : t.card;
  const head =
    title != null || aside != null ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
        {title != null ? (
          <T s={20} w="700" lh={1.45} role="heading" level={2} style={{ flexShrink: 1 }} c={tone === 'inverse' ? t.onColor : t.ink}>
            {title}
          </T>
        ) : (
          <View />
        )}
        {aside != null || chevron ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {typeof aside === 'string' || typeof aside === 'number' ? (
              <T s={15} w="600" c={t.mute} mono>
                {aside}
              </T>
            ) : (
              aside
            )}
            {chevron ? <Icon name="chev" size={14} color={t.faint} /> : null}
          </View>
        ) : null}
      </View>
    ) : null;
  const boxStyle: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: 20, padding: 20 }, style];
  if (onPress)
    return (
      <Tap onPress={onPress} label={label ?? title} press="soft" style={boxStyle}>
        {head}
        {children}
      </Tap>
    );
  return (
    <View style={boxStyle}>
      {head}
      {children}
    </View>
  );
}

/** 예전 이름. 이제 Box 와 같은 흰 카드다. tone: blue = 옅은 파랑 바탕, inverse = 파랑 바탕 */
export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'blue' | 'inverse' }) {
  return (
    <Box tone={tone} style={style}>
      {children}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// 꼬리표
// ─────────────────────────────────────────────────────────────

export type Tone = 'blue' | 'orange' | 'green' | 'red' | 'neutral' | 'solid' | 'outline' | 'onTint' | 'hot';

/** 짧은 꼬리표(높이 22, 모서리 6, 12px 600). hot = 주황 바탕 흰 글자(연속 정답 ×N). */
export function Chip({ label, tone = 'blue', style }: { label: string; tone?: Tone; mono?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const m: Record<Tone, [string, string]> = {
    blue: [t.blueWeak, t.blueText],
    orange: [t.orangeWeak, t.orangeText],
    green: [t.greenWeak, t.greenText],
    red: [t.redWeak, t.redText],
    neutral: [t.fill, t.deck],
    solid: [t.blue, t.onColor],
    outline: ['transparent', t.sub],
    onTint: [t.card, t.blueText],
    hot: [t.orange, '#ffffff'],
  };
  const [bg, fg] = m[tone];
  const hot = tone === 'hot';
  return (
    <View
      style={[
        { alignSelf: 'flex-start', height: hot ? 20 : 22, paddingHorizontal: 7, borderRadius: hot ? 10 : 6, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        tone === 'outline' ? { borderWidth: 1, borderColor: t.line } : null,
        style,
      ]}
    >
      <T s={hot ? 13 : 12} w={hot ? '800' : '600'} c={fg} lh={hot ? 1.54 : 1.5} mono={hot}>
        {label}
      </T>
    </View>
  );
}

/** 머리 줄 오른쪽의 알약(높이 32). label 은 숫자 옆 이름("연속"), value 는 숫자("4일"). hot 이면 숫자가 주황. */
export function Pill({ label, value, hot, icon, iconColor, onPress, a11yLabel, style }: { label?: string; value: React.ReactNode; hot?: boolean; icon?: IconName; iconColor?: string; onPress?: () => void; a11yLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const inner = (
    <>
      {icon ? <Icon name={icon} size={16} color={iconColor ?? (hot ? t.orange : t.mute)} /> : null}
      {label ? (
        <T s={14} w="600" c={t.mute}>
          {label}
        </T>
      ) : null}
      {typeof value === 'string' || typeof value === 'number' ? (
        <T s={15} w="700" c={hot ? t.orangeText : t.deck} mono>
          {value}
        </T>
      ) : (
        value
      )}
    </>
  );
  const pill: StyleProp<ViewStyle> = [{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', gap: 4 }, style];
  if (onPress)
    return (
      <Tap onPress={onPress} label={a11yLabel} style={pill}>
        {inner}
      </Tap>
    );
  return (
    <View style={pill} accessibilityLabel={a11yLabel}>
      {inner}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 단추
// ─────────────────────────────────────────────────────────────

/** Toss xlarge 단추: 높이 56, 모서리 16, 17px 600. 누르면 0.96배와 7% 어둡게. weak = 옅은 파랑 바탕. */
export function PrimaryButton({ label, onPress, weak, disabled, icon, style, a11yLabel }: { label: string; onPress?: () => void; weak?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; a11yLabel?: string }) {
  const t = useTheme();
  const fg = weak ? t.blueText : 'rgba(255,255,255,0.95)';
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      label={a11yLabel ?? label}
      press="scale"
      style={[{ minHeight: 56, paddingHorizontal: 28, paddingVertical: 2, borderRadius: 16, backgroundColor: weak ? t.blueWeak : t.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'stretch' }, style]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} bold /> : null}
      <T s={17} w="600" c={fg} lh={1.5}>
        {label}
      </T>
    </Tap>
  );
}

export type LipTone = 'blue' | 'green' | 'red' | 'orange' | 'off' | 'ghost';

/**
 * 학습 안의 입체 단추: 얼굴 52 + 하단 테두리 4, 모서리 16, 17px 700.
 * 누르면 얼굴이 4 내려가 테두리를 덮는다. tone='off' 는 회색이고 눌리지 않으며, 누르면 옆으로 흔들린 뒤 onPress 를 부른다.
 */
export function LipButton({ label, onPress, tone = 'blue', disabled, style, a11yLabel, children }: { label?: string; onPress?: () => void; tone?: LipTone; disabled?: boolean; style?: StyleProp<ViewStyle>; a11yLabel?: string; children?: React.ReactNode }) {
  const t = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  const box = useRef<any>(null);
  const m: Record<LipTone, [string, string, string]> = {
    blue: [t.blue, t.blueLip, '#ffffff'],
    green: [t.green, t.greenLip, '#ffffff'],
    red: [t.red, t.redLip, '#ffffff'],
    orange: [t.orange, t.orangeLip, '#ffffff'],
    off: [t.p.grey200, t.p.grey200, t.p.grey400],
    ghost: [t.card, t.line, t.sub],
  };
  const [face, lip, fg] = m[tone];
  const off = tone === 'off';
  const press = () => {
    if (off && !motionOff()) {
      if (WEB) webShake(box, LIP_SHAKE[0], LIP_SHAKE[1], 300, Easing.out(Easing.quad));
      else {
        shake.setValue(0);
        Animated.timing(shake, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
      }
    }
    onPress?.();
  };
  return (
    <MView ref={box} style={[{ alignSelf: 'stretch' }, WEB ? null : { transform: [{ translateX: shake.interpolate({ inputRange: LIP_SHAKE[0], outputRange: LIP_SHAKE[1] }) }] }, style]}>
      <Pressable onPress={press} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11yLabel ?? label} accessibilityState={{ disabled: !!disabled || off }} style={{ height: 56 }}>
        {({ pressed }) => (
          <>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 52, borderRadius: 16, backgroundColor: lip }} />
            <View
              style={[
                SOFT,
                { height: 52, borderRadius: 16, backgroundColor: face, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
                tone === 'ghost' ? { borderWidth: 2, borderColor: t.line } : null,
                pressed && !off && !disabled ? { transform: [{ translateY: 4 }] } : null,
              ]}
            >
              {children ?? (
                <T s={17} w="700" c={fg} lh={1.5} style={{ letterSpacing: -0.2 }}>
                  {label}
                </T>
              )}
            </View>
          </>
        )}
      </Pressable>
    </MView>
  );
}
const LIP_SHAKE: [number[], number[]] = [
  [0, 0.25, 0.5, 0.75, 1],
  [0, -6, 5, -2, 0],
];

// ─────────────────────────────────────────────────────────────
// 선택지
// ─────────────────────────────────────────────────────────────

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';

/** 선택지 상태별 [테두리, 바탕, 글자] */
export function optionColors(t: Theme, state: OptionState): [string, string, string] {
  switch (state) {
    case 'selected':
      return [t.blueLine, t.p.blue50, t.blueText];
    case 'correct':
      return [t.greenLine, t.greenWeak, t.greenText];
    case 'wrong':
      return [t.redLine, t.redWeak, t.redText];
    default:
      return [t.line, t.card, t.body];
  }
}

/**
 * 문제의 선택지: 테두리 2, 하단 테두리 4, 모서리 16, 17px 600.
 * 누르면 2 내려간다. keyLabel 을 주면 왼쪽에 28 크기 번호 상자를 둔다.
 * children 에 함수를 주면 상태 글자색을 받아 직접 그린다.
 */
export function OptionTile({
  state = 'idle',
  onPress,
  disabled,
  label,
  keyLabel,
  children,
  style,
  a11yLabel,
  center,
}: {
  state?: OptionState;
  onPress?: () => void;
  disabled?: boolean;
  label?: string;
  keyLabel?: string;
  children?: React.ReactNode | ((ink: string) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
  a11yLabel?: string;
  center?: boolean;
}) {
  const t = useTheme();
  const [border, bg, ink] = optionColors(t, state);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !!disabled, selected: state === 'selected' }}
      style={({ pressed }) => [
        SOFT,
        {
          flexDirection: center ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: center ? 'center' : 'flex-start',
          gap: center ? 10 : 14,
          minHeight: 60,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderWidth: 2,
          borderBottomWidth: 4,
          borderRadius: 16,
          borderColor: border,
          backgroundColor: bg,
          opacity: state === 'dim' ? 0.5 : 1,
        },
        style,
        pressed && !disabled ? { transform: [{ translateY: 2 }], borderBottomWidth: 2, marginBottom: 2 } : null,
      ]}
    >
      {keyLabel ? (
        <View style={[SOFT, { width: 28, height: 28, borderWidth: 2, borderColor: state === 'idle' || state === 'dim' ? t.line : border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, center ? { position: 'absolute', top: 12, left: 12 } : null]}>
          <T s={13} w="700" c={state === 'idle' || state === 'dim' ? t.mute : ink} lh={1.2}>
            {keyLabel}
          </T>
        </View>
      ) : null}
      {typeof children === 'function' ? (
        children(ink)
      ) : children != null ? (
        children
      ) : (
        <T s={17} w="600" c={ink} lh={1.5} center={center} style={center ? null : { flex: 1 }}>
          {label}
        </T>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
// 진행
// ─────────────────────────────────────────────────────────────

/**
 * 진행 막대. 기본 높이 16, 둥근 끝, 높이 12 이상이면 위쪽 1/4 자리에 흰 30% 띠.
 * hot = 주황(연속 정답). 값이 바뀌면 Toss medium 스프링으로 늘어난다. grow 면 처음에 0 에서 자란다.
 */
export function ProgressBar({
  value,
  hot,
  color,
  track,
  height = 16,
  band,
  grow,
  delay = 0,
  style,
  a11yLabel,
}: {
  value: number;
  hot?: boolean;
  color?: string;
  track?: string;
  height?: number;
  band?: boolean;
  grow?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  a11yLabel?: string;
}) {
  const t = useTheme();
  const v = Math.max(0, Math.min(1, value || 0));
  const w = useRef(new Animated.Value(grow && !motionOff() ? 0 : v)).current;
  const first = useRef(true);
  // 웹: 같은 스프링으로 폭을 브라우저가 옮긴다. React 는 끝 폭을 그려 두고, 끊기면 지금 폭에서 이어 간다.
  const fill = useRef<any>(null);
  const tw = useRef<Tween | null>(null);
  const shown = useRef(grow && !motionOff() ? 0 : v);
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (first.current && !grow) {
      first.current = false;
      return;
    }
    first.current = false;
    if (WEB) {
      const from = tw.current ? tweenStop(tw.current, shown.current) : shown.current;
      shown.current = v;
      if (motionOff() || from === v) return;
      tw.current = webTween(fill, { spring: 'medium' }, (x) => ({ width: `${Math.max(0, Math.min(1, x)) * 100}%` }), { from, to: v, delay });
      return;
    }
    const a = spring(w, v, 'medium', { delay, native: false });
    a.start();
    return () => a.stop();
  }, [v]);
  const showBand = band ?? height >= 12;
  const r = height / 2;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[{ height, borderRadius: r, backgroundColor: track ?? t.line, overflow: 'hidden' }, style]}
    >
      <MView
        ref={fill}
        style={[SOFT, { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: r, overflow: 'hidden', backgroundColor: color ?? (hot ? t.orange : t.blue), width: WEB ? `${v * 100}%` : w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]}
      >
        {showBand ? <View style={{ position: 'absolute', top: height / 4, left: 8, right: 8, height: height / 4, borderRadius: height / 8, backgroundColor: 'rgba(255,255,255,0.3)' }} /> : null}
      </MView>
    </View>
  );
}

/**
 * 원형 진행(정답률 링). 기본 148, 두께 12, 초록. 열릴 때 0 에서 value 까지 그려진다.
 * 가운데에 children 을 둔다.
 */
export function Ring({ value, size = 148, stroke = 12, color, track, children, duration = 900, delay = 100, a11yLabel }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; duration?: number; delay?: number; a11yLabel?: string }) {
  const t = useTheme();
  const target = Math.max(0, Math.min(1, value || 0));
  const [k, setK] = useState(motionOff() || WEB ? target : 0);
  const from = useRef(motionOff() ? target : 0);
  const box = useRef<any>(null);
  const r = (size - stroke) / 2 - 4;
  const C = 2 * Math.PI * r;
  (WEB ? useLayoutEffect : useEffect)(() => {
    if (WEB) {
      // 웹: 끝 모양을 그려 두고, 그리기 전에 원의 stroke-dashoffset 을 브라우저 움직임으로 0 에서 채운다.
      const start = from.current;
      from.current = target;
      const arc = (box.current as HTMLElement | null)?.querySelectorAll?.('circle')[1];
      if (motionOff() || !arc || start === target) return;
      const tw = webTween(arc, { duration, easing: EASE_OUT }, (x) => ({ strokeDashoffset: String(C * (1 - x)), opacity: x > 0 ? 1 : 0 }), { from: start, to: target, delay });
      return () => tw?.anim.cancel();
    }
    if (motionOff()) {
      setK(target);
      return;
    }
    const a = new Animated.Value(from.current);
    const id = a.addListener(({ value: x }) => {
      from.current = x;
      setK(x);
    });
    const anim = Animated.timing(a, { toValue: target, duration, delay, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => {
      anim.stop();
      a.removeListener(id);
    };
  }, [target]);
  return (
    <View ref={box} accessibilityRole="image" accessibilityLabel={a11yLabel} style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.p.grey100} strokeWidth={stroke} fill="none" />
          {k > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? t.green} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - k)} /> : null}
        </Svg>
      </View>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

export type StatTone = 'yellow' | 'green' | 'blue' | 'orange';

/**
 * 결과 카드: 바깥은 색(테두리 2), 머리에 아이콘, 안쪽 흰 패널(모서리 14, 높이 56)에 굵은 숫자.
 * lead 를 주면 숫자 앞에 아이콘(예: bolt)을 둔다.
 */
export function StatCard({ tone, icon, label, value, num, lead, a11yLabel, style }: { tone: StatTone; icon: IconName | React.ReactNode; label?: string; value?: React.ReactNode; /** 숫자 글자 안에 넣을 요소(예: 세어 올라가는 Count) */ num?: React.ReactNode; lead?: IconName; a11yLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const m: Record<StatTone, [string, string, string]> = {
    yellow: [t.yellow, t.onYellow, t.orangeText],
    green: [t.green, '#ffffff', t.greenText],
    blue: [t.blue, '#ffffff', t.blueText],
    orange: [t.orange, '#ffffff', t.orangeText],
  };
  const [bg, head, ink] = m[tone];
  return (
    <View accessible={!!a11yLabel} accessibilityLabel={a11yLabel} style={[{ flex: 1, borderRadius: 16, padding: 2, backgroundColor: bg }, style]}>
      <View style={{ height: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {typeof icon === 'string' ? <Icon name={icon as IconName} size={13} color={head} sw={icon === 'check' ? 3.2 : undefined} /> : icon}
        {label ? (
          <T s={12} w="700" c={head} lh={1.4}>
            {label}
          </T>
        ) : null}
      </View>
      <View style={{ height: 56, borderRadius: 14, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {lead ? <Icon name={lead} size={18} color={t.yellow} /> : null}
        {num != null || typeof value === 'string' || typeof value === 'number' ? (
          <T s={20} w="700" c={ink} mono lh={1.45}>
            {num ?? value}
          </T>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/**
 * 오늘 할 일 한 줄: 아이콘 상자 40, 이름, 가는 막대(8), 오른쪽 숫자 "n/m" 또는 체크.
 */
export function TaskRow({
  name,
  value,
  of,
  color,
  icon,
  iconColor,
  iconBg,
  doneColor,
  nameWidth = 92,
  trackWidth,
  onPress,
  a11yLabel,
  doneLabel,
}: {
  name: string;
  value: number;
  of: number;
  color?: string;
  icon?: IconName | React.ReactNode;
  iconColor?: string;
  iconBg?: string;
  doneColor?: string;
  nameWidth?: number;
  trackWidth?: number;
  onPress?: () => void;
  a11yLabel?: string;
  /** 마친 줄에서 체크 옆에 보이는 다음 동작(예: "추가 학습") */
  doneLabel?: string;
}) {
  const t = useTheme();
  const done = of > 0 && value >= of;
  const row = (
    <>
      {icon != null ? (
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: iconBg ?? t.blueWeak, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={22} color={iconColor ?? t.blueText} /> : icon}
        </View>
      ) : null}
      <T s={16} w="600" lines={1} style={trackWidth ? { flex: 1 } : { width: nameWidth }}>
        {name}
      </T>
      <ProgressBar value={of > 0 ? value / of : 0} height={8} band={false} color={color ?? t.blue} style={trackWidth ? { width: trackWidth } : { flex: 1 }} />
      <View style={{ minWidth: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        {done && doneLabel ? (
          <>
            <Icon name="check" size={16} color={doneColor ?? t.green} sw={3} />
            <T s={14} w="600" c={t.blueText} lh={1.4}>
              {doneLabel}
            </T>
            <Icon name="chev" size={14} color={t.blueText} />
          </>
        ) : done ? (
          <Icon name="check" size={18} color={doneColor ?? t.green} sw={3} />
        ) : (
          <T s={14} w="600" c={t.mute} mono>
            {value}/{of}
          </T>
        )}
      </View>
    </>
  );
  const st: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 };
  const label = a11yLabel ?? `${name} ${value}/${of}`;
  if (onPress)
    return (
      <Tap onPress={onPress} label={label} press="soft" style={st}>
        {row}
      </Tap>
    );
  return (
    <View style={st} accessible accessibilityLabel={label}>
      {row}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 머리글, 빈 상태, 표식
// ─────────────────────────────────────────────────────────────

/** 카드 안이나 카드 사이의 짧은 머리글. 기본 20 굵게, small 이면 17 굵게. right 는 오른쪽 요소. */
export function SectionTitle({ title, right, small }: { index?: string; title: string; right?: React.ReactNode; small?: boolean }) {
  const head = (
    <T s={small ? 17 : 20} w="700" role="heading" level={2} style={right ? { flexShrink: 1 } : null}>
      {title}
    </T>
  );
  if (!right) return head;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {head}
      {right}
    </View>
  );
}

/** 카드 안 가는 구분선 */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.hair }, style]} />;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  const t = useTheme();
  return (
    <Box style={{ gap: 6 }}>
      <T s={17} w="700">
        {title}
      </T>
      {body ? (
        <T s={15} c={t.sub}>
          {body}
        </T>
      ) : null}
    </Box>
  );
}

/** 읽음 상태 점(8). 안 읽은 기사는 파랑, 읽은 기사는 회색. 높이는 17px 글자 첫 줄에 맞춘다. */
export function ReadMark({ read, lineHeight = 25.5 }: { read: boolean; lineHeight?: number }) {
  const t = useTheme();
  const pop = usePop(read);
  return (
    <MView ref={pop.ref} accessibilityRole="image" accessibilityLabel={read ? '읽음' : '읽지 않음'} style={[{ width: 8, height: lineHeight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, pop.style]}>
      <View style={[SOFT, { width: 8, height: 8, borderRadius: 4, backgroundColor: read ? t.p.grey300 : t.blue }]} />
    </MView>
  );
}

/**
 * 하루 표시. 할당량을 마친 날만 불꽃색(src/heat.ts)으로 칠하고, 더 푼 문제가 많을수록 짙어진다.
 * 마치지 못한 날은 칠하지 않는다. 오늘 아직이면 주황 테두리(HEAT_RING)만 두른다.
 * variant 'cal': 달력 칸(기본 36, 숫자). 'week': 주간 점(기본 30, 빈 날 회색 원, 칠한 날 체크).
 */
export function DayMark({
  status,
  label,
  size,
  today,
  extra = 0,
  variant = 'cal',
  a11yLabel,
}: {
  status: 'done' | 'late' | 'pending' | 'missed' | 'none' | 'future';
  label: string;
  size?: number;
  today?: boolean;
  extra?: number;
  variant?: 'cal' | 'week';
  a11yLabel?: string;
}) {
  const t = useTheme();
  const pop = usePop(status);
  const filled = status === 'done';
  const ring = today && !filled;
  const week = variant === 'week';
  const d = size ?? (week ? 30 : 36);
  if (week) {
    return (
      <MView
        ref={pop.ref}
        accessibilityRole="image"
        accessibilityLabel={a11yLabel ?? label}
        style={[
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: filled ? heatColor(extra) : ring ? t.card : t.p.grey100,
            borderWidth: ring ? 2 : 0,
            borderColor: ring ? HEAT_RING : 'transparent',
          },
          pop.style,
        ]}
      >
        {filled ? <Icon name="check" size={Math.round(d * 0.47)} color={heatInk(extra)} sw={3.2} /> : null}
      </MView>
    );
  }
  const fg = filled ? heatInk(extra) : status === 'future' ? t.p.grey300 : status === 'none' ? t.faint : t.deck;
  return (
    <MView ref={pop.ref} accessibilityLabel={a11yLabel} style={[{ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? heatColor(extra) : 'transparent' }, pop.style]}>
      {ring ? <View aria-hidden style={{ position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderRadius: d / 2 + 4, borderWidth: 2, borderColor: HEAT_RING }} /> : null}
      <T s={d >= 34 ? 15 : 13} w={filled || today ? '700' : '600'} c={fg} mono lh={1.2}>
        {label}
      </T>
    </MView>
  );
}

// ─────────────────────────────────────────────────────────────
// 시트, 시작 화면
// ─────────────────────────────────────────────────────────────

/**
 * 아래에서 올라오는 시트. 화면 맨 바깥(스크롤 밖) 에 두고 open 으로 연다.
 * 바깥 어두운 곳을 누르면 onClose. 흰 바탕, 위 모서리 20, 손잡이 36×4.
 */
type SheetProps = { open: boolean; onClose: () => void; children: React.ReactNode; label?: string; style?: StyleProp<ViewStyle> };

function SheetNative({ open, onClose, children, label = '닫기', style }: SheetProps) {
  const t = useTheme();
  const [shown, setShown] = useState(open);
  const [h, setH] = useState(600);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setShown(true);
      if (motionOff()) return v.setValue(1);
      Animated.timing(v, { toValue: 1, duration: 380, easing: EASE_SHEET, useNativeDriver: NATIVE_DRIVER }).start();
    } else if (shown) {
      if (motionOff()) {
        v.setValue(0);
        setShown(false);
        return;
      }
      Animated.timing(v, { toValue: 0, duration: 240, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start(() => setShown(false));
    }
  }, [open]);
  if (!shown) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 30 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim, opacity: v }]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={label} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 28 },
          { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }) }] },
          style,
        ]}
      >
        <View aria-hidden style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.p.grey300, alignSelf: 'center', marginBottom: 16 }} />
        {children}
      </Animated.View>
    </View>
  );
}

/**
 * 웹: 같은 움직임(열기 380ms 시트 곡선, 닫기 240ms)을 브라우저에 맡긴다. 시트 높이만큼 내려간 자리는 translateY(100%) 로 둔다.
 * 열리는 중에 닫거나 닫히는 중에 다시 열면 지금 자리에서 이어 간다.
 */
function SheetWeb({ open, onClose, children, label = '닫기', style }: SheetProps) {
  const t = useTheme();
  const [shown, setShown] = useState(open);
  const scrim = useRef<any>(null);
  const panel = useRef<any>(null);
  const tw = useRef<[Tween | null, Tween | null]>([null, null]);
  const pos = useRef(0);
  if (open && !shown) setShown(true);
  useLayoutEffect(() => {
    if (!shown) return;
    const from = tw.current[0] ? tweenStop(tw.current[0], pos.current) : pos.current;
    tw.current[1]?.anim.cancel();
    const to = open ? 1 : 0;
    pos.current = to;
    if (motionOff() || from === to) {
      tw.current = [null, null];
      if (!open) setShown(false);
      return;
    }
    const curve = open ? { duration: 380, easing: EASE_SHEET } : { duration: 240, easing: EASE_OUT };
    const fill: FillMode = open ? 'backwards' : 'forwards';
    const a = webTween(panel, curve, (x) => ({ transform: `translateY(${(1 - x) * 100}%)` }), { from, to, fill });
    const b = webTween(scrim, curve, (x) => ({ opacity: x }), { from, to, fill });
    tw.current = [a, b];
    if (!open && a) a.anim.onfinish = () => setShown(false);
    else if (!open) setShown(false);
  }, [open, shown]);
  if (!shown) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 30 }]}>
      <View ref={scrim} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={label} style={StyleSheet.absoluteFill} />
      </View>
      <View
        ref={panel}
        accessibilityViewIsModal
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 28 }, style]}
      >
        <View aria-hidden style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.p.grey300, alignSelf: 'center', marginBottom: 16 }} />
        {children}
      </View>
    </View>
  );
}

/**
 * 아래에서 올라오는 시트. 화면 맨 바깥(스크롤 밖) 에 두고 open 으로 연다.
 * 바깥 어두운 곳을 누르면 onClose. 흰 바탕, 위 모서리 20, 손잡이 36×4.
 */
export const Sheet = WEB ? SheetWeb : SheetNative;

/** 앱 표식: 파랑 둥근 사각형(88, 모서리 24) 안에 흰 칸 3×3. */
export function AppMark({ size = 88 }: { size?: number }) {
  const t = useTheme();
  const k = size / 88;
  const cell = 20 * k;
  const gap = 5 * k;
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: 24 * k, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: cell * 3 + gap * 2, flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={{ width: cell, height: cell, borderRadius: 6 * k, backgroundColor: '#ffffff' }} />
        ))}
      </View>
    </View>
  );
}

/** 시작 화면: 표식과 이름이 0.3초 동안 나타나 잠시 머문 뒤 사라지고 onDone. 화면 맨 바깥에 둔다. */
function SplashNative({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const all = useRef(new Animated.Value(1)).current;
  const mark = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  const word = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (motionOff()) {
      const id = setTimeout(onDone, 400);
      return () => clearTimeout(id);
    }
    Animated.timing(mark, { toValue: 1, duration: 300, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    Animated.timing(word, { toValue: 1, duration: 300, delay: 80, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    const id = setTimeout(() => {
      Animated.timing(all, { toValue: 0, duration: 200, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }).start(() => onDone());
    }, 820);
    return () => clearTimeout(id);
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 50, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', gap: 16, opacity: all }]}>
      <Animated.View style={{ opacity: mark, transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
        <AppMark />
      </Animated.View>
      <Animated.View style={{ opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }}>
        <T s={24} w="800" lh={1.4}>
          Latticework
        </T>
      </Animated.View>
    </Animated.View>
  );
}

/** 웹: 같은 시간과 곡선을 브라우저에 맡긴다. */
function SplashWeb({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const all = useRef<any>(null);
  const mark = useRef<any>(null);
  const word = useRef<any>(null);
  useLayoutEffect(() => {
    if (motionOff()) {
      const id = setTimeout(onDone, 400);
      return () => clearTimeout(id);
    }
    const a = webTween(mark, { duration: 300, easing: EASE_OUT }, (v) => ({ opacity: v, transform: `scale(${0.96 + 0.04 * v})` }));
    const b = webTween(word, { duration: 300, easing: EASE_OUT }, (v) => ({ opacity: v, transform: `translateY(${4 * (1 - v)}px)` }), { delay: 80 });
    let c: Tween | null = null;
    const id = setTimeout(() => {
      c = webTween(all, { duration: 200, easing: Easing.linear }, (v) => ({ opacity: v }), { from: 1, to: 0, fill: 'forwards' });
      if (c) c.anim.onfinish = () => onDone();
      else onDone();
    }, 820);
    return () => {
      clearTimeout(id);
      a?.anim.cancel();
      b?.anim.cancel();
      if (c) c.anim.onfinish = null;
    };
  }, []);
  return (
    <View ref={all} style={[StyleSheet.absoluteFill, { zIndex: 50, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
      <View ref={mark}>
        <AppMark />
      </View>
      <View ref={word}>
        <T s={24} w="800" lh={1.4}>
          Latticework
        </T>
      </View>
    </View>
  );
}

export const Splash = WEB ? SplashWeb : SplashNative;

export const VERDICT_LABEL = { hit: '적중', miss: '빗나감', open: '미확인' } as const;

export function verdictTone(v: 'hit' | 'miss' | 'open'): Tone {
  return v === 'hit' ? 'blue' : v === 'miss' ? 'orange' : 'neutral';
}
