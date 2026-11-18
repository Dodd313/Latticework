import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Nav, NavCtx, Route, TabBar, TabName } from './src/nav';
import { ArchiveScreen } from './src/screens/Archive';
import { ArticleScreen } from './src/screens/Article';
import { ReviewScreen } from './src/screens/Review';
import { SettingsScreen } from './src/screens/Settings';
import { ThreadsScreen } from './src/screens/Threads';
import { TodayScreen } from './src/screens/Today';
import { StoreProvider } from './src/store';
import { ThemeProvider, useTheme } from './src/theme';

function Shell() {
  const t = useTheme();
  const [tab, setTabState] = useState<TabName>('today');
  const [visited, setVisited] = useState<Record<TabName, boolean>>({ today: true, threads: false, archive: false, review: false });
  const [stack, setStack] = useState<Route[]>([]);
  const [threadFocus, setThreadFocus] = useState<string | null>(null);

  const setTab = useCallback((next: TabName) => {
    setStack([]);
    setTabState(next);
    setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
  }, []);

  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
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
      <View key={name} style={[styles.fill, { display: tab === name ? 'flex' : 'none' }]}>
        {node}
      </View>
    ) : null;

  return (
    <NavCtx.Provider value={nav}>
      <View style={[styles.root, { backgroundColor: t.ground }]}>
        <View style={styles.column}>
          <View style={styles.fill}>
            {layer('today', <TodayScreen />)}
            {layer('threads', <ThreadsScreen />)}
            {layer('archive', <ArchiveScreen />)}
            {layer('review', <ReviewScreen />)}
            {top ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: t.ground }]}>
                {top.name === 'article' ? <ArticleScreen key={`${stack.length}-${top.id}`} id={top.id} /> : <SettingsScreen />}
              </View>
            ) : null}
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
