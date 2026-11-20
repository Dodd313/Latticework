import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { cheerRead, seedOf } from '../cheer';
import { monthDay, todayKST } from '../dates';
import { MView, NATIVE_DRIVER, Rise, WEB, motionOff, spring, usePop, webTween } from '../motion';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
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
  const pop = usePop(read);
  return (
    <Tap onPress={onPress} label={read ? '읽음 해제' : '읽음 표시'} selected={read} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <MView
        ref={pop.ref}
        style={[
          {
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: read ? t.blue : 'transparent',
            borderWidth: read ? 0 : 2,
            borderColor: t.line,
          },
          pop.style,
        ]}
      >
        <Icon name="check" size={16} color={read ? t.onColor : t.faint} sw={3} />
      </MView>
    </Tap>
  );
}

/** 끝까지 읽었을 때 아래에서 올라와 2초쯤 머물다 사라지는 응원 한 줄. 화면 위에 떠서 자리를 밀지 않는다. */
function ReadToast({ text, onDone }: { text: string; onDone: () => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(motionOff() || WEB ? 1 : 0)).current;
  const box = useRef<any>(null);
  // 웹: 같은 스프링과 같은 나가기를 브라우저에 맡긴다.
  useLayoutEffect(() => {
    if (!WEB) return;
    const toast = (x: number) => ({ opacity: x, transform: `translateY(${24 * (1 - x)}px)` });
    const enter = motionOff() ? null : webTween(box, { spring: 'quick' }, toast);
    let out: ReturnType<typeof webTween> = null;
    const id = setTimeout(() => {
      if (motionOff()) return onDone();
      enter?.anim.cancel();
      out = webTween(box, { duration: 200, easing: Easing.in(Easing.cubic) }, toast, { from: 1, to: 0, fill: 'forwards' });
      if (out) out.anim.onfinish = () => onDone();
      else onDone();
    }, 2200);
    return () => {
      clearTimeout(id);
      enter?.anim.cancel();
      if (out) out.anim.onfinish = null;
    };
  }, []);
  useEffect(() => {
    if (WEB) return;
    let out: Animated.CompositeAnimation | null = null;
    const enter = spring(v, 1, 'quick');
    enter.start();
    const id = setTimeout(() => {
      if (motionOff()) return onDone();
      out = Animated.timing(v, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
      out.start(({ finished }) => finished && onDone());
    }, 2200);
    return () => {
      clearTimeout(id);
      enter.stop();
      out?.stop();
    };
  }, []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 20 }}>
      <MView
        ref={box}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          maxWidth: 360,
          paddingVertical: 12,
          paddingLeft: 12,
          paddingRight: 18,
          borderRadius: 16,
          backgroundColor: t.blue,
          ...(WEB ? null : { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }),
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.onColor, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
          <Icon name="check" size={14} color={t.blue} sw={3.4} />
        </View>
        <T type="t6" w="600" c={t.onColor} lines={1} style={{ flexShrink: 1 }}>
          {text}
        </T>
      </MView>
      <View style={{ height: BOTTOM_PAD }} />
    </View>
  );
}

function Body({ a, pos }: { a: Article; pos: string | undefined }) {
  const t = useTheme();
  const { days, user, markRead } = useStore();
  const isRead = !!user.read[a.id];
  const progress = useRef(new Animated.Value(0)).current;
  // 웹: 스크롤마다 React 를 다시 그리지 않고 진행선의 transform 만 고쳐 쓴다.
  const bar = useRef<any>(null);
  const autoMarked = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  // 끝까지 읽어 새로 읽음이 되면 응원 한 줄. 숫자는 오늘 기사 중 읽은 수(이번 기사 포함)와 오늘 기사 수.
  const cheer = () => {
    const today = todayKST();
    const todayDay = days[0] && days[0].date === today ? days[0] : undefined;
    const isToday = !!todayDay && todayDay.articles.some((x) => x.id === a.id);
    const readToday = isToday ? todayDay!.articles.filter((x) => x.id === a.id || !!user.read[x.id]).length : 0;
    const totalToday = isToday ? todayDay!.articles.length : 0;
    return cheerRead({ readToday, totalToday, seed: seedOf(today, 'read', a.id) });
  };
  // 스크롤에 맞춰 위쪽 진행선을 늘리고, 끝까지 읽으면 한 번만 읽음으로 표시한다.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const room = Math.max(1, contentSize.height - layoutMeasurement.height);
    const p = Math.max(0, Math.min(1, contentOffset.y / room));
    if (WEB) {
      const el = bar.current as HTMLElement | null;
      if (el) el.style.transform = `scaleX(${p})`;
    } else progress.setValue(p);
    if (!autoMarked.current && contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) {
      autoMarked.current = true;
      if (!isRead) setToast(cheer());
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
        <MView ref={bar} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: t.blue, transformOrigin: 'left', transform: [{ scaleX: WEB ? 0 : progress }] }} />
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
      {toast ? <ReadToast text={toast} onDone={() => setToast(null)} /> : null}
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
