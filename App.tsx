import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { EASE, NATIVE_DRIVER, motionOff } from './src/motion';
import { Nav, NavCtx, Route, TabBar, TabName } from './src/nav';
import { ArchiveScreen } from './src/screens/Archive';
import { ArticleScreen } from './src/screens/Article';
import { ReviewScreen } from './src/screens/Review';
import { SettingsScreen } from './src/screens/Settings';
import { ThreadsScreen } from './src/screens/Threads';
import { TodayScreen } from './src/screens/Today';
import { StoreProvider } from './src/store';
import { ThemeProvider, useTheme } from './src/theme';

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

/** 기사와 설정 같은 안쪽 화면 한 장. 오른쪽에서 밀려 들어오고, 닫힐 때 같은 길로 나간다. */
function StackLayer({ closing, onClosed, bg, children }: { closing: boolean; onClosed: () => void; bg: string; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  useEffect(() => {
    if (motionOff()) return;
    Animated.timing(v, { toValue: 1, duration: 360, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
  }, []);
  useEffect(() => {
    if (!closing) return;
    if (motionOff()) {
      onClosed();
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start(() => onClosed());
  }, [closing]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg, opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }] }]}>{children}</Animated.View>
  );
}

function Shell() {
  const t = useTheme();
  const [tab, setTabState] = useState<TabName>('today');
  const [visited, setVisited] = useState<Record<TabName, boolean>>({ today: true, threads: false, archive: false, review: false });
  const [stack, setStack] = useState<Route[]>([]);
  const [threadFocus, setThreadFocus] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const setTab = useCallback((next: TabName) => {
    setStack([]);
    setClosing(false);
    setTabState(next);
    setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
  }, []);

  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  // 닫기는 두 단계다: 먼저 나가는 움직임을 재생하고, 끝나면 실제로 걷어 낸다.
  const pop = useCallback(() => setClosing(true), []);
  const finishPop = useCallback(() => {
    setStack((s) => s.slice(0, -1));
    setClosing(false);
  }, []);
  const openThread = useCallback(
    (id: string) => {
      setThreadFocus(id);
      setTab('threads');
    },
    [setTab],
  );

  const nav = useMemo<Nav>(() => ({ tab, setTab, push, pop, openThread, threadFocus }), [tab, setTab, push, pop, openThread, threadFocus]);
  const top = stack[stack.length - 1];

  const layer = (name: TabName, node: React.ReactNode) =>
    visited[name] ? (
      <TabLayer key={name} active={tab === name}>
        {node}
      </TabLayer>
    ) : null;

  return (
    <NavCtx.Provider value={nav}>
      <View style={[styles.root, { backgroundColor: t.ground }]}>
        <View style={styles.column}>
          <View style={[styles.fill, { overflow: 'hidden' }]}>
            {layer('today', <TodayScreen />)}
            {layer('threads', <ThreadsScreen />)}
            {layer('archive', <ArchiveScreen />)}
            {layer('review', <ReviewScreen />)}
            {stack.map((route, i) => (
              <StackLayer key={`${i}-${route.name === 'article' ? route.id : 'settings'}`} closing={closing && i === stack.length - 1} onClosed={finishPop} bg={t.ground}>
                {route.name === 'article' ? <ArticleScreen id={route.id} /> : <SettingsScreen />}
              </StackLayer>
            ))}
          </View>
          {top && top.name === 'article' ? null : <TabBar />}
        </View>
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
  column: { flex: 1, width: '100%', maxWidth: 560 },
  fill: { flex: 1 },
});
