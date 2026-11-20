/**
 * 응원 문장. 앱이 사용자에게 건네는 짧은 칭찬과 반응을 한곳에서 만든다.
 * 지금은 Latti(src/latti.tsx, docs/data/latti.json)가 말하고, 이 문장들은 Latti 문구가 없을 때
 * (Claude 링크 빌드, 처음 열었는데 문구를 받지 못했을 때)의 대신 문장이다. 기사 끝 알림(cheerRead)은 늘 이것을 쓴다.
 *
 * 규칙 (사용자 결정)
 * - 실제 숫자에 기대는 따뜻한 반응을 건넨다. 예: "오늘 12문제나 풀었어요!"
 *   노력과 진전을 칭찬하고, 죄책감을 주거나 재촉하지 않는다.
 * - 화면 읽는 법을 설명하지 않는다. 범례, "~하면 ~됩니다" 식 안내, 그림을 풀어 쓰는 설명문은 쓰지 않는다.
 *   응원 문장은 칭찬과 반응이지 안내가 아니다.
 * - 해요체, 짧게(되도록 22자 안, 많아도 30자 안팎), 느낌표는 한 줄에 하나까지,
 *   긴 줄표 없음, 이모지 없음, 고유명사(Latticework) 말고는 영어 없음.
 * - 하루 목표를 넘긴 연습은 "추가 학습"이라 부른다. "더 풀기"라는 말은 쓰지 않는다.
 * - 문장 속 숫자는 모두 인자로 받은 실제 값이다. 지어낸 숫자를 넣지 않는다.
 * - 같은 순간에 맞는 사실이 여럿이면 가장 눈에 띄는 사실 하나를 고른다.
 * - 변형은 무작위가 아니라 seed 로 고른다. 다시 그려도 문장이 바뀌지 않게,
 *   부르는 쪽은 seedOf(날짜, 카운터 ...) 처럼 그 순간에 고정된 값으로 seed 를 만든다.
 *
 * 모든 함수는 순수 함수다. 상태를 읽거나 쓰지 않는다.
 */

export type CheerSect = 'lat' | 'voc';

/** 문자열과 숫자를 섞어 32비트 seed 를 만든다 (FNV-1a). 예: seedOf('2026-11-20', 'lat', 3) */
export function seedOf(...parts: Array<string | number | boolean | null | undefined>): number {
  let h = 0x811c9dc5;
  const s = parts.map((p) => String(p ?? '')).join('\u0001');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** seed 와 순간 이름(salt)으로 변형 하나를 고른다. 같은 입력이면 늘 같은 줄이다. */
function pick(lines: string[], seed: number, salt: string): string {
  const i = seedOf(seed >>> 0, salt) % lines.length;
  return lines[i];
}

type Fact = { score: number; lines: string[] };

/** 점수가 가장 높은 사실을 고른다. 같으면 먼저 넣은 쪽. */
function best(facts: Fact[]): Fact | null {
  let top: Fact | null = null;
  for (const f of facts) if (f.lines.length > 0 && (!top || f.score > top.score)) top = f;
  return top;
}

/** 숫자를 우리말로 읽었을 때 받침이 있는지. 끝자리 0(십, 백, 천, 만, 영), 1, 3, 6, 7, 8 은 받침이 있다. */
function hasBatchim(n: number): boolean {
  const d = Math.abs(Math.trunc(n)) % 10;
  return d === 0 || d === 1 || d === 3 || d === 6 || d === 7 || d === 8;
}
const iGa = (n: number) => (hasBatchim(n) ? '이' : '가');
const eulReul = (n: number) => (hasBatchim(n) ? '을' : '를');
/** (으)로: 받침이 없거나 ㄹ 받침(1 일, 7 칠, 8 팔)이면 '로'. */
const euRo = (n: number) => {
  const d = Math.abs(Math.trunc(n)) % 10;
  return !hasBatchim(n) || d === 1 || d === 7 || d === 8 ? '로' : '으로';
};

const int = (n: number) => Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));

/* 1. 정답 피드백 */

/**
 * 정답 칸의 한 줄. combo 는 이번 세션에서 연달아 맞힌 수(이번 정답 포함),
 * idx 는 세션 안에서 이 문제의 순서(0부터), firstTry 는 한 번에 맞혔는지(기본 true).
 */
export function cheerCorrect(p: { combo: number; idx: number; seed: number; firstTry?: boolean }): string {
  const c = int(p.combo);
  if (c >= 10 && c % 5 === 0) {
    return pick(
      [`${c}연속 정답이에요!`, `${c}문제 연속, 놀라워요`, `${c}연속, 거침이 없네요`, `${c}문제째 막힘이 없어요`],
      p.seed,
      'correct-10',
    );
  }
  if (c === 5) {
    return pick(
      [`${c}연속 정답이에요!`, `${c}문제 연속, 흐름이 좋아요`, `${c}문제째 막힘이 없어요`, `벌써 ${c}연속이에요`],
      p.seed,
      'correct-5',
    );
  }
  if (c === 3) {
    return pick(
      [`${c}연속 정답이에요!`, `벌써 ${c}연속이에요`, `${c}문제 연속 맞혔어요`, `${c}연속, 감이 좋아요`],
      p.seed,
      'correct-3',
    );
  }
  if (int(p.idx) === 0 && p.firstTry !== false) {
    return pick(['첫 문제부터 정답이에요', '시작이 좋아요!', '산뜻한 출발이에요'], p.seed, 'correct-first');
  }
  return pick(
    ['정답이에요!', '맞혔어요, 좋아요', '정확해요', '잘했어요!', '훌륭해요', '바로 그거예요', '제대로 짚었어요'],
    p.seed,
    'correct',
  );
}

/* 2. 오답 피드백 (정답은 따로 보이므로 다시 말하지 않는다) */

export function cheerWrong(p: { seed: number }): string {
  return pick(
    [
      '괜찮아요, 이렇게 익혀 가요',
      '아깝네요, 다음엔 맞힐 거예요',
      '헷갈릴 만했어요',
      '좋은 시도였어요',
      '이번에 새로 알게 됐어요',
      '아쉽지만 괜찮아요',
    ],
    p.seed,
    'wrong',
  );
}

/* 3. 세션 마침 화면 */

export type CheerFinishInput = {
  sect: CheerSect;
  /** 이번 세션이 추가 학습이었는지 */
  extra: boolean;
  /** 이번 세션 문제 수 */
  total: number;
  /** 이번 세션에서 맞힌 수 */
  right: number;
  /** 오늘 이 구역에서 푼 문제 수(이번 세션 포함) */
  solvedToday: number;
  /** 오늘 추가 학습으로 푼 문제 수(이번 세션 포함) */
  extraToday: number;
  /** 지금의 연속 일수 */
  streakDays: number;
  /** 이번 세션으로 연속 기록이 하루 늘었는지 */
  streakUp: boolean;
  /** 이번 세션으로 레벨이 올랐는지 */
  levelUp: boolean;
  seed: number;
};

export function cheerFinish(p: CheerFinishInput): { headline: string } {
  const total = int(p.total);
  const right = Math.min(int(p.right), total);
  const solved = int(p.solvedToday);
  const extraN = int(p.extraToday);
  const streak = int(p.streakDays);

  if (total === 0) {
    return {
      headline: pick(['오늘 분량은 이미 다 마쳤어요', '오늘 몫은 벌써 해냈어요', '오늘은 이미 완주했어요'], p.seed, 'finish-none'),
    };
  }

  const facts: Fact[] = [];

  if (p.streakUp && streak >= 2) {
    const milestone = streak === 7 || streak % 10 === 0 || streak === 3;
    facts.push({
      score: milestone ? 95 : 72,
      lines: [`연속 ${streak}일째예요!`, `${streak}일 연속으로 해냈어요`, `연속 기록이 ${streak}일로 늘었어요`, `${streak}일째 이어 가고 있어요`],
    });
  } else if (p.streakUp && streak === 1) {
    facts.push({ score: 55, lines: ['연속 기록을 새로 시작했어요', `연속 ${streak}일째, 시작이 좋아요`, '새 출발, 좋아요'] });
  }

  if (total >= 3 && right === total) {
    facts.push({
      score: total >= 10 ? 88 : 80,
      lines: [`${total}문제 모두 맞혔어요!`, `${total}문제 전부 정답, 완벽해요`, '하나도 안 틀렸어요!', '만점이에요!'],
    });
  }

  if (solved >= 10) {
    facts.push({
      score: solved >= 30 ? 85 : solved >= 20 ? 75 : 65,
      lines: [
        `오늘 ${solved}문제나 풀었어요!`,
        `오늘 벌써 ${solved}문제를 풀었어요`,
        `오늘 ${solved}문제, 대단한 하루예요`,
        p.sect === 'voc' ? `오늘 단어 ${solved}문제를 풀었어요` : `오늘 개념 ${solved}문제를 풀었어요`,
      ],
    });
  }

  if (p.extra && extraN > 0) {
    facts.push({
      score: 62,
      lines: [
        `추가 학습으로 ${extraN}문제를 풀었어요`,
        `목표보다 ${extraN}문제 더 해냈어요`,
        '추가 학습까지 해내다니 멋져요',
        '오늘은 목표를 넘어섰어요',
      ],
    });
  }

  if (p.levelUp) {
    facts.push({ score: 58, lines: ['레벨이 올랐어요!', '레벨이 한 단계 올랐어요', '한 단계 올라섰어요, 축하해요'] });
  }

  if (total >= 3 && right / total >= 0.8) {
    facts.push({
      score: 45,
      lines: [`${total}문제 중 ${right}문제 맞혔어요`, `${right}문제 정답, 잘하고 있어요`, '거의 다 맞혔어요'],
    });
  }

  const fallback = p.extra
    ? ['추가 학습 완료, 수고했어요', '추가 학습까지 끝냈어요', '오늘도 한발 앞서 갔어요']
    : [
        '오늘 분량 완료, 수고했어요',
        '오늘 몫을 해냈어요',
        '끝까지 풀었어요, 잘했어요',
        p.sect === 'voc' ? '단어가 차곡차곡 쌓여요' : '개념이 하나씩 쌓여요',
      ];
  if (right > 0) fallback.push(`${right}문제 맞혔어요, 수고했어요`);
  facts.push({ score: 10, lines: fallback });

  const top = best(facts)!;
  return { headline: pick(top.lines, p.seed, `finish-${top.score}`) };
}

/* 4. 홈 "오늘" 카드 */

export type CheerHomeInput = {
  /** 오늘 마친 구역 수 */
  doneParts: number;
  /** 오늘 구역 수 */
  totalParts: number;
  /** 오늘 푼 문제 수(모든 구역 합) */
  solvedToday: number;
  /** 오늘 끝까지 읽은 기사 수 */
  readToday: number;
  /** 지금의 연속 일수 */
  streakDays: number;
  /** 오늘 목표를 모두 채웠는지 */
  allDone: boolean;
  /** 한국 시각의 시(0~23) */
  hourKST: number;
  seed: number;
};

/** 할 말이 없으면 null. */
export function cheerHome(p: CheerHomeInput): string | null {
  const done = int(p.doneParts);
  const solved = int(p.solvedToday);
  const read = int(p.readToday);
  const streak = int(p.streakDays);
  const hour = int(p.hourKST) % 24;

  if (p.allDone) {
    const facts: Fact[] = [
      { score: 10, lines: ['오늘 할 일을 다 마쳤어요!', '오늘 완주했어요, 멋져요', '오늘 몫을 다 해냈어요', '완벽한 하루예요'] },
    ];
    if (streak >= 2) {
      facts.push({ score: 70, lines: [`연속 ${streak}일째 완주예요!`, `오늘도 다 해냈어요, ${streak}일째예요`, `${streak}일 연속 완주, 멋져요`] });
    }
    if (solved >= 10) {
      facts.push({ score: solved >= 20 ? 75 : 60, lines: [`오늘 ${solved}문제나 풀고 다 마쳤어요`, `오늘 ${solved}문제, 꽉 찬 하루예요`] });
    }
    const top = best(facts)!;
    return pick(top.lines, p.seed, `home-done-${top.score}`);
  }

  if (done > 0 || solved > 0 || read > 0) {
    const facts: Fact[] = [];
    if (solved >= 10) facts.push({ score: 70, lines: [`오늘 벌써 ${solved}문제 풀었어요!`, `오늘 ${solved}문제나 풀었어요`] });
    if (done > 0 && int(p.totalParts) - done === 1) facts.push({ score: 60, lines: ['거의 다 왔어요!', '완주가 눈앞이에요'] });
    if (done > 0) facts.push({ score: 40, lines: [`${done}개 마쳤어요, 좋은 흐름이에요`, '착착 해 나가고 있어요'] });
    if (read > 0) facts.push({ score: 30, lines: [`기사 ${read}건 읽었어요, 좋아요`, '오늘 기사부터 챙겼어요'] });
    if (solved > 0) facts.push({ score: 20, lines: [`오늘 ${solved}문제 풀었어요`, '좋은 출발이에요'] });
    const top = best(facts);
    return top ? pick(top.lines, p.seed, `home-going-${top.score}`) : null;
  }

  if (hour >= 5 && hour <= 10) {
    const lines = ['좋은 아침이에요', '오늘도 반가워요', '상쾌한 아침이에요'];
    // 오늘은 아직 연속 기록에 들지 않았으므로 지난 날까지의 일수로 말한다.
    if (streak >= 2) lines.push(`${streak}일 연속 함께했어요`);
    return pick(lines, p.seed, 'home-morning');
  }
  if (hour >= 18 && hour <= 23) {
    return pick(['오늘 하루 수고 많았어요', '편안한 저녁이에요', '오늘도 반가워요'], p.seed, 'home-evening');
  }
  return null;
}

/* 5. 기사를 끝까지 읽었을 때 */

export function cheerRead(p: { readToday: number; totalToday: number; seed: number }): string {
  const read = int(p.readToday);
  const total = int(p.totalToday);
  if (total > 0 && read >= total) {
    return pick(
      [`오늘 기사 ${total}건 다 읽었어요`, `기사 ${total}건 완독이에요!`, `${total}건 모두 끝까지 읽었어요`, '오늘 기사를 다 읽었어요, 멋져요'],
      p.seed,
      'read-all',
    );
  }
  if (read === 1) {
    return pick(['오늘 첫 기사를 읽었어요', '끝까지 읽었어요, 좋은 출발이에요', `기사 ${read}건 완독이에요`], p.seed, 'read-first');
  }
  if (read > 1) {
    return pick([`오늘 기사 ${read}건째 읽었어요`, '끝까지 읽었어요, 잘했어요'], p.seed, 'read-some');
  }
  return pick(['끝까지 읽었어요, 잘했어요', '꼼꼼히 읽었어요'], p.seed, 'read');
}

/* 6. 퀴즈를 마쳤을 때 (저녁 퀴즈와 주간 퀴즈가 함께 쓴다. 그래서 "오늘"이라 하지 않는다) */

export function cheerQuiz(p: { right: number; total: number; seed: number }): string {
  const total = int(p.total);
  const right = Math.min(int(p.right), total);
  if (total === 0) return pick(['퀴즈를 마쳤어요', '끝까지 함께했어요'], p.seed, 'quiz-none');
  if (right === total) {
    return pick(
      [`${total}문제 모두 맞혔어요!`, '기사를 꼼꼼히 읽었네요', '만점이에요, 완벽해요', `${total}문제 전부 정답이에요`],
      p.seed,
      'quiz-perfect',
    );
  }
  if (right / total >= 0.6) {
    return pick(
      [`${total}문제 중 ${right}문제 맞혔어요`, `${right}문제 정답, 잘 기억했어요`, '기사를 잘 소화했어요'],
      p.seed,
      'quiz-good',
    );
  }
  if (right > 0) {
    return pick([`${right}문제 맞혔어요, 수고했어요`, '끝까지 풀었어요, 잘했어요', '차근차근 잘 풀었어요'], p.seed, 'quiz-some');
  }
  return pick(['끝까지 풀었어요, 수고했어요', '헷갈리는 문제들이었어요', '괜찮아요, 끝까지 풀었어요'], p.seed, 'quiz-zero');
}

/* 7. 레벨이 올랐을 때 */

export function cheerLevel(p: { level: number; seed: number }): string {
  const n = int(p.level);
  return pick(
    [
      `레벨 ${n}${iGa(n)} 됐어요!`,
      `레벨 ${n} 달성, 축하해요`,
      `레벨 ${n}까지 올라왔어요`,
      `꾸준함이 레벨 ${n}${eulReul(n)} 만들었어요`,
      `레벨 ${n}${euRo(n)} 올라섰어요`,
    ],
    p.seed,
    'level',
  );
}
