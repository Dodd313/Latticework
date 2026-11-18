import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { EASE, NATIVE_DRIVER, RuleDraw, motionOff } from './motion';
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

/** 탭 화면의 공통 틀: 제호 줄, 굵은 괘선과 가는 괘선 사이의 정보 줄, 스크롤 본문 */
export function TabScreen({
  title,
  subtitle,
  meta,
  right,
  children,
  contentStyle,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.ground }} contentContainerStyle={[{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28, gap: 12 }, contentStyle]}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <T serif s={23} w="700" lh={1.3} role="heading" level={1}>
            {title}
          </T>
          {right}
        </View>
        <RuleDraw color={t.rule} height={3} />
        <View style={{ marginTop: -10, borderBottomWidth: subtitle || meta ? 1 : 0, borderBottomColor: t.rule, paddingVertical: subtitle || meta ? 9 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {subtitle ? (
            <T s={12.5} w="500" style={{ flexShrink: 1 }}>
              {subtitle}
            </T>
          ) : null}
          {meta ? (
            <T s={12.5} c={t.sub} mono>
              {meta}
            </T>
          ) : null}
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

/** 안쪽 화면의 위쪽 줄: 뒤로 가기와 제호 */
export function BackBar({ label, right }: { label: string; right?: React.ReactNode }) {
  const t = useTheme();
  const nav = useNav();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingLeft: 12, paddingRight: 22, backgroundColor: t.ground, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <Tap onPress={nav.pop} label={`${label}(으)로 돌아가기`} style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingRight: 12, gap: 4 }}>
        <Icon name="back" size={20} color={t.ink} bold />
        <T s={14} w="500">
          {label}
        </T>
      </Tap>
      {right ?? (
        <T serif s={15} w="700">
          Latticework 시사
        </T>
      )}
    </View>
  );
}

const TABS: { name: TabName; label: string }[] = [
  { name: 'today', label: '오늘' },
  { name: 'threads', label: '이슈' },
  { name: 'archive', label: '지난 기사' },
  { name: 'review', label: '퀴즈' },
];

/** 화면 맨 아래 줄의 아래 여백. 자체 주소에서는 아이폰 홈 막대 영역을 더한다. */
export const BOTTOM_PAD: any = STANDALONE ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 8;

export function TabBar() {
  const t = useTheme();
  const nav = useNav();
  const index = Math.max(0, TABS.findIndex((x) => x.name === nav.tab));
  const [width, setWidth] = useState(0);
  const pos = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (motionOff()) {
      pos.setValue(index);
      return;
    }
    Animated.timing(pos, { toValue: index, duration: 340, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
  }, [index]);
  const PAD = 8;
  const BAR = 24;
  const cell = (width - PAD * 2) / TABS.length;
  const at = (i: number) => PAD + cell * i + cell / 2 - BAR / 2;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', paddingHorizontal: PAD, paddingBottom: BOTTOM_PAD, backgroundColor: t.ground, borderTopWidth: 1, borderTopColor: t.rule }}
    >
      {width > 0 ? (
        <Animated.View
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, width: BAR, height: 3, backgroundColor: t.rule, transform: [{ translateX: pos.interpolate({ inputRange: [0, TABS.length - 1], outputRange: [at(0), at(TABS.length - 1)] }) }] }}
        />
      ) : null}
      {TABS.map((tab) => {
        const on = nav.tab === tab.name;
        return (
          <Tap key={tab.name} role="tab" selected={on} label={tab.label} onPress={() => nav.setTab(tab.name)} style={{ flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingTop: 3 }}>
            <T s={13} w={on ? '700' : '500'} c={on ? t.ink : t.sub} lh={1.3}>
              {tab.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}
