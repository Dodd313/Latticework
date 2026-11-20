import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

// Toss 디자인 시스템 색. 값은 @toss/tds-colors 공식 패키지(밝은 테마는 기본 값, 어두운 테마는 adaptive 값)와
// motion-lab/v3/kit.css 의 계산 규칙(연한 바탕 = 300 단계 15%, 하단 테두리 = 채움색 밝기 0.134 낮춤)을 그대로 쓴다.

const LIGHT_PALETTE = {
  white: '#ffffff',
  grey50: '#f9fafb',
  grey100: '#f2f4f6',
  grey200: '#e5e8eb',
  grey300: '#d1d6db',
  grey400: '#b0b8c1',
  grey500: '#8b95a1',
  grey600: '#6b7684',
  grey700: '#4e5968',
  grey800: '#333d4b',
  grey900: '#191f28',
  blue50: '#e8f3ff',
  blue100: '#c9e2ff',
  blue200: '#90c2ff',
  blue300: '#64a8ff',
  blue400: '#4593fc',
  blue500: '#3182f6',
  blue600: '#2272eb',
  blue700: '#1b64da',
  green50: '#f0faf6',
  green100: '#aeefd5',
  green200: '#76e4b8',
  green300: '#3fd599',
  green400: '#15c47e',
  green500: '#03b26c',
  green600: '#02a262',
  green700: '#029359',
  red50: '#ffeeee',
  red100: '#ffd4d6',
  red200: '#feafb4',
  red300: '#fb8890',
  red500: '#f04452',
  red600: '#e42939',
  red700: '#d22030',
  orange50: '#fff3e0',
  orange100: '#ffe0b0',
  orange200: '#ffcd80',
  orange300: '#ffbd51',
  orange400: '#ffa927',
  orange500: '#fe9800',
  orange600: '#fb8800',
  orange700: '#f57800',
  orange800: '#ed6700',
  orange900: '#e45600',
  yellow50: '#fff9e7',
  yellow100: '#ffefbf',
  yellow200: '#ffe69b',
  yellow300: '#ffdd78',
  yellow400: '#ffd158',
  yellow500: '#ffc342',
  yellow600: '#ffb331',
  yellow700: '#faa131',
  purple50: '#f9f0fc',
  purple500: '#a234c7',
  purple600: '#8f2ab3',
};

export type Palette = typeof LIGHT_PALETTE;

const DARK_PALETTE: Palette = {
  white: '#ffffff',
  grey50: '#202027',
  grey100: '#2c2c35',
  grey200: '#3c3c47',
  grey300: '#4d4d59',
  grey400: '#62626d',
  grey500: '#7e7e87',
  grey600: '#9e9ea4',
  grey700: '#c3c3c6',
  grey800: '#e4e4e5',
  grey900: '#ffffff',
  blue50: '#202c4d',
  blue100: '#23386a',
  blue200: '#25478c',
  blue300: '#265ab3',
  blue400: '#2970d9',
  blue500: '#3485fa',
  blue600: '#449bff',
  blue700: '#61b0ff',
  green50: '#153729',
  green100: '#135338',
  green200: '#136d47',
  green300: '#138a59',
  green400: '#13a065',
  green500: '#16bb76',
  green600: '#26cf88',
  green700: '#4ee4a6',
  red50: '#3c2020',
  red100: '#562025',
  red200: '#7a242d',
  red300: '#9e2733',
  red500: '#f04251',
  red600: '#fa616d',
  red700: '#fe818b',
  orange50: '#3d2500',
  orange100: '#563200',
  orange200: '#804600',
  orange300: '#a85f00',
  orange400: '#cf7200',
  orange500: '#f18600',
  orange600: '#fd9528',
  orange700: '#ffa861',
  orange800: '#ffc39e',
  orange900: '#ffe4d6',
  yellow50: '#3d2d1a',
  yellow100: '#724c1e',
  yellow200: '#b56f1d',
  yellow300: '#eb8b1e',
  yellow400: '#ffa126',
  yellow500: '#ffb134',
  yellow600: '#ffc259',
  yellow700: '#ffd68a',
  purple50: '#3f2447',
  purple500: '#ae3dd1',
  purple600: '#c353e5',
};

function build(mode: 'light' | 'dark', p: Palette, x: { bg: string; card: string; layer: string; blueWeak: string; greenWeak: string; redWeak: string; orangeWeak: string; purpleWeak: string; blueLip: string; greenLip: string; redLip: string; orangeLip: string; scrim: string; press: string; fill: string }) {
  return {
    mode,
    p,
    // 바탕과 면
    bg: x.bg, // 화면 바탕 (grey100)
    card: x.card, // 흰 카드, 안쪽 화면, 아래 탭
    layer: x.layer, // 카드 안의 옅은 상자 (요약 상자 등)
    fill: x.fill, // 작은 배지 바탕 (rgba 회색)
    scrim: x.scrim, // 시트 뒤 어둡게
    press: x.press, // 눌림 7%
    // 글자
    ink: p.grey900, // 제목, 주요 숫자
    body: p.grey800, // 본문
    sub: p.grey600, // 보조 글자
    mute: p.grey500, // 더 옅은 글자, 머리 오른쪽 값
    faint: p.grey400, // 비활성 아이콘, 탭 꺼짐
    onColor: '#ffffff', // 파랑/초록/빨강 위 글자
    // 선
    line: p.grey200, // 테두리, 막대 바탕
    hair: p.grey100, // 카드 안 구분선
    // 색
    blue: p.blue500,
    blueText: p.blue600,
    blueWeak: x.blueWeak,
    blueLine: p.blue200,
    green: p.green500,
    greenText: p.green600,
    greenWeak: x.greenWeak,
    greenLine: p.green200,
    red: p.red500,
    redText: p.red600,
    redWeak: x.redWeak,
    redLine: p.red200,
    orange: p.orange500,
    orangeText: p.orange700,
    orangeWeak: x.orangeWeak,
    orangeSoft: p.orange100,
    yellow: p.yellow500,
    onYellow: 'rgba(0,12,30,0.8)',
    purple: p.purple500,
    purpleWeak: x.purpleWeak,
    // 입체 버튼의 하단 테두리
    blueLip: x.blueLip,
    greenLip: x.greenLip,
    redLip: x.redLip,
    orangeLip: x.orangeLip,

    deck: p.grey700,
  };
}

const light = build('light', LIGHT_PALETTE, {
  bg: LIGHT_PALETTE.grey100,
  card: '#ffffff',
  layer: LIGHT_PALETTE.grey50,
  fill: 'rgba(2,32,71,0.05)',
  scrim: 'rgba(0,0,0,0.2)',
  press: 'rgba(0,0,0,0.07)',
  blueWeak: '#e8f2ff',
  greenWeak: '#e2f9f0',
  redWeak: '#feedee',
  orangeWeak: '#fff5e5',
  purpleWeak: '#f7edfa',
  blueLip: '#0057c8',
  greenLip: '#008845',
  redLip: '#bf002b',
  orangeLip: '#d06e00',
});

export type Theme = ReturnType<typeof build>;

const dark: Theme = build('dark', DARK_PALETTE, {
  bg: '#101013', // adaptiveGreyBackground
  card: '#17171c', // adaptiveBackground
  layer: '#202027', // adaptiveLayeredBackground
  fill: 'rgba(217,217,255,0.11)',
  scrim: 'rgba(0,0,0,0.56)',
  press: 'rgba(255,255,255,0.06)',
  blueWeak: DARK_PALETTE.blue50,
  greenWeak: DARK_PALETTE.green50,
  redWeak: DARK_PALETTE.red50,
  orangeWeak: DARK_PALETTE.orange50,
  purpleWeak: DARK_PALETTE.purple50,
  blueLip: DARK_PALETTE.blue200,
  greenLip: DARK_PALETTE.green200,
  redLip: DARK_PALETTE.red200,
  orangeLip: DARK_PALETTE.orange200,
});

/** Toss 글자 단계: [크기, 줄 높이] */
export const TYPE = {
  t1: [30, 40],
  t2: [26, 35],
  t3: [22, 31],
  t4: [20, 29],
  t5: [17, 25.5],
  t6: [15, 22.5],
  t7: [13, 19.5],
} as const;
export type TypeStep = keyof typeof TYPE;

/** 화면 치수 */
export const SPACE = {
  side: 12, // 카드 바깥 좌우 여백
  gap: 12, // 카드 사이
  pad: 20, // 카드 안쪽
  radius: 20, // 카드 모서리
  inner: 16, // 단추, 선택지, 작은 상자 모서리
} as const;

export const FONT_SANS = Platform.select({
  web: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', system-ui, sans-serif",
  default: undefined,
});

function readExplicit(): 'light' | 'dark' | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'dark' || v === 'light' ? v : null;
}

const ThemeCtx = createContext<Theme>(light);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [explicit, setExplicit] = useState<'light' | 'dark' | null>(readExplicit());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof MutationObserver === 'undefined') return;
    // 보는 사람이 화면 테마를 직접 고르면 시스템 설정보다 그 선택을 따른다.
    const obs = new MutationObserver(() => setExplicit(readExplicit()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const mode = explicit ?? (system === 'dark' ? 'dark' : 'light');
  return <ThemeCtx.Provider value={mode === 'dark' ? dark : light}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeCtx);
}
