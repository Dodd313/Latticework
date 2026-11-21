/**
 * @OnlyCurrentDoc
 * 위 표시는 이 스크립트가 붙은 스프레드시트 하나만 열고 고치도록 권한을 좁힌다(다른 파일에는 손대지 못한다).
 */

/**
 * Latticework 학습 기록을 이 스프레드시트에 받는 스크립트.
 *
 * 붙이는 곳: 스프레드시트 "Latticework 기록"의 [확장 프로그램 > Apps Script].
 * 배포: [배포 > 새 배포 > 웹 앱], 실행 사용자 "나", 액세스 권한 "모든 사용자". 받은 주소를 앱 설정에 붙여 넣는다.
 * 코드를 고친 뒤에는 [배포 > 배포 관리 > 수정 > 버전: 새 버전]으로 같은 주소에 다시 배포한다.
 *
 * 앱과의 약속(src/sync.ts):
 *   doPost  본문은 JSON 글자(text/plain). { device, rows: [...], sets: [...], snapshot?: {...} }
 *           시트에 이미 있는 id 는 다시 적지 않는다. 답: { ok, added, rows, sets }
 *   doGet   ?info=1 (또는 아무것도 없이)  개수만: { ok, rows, sets, devices }
 *           ?after=N&limit=M               풀이 줄 N 번째부터 M 줄: { ok, total, next, rows }
 *                                          after=0 이면 수리 세트 전체(sets)와 기기별 마지막 상태(snapshots)도 함께
 *           ?all=1                         풀이 줄 전체를 한 번에
 * 바깥 라이브러리는 쓰지 않는다.
 */

// 탭 이름과 머리 줄. text 는 글자로 둘 열(1부터). 시트가 날짜나 숫자로 바꾸지 않게 한다.
var TAB_ROWS = { name: '풀이', head: ['시각', '종류', '항목', '문제', '정답 여부', '시도', '초', '채점', '다시 나온 문제', 'id'], text: [1, 3, 4, 10] };
var TAB_SETS = { name: '수리', head: ['날짜', '분야', '수준', '문제 수', '정답 수', '중간 초', '최고 초', '합계 초', 'id'], text: [1, 2, 9] };
var TAB_SNAP = { name: '상태', head: ['날짜', '기기', '시각', '내용'] }; // 상태 줄은 모든 칸을 글자로 둔다

var KIND = { lat: 'Latticework', voc: '영단어' }; // 앱의 종류 열쇠와 시트에 적는 이름
var CHUNK = 45000; // 칸 하나에 5만 자까지 들어간다. 상태 JSON 이 길면 오른쪽 칸으로 나눠 적는다
var PAGE = 2000; // doGet 한 번에 돌려주는 풀이 줄 수

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'json' });
  }
  // 같은 때에 두 번 들어와도(sendBeacon 과 fetch) 차례로 처리해 같은 id 를 두 번 적지 않는다.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return reply({ ok: false, error: 'busy' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var added = 0;
    added += appendNew(ss, TAB_ROWS, body.rows, rowCells);
    added += appendNew(ss, TAB_SETS, body.sets, setCells);
    if (body.snapshot && body.device) saveSnapshot(ss, String(body.device), body.snapshot);
    return reply({ ok: true, added: added, rows: dataRows(ss, TAB_ROWS), sets: dataRows(ss, TAB_SETS) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (p.after == null && !p.all) {
    return reply({ ok: true, rows: dataRows(ss, TAB_ROWS), sets: dataRows(ss, TAB_SETS), devices: devices(ss) });
  }
  var total = dataRows(ss, TAB_ROWS);
  var after = Math.max(0, parseInt(p.after || '0', 10) || 0);
  var limit = p.all ? total : Math.min(5000, Math.max(1, parseInt(p.limit || PAGE, 10) || PAGE));
  var rows = readRange(ss, TAB_ROWS, after, limit).map(rowObject);
  var out = { ok: true, total: total, next: after + rows.length < total ? after + rows.length : null, rows: rows };
  if (after === 0) {
    out.sets = readRange(ss, TAB_SETS, 0, dataRows(ss, TAB_SETS)).map(setObject);
    out.snapshots = latestSnapshots(ss);
  }
  return reply(out);
}

// ── 쓰기 ──────────────────────────────────────────────

// items 가운데 시트에 없는 id 만 맨 아래에 한 번에 붙인다. id 열은 호출마다 한 번만 읽는다(2만 줄도 1초 안팎).
function appendNew(ss, tab, items, toCells) {
  if (!items || !items.length) return 0;
  var sheet = tabOf(ss, tab);
  var last = sheet.getLastRow();
  var width = tab.head.length;
  var seen = {};
  if (last > 1) {
    var ids = sheet.getRange(2, width, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) seen[String(ids[i][0])] = true;
  }
  var fresh = [];
  for (var j = 0; j < items.length; j++) {
    var id = String((items[j] && items[j].id) || '');
    if (!id || seen[id]) continue;
    seen[id] = true;
    fresh.push(toCells(items[j]));
  }
  if (!fresh.length) return 0;
  ensureRows(sheet, last + fresh.length);
  textFormat(sheet, tab, last + 1, fresh.length);
  sheet.getRange(last + 1, 1, fresh.length, width).setValues(fresh);
  return fresh.length;
}

function rowCells(r) {
  return [str(r.t), KIND[r.k] || str(r.k), str(r.u), str(r.q), r.ok === true, num(r.n), num(r.sec), num(r.g), r.r ? 1 : '', str(r.id)];
}

function setCells(s) {
  return [str(s.d), str(s.k), num(s.lv), num(s.n), num(s.ok), blank(s.med), blank(s.best), num(s.sum), str(s.id)];
}

// 상태는 기기마다 하루 한 줄. 같은 날 같은 기기의 줄이 있으면 고쳐 쓴다.
function saveSnapshot(ss, device, snap) {
  var sheet = tabOf(ss, TAB_SNAP);
  var date = str(snap.date) || today();
  var json = JSON.stringify(snap);
  var cells = [date, device, str(snap.at) || new Date().toISOString()];
  // 칸이 =, +, -, @ 로 시작하면 시트가 수식으로 읽을 수 있어 자르는 자리를 한 글자씩 앞당긴다.
  for (var i = 0; i < json.length; ) {
    var end = Math.min(json.length, i + CHUNK);
    while (end < json.length && end > i + 1 && '=+-@'.indexOf(json.charAt(end)) >= 0) end--;
    cells.push(json.slice(i, end));
    i = end;
  }
  var last = sheet.getLastRow();
  var row = last + 1;
  if (last > 1) {
    var keys = sheet.getRange(2, 1, last - 1, 2).getValues();
    for (var k = 0; k < keys.length; k++) {
      if (str(keys[k][0]) === date && str(keys[k][1]) === device) {
        row = k + 2;
        break;
      }
    }
  }
  if (row <= last) {
    var width = sheet.getLastColumn();
    if (width > 0) sheet.getRange(row, 1, 1, width).clearContent();
  } else {
    ensureRows(sheet, row);
  }
  if (cells.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), cells.length - sheet.getMaxColumns());
  sheet.getRange(row, 1, 1, cells.length).setNumberFormat('@').setValues([cells]);
}

// ── 읽기 ──────────────────────────────────────────────

function readRange(ss, tab, after, limit) {
  var sheet = ss.getSheetByName(tab.name);
  if (!sheet) return [];
  var total = Math.max(0, sheet.getLastRow() - 1);
  var n = Math.min(limit, total - after);
  if (n <= 0) return [];
  return sheet.getRange(2 + after, 1, n, tab.head.length).getValues();
}

function rowObject(c) {
  var k = c[1] === KIND.lat ? 'lat' : c[1] === KIND.voc ? 'voc' : str(c[1]);
  var o = { id: str(c[9]), t: str(c[0]), k: k, u: str(c[2]), q: str(c[3]), ok: c[4] === true || c[4] === 'TRUE', n: Number(c[5]) || 0, sec: Number(c[6]) || 0, g: Number(c[7]) || 0 };
  if (c[8] === 1 || c[8] === '1') o.r = 1;
  return o;
}

function setObject(c) {
  return { id: str(c[8]), d: str(c[0]), k: str(c[1]), lv: Number(c[2]) || 1, n: Number(c[3]) || 0, ok: Number(c[4]) || 0, med: c[5] === '' ? null : Number(c[5]), best: c[6] === '' ? null : Number(c[6]), sum: Number(c[7]) || 0 };
}

// 기기마다 가장 늦은 날의 상태 한 줄(나눠 적은 칸을 다시 이어 붙인다).
// 날짜, 기기, 시각 세 열만 먼저 읽어 줄을 고른 뒤 그 줄의 내용만 읽는다(상태 줄이 쌓여도 가볍게).
function latestSnapshots(ss) {
  var sheet = ss.getSheetByName(TAB_SNAP.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  var best = {};
  for (var i = 0; i < keys.length; i++) {
    var dev = str(keys[i][1]);
    var key = str(keys[i][0]) + ' ' + str(keys[i][2]);
    if (dev && (!best[dev] || key > best[dev].key)) best[dev] = { key: key, row: i + 2 };
  }
  var width = Math.max(4, sheet.getLastColumn());
  var out = [];
  for (var d in best) {
    try {
      out.push(JSON.parse(sheet.getRange(best[d].row, 4, 1, width - 3).getValues()[0].join('')));
    } catch (err) {
      // 깨진 줄은 건너뛴다.
    }
  }
  return out;
}

function devices(ss) {
  var sheet = ss.getSheetByName(TAB_SNAP.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var v = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  var seen = {};
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var d = str(v[i][0]);
    if (d && !seen[d]) {
      seen[d] = true;
      out.push(d);
    }
  }
  return out;
}

// ── 도우미 ────────────────────────────────────────────

// 탭이 없으면 만들고 머리 줄을 적는다.
function tabOf(ss, tab) {
  var sheet = ss.getSheetByName(tab.name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(tab.name);
  sheet.getRange(1, 1, 1, tab.head.length).setValues([tab.head]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function dataRows(ss, tab) {
  var sheet = ss.getSheetByName(tab.name);
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function ensureRows(sheet, need) {
  var max = sheet.getMaxRows();
  if (need > max) sheet.insertRowsAfter(max, need - max + 100);
}

function textFormat(sheet, tab, row, n) {
  for (var i = 0; i < tab.text.length; i++) sheet.getRange(row, tab.text[i], n, 1).setNumberFormat('@');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function str(x) {
  if (x == null) return '';
  if (Object.prototype.toString.call(x) === '[object Date]') return x.toISOString();
  return String(x);
}

function num(x) {
  var n = Number(x);
  return isFinite(n) ? n : 0;
}

function blank(x) {
  return x == null || x === '' || !isFinite(Number(x)) ? '' : Number(x);
}

function today() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}
