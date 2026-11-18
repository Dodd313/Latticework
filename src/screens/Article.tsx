import React, { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, TextInput, View } from 'react-native';
import { monthDay, stamp } from '../dates';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { findArticle, useStore } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { AXIS_LABEL, AXIS_MAX, Article, ArticleLink, LinkKind, RelevanceAxes, Stance } from '../types';
import { Card, Chip, Divider, ExtLink, Icon, Meter, SectionTitle, T, Tap, Tone } from '../ui';

const STANDALONE_PAD: any = BOTTOM_PAD === 8 ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))';

const LINK_LABEL: Record<LinkKind, string> = { continue: '이어짐', reverse: '뒤집힘', cross: '교차', pattern: '반복 패턴', new: '새 실 시작' };

const STANCE_TONE: Record<Stance, Tone> = { positive: 'blue', negative: 'orange', mixed: 'blue', watch: 'neutral' };

const AXES: (keyof RelevanceAxes)[] = ['price', 'scope', 'persistence', 'pricedIn', 'linkage'];

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

  let n = 0;
  const idx = () => String(++n).padStart(2, '0');

  return (
    <>
      <ScrollView style={{ flex: 1 }} onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 32 }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Chip label={a.category} />
            <T s={13} c={t.sub} mono>
              {stamp(a.date)} · {a.minutes}분
            </T>
          </View>
          <T s={26} w="700" lh={1.32} role="heading" level={1}>
            {a.title}
          </T>
          <ExtLink url={a.url} label={`${a.source} 원문 보기`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}>
            <T s={14} w="500" c={t.blue}>
              원문 보기 · {a.source}
            </T>
            <Icon name="external" size={16} color={t.blue} bold />
          </ExtLink>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <T s={14} w="600">
                주식투자 관련도
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <T s={24} w="600" c={t.orange} mono>
                  {a.relevance.total}
                </T>
                <T s={13} c={t.sub} mono>
                  /100
                </T>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {AXES.map((k) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 22 }}>
                  <T s={13} c={t.sub} style={{ width: 128 }}>
                    {AXIS_LABEL[k]}
                  </T>
                  <Meter value={a.relevance.axes[k] ?? 0} max={AXIS_MAX[k]} />
                  <T s={12} c={t.sub} mono style={{ width: 44, textAlign: 'right' }}>
                    {a.relevance.axes[k] ?? 0}/{AXIS_MAX[k]}
                  </T>
                </View>
              ))}
            </View>
            {a.relevance.reason ? (
              <T s={13} c={t.sub}>
                {a.relevance.reason}
              </T>
            ) : null}
          </Card>
        </View>

        {a.summary.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="3줄 요약" />
            <View style={{ gap: 10 }}>
              {a.summary.map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                  <T s={16} w="600" c={t.blue} mono lh={1.55}>
                    {i + 1}
                  </T>
                  <T s={16} lh={1.55} style={{ flex: 1 }}>
                    {line}
                  </T>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {a.numbers.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="핵심 숫자" />
            <Card style={{ paddingVertical: 0 }}>
              {a.numbers.map((num, i) => (
                <View key={i}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, paddingVertical: 10 }}>
                    <T s={21} w="600" mono>
                      {num.value}
                    </T>
                    <T s={13} c={t.sub} lh={1.4} style={{ flex: 1, textAlign: 'right' }}>
                      {num.label}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {a.impact.length > 0 || a.trap ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="시장에 미치는 영향" />
            <View style={{ gap: 8 }}>
              {a.impact.map((it, i) => (
                <Card key={i} style={{ gap: 6, borderRadius: 14, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <T s={15} w="600" style={{ flex: 1 }}>
                      {it.target}
                    </T>
                    <Chip label={it.label} tone={STANCE_TONE[it.stance] ?? 'neutral'} />
                  </View>
                  <T s={15} c={t.sub} lh={1.55}>
                    {it.text}
                  </T>
                </Card>
              ))}
            </View>
            {a.trap ? (
              <Card tone="inverse" style={{ gap: 6, borderRadius: 14 }}>
                <T s={13} w="600" c={t.onInverseAccent}>
                  바로 반응하면 생기는 함정
                </T>
                <T s={15} c={t.onInverse} lh={1.55}>
                  {a.trap}
                </T>
              </Card>
            ) : null}
          </View>
        ) : null}

        {a.chain.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="왜 중요한가" />
            <View style={{ gap: 4 }}>
              {a.chain.map((step, i) => (
                <View key={i} style={{ gap: 4 }}>
                  {i > 0 ? (
                    <View style={{ alignItems: 'center' }} aria-hidden>
                      <Icon name="down" size={12} color={t.mute} />
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 40,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      backgroundColor: t.card,
                      borderWidth: 1,
                      borderColor: t.line,
                      borderRadius: 10,
                    }}
                  >
                    <T s={12} c={t.mute} mono>
                      {i + 1}
                    </T>
                    <T s={15} w="500" style={{ flex: 1 }}>
                      {step}
                    </T>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {a.links.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="지난 기록과의 연결" />
            <View style={{ gap: 10 }}>
              {a.links.map((link, i) => (
                <LinkCard key={i} link={link} />
              ))}
            </View>
            {a.threadId ? (
              <Tap onPress={() => nav.openThread(a.threadId!)} label="이 실 전체 보기" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                <T s={15} w="600" c={t.blue}>
                  이 실 전체 보기
                </T>
                <Icon name="next" size={16} color={t.blue} bold />
              </Tap>
            ) : null}
          </View>
        ) : null}

        {a.lattice ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="Latticework 관점" />
            <Card style={{ gap: 10, borderRadius: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {a.lattice.models.map((m) => (
                  <View key={m} style={{ borderWidth: 1, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <T s={12} w="600" lh={1.35}>
                      {m}
                    </T>
                  </View>
                ))}
              </View>
              <T s={15} lh={1.55}>
                {a.lattice.text}
              </T>
            </Card>
          </View>
        ) : null}

        {a.counter ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="반론 한 줄" />
            <T s={16} lh={1.55}>
              {a.counter}
            </T>
          </View>
        ) : null}

        {a.trackers.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="추적 지표" />
            <Card style={{ paddingVertical: 0, borderRadius: 14 }}>
              {a.trackers.map((tr, i) => (
                <View key={i}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 10 }}>
                    <T s={15} lh={1.4}>
                      {tr}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
            {a.checkDate ? (
              <T s={13} c={t.sub} mono>
                {monthDay(a.checkDate)}에 다시 점검하고 해석을 채점합니다
              </T>
            ) : null}
          </View>
        ) : null}

        {a.glossary.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle index={idx()} title="용어" />
            <View style={{ gap: 12 }}>
              {a.glossary.map((g) => (
                <View key={g.term} style={{ gap: 2 }}>
                  <T s={15} w="600">
                    {g.term}
                  </T>
                  <T s={14} c={t.sub}>
                    {g.def}
                  </T>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionTitle index={idx()} title="내 생각" />
          <TextInput
            nativeID={`memo-${a.id}`}
            accessibilityLabel="내 생각 메모"
            value={memo}
            onChangeText={onMemo}
            onBlur={() => setMemo(a.id, memoRef.current)}
            multiline
            placeholder="이 뉴스로 내 판단이 어떻게 바뀌었나요?"
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
            메모는 자동으로 저장되고, 다음 기사를 고를 때 연결 재료로 쓰입니다.
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
