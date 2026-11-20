import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CSS_EASE, EASE, EASE_OUT, EASE_SHEET, NATIVE_DRIVER, motionOff, webAnimate, webStop } from './src/motion';
import { Nav, NavCtx, NavTabCtx, Route, TabBar, TabName, requestNode } from './src/nav';
import { ArchiveScreen } from './src/screens/Archive';
import { ArticleScreen } from './src/screens/Article';
import { DayQuizScreen } from './src/screens/DayQuiz';
import { NewsScreen } from './src/screens/News';
import { StudyScreen } from './src/screens/Study';
import { KnowledgeScreen } from './src/screens/Knowledge';
import { SettingsScreen } from './src/screens/Settings';
import { WeeklyQuizScreen } from './src/screens/WeeklyQuiz';
import { AfterSplash, ShownCtx } from './src/screens/Flow';
import { TodayScreen } from './src/screens/Today';
import { StoreDefer, StoreProvider } from './src/store';
import { Splash } from './src/ui';
import { ThemeProvider, useTheme } from './src/theme';

/** 화면 기둥의 최대 폭 */
const COLUMN = 560;

/**
 * 탭 화면 한 장. 보이게 될 때 살짝 떠오르며 나타난다.
 * 0 으로 되돌리기는 그리기 전에(useLayoutEffect) 한다. 그리고 난 뒤(useEffect)에 하면
 * 웹에서는 새 탭이 다 보인 채로 한 장 그려졌다가 사라진 뒤 다시 나타난다.
 */
function TabLayerNative({ active, children }: { active: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(active || motionOff() ? 1 : 0)).current;
  const lift = useMemo(() => v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }), [v]);
  useLayoutEffect(() => {
    if (!active || motionOff()) return;
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 300, easing: EASE, useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [active]);
  return <Animated.View style={[styles.fill, { display: active ? 'flex' : 'none', opacity: v, transform: [{ translateY: lift }] }]}>{children}</Animated.View>;
}

/**
 * 기사와 설정 같은 안쪽 화면 한 장. 오른쪽 끝에서 화면 폭만큼 밀려 들어오고(시트 곡선 420ms),
 * 닫힐 때 같은 길로 나간다(320ms).
 */
type StackLayerProps = { id: number; closing: boolean; onClosed: (id: number) => void; bg: string; children: React.ReactNode };

function StackLayerNative({ id, closing, onClosed, bg, children }: StackLayerProps) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, COLUMN);
  const v = useRef(new Animated.Value(motionOff() ? 1 : 0)).current;
  const slide = useMemo(() => v.interpolate({ inputRange: [0, 1], outputRange: [w, 0] }), [v, w]);
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
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg, pointerEvents: closing ? 'none' : 'auto', transform: [{ translateX: slide }] }]}>{children}</Animated.View>;
}

const TAB_IN: Keyframe[] = [
  { opacity: 0, transform: 'translateY(10px)' },
  { opacity: 1, transform: 'translateY(0px)' },
];

/** 웹의 탭 화면 한 장: 같은 움직임(300ms, 10px 위로)을 브라우저에 맡긴다. 그리기 전에 걸므로 첫 장부터 투명하게 그려진다. */
function TabLayerWeb({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (!active || motionOff()) return;
    const a = webAnimate(ref, TAB_IN, { duration: 300, easing: CSS_EASE.ease });
    return () => a?.cancel();
  }, [active]);
  return (
    <View ref={ref} style={[styles.fill, { display: active ? 'flex' : 'none' }]}>
      {children}
    </View>
  );
}

/**
 * 웹의 안쪽 화면 한 장: 들어오기(420ms)와 나가기(320ms)를 브라우저에 맡긴다.
 * 들어오는 중에 닫히면 지금 자리에서 나간다. 나가기는 끝 자리(fill)를 붙든 채 onClosed 로 걷어 낸다.
 */
function StackLayerWeb({ id, closing, onClosed, bg, children }: StackLayerProps) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, COLUMN);
  const ref = useRef<any>(null);
  const opening = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (motionOff()) return;
    opening.current = webAnimate(ref, [{ transform: `translateX(${w}px)` }, { transform: 'translateX(0px)' }], { duration: 420, easing: CSS_EASE.sheet });
  }, []);
  useLayoutEffect(() => {
    if (!closing) return;
    const from = webStop(ref, opening.current, 'translateX(0px)');
    const a = motionOff() ? null : webAnimate(ref, [{ transform: from }, { transform: `translateX(${w}px)` }], { duration: 320, easing: CSS_EASE.out, fill: 'forwards' });
    if (!a) {
      onClosed(id);
      return;
    }
    a.onfinish = () => onClosed(id);
    return () => {
      a.onfinish = null;
    };
  }, [closing]);
  return (
    <View ref={ref} style={[StyleSheet.absoluteFill, { backgroundColor: bg, pointerEvents: closing ? 'none' : 'auto' }]}>
      {children}
    </View>
  );
}

// 웹에서는 탭과 안쪽 화면의 움직임을 브라우저에 맡기고, 앱(iOS, Android)에서는 Animated(네이티브 드라이버)를 쓴다.
const TabLayer = Platform.OS === 'web' ? TabLayerWeb : TabLayerNative;
const StackLayer = Platform.OS === 'web' ? StackLayerWeb : StackLayerNative;

/** 쌓인 화면 하나의 내용. route 가 같으면 다시 그리지 않는다(닫힘 표시나 다른 화면이 쌓일 때). */
const RouteScreen = memo(function RouteScreen({ route }: { route: Route }) {
  return route.name === 'article' ? (
    <ArticleScreen id={route.id} />
  ) : route.name === 'quiz' ? (
    <DayQuizScreen date={route.date} />
  ) : route.name === 'news' ? (
    <NewsScreen />
  ) : route.name === 'study' ? (
    <StudyScreen sect={route.sect} focus={route.focus} />
  ) : route.name === 'weekly' ? (
    <WeeklyQuizScreen id={route.id} />
  ) : (
    <SettingsScreen />
  );
});

function Shell() {
  const t = useTheme();
  const [tab, setTabState] = useState<TabName>('today');
  const [visited, setVisited] = useState<Record<TabName, boolean>>({ today: true, archive: false, knowledge: false });
  // 쌓인 화면마다 고유 번호를 둔다. 닫히는 중인 화면 위로 새 화면이 올라와도 닫힘이 엉뚱한 화면으로 옮겨 가지 않는다.
  const [stack, setStack] = useState<{ id: number; route: Route; closing: boolean }[]>([]);
  const seq = useRef(0);
  // 시작 화면은 앱을 열 때 한 번만. 움직임 줄이기가 켜져 있으면 건너뛴다.
  const [splash, setSplash] = useState(() => !motionOff());
  const endSplash = useCallback(() => setSplash(false), []);
  // 시작 화면 다음의 해금과 돌아보기가 덮고 있는지. 덮는 동안 탭 화면은 기록이 바뀌어도 나중에 다시 그린다.
  const [overlay, setOverlay] = useState(false);

  const setTab = useCallback((next: TabName) => {
    setStack((s) => (s.length ? [] : s));
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
  // 동작만 담은 값은 한 번 만들고 바꾸지 않는다. 지금 탭은 따로 내려보내 탭 막대만 다시 그린다.
  // 지식 탭의 지도로: 요청을 먼저 남기고 탭을 바꾼다(처음 여는 지식 탭도 열리면서 이 요청을 읽는다).
  const showNode = useCallback(
    (id: string | null) => {
      requestNode(id);
      setTab('knowledge');
    },
    [setTab],
  );
  const nav = useMemo<Nav>(() => ({ setTab, push, pop, showNode }), [setTab, push, pop, showNode]);
  // 시험용(웹): 화면 이동을 바깥에서 부를 수 있게
  useEffect(() => {
    if (Platform.OS === 'web') (globalThis as any).__LW_NAV__ = nav;
  }, [nav]);
  const top = stack[stack.length - 1]?.route;
  // 탭 화면은 한 번 만든 요소를 계속 쓴다. 탭을 바꾸거나 화면을 쌓아도 보이지 않는 탭까지 다시 그리지 않는다.
  const screens = useMemo(() => ({ today: <TodayScreen />, archive: <ArchiveScreen />, knowledge: <KnowledgeScreen /> }), []);
  const topId = stack.length ? stack[stack.length - 1].id : 0;

  const layer = (name: TabName) =>
    visited[name] ? (
      <TabLayer key={name} active={tab === name}>
        {/* 안쪽 화면이 덮고 있거나 가려진 탭은 기록이 바뀌어도 맨 위 화면을 먼저 그린 뒤에 다시 그린다. */}
        <ShownCtx.Provider value={tab === name && topId === 0 && !overlay}>
          <StoreDefer defer={tab !== name || topId !== 0 || overlay}>{screens[name]}</StoreDefer>
        </ShownCtx.Provider>
      </TabLayer>
    ) : null;

  return (
    <NavCtx.Provider value={nav}>
      <NavTabCtx.Provider value={tab}>
        <View style={[styles.root, { backgroundColor: t.bg }]}>
          <View style={styles.column}>
            <View style={[styles.fill, { overflow: 'hidden' }]}>
              {layer('today')}
              {layer('archive')}
              {layer('knowledge')}
              {stack.map(({ id, route, closing }) => (
                <StackLayer key={id} id={id} closing={closing} onClosed={finishPop} bg={t.card}>
                  <StoreDefer defer={id !== topId}>
                    <RouteScreen route={route} />
                  </StoreDefer>
                </StackLayer>
              ))}
            </View>
            {top && top.name !== 'settings' ? null : <TabBar />}
            {/* 시작 화면 다음: 해금(전체 화면), 이어서 주간·월간 돌아보기. 탭 막대까지 덮고, 시작 화면보다는 아래 */}
            <AfterSplash splashDone={!splash} onOverlay={setOverlay} />
          </View>
          {splash ? <Splash onDone={endSplash} /> : null}
        </View>
      </NavTabCtx.Provider>
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
