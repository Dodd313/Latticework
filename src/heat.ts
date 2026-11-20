/**
 * 연속 학습의 불꽃색.
 * 그날 할당량을 마쳤는지는 칠했는지로만 나눈다. 칠한 날은 할당량을 넘겨 더 푼 문제 수만큼
 * 노랑에서 주황, 빨강으로 짙어진다. 0문제는 노랑, 30문제 이상은 빨강.
 * 색은 Toss 디자인 시스템 팔레트(yellow500, orange500, orange800, red600) 사이를 잇는다.
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 195, 66]],
  [0.33, [254, 152, 0]],
  [0.66, [237, 103, 0]],
  [1, [228, 41, 57]],
];

export const HEAT_FULL = 30;

function mix(extra: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, extra / HEAT_FULL));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** 그날 칠할 색 */
export function heatColor(extra: number): string {
  return hex(mix(extra));
}

/** 칠한 칸 위 글자색. 밝은 노랑 위에서는 흰 글자가 안 보여 어두운 글자를 쓴다. */
export function heatInk(extra: number): string {
  return Math.min(1, extra / HEAT_FULL) < 0.22 ? 'rgba(0,12,30,0.82)' : '#FFFFFF';
}

/** 오늘 아직 마치지 못했을 때의 테두리 */
export const HEAT_RING = '#FE9800';
