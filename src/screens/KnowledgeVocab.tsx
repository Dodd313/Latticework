// 지식 탭의 단어장: 이미 배운(한 번이라도 답한) 단어와 구문만. 새로 배운 것부터, 처음 배운 날로 묶는다.
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, todayKST } from '../dates';
import { CSS_EASE, EASE_OUT, MView, NATIVE_DRIVER, WEB, motionOff, spring, webAnimate, webTween } from '../motion';
import { VocabItem, useVocabLearned } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { EmptyState, Icon, T, Tap } from '../ui';

type Kind = '전체' | '단어' | '구문';
const KINDS: Kind[] = ['전체', '단어', '구문'];
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

function dayTitle(d: string, today: string): string {
  if (d === today) return '오늘';
  if (d === addDays(today, -1)) return '어제';
  return md(d);
}

/** 지식 탭이 칸을 바꿀 때 다시 그리지 않게 memo 로 감싼다(자기 자료가 바뀔 때만 다시 그린다). */
export const KnowledgeVocab = React.memo(function KnowledgeVocab() {
  const t = useTheme();
  const items = useVocabLearned();
  const [kind, setKind] = useState<Kind>('전체');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<VocabItem | null>(null);
  const query = q.trim();
  const today = todayKST();
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { 전체: items.length, 단어: 0, 구문: 0 };
    for (const it of items) c[it.kind] += 1;
    return c;
  }, [items]);
  const list = useMemo(() => {
    const ql = query.toLowerCase();
    return items.filter((it) => (kind === '전체' || it.kind === kind) && (!query || it.v.term.toLowerCase().includes(ql) || it.v.ko.includes(query)));
  }, [items, kind, query]);

  const listRef = useRef<any>(null);
  const firstKind = useRef(true);
  useLayoutEffect(() => {
    if (firstKind.current) {
      firstKind.current = false;
      return;
    }
    if (!WEB || motionOff()) return;
    const a = webAnimate(listRef, [{ opacity: 0.2 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
    return () => a?.cancel();
  }, [kind]);

  const rows: React.ReactNode[] = [];
  let last = '';
  for (const it of list) {
    if (it.first !== last) {
      last = it.first;
      rows.push(
        <T key={`d:${it.first}`} s={13} w="600" c={t.mute} style={{ paddingTop: 16, paddingBottom: 2, paddingHorizontal: 20 }}>
          {dayTitle(it.first, today)}
        </T>,
      );
    }
    rows.push(
      <Tap key={it.v.id} press="dim" label={`${it.v.term} ${it.v.ko}`} onPress={() => setOpen(it)} style={{ minHeight: 60, paddingVertical: 8, paddingHorizontal: 20, justifyContent: 'center' }}>
        <T s={17} w="600" lines={1} lh={24 / 17} style={{ letterSpacing: -0.2 }}>
          {it.v.term}
        </T>
        <T s={14} w="500" c={t.sub} lines={1} lh={20 / 14}>
          {it.v.ko}
        </T>
      </Tap>,
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} stickyHeaderIndices={[0]} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ backgroundColor: t.card, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.p.grey100 }}>
            <Icon name="search" size={20} color={t.faint} sw={2.2} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="단어 검색"
              placeholderTextColor={t.faint}
              accessibilityLabel="단어 검색"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[{ flex: 1, minWidth: 0, fontFamily: FONT_SANS, fontSize: 16, fontWeight: '500', color: t.ink, paddingVertical: 0 }, { outlineStyle: 'none' } as any]}
            />
            {query ? (
              <T s={13} w="600" c={t.mute} mono>
                {`${list.length}개`}
              </T>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {KINDS.map((k) => {
              const on = k === kind;
              return (
                <Tap key={k} role="tab" selected={on} label={`${k} ${counts[k]}`} onPress={() => setKind(k)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? t.ink : t.p.grey100, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T s={14} w="600" c={on ? t.card : t.p.grey700} lh={1.3}>
                    {k}
                  </T>
                  <T s={14} w="600" c={on ? t.faint : t.mute} mono lh={1.3}>
                    {String(counts[k])}
                  </T>
                </Tap>
              );
            })}
          </View>
        </View>
        <View ref={listRef}>
          {items.length === 0 ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
              <EmptyState title="아직 배운 단어가 없어요" />
            </View>
          ) : (
            rows
          )}
        </View>
      </ScrollView>
      {open ? <VocabCard item={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
});

/** 가운데 카드: 종류, 표현, 뜻, 풀이, 반복과 처음 본 날. 바깥이나 카드를 누르면 닫힌다 */
function VocabCard({ item, onClose }: { item: VocabItem; onClose: () => void }) {
  const t = useTheme();
  const scrim = useRef<any>(null);
  const card = useRef<any>(null);
  const v = useRef(new Animated.Value(WEB || motionOff() ? 1 : 0)).current;
  const closing = useRef(false);
  useLayoutEffect(() => {
    if (motionOff()) return;
    if (WEB) {
      const a = webTween(scrim, { duration: 240, easing: EASE_OUT }, (x) => ({ opacity: x }));
      const b = webTween(card, { spring: 'quick' }, (x) => ({ opacity: Math.min(1, x), transform: `scale(${(0.94 + 0.06 * x).toFixed(4)})` }));
      return () => {
        a?.anim.cancel();
        b?.anim.cancel();
      };
    }
    spring(v, 1, 'quick').start();
  }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (motionOff()) return onClose();
    if (WEB) {
      webAnimate(scrim, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease', fill: 'forwards' });
      const b = webAnimate(card, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 180, easing: CSS_EASE.out, fill: 'forwards' });
      if (b) b.onfinish = onClose;
      else onClose();
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(onClose);
  };
  const cells: [string, string][] = [
    ['반복', `${item.reps}회`],
    ['처음 본 날', md(item.first)],
  ];
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20, justifyContent: 'center', paddingHorizontal: 24 }]}>
      <MView ref={scrim} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }, WEB ? null : { opacity: v }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="닫기" style={StyleSheet.absoluteFill} />
      </MView>
      <MView ref={card} style={[{ backgroundColor: t.card, borderRadius: 26, paddingTop: 28, paddingHorizontal: 24, paddingBottom: 24 }, WEB ? ({ boxShadow: '0 2px 6px rgba(0,12,30,.06), 0 10px 28px rgba(0,12,30,.14)' } as any) : { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={`${item.v.term} 닫기`}>
          <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 9, borderRadius: 7, backgroundColor: t.purpleWeak, justifyContent: 'center' }}>
            <T s={12} w="700" c={t.purple} lh={1.3}>
              {item.kind}
            </T>
          </View>
          <T s={28} w="700" lh={36 / 28} style={{ marginTop: 14, letterSpacing: -0.6 }}>
            {item.v.term}
          </T>
          <T s={18} w="600" c={t.p.grey700} lh={26 / 18} style={{ marginTop: 6 }}>
            {item.v.ko}
          </T>
          {item.v.def ? (
            <Text style={{ marginTop: 10, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22, color: t.sub }}>{item.v.def}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {cells.map(([a, b]) => (
              <View key={a} style={{ flex: 1, backgroundColor: t.layer, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
                <T s={13} w="600" c={t.mute} lh={18 / 13}>
                  {a}
                </T>
                <T s={18} w="700" mono lines={1} lh={26 / 18} style={{ marginTop: 2 }}>
                  {b}
                </T>
              </View>
            ))}
          </View>
        </Pressable>
      </MView>
    </View>
  );
}
