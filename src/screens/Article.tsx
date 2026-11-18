import React from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { monthDay, stamp } from '../dates';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { findArticle, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, ArticleLink, LinkKind } from '../types';
import { Card, Chip, ExtLink, Icon, SectionTitle, T, Tap } from '../ui';

const STANDALONE_PAD: any = BOTTOM_PAD === 8 ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))';

const LINK_LABEL: Record<LinkKind, string> = { continue: '후속 보도', reverse: '반전', cross: '연관 이슈', pattern: '유사 사례', new: '새 이슈' };

function LinkCard({ link }: { link: ArticleLink }) {
  const t = useTheme();
  const nav = useNav();
  const body = (
    <Card tone="blue" style={{ gap: 6, borderRadius: 14, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Chip label={LINK_LABEL[link.kind]} tone={link.kind === 'continue' || link.kind === 'reverse' ? 'solid' : 'onTint'} />
        {link.refDate ? (
          <T s={12} c={t.onBlueTint} mono>
            {monthDay(link.refDate)} 보도
          </T>
        ) : null}
      </View>
      {link.refTitle ? (
        <T s={16} w="600" lh={1.4}>
          {link.refTitle}
        </T>
      ) : null}
      <T s={14} c={t.onBlueTint}>
        {link.text}
      </T>
    </Card>
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
  const nav = useNav();
  const { user, markRead } = useStore();
  const isRead = !!user.read[a.id];
  // 끝까지 읽으면 읽음으로 표시한다.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) markRead(a.id, true);
  };

  const past = a.links.filter((l) => l.kind !== 'new');
  const body = a.body ?? [];

  return (
    <>
      <ScrollView style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 28 }}>
        <View style={{ gap: 10 }}>
          <T s={13} c={t.sub} mono>
            {stamp(a.date)} · {a.category}
          </T>
          <T s={26} w="700" lh={1.32} role="heading" level={1}>
            {a.title}
          </T>
          <T s={13} c={t.sub}>
            출처 {a.source} · 읽는 시간 {a.minutes}분
          </T>
        </View>

        {a.summary.length > 0 ? (
          <Card style={{ gap: 12, borderRadius: 16 }}>
            <T s={13} w="700" c={t.blue} role="heading" level={2}>
              핵심 요약
            </T>
            <View style={{ gap: 10 }}>
              {a.summary.map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.blue, marginTop: 11 }} aria-hidden />
                  <T s={16} w="500" lh={1.6} style={{ flex: 1 }}>
                    {line}
                  </T>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {body.length > 0 ? (
          <View style={{ gap: 18 }}>
            {body.map((para, i) => (
              <T key={i} s={17} lh={1.8}>
                {para}
              </T>
            ))}
          </View>
        ) : null}

        {past.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle title="관련 기사" />
            <View style={{ gap: 10 }}>
              {past.map((link, i) => (
                <LinkCard key={i} link={link} />
              ))}
            </View>
            {a.threadId ? (
              <Tap onPress={() => nav.openThread(a.threadId!)} label="이슈 타임라인 보기" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                <T s={15} w="600" c={t.blue}>
                  이슈 타임라인 보기
                </T>
                <Icon name="next" size={16} color={t.blue} bold />
              </Tap>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: STANDALONE_PAD, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line }}>
        <Tap
          onPress={() => markRead(a.id, !isRead)}
          label={isRead ? '읽음 해제' : '읽음 표시'}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: isRead ? 0 : 1.5,
            borderColor: t.line,
            backgroundColor: isRead ? t.blue : t.card,
          }}
        >
          <Icon name="check" size={22} color={isRead ? '#FFFFFF' : t.mute} bold />
        </Tap>
        <ExtLink
          url={a.url}
          label="기사 원문 보기"
          style={{ flex: 1, height: 52, borderRadius: 14, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          <T s={16} w="600" c={t.onInverse}>
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
        <View style={{ padding: 20 }}>
          <T s={15} c={t.sub}>
            기사를 찾을 수 없습니다.
          </T>
        </View>
      )}
    </View>
  );
}
