import React, { useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { Rise, usePop } from '../motion';
import { monthDay } from '../dates';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { findArticle, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, ArticleLink } from '../types';
import { ExtLink, Icon, SectionTitle, T, Tap } from '../ui';

const STANDALONE_PAD: any = BOTTOM_PAD === 8 ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))';

function LinkCard({ link }: { link: ArticleLink }) {
  const t = useTheme();
  const nav = useNav();
  const body = (
    <View style={{ gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: t.line }}>
      {link.refDate ? (
        <T s={12.5} c={t.sub} mono>
          {monthDay(link.refDate)} 보도
        </T>
      ) : null}
      {link.refTitle ? (
        <T serif s={18} w="700" lh={1.45}>
          {link.refTitle}
        </T>
      ) : null}
      <T s={14.5} lh={1.65} c={t.deck}>
        {link.text}
      </T>
    </View>
  );
  if (!link.refArticleId) return body;
  return (
    <Tap onPress={() => nav.push({ name: 'article', id: link.refArticleId! })} label={`${link.refTitle ?? '관련 기사'} 열기`}>
      {body}
    </Tap>
  );
}

function Body({ a }: { a: Article }) {
  const t = useTheme();
  const { user, markRead } = useStore();
  const isRead = !!user.read[a.id];
  const progress = useRef(new Animated.Value(0)).current;
  const autoMarked = useRef(false);
  const checkScale = usePop(isRead);
  // 스크롤에 맞춰 위쪽 진행선을 늘리고, 끝까지 읽으면 한 번만 읽음으로 표시한다.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const room = Math.max(1, contentSize.height - layoutMeasurement.height);
    progress.setValue(Math.max(0, Math.min(1, contentOffset.y / room)));
    if (!autoMarked.current && contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) {
      autoMarked.current = true;
      markRead(a.id, true);
    }
  };

  const past = a.links.filter((l) => l.kind !== 'new');
  const body = a.body ?? [];

  return (
    <>
      <View style={{ height: 2, marginTop: -1 }} aria-hidden>
        <Animated.View style={{ height: 2, backgroundColor: t.rule, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
      <ScrollView style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 36, gap: 28 }}>
        <Rise delay={80} style={{ gap: 12 }}>
          <T serif s={27} w="700" lh={1.38} role="heading" level={1}>
            {a.title}
          </T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.rule }}>
            <T s={12.5} c={t.sub}>
              출처 {a.source}
            </T>
            <T s={12.5} c={t.sub} mono>
              {a.date.replace(/-/g, '.')} · 읽는 시간 {a.minutes}분
            </T>
          </View>
        </Rise>

        {a.summary.length > 0 ? (
          <Rise delay={180} style={{ gap: 14, paddingVertical: 18, borderTopWidth: 3, borderTopColor: t.rule, borderBottomWidth: 1, borderBottomColor: t.rule }}>
            <SectionTitle title="핵심 요약" />
            <View style={{ gap: 12 }}>
              {a.summary.map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                  <T serif s={15.5} w="700" c={t.blue} lh={1.62}>
                    {i + 1}
                  </T>
                  <T s={15.5} w="500" lh={1.62} style={{ flex: 1 }}>
                    {line}
                  </T>
                </View>
              ))}
            </View>
          </Rise>
        ) : null}

        {body.length > 0 ? (
          <Rise delay={280} style={{ gap: 20 }}>
            {body.map((para, i) => (
              <T key={i} serif s={17} lh={1.9} c={t.bodyInk}>
                {para}
              </T>
            ))}
          </Rise>
        ) : null}

        {past.length > 0 ? (
          <View>
            <View style={{ paddingBottom: 14 }}>
              <SectionTitle title="관련 기사" />
            </View>
            {past.map((link, i) => (
              <LinkCard key={i} link={link} />
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: t.line }} />
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, paddingBottom: STANDALONE_PAD, backgroundColor: t.ground, borderTopWidth: 1, borderTopColor: t.rule }}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Tap
            onPress={() => markRead(a.id, !isRead)}
            label={isRead ? '읽음 해제' : '읽음 표시'}
            style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: t.rule, backgroundColor: isRead ? t.inverse : t.ground }}
          >
            <Icon name="check" size={22} color={isRead ? t.onInverse : t.mute} bold />
          </Tap>
        </Animated.View>
        <ExtLink url={a.url} label="기사 원문 보기" style={{ flex: 1, height: 52, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
          <T s={16} w="700" c={t.onInverse}>
            기사 원문 보기
          </T>
          <Icon name="external" size={18} color={t.onInverse} bold />
        </ExtLink>
      </View>
    </>
  );
}

export function ArticleScreen({ id }: { id: string }) {
  const t = useTheme();
  const { days } = useStore();
  const a = findArticle(days, id);
  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      <BackBar label="뒤로" />
      {a ? (
        <Body key={a.id} a={a} />
      ) : (
        <View style={{ padding: 22 }}>
          <T s={15} c={t.sub}>
            기사를 찾을 수 없습니다.
          </T>
        </View>
      )}
    </View>
  );
}
