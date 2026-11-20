import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { todayKST } from '../dates';
import { Rise } from '../motion';
import { BOTTOM_PAD, BackBar, useNav } from '../nav';
import { useStore } from '../store';
import { LAT_GOAL, Q, Section, buildLat, buildVoc, levelOf, xpFor } from '../study';
import { useTheme } from '../theme';
import { Icon, Rich, T, Tap } from '../ui';

const PAD: any = BOTTOM_PAD === 8 ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))';
const MARK = ['가', '나', '다', '라', '마'];
const SECT_NAME: Record<Section, string> = { lat: 'Latticework', voc: '영단어' };

type Phase = 'answer' | 'hint' | 'right' | 'wrong' | 'think' | 'grade';

function Button({ label, onPress, disabled, kind = 'solid' }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'solid' | 'line' }) {
  const t = useTheme();
  return (
    <Tap onPress={onPress} disabled={disabled} label={label} style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === 'solid' ? t.inverse : 'transparent', borderWidth: kind === 'line' ? 1 : 0, borderColor: t.rule }}>
      <T s={16} w="700" c={kind === 'solid' ? t.onInverse : t.ink}>
        {label}
      </T>
    </Tap>
  );
}

export function StudyScreen({ sect }: { sect: Section }) {
  const t = useTheme();
  const nav = useNav();
  const { studyData, study, recordStudy, studyAsked } = useStore();
  const today = todayKST();
  const rec = study.days[today];
  const goal = sect === 'lat' ? (rec?.latGoal ?? LAT_GOAL) : (rec?.vocGoal ?? 0);
  const doneAtOpen = useRef(sect === 'lat' ? (rec?.lat ?? 0) : (rec?.voc ?? 0)).current;

  // 세션은 화면을 열 때 한 번 짠다. 오늘 목표가 남았으면 남은 만큼, 다 했으면 "더 풀기"로 연다.
  const first = useMemo<{ queue: Q[]; extra: boolean }>(() => {
    if (!studyData) return { queue: [], extra: false };
    const left = Math.max(0, goal - doneAtOpen);
    const now = new Date();
    const asked = studyAsked();
    if (left > 0) return { queue: sect === 'lat' ? buildLat(studyData, study, today, now, left, 'daily', asked) : buildVoc(studyData, study, today, now, 'daily', left, asked), extra: false };
    return { queue: [], extra: true };
  }, []);

  const [queue, setQueue] = useState<Q[]>(first.queue);
  const [extra, setExtra] = useState(first.extra);
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>(first.queue[0]?.reveal !== undefined ? 'think' : 'answer');
  const [picked, setPicked] = useState<number | null>(null);
  const [crossed, setCrossed] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [tally, setTally] = useState({ right: 0, total: 0, xp: 0 });
  const [exhausted, setExhausted] = useState(false);
  const shownAt = useRef(Date.now());

  const q = queue[at];
  const finished = !q;
  const firstRun = queue.filter((x) => !x.retry).length;

  const open = (index: number, list: Q[]) => {
    setAt(index);
    setPicked(null);
    setCrossed([]);
    setAttempts(0);
    setPhase(list[index]?.reveal !== undefined ? 'think' : 'answer');
    shownAt.current = Date.now();
  };

  const settle = (grade: 1 | 2 | 3, ok: boolean, tries: number): Q[] => {
    if (!q) return queue;
    recordStudy(q, { ok, attempts: tries, sec: (Date.now() - shownAt.current) / 1000, grade, counts: !q.retry && !extra });
    if (!q.retry) setTally((s) => ({ right: s.right + (grade === 3 ? 1 : 0), total: s.total + 1, xp: s.xp + xpFor(grade) }));
    // 틀린 문제는 세션 끝에 한 번 더 낸다.
    if (grade === 1 && !q.retry) {
      const next = [...queue, { ...q, retry: true }];
      setQueue(next);
      return next;
    }
    return queue;
  };

  const check = () => {
    if (!q || picked === null || q.answer === undefined) return;
    const tries = attempts + 1;
    setAttempts(tries);
    if (picked === q.answer) {
      settle(tries === 1 ? 3 : 2, true, tries);
      setPhase('right');
    } else if (tries === 1 && !q.retry && (q.options?.length ?? 0) > 2) {
      setCrossed((c) => [...c, picked]);
      setPicked(null);
      setPhase('hint');
    } else {
      settle(1, false, tries);
      setPhase('wrong');
    }
  };

  const selfGrade = (grade: 1 | 2 | 3) => {
    open(at + 1, settle(grade, grade !== 1, 1));
  };

  const more = () => {
    if (!studyData) return;
    const now = new Date();
    const asked = studyAsked();
    const list = sect === 'lat' ? buildLat(studyData, study, today, now, 5, 'weak', asked) : buildVoc(studyData, study, today, now, 'weak', 8, asked);
    setExhausted(list.length === 0);
    setExtra(true);
    setQueue(list);
    setTally({ right: 0, total: 0, xp: 0 });
    open(0, list);
  };

  const position = q ? (q.retry ? '다시 풀기' : `${queue.slice(0, at + 1).filter((x) => !x.retry).length} / ${firstRun}`) : '';
  const settled = phase === 'right' || phase === 'wrong';

  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      <BackBar
        label="오늘"
        right={
          <T s={12.5} c={t.sub} mono>
            {SECT_NAME[sect]}
            {position ? ` · ${position}` : ''}
          </T>
        }
      />
      {!finished ? (
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 22, marginTop: -1 }} aria-hidden>
          {queue.map((x, i) => (
            <View key={i} style={{ flex: 1, height: 3, backgroundColor: i < at ? t.rule : i === at ? t.green : t.line }} />
          ))}
        </View>
      ) : null}

      {!studyData ? (
        <View style={{ padding: 22 }}>
          <T s={15} c={t.sub} lh={1.6}>
            복습 자료를 받지 못했습니다. 인터넷에 연결한 뒤 다시 열어 주세요.
          </T>
        </View>
      ) : finished ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 40, gap: 22 }}>
          <Rise>
            <View style={{ borderTopWidth: 3, borderTopColor: t.rule, borderBottomWidth: 1, borderBottomColor: t.rule, paddingVertical: 24, gap: 8 }}>
              <T s={13} w="700" c={t.sub} style={{ letterSpacing: 0.4 }}>
                {SECT_NAME[sect]}
              </T>
              <T serif s={28} w="700" lh={1.35}>
                {exhausted ? '남은 문제 없음' : extra ? '더 풀기 완료' : '학습 완료'}
              </T>
              {tally.total > 0 ? (
                <T s={15} lh={1.6} c={t.deck}>
                  정답 {tally.right}/{tally.total} · 경험치 +{tally.xp}
                </T>
              ) : null}
              <T s={13} c={t.sub}>
                레벨 {levelOf(study.xp)} · 누적 경험치 {study.xp}점
              </T>
            </View>
          </Rise>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {exhausted ? null : <Button label="더 풀기" kind="line" onPress={more} />}
            <Button label="오늘로 돌아가기" onPress={nav.pop} />
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 28, gap: 22 }}>
            <Rise trigger={`${at}-${q.key}`} y={10} style={{ gap: 12 }}>
              <T s={12.5} w="700" c={t.blue} style={{ letterSpacing: 0.3 }}>
                {q.kicker}
              </T>
              <Rich serif s={q.q.length > 40 ? 20 : 23} w="700" lh={1.5} role="heading" level={1}>
                {q.q}
              </Rich>
              {q.pre ? (
                <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.line, borderBottomWidth: 1, borderBottomColor: t.line }}>
                  <Rich serif s={16.5} lh={1.75} c={t.bodyInk}>
                    {q.pre}
                  </Rich>
                </View>
              ) : null}
            </Rise>

            {q.options ? (
              <View accessibilityRole="radiogroup" style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
                {q.options.map((opt, i) => {
                  const isAnswer = settled && i === q.answer;
                  const isCrossed = crossed.includes(i) || (phase === 'wrong' && i === picked);
                  const on = !settled && picked === i;
                  return (
                    <Tap
                      key={i}
                      role="button"
                      selected={on}
                      label={opt}
                      disabled={settled || crossed.includes(i)}
                      onPress={() => {
                        setPicked(i);
                        if (phase === 'hint') setPhase('hint');
                      }}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingVertical: 12, paddingHorizontal: on || isAnswer ? 12 : 4, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: on || isAnswer ? t.inverse : 'transparent' },
                        settled ? { opacity: 1 } : null,
                      ]}
                    >
                      <T serif s={15} w="700" c={on || isAnswer ? t.onInverse : t.sub} style={{ width: 16 }}>
                        {MARK[i]}
                      </T>
                      <Rich s={16} w={on || isAnswer ? '700' : '400'} lh={1.5} c={on || isAnswer ? t.onInverse : isCrossed ? t.mute : t.ink} style={[{ flex: 1 }, isCrossed ? ({ textDecorationLine: 'line-through' } as any) : null]}>
                        {opt}
                      </Rich>
                      {isAnswer ? <Icon name="check" size={18} color={t.onInverse} bold /> : null}
                    </Tap>
                  );
                })}
              </View>
            ) : null}

            {phase === 'hint' && q.hint ? (
              <Rise y={8} style={{ gap: 6 }}>
                <T s={12.5} w="700" c={t.orange} style={{ letterSpacing: 0.3 }}>
                  힌트
                </T>
                <Rich s={15} lh={1.65}>
                  {q.hint}
                </Rich>
              </Rise>
            ) : null}
            {phase === 'hint' && !q.hint ? (
              <T s={14} c={t.orange}>
                다시 골라 보세요.
              </T>
            ) : null}

            {settled ? (
              <Rise y={8} style={{ gap: 6 }}>
                <T s={12.5} w="700" c={phase === 'right' ? t.green : t.orange} style={{ letterSpacing: 0.3 }}>
                  {phase === 'right' ? (attempts === 1 ? '정답' : '두 번째에 정답') : '오답'}
                </T>
                {q.explain ? (
                  <Rich s={15} lh={1.7} c={t.deck}>
                    {q.explain}
                  </Rich>
                ) : null}
              </Rise>
            ) : null}

            {phase === 'grade' ? (
              <Rise y={8} style={{ gap: 8, paddingVertical: 16, borderTopWidth: 3, borderTopColor: t.rule, borderBottomWidth: 1, borderBottomColor: t.rule }}>
                <T s={12.5} w="700" style={{ letterSpacing: 0.4 }}>
                  기준 답
                </T>
                <Rich serif s={16.5} lh={1.8} c={t.bodyInk}>
                  {q.reveal}
                </Rich>
              </Rise>
            ) : null}
            {phase === 'think' ? (
              <T s={14} lh={1.6} c={t.sub}>
                머릿속으로 답을 말해 본 뒤 기준 답과 견줘 보세요.
              </T>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, paddingBottom: PAD, borderTopWidth: 1, borderTopColor: t.rule, backgroundColor: t.ground }}>
            {phase === 'think' ? <Button label="답 보기" onPress={() => setPhase('grade')} /> : null}
            {phase === 'grade' ? (
              <>
                <Button label="몰랐다" kind="line" onPress={() => selfGrade(1)} />
                <Button label="애매했다" kind="line" onPress={() => selfGrade(2)} />
                <Button label="알았다" onPress={() => selfGrade(3)} />
              </>
            ) : null}
            {phase === 'answer' || phase === 'hint' ? <Button label="확인" disabled={picked === null} onPress={check} /> : null}
            {settled ? <Button label={at + 1 < queue.length ? '다음' : '마치기'} onPress={() => open(at + 1, queue)} /> : null}
          </View>
        </>
      )}
    </View>
  );
}
