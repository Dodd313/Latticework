// Research: 분석 중인 기업을 고르는 화면(2026-11-24 소유자 결정). 홈의 수리 아래 줄에서 연다.
// 기업을 누르면 그 기업의 사실 문제(StudyScreen sect 'rs')로 간다. 사실은 소유자의 분석 일지에서 뽑아 docs/data/research.json 에 둔다.
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { todayKST } from '../dates';
import { Rise } from '../motion';
import { BackBar, useNav } from '../nav';
import { useStore } from '../store';
import { ResearchCompany, liveFacts, researchStatus } from '../study';
import { useTheme } from '../theme';
import { Box, EmptyState, Icon, T, Tap } from '../ui';

export function ResearchScreen() {
  const t = useTheme();
  const { researchData } = useStore();
  const companies = researchData?.companies ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar label="홈" bg={t.bg} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20, gap: 4 }}>
          <T s={26} w="700" lh={1.35} role="heading" level={1}>
            Research
          </T>
          <T s={15} w="500" c={t.mute} lh={22 / 15}>
            분석 중인 기업의 사실을 되풀이해 익힙니다. 하루 목표에는 들지 않아요.
          </T>
        </View>
        <View style={{ paddingHorizontal: 12, gap: 12 }}>
          {companies.length === 0 ? (
            <EmptyState title="분석 중인 기업이 없어요" body="분석 일지를 수집함에 넣으면 다음 날 아침에 생겨요." />
          ) : (
            companies.map((c, i) => (
              <Rise key={c.id} delay={40 + i * 60}>
                <CompanyCard c={c} />
              </Rise>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CompanyCard({ c }: { c: ResearchCompany }) {
  const t = useTheme();
  const nav = useNav();
  const { researchData, study } = useStore();
  const today = todayKST();
  const info = useMemo(() => {
    if (!researchData) return null;
    const s = researchStatus(researchData, study, c.id, today);
    const fs = liveFacts(researchData, c.id);
    // 묶음(광산, 사업, 산업 등)별 사실 수. 일지에 처음 나온 순서대로.
    const groups: [string, number][] = [];
    for (const f of fs) {
      const name = researchData.groups?.[f.group] ?? f.group;
      const g = groups.find((x) => x[0] === name);
      if (g) g[1]++;
      else groups.push([name, 1]);
    }
    const last = fs.reduce((m, f) => (f.asOf > m ? f.asOf : m), '');
    return { ...s, groups, last };
  }, [researchData, study, c.id, today]);
  if (!info) return null;
  const cells: [string, string, boolean][] = [
    ['사실', `${info.total}개`, false],
    ['익힌 것', `${info.seen}개`, false],
    ['오늘 복습', `${info.due}개`, info.due > 0],
  ];
  const label = info.due > 0 ? `복습 ${info.due}개 풀기` : info.seen < info.total ? '새 사실 익히기' : '다시 풀기';
  return (
    <Tap press="soft" onPress={() => nav.push({ name: 'study', sect: 'rs', focus: c.id })} label={`${c.name} 문제 풀기`}>
      <Box>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.layer, alignItems: 'center', justifyContent: 'center' }}>
            <T s={13} w="700" mono>
              {c.ticker}
            </T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={18} w="700" lines={1} lh={26 / 18}>
              {c.name}
            </T>
            <T s={13} w="500" c={t.mute} lines={1} lh={18 / 13}>
              {[c.ko, c.sector].filter(Boolean).join(' · ')}
            </T>
          </View>
          <Icon name="chev" size={18} color={t.p.grey400} />
        </View>
        {c.note ? (
          <T s={14} c={t.sub} lh={21 / 14} style={{ marginTop: 12 }}>
            {c.note}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {cells.map(([a, b, hot]) => (
            <View key={a} style={{ flex: 1, backgroundColor: t.layer, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
              <T s={12} w="600" c={t.mute} lh={17 / 12}>
                {a}
              </T>
              <T s={17} w="700" c={hot ? t.orangeText : t.ink} mono lines={1} lh={24 / 17} style={{ marginTop: 2 }}>
                {b}
              </T>
            </View>
          ))}
        </View>
        <T s={13} c={t.mute} lh={19 / 13} style={{ marginTop: 12 }}>
          {info.groups.map(([g, n]) => `${g} ${n}`).join(' · ')}
          {info.last ? ` · 일지 ${Number(info.last.slice(5, 7))}/${Number(info.last.slice(8, 10))}까지` : ''}
        </T>
        <View style={{ marginTop: 14, height: 48, borderRadius: 14, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
          <T s={16} w="700" c="#fff">
            {label}
          </T>
        </View>
      </Box>
    </Tap>
  );
}
