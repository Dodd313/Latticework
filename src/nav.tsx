import React, { createContext, useContext } from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { STANDALONE } from './store';
import { useTheme } from './theme';
import { Icon, T, Tap } from './ui';

export type TabName = 'today' | 'threads' | 'archive' | 'review';

export type Route = { name: 'article'; id: string } | { name: 'settings' };

export type Nav = {
  tab: TabName;
  setTab: (tab: TabName) => void;
  push: (route: Route) => void;
  pop: () => void;
  openThread: (id: string) => void;
  threadFocus: string | null;
};

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx가 없습니다');
  return n;
}

/** 탭 화면의 공통 틀: 큰 제목과 스크롤 본문 */
export function TabScreen({
  title,
  subtitle,
  top,
  right,
  children,
  contentStyle,
}: {
  title: string;
  subtitle?: string;
  top?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.ground }} contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 12 }, contentStyle]}>
      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        {top || right ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <View style={{ flex: 1 }}>{top}</View>
            {right}
          </View>
        ) : (
          <View style={{ height: 8 }} />
        )}
        <T s={30} w="700" role="heading" level={1}>
          {title}
        </T>
        {subtitle ? (
          <T s={15} c={t.sub}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {children}
    </ScrollView>
  );
}

/** 안쪽 화면의 위쪽 줄: 뒤로 가기 */
export function BackBar({ label, right }: { label: string; right?: React.ReactNode }) {
  const t = useTheme();
  const nav = useNav();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, paddingHorizontal: 8, backgroundColor: t.ground }}>
      <Tap onPress={nav.pop} label={`${label}(으)로 돌아가기`} style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingRight: 12, gap: 2 }}>
        <Icon name="back" color={t.blue} bold />
        <T s={16} w="500" c={t.blue}>
          {label}
        </T>
      </Tap>
      {right}
    </View>
  );
}

const TABS: { name: TabName; label: string; icon: 'today' | 'threads' | 'archive' | 'review' }[] = [
  { name: 'today', label: '오늘', icon: 'today' },
  { name: 'threads', label: '이슈', icon: 'threads' },
  { name: 'archive', label: '지난 기사', icon: 'archive' },
  { name: 'review', label: '퀴즈', icon: 'review' },
];

/** 화면 맨 아래 줄의 아래 여백. 자체 주소에서는 아이폰 홈 막대 영역을 더한다. */
export const BOTTOM_PAD: any = STANDALONE ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 8;

export function TabBar() {
  const t = useTheme();
  const nav = useNav();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 6, paddingBottom: BOTTOM_PAD, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line }}
    >
      {TABS.map((tab) => {
        const on = nav.tab === tab.name;
        return (
          <Tap
            key={tab.name}
            role="tab"
            selected={on}
            label={tab.label}
            onPress={() => nav.setTab(tab.name)}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <Icon name={tab.icon} color={on ? t.ink : t.mute} bold={on} />
            <T s={11} w={on ? '700' : '500'} c={on ? t.ink : t.mute} lh={1.3}>
              {tab.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}
