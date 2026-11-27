// 학습 기록을 소유자의 구글 시트로 보내고 다시 받는 일(전송과 모양 바꾸기만). 기기 안 보관과 차례는 src/store.tsx 가 맡는다.
//
// 시트 쪽은 ops/sheet-sync.gs (시트에 붙인 Apps Script 웹 앱)다. 주소는 기기와 내보낸 백업에만 둔다(저장소와 study.json 에 두지 않는다).
// 보내기: POST 본문은 text/plain 의 JSON 이다(브라우저가 사전 확인 요청을 보내지 않게). 응답 { ok, added, rows, sets }.
// 받기:   GET ?info=1 은 개수만, ?after=N&limit=M 은 풀이 기록 N 번째부터(after=0 이면 수리 세트와 기기별 마지막 상태도 함께).
// Apps Script 는 응답을 다른 주소(googleusercontent.com)로 넘겨(302) 돌려준다. fetch 가 따라가므로 따로 할 일은 없다.
// 같은 id 는 시트가 한 번만 적는다. 그래서 sendBeacon 과 fetch 로 같은 묶음이 두 번 가도 된다.
import type { Card, LogRow, ReadMark, StudyDay, StudySect } from './study';
import type { NumDay, NumSession } from './numeracy';
import type { UserData } from './types';

/** 기기의 보내기 설정과 상태(localStorage lw.sync.v1). sent 는 이 주소로 보내 시트가 받았다고 답한 줄 수. */
export type SyncConf = {
  url: string;
  device: string;
  seq: number;
  sent: number;
  lastAt?: string;
  snapKey?: string;
  fail: number;
  nextTry: number;
};

/** 시트의 풀이 탭 한 줄(보낼 때와 받을 때 같은 모양). t 는 한국 시각이 붙은 ISO 문자열로 보낸다. */
export type SheetRow = { id: string; t: string; k: StudySect; u: string; q: string; ok: boolean; n: number; sec: number; g: 1 | 2 | 3; r?: 1 };
/** 시트의 수리 탭 한 줄 */
export type SheetSet = NumSession & { id: string };
/** 상태 탭(기기마다 하루 한 줄). 풀이 기록으로 다시 만들 수 없는 것만 담는다. */
export type Snapshot = {
  v: 1;
  date: string;
  at: string;
  device: string;
  /** 개인 기록. 지금은 보내지 않는다(null). */
  user: UserData | null;
  /** cards 는 기억 상태의 사본. 풀이 기록이 빠진 항목(기기 기록이 6,000줄을 넘어 앞이 잘린 경우 등)을 살리는 데만 쓴다. */
  /** marks 는 읽기 표시(이해했어요, 나중에, 빼기). 풀이 기록에 없어 상태 줄로만 옮긴다. */
  study: { start: string; days: Record<string, StudyDay>; xp: number; cards?: Record<string, Card>; marks?: Record<string, ReadMark> };
  num: { start: string; level: Record<string, number>; days: Record<string, NumDay> };
};
export type SheetAll = { rows: SheetRow[]; sets: SheetSet[]; snapshots: Snapshot[] };
export type SheetInfo = { rows: number; sets: number; devices: string[] };

export function emptyConf(): SyncConf {
  return { url: '', device: newDevice(), seq: 0, sent: 0, fail: 0, nextTry: 0 };
}

export function newDevice(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 36).toString(36);
  return 'd' + s;
}

/** 53비트 해시(cyrb53)를 36진수로. 같은 글이면 어느 기기에서나 같은 값이다. */
export function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 풀이 한 줄의 id. 새 줄은 기록할 때 붙인 id, id 가 없던 예전 줄은 시각, 항목, 문제, 종류의 해시. */
export function rowId(r: LogRow): string {
  return r.id || 'h' + hash53(`${r.t}|${r.u}|${r.q}|${r.k}`);
}

/** 수리 한 세트의 id. src/numeracy.ts 의 mergeNum 이 같은 줄로 보는 기준(모든 칸)과 같다. */
export function setId(s: NumSession): string {
  return 'n' + hash53([s.d, s.k, s.lv, s.n, s.ok, s.med, s.best, s.sum].join('|'));
}

/** id 가 없는 줄에 id 를 붙인다. 모두 있으면 받은 배열을 그대로 돌려준다. */
export function withIds(log: LogRow[]): LogRow[] {
  if (log.every((r) => r.id)) return log;
  return log.map((r) => (r.id ? r : { ...r, id: rowId(r) }));
}

/** UTC ISO 를 한국 시각 ISO(+09:00)로. 시트에서 사람이 읽기 쉽고, 되돌리면 같은 순간이다. */
export function toKst(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
}

/** 시트에서 받은 시각(어떤 꼴이든)을 기기의 꼴(UTC ISO)로. 못 읽으면 ''. */
export function toUtc(s: unknown): string {
  const t = Date.parse(String(s ?? ''));
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

export function toSheetRow(r: LogRow): SheetRow {
  const out: SheetRow = { id: rowId(r), t: toKst(r.t), k: r.k, u: r.u, q: r.q, ok: !!r.ok, n: r.n, sec: r.sec, g: r.g };
  if (r.r) out.r = 1;
  return out;
}

/** 시트에서 받은 줄을 풀이 기록 한 줄로. 모양이 틀리면 null. */
export function fromSheetRow(x: any): LogRow | null {
  if (!x || typeof x !== 'object') return null;
  const t = toUtc(x.t);
  const g = Number(x.g);
  if (!t || (x.k !== 'lat' && x.k !== 'voc' && x.k !== 'rs') || !x.u || !x.q || (g !== 1 && g !== 2 && g !== 3)) return null;
  const row: LogRow = { t, u: String(x.u), k: x.k, q: String(x.q), ok: x.ok === true || x.ok === 'TRUE' || x.ok === 1, n: Number(x.n) || 1, sec: Number(x.sec) || 0, g: g as 1 | 2 | 3 };
  if (x.r === 1 || x.r === '1' || x.r === true) row.r = 1;
  row.id = String(x.id || '') || rowId(row);
  return row;
}

export function toSheetSet(s: NumSession): SheetSet {
  return { ...s, id: setId(s) };
}

/** 주소 꼴만 본다. 실제로 되는지는 연결 시험으로 안다. */
export function validUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+\/\S*$/.test(url.trim());
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  const AC = (globalThis as any).AbortController;
  const ctl = AC ? new AC() : null;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    return await run(ctl?.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** 보낸다. 시트가 { ok: true } 로 답해야 성공이다(그 밖에는 throw). */
export async function sheetPost(url: string, body: unknown, ms = 30000): Promise<{ ok: true; added: number; rows?: number; sets?: number }> {
  return withTimeout(ms, async (signal) => {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal, credentials: 'omit' } as any);
    if (!res.ok) throw new Error('http ' + res.status);
    const j = await res.json();
    if (!j || j.ok !== true) throw new Error(String(j?.error ?? 'not ok'));
    return j;
  });
}

/** 화면을 떠날 때 마지막으로 한 번 던진다. 응답은 받을 수 없으므로 보냈다고 적지 않는다(다음 fetch 가 다시 보내고 시트가 거른다). */
export function sheetBeacon(url: string, body: unknown): boolean {
  try {
    const nav = (globalThis as any).navigator;
    const B = (globalThis as any).Blob;
    if (!nav?.sendBeacon || !B) return false;
    return !!nav.sendBeacon(url, new B([JSON.stringify(body)], { type: 'text/plain;charset=utf-8' }));
  } catch {
    return false;
  }
}

export async function sheetGet(url: string, params: Record<string, string | number>, ms = 30000): Promise<any> {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return withTimeout(ms, async (signal) => {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + q, { method: 'GET', redirect: 'follow', signal, credentials: 'omit' } as any);
    if (!res.ok) throw new Error('http ' + res.status);
    const j = await res.json();
    if (!j || j.ok !== true) throw new Error(String(j?.error ?? 'not ok'));
    return j;
  });
}

export async function sheetInfo(url: string): Promise<SheetInfo> {
  const j = await sheetGet(url, { info: 1 });
  return { rows: Number(j.rows) || 0, sets: Number(j.sets) || 0, devices: Array.isArray(j.devices) ? j.devices.map(String) : [] };
}

/** 시트의 기록을 모두 받는다(풀이 기록은 2,000줄씩 나눠 받는다). */
export async function sheetAll(url: string): Promise<SheetAll> {
  const rows: SheetRow[] = [];
  let sets: SheetSet[] = [];
  let snapshots: Snapshot[] = [];
  let after = 0;
  for (let page = 0; page < 500; page++) {
    const j = await sheetGet(url, { after, limit: 2000 }, 60000);
    if (Array.isArray(j.rows)) rows.push(...j.rows);
    if (page === 0) {
      sets = Array.isArray(j.sets) ? j.sets : [];
      snapshots = Array.isArray(j.snapshots) ? j.snapshots.filter((s: any) => s && typeof s === 'object' && (s.user || s.study || s.num)) : [];
    }
    if (j.next == null || !(Number(j.next) > after)) break;
    after = Number(j.next);
  }
  return { rows, sets, snapshots };
}

/** 다음 시도까지 기다릴 시간: 1분, 2분, 4분 ... 60분까지. */
export function backoff(fail: number): number {
  return Math.min(60, 2 ** Math.max(0, fail - 1)) * 60 * 1000;
}
