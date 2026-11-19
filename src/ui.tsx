import React from 'react';
import { Animated, Linking, Platform, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { usePop } from './motion';
import { FONT_MONO, FONT_SANS, FONT_SERIF, useTheme } from './theme';

type TProps = {
  s?: number; // 글자 크기
  w?: '400' | '500' | '600' | '700';
  c?: string;
  mono?: boolean;
  serif?: boolean; // 명조. 제목과 본문에 쓴다
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

export function T({ s = 15, w = '400', c, mono, serif, lh, center, lines, style, children, role, level }: TProps) {
  const t = useTheme();
  const a11y = role === 'heading' ? ({ accessibilityRole: 'header', 'aria-level': level ?? 2 } as any) : null;
  return (
    <Text
      {...a11y}
      numberOfLines={lines}
      style={[
        {
          fontFamily: serif ? FONT_SERIF : mono ? FONT_MONO : FONT_SANS,
          fontSize: s,
          fontWeight: w,
          color: c ?? t.ink,
          lineHeight: Math.round(s * (lh ?? (s >= 22 ? 1.3 : 1.5))),
          textAlign: center ? 'center' : undefined,
          letterSpacing: serif ? (s >= 20 ? -0.6 : -0.2) : s >= 22 && !mono ? -0.4 : 0,
        },
        mono ? ({ fontVariant: ['tabular-nums'] } as TextStyle) : null,
        KOREAN_WRAP,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** 지면형의 구획. 상자 대신 위쪽 괘선 하나로 나눈다. 색 바탕(tone)은 강조할 때만 쓴다. */
/**
 * 문제 본문용 글자. <sub>…</sub> 와 <sup>…</sup> 만 아래첨자와 위첨자로 그리고, 그 밖의 태그는 지운다.
 */
export function Rich({ children, ...rest }: Omit<TProps, 'children'> & { children?: string }) {
  const text = String(children ?? '');
  const size = rest.s ?? 15;
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

export function Card({ children, style, tone = 'card' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'card' | 'blue' | 'inverse' }) {
  const t = useTheme();
  if (tone === 'card') return <View style={[{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: t.line }, style]}>{children}</View>;
  return <View style={[{ backgroundColor: tone === 'blue' ? t.blueTint : t.inverse, padding: 16 }, style]}>{children}</View>;
}

export type Tone = 'blue' | 'orange' | 'neutral' | 'solid' | 'outline' | 'onTint';

/** 분류, 보도 구분, 점검 결과 같은 짧은 꼬리표. 지면형에서는 바탕 없이 굵은 글자로만 쓴다. */
export function Chip({ label, tone = 'blue' }: { label: string; tone?: Tone; mono?: boolean }) {
  const t = useTheme();
  const fg: Record<Tone, string> = { blue: t.blue, orange: t.orange, neutral: t.sub, solid: t.blue, outline: t.sub, onTint: t.blue };
  return (
    <T s={12.5} w="700" c={fg[tone]} lh={1.35} style={{ letterSpacing: 0.3 }}>
      {label}
    </T>
  );
}

export type IconName = 'home' | 'today' | 'threads' | 'archive' | 'review' | 'gear' | 'back' | 'next' | 'external' | 'search' | 'check' | 'down';

export function Icon({ name, size = 24, color, bold }: { name: IconName; size?: number; color?: string; bold?: boolean }) {
  const t = useTheme();
  const stroke = color ?? t.ink;
  const sw = bold ? 2.2 : 1.8;
  const common = { fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: React.ReactNode = null;
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
    case 'next':
      body = <Path d="M9.5 5.5L16 12l-6.5 6.5" {...common} />;
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
  }
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {body}
      </Svg>
    </View>
  );
}

// 웹에서는 눌림과 색 바뀜이 툭 끊기지 않게 짧은 전환을 건다.
const SOFT: any = Platform.OS === 'web' ? { transitionProperty: 'opacity, background-color, border-color', transitionDuration: '180ms', transitionTimingFunction: 'ease-out' } : null;

export function Tap({
  onPress,
  label,
  children,
  style,
  disabled,
  selected,
  role = 'button',
  nativeID,
}: {
  onPress?: () => void;
  label?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  selected?: boolean;
  role?: 'button' | 'tab' | 'link';
  nativeID?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected }}
      style={({ pressed }) => [SOFT, disabled ? { opacity: 0.45 } : null, style, pressed ? { opacity: 0.55 } : null]}
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

export function SectionTitle({ title }: { index?: string; title: string }) {
  return (
    <T s={13} w="700" role="heading" level={2} style={{ letterSpacing: 0.4 }}>
      {title}
    </T>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.lineSoft }} />;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 8, paddingVertical: 24 }}>
      <T serif s={19} w="700" lh={1.4}>
        {title}
      </T>
      <T s={14} c={t.sub}>
        {body}
      </T>
    </Card>
  );
}

/** 읽음 상태. 글자 대신 작은 표식으로만 보여 준다: 읽은 기사는 회색 체크, 안 읽은 기사는 초록 점. */
export function ReadMark({ read }: { read: boolean }) {
  const t = useTheme();
  const scale = usePop(read);
  return (
    <Animated.View accessibilityRole="image" accessibilityLabel={read ? '읽음' : '읽지 않음'} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
      {read ? <Icon name="check" size={16} color={t.mute} bold /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />}
    </Animated.View>
  );
}

/**
 * 하루 목표의 상태를 그리는 둥근 표식. 달력과 주간 줄에서 같이 쓴다.
 * 달성: 먹색으로 채움 · 늦게 읽음: 먹색 테두리 · 오늘 남음: 초록 테두리 · 미달성: 주황 점선 · 발행 없음: 표식 없음
 */
export function DayMark({ status, label, size = 32, today }: { status: 'done' | 'late' | 'pending' | 'missed' | 'none' | 'future'; label: string; size?: number; today?: boolean }) {
  const t = useTheme();
  const scale = usePop(status);
  const filled = status === 'done';
  const border = status === 'late' ? t.rule : status === 'pending' ? t.green : status === 'missed' ? t.orange : 'transparent';
  const fg = filled ? t.onInverse : status === 'missed' ? t.orange : status === 'none' || status === 'future' ? t.mute : t.ink;
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? t.inverse : 'transparent',
        borderWidth: filled || border === 'transparent' ? 0 : status === 'pending' ? 2 : 1,
        borderColor: border,
        borderStyle: status === 'missed' ? 'dashed' : 'solid',
        transform: [{ scale }],
      }}
    >
      <T s={size >= 36 ? 14 : 13} w={filled || today ? '700' : '400'} c={fg} mono lh={1.2}>
        {label}
      </T>
    </Animated.View>
  );
}

export const VERDICT_LABEL = { hit: '적중', miss: '빗나감', open: '미확인' } as const;

export function verdictTone(v: 'hit' | 'miss' | 'open'): Tone {
  return v === 'hit' ? 'blue' : v === 'miss' ? 'orange' : 'neutral';
}
