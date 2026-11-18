import React, { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, TextInput, View } from 'react-native';
import { monthDay, stamp } from '../dates';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { findArticle, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { Article, ArticleLink, LinkKind } from '../types';
import { Card, Chip, ExtLink, Icon, SectionTitle, T, Tap } from '../ui';

const STANDALONE_PAD: any = BOTTOM_PAD === 8 ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))';

const LINK_LABEL: Record<LinkKind, string> = { continue: '이어짐', reverse: '뒤집힘', cross: '함께 볼 기사', pattern: '비슷한 전례', new: '새 주제' };

function LinkCard({ link }: { link: ArticleLink }) {
  const t = useTheme();
  const nav = useNav();
  const body = (
    <Card tone="blue" style={{ gap: 6, borderRadius: 14, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Chip label={LINK_LABEL[link.kind]} tone={link.kind === 'continue' || link.kind === 'reverse' ? 'solid' : 'onTint'} />
        {link.refDate ? (
          <T s={12} c={t.onBlueTint} mono>
            {monthDay(link.refDate)} 기사
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
    <Tap onPress={() => nav.push({ name: 'article', id: link.refArticleId! })} label={`${link.refTitle ?? '연결된 기사'} 열기`}>
      {body}
    </Tap>
  );
}

function Body({ a }: { a: Article }) {
  const t = useTheme();
  const nav = useNav();
  const { user, setMemo, markRead } = useStore();
  const isRead = !!user.read[a.id];
  const [memo, setMemoText] = useState(user.memos[a.id]?.text ?? '');
  const memoRef = useRef(memo);
  memoRef.current = memo;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 메모는 입력이 잠시 멈췄을 때 한 번만 저장한다.
  const onMemo = (text: string) => {
    setMemoText(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMemo(a.id, text), 1200);
  };
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      setMemo(a.id, memoRef.current);
    };
  }, [a.id, setMemo]);

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
            {a.source} 기사를 정리했습니다 · 읽는 데 {a.minutes}분
          </T>
        </View>

        {a.summary.length > 0 ? (
          <Card style={{ gap: 12, borderRadius: 16 }}>
            <T s={13} w="700" c={t.blue} role="heading" level={2}>
              요약
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

        <View style={{ gap: 8 }}>
          <ExtLink
            url={a.url}
            label={`${a.source} 원문 전체 보기`}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: t.ink, backgroundColor: t.card }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T s={16} w="600">
                원문 전체 보기
              </T>
              <T s={13} c={t.sub}>
                {a.source} 기사가 앱 안에서 열립니다
              </T>
            </View>
            <Icon name="external" size={20} color={t.ink} bold />
          </ExtLink>
        </View>

        {past.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle title="전에 읽은 기사와의 연결" />
            <View style={{ gap: 10 }}>
              {past.map((link, i) => (
                <LinkCard key={i} link={link} />
              ))}
            </View>
            {a.threadId ? (
              <Tap onPress={() => nav.openThread(a.threadId!)} label="이어진 기사 모두 보기" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                <T s={15} w="600" c={t.blue}>
                  이어진 기사 모두 보기
                </T>
                <Icon name="next" size={16} color={t.blue} bold />
              </Tap>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionTitle title="내 생각" />
          <TextInput
            nativeID={`memo-${a.id}`}
            accessibilityLabel="내 생각 메모"
            value={memo}
            onChangeText={onMemo}
            onBlur={() => setMemo(a.id, memoRef.current)}
            multiline
            placeholder="읽고 든 생각을 적어 두세요"
            placeholderTextColor={t.mute}
            style={{
              minHeight: 112,
              backgroundColor: t.card,
              borderWidth: 1,
              borderColor: t.line,
              borderRadius: 14,
              padding: 14,
              fontFamily: FONT_SANS,
              fontSize: 16,
              lineHeight: 24,
              color: t.ink,
              textAlignVertical: 'top',
            }}
          />
          <T s={12} c={t.mute}>
            메모는 자동으로 저장됩니다.
          </T>
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: STANDALONE_PAD, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line }}>
        <Tap
          onPress={() => markRead(a.id, !isRead)}
          label={isRead ? '읽음 취소' : '읽음으로 표시'}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            backgroundColor: isRead ? t.chip : t.inverse,
          }}
        >
          {isRead ? <Icon name="check" size={18} color={t.ink} bold /> : null}
          <T s={16} w="600" c={isRead ? t.ink : t.onInverse}>
            {isRead ? '읽었습니다' : '읽음으로 표시'}
          </T>
        </Tap>
        <ExtLink
          url={a.url}
          label="원문 열기"
          style={{ width: 88, height: 52, borderRadius: 14, borderWidth: 1, borderColor: t.ink, alignItems: 'center', justifyContent: 'center' }}
        >
          <T s={16} w="600">
            원문
          </T>
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
            이 기사를 찾지 못했습니다. 목록으로 돌아가 다시 열어 주세요.
          </T>
        </View>
      )}
    </View>
  );
}
