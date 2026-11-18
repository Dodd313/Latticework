import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { EASE, NATIVE_DRIVER, motionOff } from './src/motion';
import { Nav, NavCtx, Route, TabBar, TabName } from './src/nav';
import { ArchiveScreen } from './src/screens/Archive';
import { ArticleScreen } from './src/screens/Article';
import { DayQuizScreen } from './src/screens/DayQuiz';
import { NewsScreen } from './src/screens/News';
import { StudyScreen } from './src/screens/Study';
import { ReviewScreen } from './src/screens/Review';
import { SettingsScreen } from './src/screens/Settings';
import { TodayScreen } from './src/screens/Today';
import { StoreProvider, useGoals } from './src/store';
import { Icon, T, Tap } from './src/ui';
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

/** 오늘 목표를 막 채웠을 때 한 번 뜨는 축하 화면. 눌러서 닫거나 잠시 뒤 저절로 닫힌다. */
function GoalReached() {
  const t = useTheme();
  const goals = useGoals();
  const status = goals.status;
  const run = goals.streak;
  const prev = useRef(status);
  const [shown, setShown] = useState(false);
  const v = useRef(new Animated.Value(0)).current;
  const mark = useRef(new Animated.Value(0)).current;

  const close = useCallback(() => {
    Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start(() => setShown(false));
  }, [v]);

  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (status !== 'done' || was !== 'pending') return;
    setShown(true);
    v.setValue(motionOff() ? 1 : 0);
    mark.setValue(motionOff() ? 1 : 0);
    if (!motionOff()) {
      Animated.timing(v, { toValue: 1, duration: 320, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
      Animated.spring(mark, { toValue: 1, friction: 5, tension: 160, delay: 180, useNativeDriver: NATIVE_DRIVER }).start();
    }
    const timer = setTimeout(close, 3200);
    return () => clearTimeout(timer);
  }, [status]);

  if (!shown) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.ground, opacity: v, alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
      <Tap onPress={close} label="닫기" style={{ alignItems: 'center', gap: 18, alignSelf: 'stretch' }}>
        <Animated.View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.green, alignItems: 'center', justifyContent: 'center', transform: [{ scale: mark }] }}>
          <Icon name="check" size={34} color="#FFFFFF" bold />
        </Animated.View>
        <View style={{ alignSelf: 'stretch', borderTopWidth: 3, borderTopColor: t.rule, borderBottomWidth: 1, borderBottomColor: t.rule, paddingVertical: 22, alignItems: 'center', gap: 6 }}>
          <T s={13} w="700" c={t.sub} style={{ letterSpacing: 0.4 }}>
            오늘 목표 달성
          </T>
          <T serif s={44} w="700" lh={1.2}>
            연속 {run}일
          </T>
        </View>
        <T s={14} c={t.sub} center>
          오늘 할 일을 모두 마쳤습니다.
        </T>
      </Tap>
    </Animated.View>
  );
}

function Shell() {
  const t = useTheme();
  const [tab, setTabState] = useState<TabName>('today');
  const [visited, setVisited] = useState<Record<TabName, boolean>>({ today: true, archive: false, review: false });
  const [stack, setStack] = useState<Route[]>([]);
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
  const nav = useMemo<Nav>(() => ({ tab, setTab, push, pop }), [tab, setTab, push, pop]);
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
            {layer('archive', <ArchiveScreen />)}
            {layer('review', <ReviewScreen />)}
            {stack.map((route, i) => (
              <StackLayer key={`${i}-${route.name}-${route.name === 'article' ? route.id : route.name === 'quiz' ? route.date : route.name === 'study' ? route.sect : ''}`} closing={closing && i === stack.length - 1} onClosed={finishPop} bg={t.ground}>
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
          <GoalReached />
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
