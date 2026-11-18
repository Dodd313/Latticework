import React from 'react';
import { Linking, Platform, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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

export type IconName = 'today' | 'threads' | 'archive' | 'review' | 'gear' | 'back' | 'next' | 'external' | 'search' | 'check' | 'down';

export function Icon({ name, size = 24, color, bold }: { name: IconName; size?: number; color?: string; bold?: boolean }) {
  const t = useTheme();
  const stroke = color ?? t.ink;
  const sw = bold ? 2.2 : 1.8;
  const common = { fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: React.ReactNode = null;
  switch (name) {
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
      style={({ pressed }) => [disabled ? { opacity: 0.45 } : null, style, pressed ? { opacity: 0.6 } : null]}
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
  return (
    <View accessibilityRole="image" accessibilityLabel={read ? '읽음' : '읽지 않음'} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      {read ? <Icon name="check" size={16} color={t.mute} bold /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />}
    </View>
  );
}

export const VERDICT_LABEL = { hit: '적중', miss: '빗나감', open: '미확인' } as const;

export function verdictTone(v: 'hit' | 'miss' | 'open'): Tone {
  return v === 'hit' ? 'blue' : v === 'miss' ? 'orange' : 'neutral';
}
