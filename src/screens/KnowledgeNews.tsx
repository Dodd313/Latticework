// 지식 탭의 뉴스: 읽은 기사를 주별로(새 주부터). 날짜와 제목(원문 그대로 한 줄), 주마다 주간 종합 퀴즈.
// 뉴스는 장기 기억 대상이 아니다. 기억 상태는 두지 않는다.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { addDays, isoWeekId, mondayOf, todayKST, weekdayOf } from '../dates';
import { useNav } from '../nav';
import { quizScore } from '../period';
import { NewsItem, useNewsHistory, useStore, weeklyReviewFor } from '../store';
import { FONT_SANS, useTheme } from '../theme';
import { EmptyState, ExtLink, Icon, T, Tap } from '../ui';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** ISO 주 이름(2026-W47)의 월요일 */
function mondayOfWeekId(id: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) return null;
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = `${y}-01-04`;
  return addDays(mondayOf(jan4), (w - 1) * 7);
}

function weekLabel(mon: string, thisMon: string): string {
  if (mon === thisMon) return '이번 주';
  if (mon === addDays(thisMon, -7)) return '지난주';
  const sun = addDays(mon, 6);
  return mon.slice(5, 7) === sun.slice(5, 7) ? `${md(mon)} ~ ${Number(sun.slice(8, 10))}일` : `${md(mon)} ~ ${md(sun)}`;
}

/** 찾는 말을 파랑으로(제목 글자는 그대로) */
function Marked({ text, q, color }: { text: string; q: string; color: string }) {
  if (!q) return <>{text}</>;
  const low = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  for (let j = low.indexOf(ql); j >= 0; j = low.indexOf(ql, i)) {
    if (j > i) out.push(text.slice(i, j));
    out.push(
      <Text key={j} style={{ color }}>
        {text.slice(j, j + q.length)}
      </Text>,
    );
    i = j + q.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

/** 지식 탭이 칸을 바꿀 때 다시 그리지 않게 memo 로 감싼다(자기 자료가 바뀔 때만 다시 그린다). */
export const KnowledgeNews = React.memo(function KnowledgeNews() {
  const t = useTheme();
  const nav = useNav();
  const items = useNewsHistory();
  const { reviews, user } = useStore();
  const [q, setQ] = useState('');
  const query = q.trim();
  const today = todayKST();
  const thisMon = mondayOf(today);

  const groups = useMemo(() => {
    const ql = query.toLowerCase();
    const hits = query ? items.filter((n) => n.title.toLowerCase().includes(ql)) : items;
    const map = new Map<string, NewsItem[]>();
    for (const n of hits) {
      const mon = mondayOf(n.date);
      let list = map.get(mon);
      if (!list) map.set(mon, (list = []));
      list.push(n);
    }
    // 읽은 기사가 없는 주라도 종합 퀴즈가 있으면 그 주를 보인다(찾는 중이 아닐 때)
    if (!query)
      for (const r of reviews) {
        const mon = mondayOfWeekId(r.id);
        if (mon && mon <= today && !map.has(mon) && r.questions.length) map.set(mon, []);
      }
    return { list: [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)), count: hits.length };
  }, [items, reviews, query, today]);

  return (
    <ScrollView style={{ flex: 1 }} stickyHeaderIndices={[0]} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ backgroundColor: t.card, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.p.grey100 }}>
          <Icon name="search" size={20} color={t.faint} sw={2.2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="기사 검색"
            placeholderTextColor={t.faint}
            accessibilityLabel="기사 검색"
            autoCorrect={false}
            returnKeyType="search"
            style={[{ flex: 1, minWidth: 0, fontFamily: FONT_SANS, fontSize: 16, fontWeight: '500', color: t.ink, paddingVertical: 0 }, { outlineStyle: 'none' } as any]}
          />
          {query ? (
            <T s={13} w="600" c={t.mute} mono>
              {`${groups.count}건`}
            </T>
          ) : null}
        </View>
      </View>
      {groups.list.length === 0 && !query ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <EmptyState title="아직 읽은 기사가 없어요" />
        </View>
      ) : null}
      {groups.list.map(([mon, list], gi) => (
        <View key={mon}>
          {gi ? <View style={{ height: 10, backgroundColor: t.bg }} /> : null}
          <WeekHead mon={mon} label={weekLabel(mon, thisMon)} reviews={reviews} user={user} onQuiz={(id) => nav.push({ name: 'weekly', id })} />
          {list.map((n, i) => {
            const first = i === 0 || list[i - 1].date !== n.date;
            const row = (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: 20 }}>
                <T s={13} w="600" c={t.mute} mono lines={1} style={{ width: 50 }}>
                  {first ? `${Number(n.date.slice(8, 10))}일 ${DOW[weekdayOf(n.date)]}` : ''}
                </T>
                <T s={16} w="500" c={t.p.grey800} lines={1} lh={23 / 16} style={{ flex: 1, minWidth: 0 }}>
                  <Marked text={n.title} q={query} color={t.blueText} />
                </T>
              </View>
            );
            if (n.inFeed)
              return (
                <Tap key={n.id} press="dim" label={n.title} onPress={() => nav.push({ name: 'article', id: n.id })}>
                  {row}
                </Tap>
              );
            if (n.url)
              return (
                <ExtLink key={n.id} url={n.url} label={n.title}>
                  {row}
                </ExtLink>
              );
            return <View key={n.id}>{row}</View>;
          })}
        </View>
      ))}
    </ScrollView>
  );
});

/** 주 머리: 이번 주 / 지난주 / 11월 9일 ~ 15일, 오른쪽에 종합 퀴즈 점수 또는 단추 */
function WeekHead({ mon, label, reviews, user, onQuiz }: { mon: string; label: string; reviews: ReturnType<typeof useStore>['reviews']; user: ReturnType<typeof useStore>['user']; onQuiz: (id: string) => void }) {
  const t = useTheme();
  const id = isoWeekId(mon);
  const review = weeklyReviewFor(reviews, id);
  const score = quizScore(user, id, review ? review.questions : null);
  const taken = !!score && score.total > 0 && score.answered >= score.total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingTop: 14, paddingBottom: 4, paddingHorizontal: 20 }}>
      <T s={17} w="700" lh={25 / 17} role="heading" level={2} style={{ letterSpacing: -0.3 }}>
        {label}
      </T>
      {taken ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <T s={13} w="600" c={t.mute}>
            종합 퀴즈
          </T>
          <T s={15} w="700" c={t.p.grey800} mono>
            {`${score!.right}/${score!.total}`}
          </T>
        </View>
      ) : review && review.questions.length ? (
        <Tap label="종합 퀴즈" onPress={() => onQuiz(id)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: t.blueWeak, alignItems: 'center', justifyContent: 'center' }}>
          <T s={13} w="700" c={t.blueText} lh={1.3}>
            종합 퀴즈
          </T>
        </Tap>
      ) : null}
    </View>
  );
}
