// 일일 학습(새 개념 읽기, 2026-11-27 소유자 결정). 수집함에서 만든 새 개념은 문제보다 먼저 여기서 읽는다.
// "이해했어요"를 누르면 그 자리에서 지식 지도의 일부가 뜨고 새 점이 돋는다(GrowthBurst). 지도에는 흐린 점으로 남고, 문제를 풀수록 짙어진다.
// "이해했어요"를 누른 개념만 다음 날부터, 하루 분량의 새 개념 자리가 날 때 Latticework 문제로 나온다. "나중에 다시"는 읽을 차례의 끝으로, "빼기"는 공부하지 않을 개념(숨김).
// 읽기 상한은 없다(원하는 만큼). 하루 목표는 1개(store 의 readGoal).
import React, { useEffect, useRef, useState } from 'react';
import { Easing, ScrollView, View, useWindowDimensions } from 'react-native';
import { todayKST } from '../dates';
import { Count, Rise, motionOff } from '../motion';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { RestPoint, useGoals, useStore } from '../store';
import { Concept, ReadMark, StudyData, nameWithEn, readOn, readQueue, startsIn } from '../study';
import { useTheme } from '../theme';
import { EmptyState, ExtLink, Icon, LipButton, PrimaryButton, Ring, T } from '../ui';
import { GrowthBurst, prewarmBurst } from './GrowthBurst';
import { Enter } from './Study';

const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

/** 학문 · 분과(· 주제) 이름 */
function pathOf(data: StudyData, c: Concept): string {
  const nodes = new Map((data.nodes ?? []).map((n) => [n.id, n]));
  const out: string[] = [];
  for (let n = nodes.get(c.node), g = 0; n && g < 8; n = n.parent ? nodes.get(n.parent) : undefined, g++) out.unshift(n.short || n.ko);
  return out.join(' · ');
}

export function ReadScreen() {
  const t = useTheme();
  const nav = useNav();
  const { studyData, study, markConcept } = useStore();
  const today = todayKST();
  // 차례는 화면을 열 때 한 번 정한다(나중에 다시를 누른 개념이 바로 다시 나오지 않게).
  const list = useRef<Concept[]>(studyData ? readQueue(studyData, study) : []).current;
  const [at, setAt] = useState(0);
  const [read, setRead] = useState(0);
  const [skipArm, setSkipArm] = useState(false);
  // 방금 이해한 개념(지도 모션을 보이는 중). 계속을 누르면 다음 카드로.
  const [burst, setBurst] = useState<Concept | null>(null);
  // 이번 이해했어요로 오늘 일일 학습 목표를 채웠는지, 그때의 연속 기록(하루 목표를 모두 마쳤으면 연속이 오른다)
  const [goalFx, setGoalFx] = useState<{ streakFrom: number } | null>(null);
  const goals = useGoals();
  const win = useWindowDimensions();
  const scroll = useRef<any>(null);
  const c = list[at];
  const readToday = readOn(study, today);
  // 이 카드를 읽는 동안 이해했어요 뒤의 지도 모양을 미리 계산해 둔다(누른 순간 멈추지 않게).
  useEffect(() => (c && !burst ? prewarmBurst(studyData, study, c.id, today) : undefined), [c?.id, !!burst]);

  const act = (k: ReadMark['k']) => {
    if (!c) return;
    if (k === 'skip' && !skipArm) {
      setSkipArm(true);
      return;
    }
    const rec = study.days[today];
    const before = rec?.read ?? 0;
    const goal = rec?.readGoal ?? 1;
    markConcept(c.id, k);
    setSkipArm(false);
    if (k === 'ok') {
      setRead((n) => n + 1);
      setGoalFx(before < goal && before + 1 >= goal ? { streakFrom: goals.streak } : null);
      setBurst(c);
      return;
    }
    next();
  };
  const next = () => {
    setBurst(null);
    setGoalFx(null);
    setAt((i) => i + 1);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  if (!studyData) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar label="홈" bg={t.bg} />
        <View style={{ padding: 12 }}>
          <EmptyState title="오프라인" />
        </View>
      </View>
    );
  }

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <RestPoint />
        <BackBar label="홈" bg={t.bg} />
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
          <T s={26} w="700" lh={1.35} role="heading" level={1}>
            {list.length === 0 ? '읽을 개념이 없어요' : '다 읽었어요'}
          </T>
          <T s={15} c={t.sub} lh={23 / 15}>
            {read > 0
              ? `이번에 ${read}개를 이해했어요. 먼저 읽은 개념부터 하루 몇 개씩 Latticework 문제로 나와요.`
              : list.length === 0
                ? '수집함에 새 지식이 들어오면 다음 날 아침에 여기에 생겨요.'
                : '나중에 다시 읽을 개념은 다음에 열 때 다시 나와요.'}
          </T>
          <PrimaryButton label="홈으로" onPress={nav.pop} style={{ marginTop: 16 }} />
        </View>
      </View>
    );
  }

  if (burst) {
    const w = Math.min(win.width, 560);
    const h = Math.round(Math.max(260, Math.min(420, win.height * 0.46)));
    return (
      <View style={{ flex: 1, backgroundColor: t.card }}>
        {/* 지도 모션을 보는 동안은 쉬는 화면: 가려진 탭이 이 틈에 따라잡아 닫기가 가볍다 */}
        <RestPoint />
        <BackBar label="홈" bg={t.card} progress={list.length ? (at + 1) / list.length : 0} />
        <View style={{ flex: 1, paddingTop: 4 }}>
          {goalFx ? <GoalDone streakFrom={goalFx.streakFrom} streakTo={goals.streak} /> : null}
          <Rise key={`b:${burst.id}`} delay={goalFx ? 620 : 0} style={{ paddingHorizontal: 20 }}>
            <T s={13} w="600" c={t.greenText}>
              지식 지도에 새 점이 생겼어요
            </T>
            <T s={24} w="700" lh={1.35} role="heading" level={1} style={{ marginTop: 4 }}>
              {nameWithEn(burst)}
            </T>
            <T s={14} c={t.mute} lh={21 / 14} style={{ marginTop: 4 }}>
              {pathOf(studyData, burst)}
            </T>
          </Rise>
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <GrowthBurst key={burst.id} id={burst.id} width={w} height={goalFx ? h - 72 : h} delay={goalFx ? 1100 : 500} />
          </View>
          <T s={14} c={t.sub} lh={21 / 14} style={{ paddingHorizontal: 20, marginTop: 8 }}>
            {(() => {
              const n = startsIn(studyData, study, today, burst.id);
              const when = n <= 1 ? '내일부터 문제로 나오고' : `약 ${n}일 뒤부터 문제로 나오고(먼저 읽은 개념부터, 복습이 많은 날은 새 개념을 덜 넣어요)`;
              return `지금은 흐린 점이에요. ${when}, 되풀이해 풀수록 점이 짙어져요.`;
            })()}
          </T>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: BOTTOM_PAD, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.card }}>
          <LipButton label={at + 1 < list.length ? '다음 개념' : '마치기'} tone="green" onPress={next} />
        </View>
      </View>
    );
  }

  const card = c.card!;
  // 제목에 영어 이름을 붙였으므로 부제에는 영어 이름을 되풀이하지 않는다.
  const sub = [c.abbr || nameWithEn(c) !== c.name ? null : c.en || c.full, card.ko && card.ko !== c.name ? card.ko : null].filter(Boolean).join(' · ');
  const left = list.length - at;
  return (
    <View style={{ flex: 1, backgroundColor: t.card }}>
      <BackBar label="홈" bg={t.card} progress={list.length ? at / list.length : 0} />
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}>
        <Rise key={c.id} delay={0}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <T s={13} w="600" c={t.blueText} lines={1} style={{ flexShrink: 1 }}>
              {pathOf(studyData, c)}
            </T>
            <T s={13} w="600" c={t.mute} mono>
              {`남은 ${left} · 오늘 ${readToday}`}
            </T>
          </View>
          <T s={26} w="700" lh={1.35} role="heading" level={1} style={{ marginTop: 6 }}>
            {nameWithEn(c)}
          </T>
          {sub ? (
            <T s={14} c={t.mute} lh={20 / 14} style={{ marginTop: 2 }}>
              {sub}
            </T>
          ) : null}

          <View style={{ marginTop: 18, borderWidth: 1.5, borderColor: t.ink, borderRadius: 14, padding: 16 }}>
            <T s={12} w="700" c={t.mute} style={{ marginBottom: 4 }}>
              정의
            </T>
            <T s={16} lh={25 / 16}>
              {card.def}
            </T>
          </View>

          {card.traits?.length ? (
            <Section title="특징">
              {card.traits.map((x, i) => (
                <Bullet key={i} text={x} />
              ))}
            </Section>
          ) : null}
          {card.measure ? (
            <Section title="측정 기준">
              <T s={15} lh={23 / 15}>
                {card.measure}
              </T>
            </Section>
          ) : null}
          {card.example ? (
            <Section title="예시">
              <View style={{ backgroundColor: t.layer, borderRadius: 12, padding: 14 }}>
                <T s={15} lh={23 / 15}>
                  {card.example}
                </T>
              </View>
            </Section>
          ) : null}
          {(card.sub ?? []).map((sb) => (
            <Section key={sb.name} title={`하위 요소 · ${nameWithEn(sb)}`}>
              <T s={15} lh={23 / 15}>
                {sb.def}
              </T>
              {(sb.traits ?? []).map((x, i) => (
                <Bullet key={i} text={x} />
              ))}
            </Section>
          ))}
          {card.contrast?.length ? (
            <Section title="헷갈리는 개념과 구분">
              {card.contrast.map((x, i) => (
                <Bullet key={i} text={`${x.with}: ${x.diff}`} />
              ))}
            </Section>
          ) : null}
          {card.analogy ? (
            <T s={14} c={t.sub} lh={21 / 14} style={{ marginTop: 18 }}>
              {`비유. ${card.analogy}`}
            </T>
          ) : null}
          {card.src?.length ? (
            <View style={{ marginTop: 18, gap: 4 }}>
              <T s={12} w="700" c={t.mute}>
                출처
              </T>
              {card.src.slice(0, 4).map((s) => (
                <ExtLink key={s.url} url={s.url} label={`${s.title} 열기`}>
                  <T s={13} c={t.blueText} lh={19 / 13}>
                    {s.title}
                  </T>
                </ExtLink>
              ))}
            </View>
          ) : null}
        </Rise>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: BOTTOM_PAD, gap: 8, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.card }}>
        <LipButton label="이해했어요" tone="green" onPress={() => act('ok')} a11yLabel="이해했어요, 차례가 오면 문제로" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <LipButton label="나중에 다시" tone="ghost" onPress={() => act('later')} style={{ flex: 1 }} />
          <LipButton label={skipArm ? '한 번 더 누르면 빼요' : '빼기'} tone={skipArm ? 'red' : 'ghost'} onPress={() => act('skip')} style={{ flex: 1 }} a11yLabel="이 개념 빼기" />
        </View>
      </View>
    </View>
  );
}

/**
 * 오늘 일일 학습 목표를 채운 순간의 표시(2026-11-27 소유자 결정). 초록 고리가 차오르고 체크가 튀어나온 뒤,
 * 이것으로 하루 목표를 모두 마쳤으면 연속 기록이 한 칸 올라간다.
 */
function GoalDone({ streakFrom, streakTo }: { streakFrom: number; streakTo: number }) {
  const t = useTheme();
  const up = streakTo > streakFrom;
  const still = motionOff();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginBottom: 14 }} accessible accessibilityLabel={up ? `일일 학습 완료, 연속 ${streakTo}일` : '일일 학습 완료'}>
      <Ring value={1} size={56} stroke={6} color={t.green} duration={still ? 0 : 620} delay={still ? 0 : 60}>
        <Enter delay={560} duration={420} easing={BACK} scale={0.4}>
          <Icon name="check" size={22} color={t.greenText} sw={3.2} />
        </Enter>
      </Ring>
      <Enter delay={240} duration={360} y={6} style={{ flex: 1 }}>
        <T s={17} w="700" c={t.ink} lh={24 / 17}>
          오늘의 일일 학습 완료
        </T>
        <T s={13} c={t.mute} lh={19 / 13}>
          {up ? '오늘 목표를 모두 마쳤어요' : '남은 과제도 이어서 해 보세요'}
        </T>
      </Enter>
      {up ? (
        <Enter delay={700} duration={460} easing={BACK} y={10} scale={0.85}>
          <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: t.orangeWeak }}>
            <T s={11} w="700" c={t.orangeText}>
              연속
            </T>
            <T s={20} w="800" c={t.orangeText} mono lh={26 / 20}>
              <Count from={streakFrom} to={streakTo} duration={420} delay={900} />일
            </T>
          </View>
        </Enter>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 20, gap: 6 }}>
      <T s={15} w="700" c={t.ink}>
        {title}
      </T>
      {children}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <T s={15} c={t.mute} lh={23 / 15}>
        •
      </T>
      <T s={15} lh={23 / 15} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}
