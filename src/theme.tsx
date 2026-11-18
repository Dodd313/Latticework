import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

// 지면형: 흰 종이, 먹색 글자, 가는 괘선. 강조는 남색 하나이고, 읽지 않은 기사 표식만 초록이다.
const light = {
  mode: 'light' as 'light' | 'dark',
  ground: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#111418',
  bodyInk: '#1B2027',
  deck: '#3A424D',
  sub: '#4B5563',
  mute: '#6B7480',
  rule: '#111418',
  line: '#D5D9DF',
  lineSoft: '#E6E9ED',
  chip: '#EEF0F3',
  track: '#D5D9DF',
  blue: '#1F4FA8',
  blueTint: '#EEF2F9',
  onBlueTint: '#3A424D',
  blueSolid: '#1F4FA8',
  onBlueSolid: '#FFFFFF',
  orange: '#B4530F',
  orangeTint: '#FBEBDD',
  green: '#1E8E4E',
  inverse: '#111418',
  onInverse: '#FFFFFF',
  onInverseAccent: '#F6C9A3',
  field: '#F1F3F5',
};

export type Theme = typeof light;

const dark: Theme = {
  mode: 'dark',
  ground: '#101214',
  card: '#101214',
  ink: '#ECEEF1',
  bodyInk: '#D9DDE3',
  deck: '#C3CAD4',
  sub: '#A8B0BB',
  mute: '#8B94A0',
  rule: '#ECEEF1',
  line: '#2B3138',
  lineSoft: '#22272D',
  chip: '#22272D',
  track: '#343B44',
  blue: '#9DB8EA',
  blueTint: '#18202D',
  onBlueTint: '#C3CAD4',
  blueSolid: '#9DB8EA',
  onBlueSolid: '#101214',
  orange: '#F0A566',
  orangeTint: '#3A2413',
  green: '#4CC27E',
  inverse: '#ECEEF1',
  onInverse: '#101214',
  onInverseAccent: '#8A4A12',
  field: '#1B2026',
};

export const FONT_SANS = Platform.select({
  web: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif",
  default: undefined,
});

// 제목과 본문에 쓰는 명조.
export const FONT_SERIF = Platform.select({
  web: "'Noto Serif KR', 'AppleMyungjo', 'Nanum Myeongjo', Batang, serif",
  ios: 'AppleMyungjo',
  default: 'serif',
});

// 날짜와 숫자. 지면형에서는 고정폭 글꼴 대신 본문 고딕에 숫자 폭만 맞춘다.
export const FONT_MONO = Platform.select({
  web: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif",
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
