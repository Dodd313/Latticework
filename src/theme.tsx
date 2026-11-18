import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

// 차분한 장부 느낌: 푸른 기가 도는 바탕, 짙은 남색 글자, 파랑과 주황 두 강조색.
const light = {
  mode: 'light' as 'light' | 'dark',
  ground: '#F3F5F7',
  card: '#FFFFFF',
  ink: '#0F1A2A',
  sub: '#4A5668',
  mute: '#5F6B7C',
  line: '#DCE1E8',
  lineSoft: '#E4E8EE',
  chip: '#E4E8EE',
  track: '#C9D1DC',
  blue: '#1F5FD1',
  blueTint: '#E6EEFB',
  onBlueTint: '#33415A',
  blueSolid: '#1F5FD1',
  onBlueSolid: '#FFFFFF',
  orange: '#B4530F',
  orangeTint: '#FBEBDD',
  inverse: '#0F1A2A',
  onInverse: '#FFFFFF',
  onInverseAccent: '#F6C9A3',
  field: '#E4E8EE',
};

export type Theme = typeof light;

const dark: Theme = {
  mode: 'dark',
  ground: '#0B121C',
  card: '#131C29',
  ink: '#E8EDF4',
  sub: '#A9B4C3',
  mute: '#8E9AAB',
  line: '#253142',
  lineSoft: '#1E2937',
  chip: '#1E2937',
  track: '#33415A',
  blue: '#8AB1F5',
  blueTint: '#16263F',
  onBlueTint: '#C5D3E8',
  blueSolid: '#8AB1F5',
  onBlueSolid: '#0B121C',
  orange: '#F0A566',
  orangeTint: '#3A2413',
  inverse: '#E8EDF4',
  onInverse: '#0B121C',
  onInverseAccent: '#8A4A12',
  field: '#1E2937',
};

export const FONT_SANS = Platform.select({
  web: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif",
  default: undefined,
});

export const FONT_MONO = Platform.select({
  web: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  ios: 'Menlo',
  default: 'monospace',
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
