import React, { createContext, useContext } from 'react';
import { Animated, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { STANDALONE } from './store';
import { useTheme } from './theme';
import { Icon, IconName, T, Tap } from './ui';

export type TabName = 'today' | 'archive' | 'review';

export type Route = { name: 'article'; id: string } | { name: 'settings' } | { name: 'quiz'; date: string } | { name: 'news' } | { name: 'study'; sect: 'lat' | 'voc' };

export type Nav = {
  tab: TabName;
  setTab: (tab: TabName) => void;
  push: (route: Route) => void;
  pop: () => void;
};

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx가 없습니다');
  return n;
}

/**
 * 탭 화면의 공통 틀: 회색 바탕, 큰 굵은 제목(26) 과 오른쪽 요소, 그 아래 카드 더미(좌우 12, 사이 12).
 * brand 면 제목을 20 아주 굵게(홈의 "Latticework" 머리 줄, 높이 56) 그린다.
 * top 은 제목과 카드 더미 사이에 화면 폭 그대로 들어간다(홈의 인용 블록).
 * overlay 는 스크롤 밖 화면 위에 겹친다(Sheet 등).
 * subtitle, meta 는 예전 이름이며 그리지 않는다.
 */
export function TabScreen({
  title,
  brand,
  right,
  top,
  overlay,
  children,
  contentStyle,
  scrollRef,
}: {
  title: string;
  brand?: boolean;
  subtitle?: string;
  meta?: string;
  right?: React.ReactNode;
  top?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: React.Ref<any>;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {brand ? (
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 12 }}>
            <T s={20} w="800" lh={1.45} role="heading" level={1} style={{ letterSpacing: -0.4, flexShrink: 1 }}>
              {title}
            </T>
            {right}
          </View>
        ) : (
          <View style={{ minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20, gap: 12 }}>
            <T s={26} w="700" lh={1.35} role="heading" level={1} style={{ flexShrink: 1 }}>
              {title}
            </T>
            {right}
          </View>
        )}
        {top}
        <View style={[{ paddingHorizontal: 12, gap: 12 }, contentStyle]}>{children}</View>
      </ScrollView>
      {overlay}
    </View>
  );
}

/**
 * 안쪽 화면의 위쪽 줄(높이 52): 왼쪽 뒤로 가기(또는 닫기 X), 가운데 짧은 제목(예: "1/2"), 오른쪽 요소.
 * label 은 화면 읽기용 "label(으)로 돌아가기" 에만 쓴다. progress(0~1) 를 주면 줄 아래에 2px 파랑 막대.
 */
export function BackBar({
  label,
  right,
  title,
  icon = 'back',
  onBack,
  bg,
  progress,
}: {
  label: string;
  right?: React.ReactNode;
  title?: string;
  icon?: 'back' | 'close';
  onBack?: () => void;
  bg?: string;
  progress?: number | Animated.Value | Animated.AnimatedInterpolation<number>;
}) {
  const t = useTheme();
  const nav = useNav();
  const p = progress == null ? null : typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : progress;
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, backgroundColor: bg ?? t.card, zIndex: 2 }}>
      <Tap onPress={onBack ?? nav.pop} label={`${label}(으)로 돌아가기`} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={icon === 'close' ? 24 : 22} color={icon === 'close' ? t.faint : t.ink} sw={icon === 'close' ? 2.4 : 2.2} />
      </Tap>
      {title ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 56, right: 56, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T s={15} w="600" c={t.mute} mono lines={1}>
            {title}
          </T>
        </View>
      ) : null}
      {right ?? <View style={{ width: 40 }} />}
      {p != null ? (
        <View aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 2 }}>
          <Animated.View
            style={{
              height: 2,
              backgroundColor: t.blue,
              width: typeof p === 'number' ? `${p * 100}%` : (p as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const TABS: { name: TabName; label: string; icon: IconName }[] = [
  { name: 'today', label: '홈', icon: 'homeFill' },
  { name: 'archive', label: '기록', icon: 'calFill' },
  { name: 'review', label: '리뷰', icon: 'reviewFill' },
];

/** 화면 맨 아래 줄의 아래 여백. 자체 주소에서는 아이폰 홈 막대 영역을 더한다. */
export const BOTTOM_PAD: any = STANDALONE ? 'calc(6px + env(safe-area-inset-bottom, 0px))' : 6;

/** 아래 탭: 흰 바탕, 위 가는 선, 아이콘과 작은 이름. 켜진 탭 grey900, 꺼진 탭 grey400. */
export function TabBar() {
  const t = useTheme();
  const nav = useNav();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', paddingBottom: BOTTOM_PAD, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line }}>
      {TABS.map((tab) => {
        const on = nav.tab === tab.name;
        const c = on ? t.ink : t.faint;
        return (
          <Tap key={tab.name} role="tab" selected={on} label={tab.label} press="soft" onPress={() => nav.setTab(tab.name)} style={{ flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Icon name={tab.icon} size={24} color={c} />
            <T s={11} w="600" c={c} lh={1.3}>
              {tab.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}
