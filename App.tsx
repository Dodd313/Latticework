import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { EASE, EASE_OUT, EASE_SHEET, NATIVE_DRIVER, motionOff } from './src/motion';
import { Nav, NavCtx, Route, TabBar, TabName } from './src/nav';
import { ArchiveScreen } from './src/screens/Archive';
import { ArticleScreen } from './src/screens/Article';
import { DayQuizScreen } from './src/screens/DayQuiz';
import { NewsScreen } from './src/screens/News';
import { StudyScreen } from './src/screens/Study';
import { ReviewScreen } from './src/screens/Review';
import { SettingsScreen } from './src/screens/Settings';
import { TodayScreen } from './src/screens/Today';
import { StoreProvider } from './src/store';
import { Splash } from './src/ui';
import { ThemeProvider, useTheme } from './src/theme';

/** 화면 기둥의 최대 폭 */
const COLUMN = 560;

/** 탭 화면 한 장. 보이게 될 때 살짝 떠오르며 나타난다. */
function TabLayer({ active, children }: { active: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || motionOff()) return;
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 300, easing: EASE, useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [active]);
  return <Animated.View style={[styles.fill, { display: active ? 'flex' : 'none', opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

/**
 * 기사와 설정 같은 안쪽 화면 한 장. 오른쪽 끝에서 화면 폭만큼 밀려 들어오고(시트 곡선 420ms),
 * 닫힐 때 같은 길로 나간다(320ms).
 */
function StackLayer({ id, closing, onClosed, bg, children }: { id: number; closing: boolean; onClosed: (id: number) => void; bg: string; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, COLUMN);
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (motionOff()) return;
    Animated.timing(v, { toValue: 1, duration: 420, easing: EASE_SHEET, useNativeDriver: NATIVE_DRIVER }).start();
  }, []);
  useEffect(() => {
    if (!closing) return;
    if (motionOff()) {
      onClosed(id);
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 320, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start(() => onClosed(id));
  }, [closing]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg, pointerEvents: closing ? 'none' : 'auto', transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [w, 0] }) }] }]}>{children}</Animated.View>
  );
}

function Shell() {
  const t = useTheme();
  const [tab, setTabState] = useState<TabName>('today');
  const [visited, setVisited] = useState<Record<TabName, boolean>>({ today: true, archive: false, review: false });
  // 쌓인 화면마다 고유 번호를 둔다. 닫히는 중인 화면 위로 새 화면이 올라와도 닫힘이 엉뚱한 화면으로 옮겨 가지 않는다.
  const [stack, setStack] = useState<{ id: number; route: Route; closing: boolean }[]>([]);
  const seq = useRef(0);
  // 시작 화면은 앱을 열 때 한 번만. 움직임 줄이기가 켜져 있으면 건너뛴다.
  const [splash, setSplash] = useState(() => !motionOff());
  const endSplash = useCallback(() => setSplash(false), []);

  const setTab = useCallback((next: TabName) => {
    setStack([]);
    setTabState(next);
    setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
  }, []);

  const push = useCallback((route: Route) => setStack((s) => [...s, { id: ++seq.current, route, closing: false }]), []);
  // 닫기는 두 단계다: 먼저 맨 위의 열린 화면이 나가는 움직임을 재생하고, 끝나면 그 화면만 걷어 낸다.
  const pop = useCallback(
    () =>
      setStack((s) => {
        for (let i = s.length - 1; i >= 0; i--) if (!s[i].closing) return s.map((e, k) => (k === i ? { ...e, closing: true } : e));
        return s;
      }),
    [],
  );
  const finishPop = useCallback((id: number) => setStack((s) => s.filter((e) => e.id !== id)), []);
  const nav = useMemo<Nav>(() => ({ tab, setTab, push, pop }), [tab, setTab, push, pop]);
  const top = stack[stack.length - 1]?.route;

  const layer = (name: TabName, node: React.ReactNode) =>
    visited[name] ? (
      <TabLayer key={name} active={tab === name}>
        {node}
      </TabLayer>
    ) : null;

  return (
    <NavCtx.Provider value={nav}>
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        <View style={styles.column}>
          <View style={[styles.fill, { overflow: 'hidden' }]}>
            {layer('today', <TodayScreen />)}
            {layer('archive', <ArchiveScreen />)}
            {layer('review', <ReviewScreen />)}
            {stack.map(({ id, route, closing }) => (
              <StackLayer key={id} id={id} closing={closing} onClosed={finishPop} bg={t.card}>
                {route.name === 'article' ? (
                  <ArticleScreen id={route.id} />
                ) : route.name === 'quiz' ? (
                  <DayQuizScreen date={route.date} />
                ) : route.name === 'news' ? (
                  <NewsScreen />
                ) : route.name === 'study' ? (
                  <StudyScreen sect={route.sect} />
                ) : (
                  <SettingsScreen />
                )}
              </StackLayer>
            ))}
          </View>
          {top && top.name !== 'settings' ? null : <TabBar />}
        </View>
        {splash ? <Splash onDone={endSplash} /> : null}
      </View>
    </NavCtx.Provider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: COLUMN },
  fill: { flex: 1 },
});
