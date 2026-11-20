import React, { useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { monthDay } from '../dates';
import { Rise, usePop } from '../motion';
import { BackBar, useNav } from '../nav';
import { findArticle, useStore } from '../store';
import { useTheme } from '../theme';
import { Article, ArticleLink } from '../types';
import { ExtLink, Icon, T, Tap } from '../ui';

/** 11월 20일 */
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 지난 기사로 이어지는 한 줄: 날짜, 제목, 이어지는 내용. 기사가 있으면 눌러서 연다. */
function LinkRow({ link, first }: { link: ArticleLink; first: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const go = link.refArticleId;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: t.hair }}>
      <View style={{ flex: 1, gap: 2 }}>
        {link.refDate ? (
          <T type="t7" w="600" c={t.mute} mono>
            {monthDay(link.refDate)}
          </T>
        ) : null}
        {link.refTitle ? (
          <T s={16} w="600" lh={1.5}>
            {link.refTitle}
          </T>
        ) : null}
        <T type="t6" c={t.sub}>
          {link.text}
        </T>
      </View>
      {go ? <Icon name="chev" size={14} color={t.faint} /> : null}
    </View>
  );
  if (!go) return body;
  return (
    <Tap press="soft" onPress={() => nav.push({ name: 'article', id: go })} label={`${link.refTitle ?? '관련 기사'} 열기`}>
      {body}
    </Tap>
  );
}

/** 위쪽 줄 오른쪽의 읽음 단추. 읽으면 파랑 원 안에 흰 체크. */
function ReadToggle({ read, onPress }: { read: boolean; onPress: () => void }) {
  const t = useTheme();
  const scale = usePop(read);
  return (
    <Tap onPress={onPress} label={read ? '읽음 해제' : '읽음 표시'} selected={read} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: read ? t.blue : 'transparent',
          borderWidth: read ? 0 : 2,
          borderColor: t.line,
          transform: [{ scale }],
        }}
      >
        <Icon name="check" size={16} color={read ? t.onColor : t.faint} sw={3} />
      </Animated.View>
    </Tap>
  );
}

function Body({ a, pos }: { a: Article; pos: string | undefined }) {
  const t = useTheme();
  const { user, markRead } = useStore();
  const isRead = !!user.read[a.id];
  const progress = useRef(new Animated.Value(0)).current;
  const autoMarked = useRef(false);
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
  const kicker = a.threadName;

  return (
    <>
      <BackBar label="뒤로" title={pos} right={<ReadToggle read={isRead} onPress={() => markRead(a.id, !isRead)} />} />
      <View style={{ height: 2, zIndex: 2 }} aria-hidden>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: t.blue, transformOrigin: 'left', transform: [{ scaleX: progress }] }} />
      </View>
      <ScrollView style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}>
        <Rise delay={60}>
          {kicker ? (
            <T type="t7" w="700" c={t.blue} style={{ marginBottom: 6 }}>
              {kicker}
            </T>
          ) : null}
          <T s={24} w="700" lh={33 / 24} role="heading" level={1} style={{ letterSpacing: -0.5, marginBottom: 8 }}>
            {a.title}
          </T>
          <T type="t7" c={t.mute} mono>
            {a.source} · {shortDate(a.date)} · {a.minutes}분
          </T>
        </Rise>

        {a.summary.length > 0 ? (
          <Rise delay={140} style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: t.layer, borderWidth: 1, borderColor: t.hair, gap: 8 }}>
            {a.summary.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row' }}>
                <View style={{ width: 18, height: 23, justifyContent: 'center' }} aria-hidden>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.body, marginLeft: 3 }} />
                </View>
                <T s={15} lh={23 / 15} c={t.body} style={{ flex: 1 }}>
                  {line}
                </T>
              </View>
            ))}
          </Rise>
        ) : null}

        {body.length > 0 ? (
          <Rise delay={220} style={{ marginTop: 20, gap: 16 }}>
            {body.map((para, i) => (
              <T key={i} s={17} lh={28 / 17} c={t.body} style={{ letterSpacing: -0.2 }}>
                {para}
              </T>
            ))}
          </Rise>
        ) : null}

        {past.length > 0 ? (
          <View style={{ marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: t.hair, paddingHorizontal: 16 }}>
            {past.map((link, i) => (
              <LinkRow key={i} link={link} first={i === 0} />
            ))}
          </View>
        ) : null}

        <ExtLink
          url={a.url}
          label="기사 원문 보기"
          style={{ marginTop: 24, minHeight: 56, paddingHorizontal: 28, borderRadius: 16, backgroundColor: t.blueWeak, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <T s={17} w="600" lh={1.5} c={t.blueText}>
            원문 보기
          </T>
          <Icon name="external" size={18} color={t.blueText} />
        </ExtLink>
      </ScrollView>
    </>
  );
}

export function ArticleScreen({ id }: { id: string }) {
  const t = useTheme();
  const { days } = useStore();
  const a = findArticle(days, id);
  const day = a ? days.find((d) => d.articles.some((x) => x.id === a.id)) : undefined;
  const pos = a && day && day.articles.length > 1 ? `${day.articles.findIndex((x) => x.id === a.id) + 1}/${day.articles.length}` : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      {a ? (
        <Body key={a.id} a={a} pos={pos} />
      ) : (
        <>
          <BackBar label="뒤로" />
          <View style={{ padding: 20 }}>
            <T type="t6" c={t.sub}>
              기사 없음
            </T>
          </View>
        </>
      )}
    </View>
  );
}
