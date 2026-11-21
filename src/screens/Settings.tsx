import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, TextInput, View } from 'react-native';
import { MView, motionOff, NATIVE_DRIVER, WEB, webShake } from '../motion';
import { BackBar } from '../nav';
import { STANDALONE, useStore } from '../store';
import type { SheetInfo } from '../sync';
import { FONT_SANS, useTheme } from '../theme';
import { Market } from '../types';
import { Box, Divider, Icon, PrimaryButton, T, Tap } from '../ui';

export const APP_VERSION = '0.1.0';

const MARKETS: { id: Market; label: string }[] = [
  { id: 'kr', label: '한국' },
  { id: 'both', label: '한국 · 미국' },
  { id: 'us', label: '미국' },
];

/** 카드 안 한 줄: 왼쪽 이름, 오른쪽 값. */
function Row({ label, value, dot }: { label: string; value: string; dot?: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52 }}>
      <T s={16} w="500" c={t.body}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
        <T s={16} w="500" c={t.mute} mono lines={1}>
          {value}
        </T>
      </View>
    </View>
  );
}

/** 시장 비중 고르기: 회색 홈 안에서 고른 칸만 흰 바탕으로 떠오른다. */
function Segment({ value, onChange }: { value: Market; onChange: (m: Market) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: t.hair }}>
      {MARKETS.map((m) => {
        const on = value === m.id;
        return (
          <Tap
            key={m.id}
            onPress={() => onChange(m.id)}
            selected={on}
            label={m.label}
            press="dim"
            style={[
              { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.card : 'transparent' },
              on ? (Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any) : { elevation: 1 }) : null,
            ]}
          >
            <T s={15} w={on ? '700' : '500'} c={on ? t.ink : t.sub}>
              {m.label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

type Result = '' | 'copied' | 'imported' | 'bad';

/** 한국 시각으로 "11월 21일 12:04" */
function whenKST(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 9 * 3600 * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

const count = (n: number) => `${n.toLocaleString('ko-KR')}건`;

/**
 * 구글 시트로 보내는 학습 기록. 웹 앱 주소는 이 기기와 내보낸 백업에만 둔다.
 * 기기에 기록이 하나도 없고 주소가 있으면 시트에 있는 기록 수를 보이고 불러오기를 권한다(가려 덮지 않는 카드).
 */
function SheetBox() {
  const t = useTheme();
  const { sync, setSyncUrl, testSync, probeSheet, restoreFromSheet, study, num, user } = useStore();
  const [url, setUrl] = useState(sync.url);
  const [badUrl, setBadUrl] = useState(false);
  const [test, setTest] = useState<'' | 'busy' | 'ok' | 'bad'>('');
  const [info, setInfo] = useState<SheetInfo | null>(null);
  const [restore, setRestore] = useState<'' | 'busy' | 'done' | 'bad'>('');
  const [restored, setRestored] = useState(0);
  const [offer, setOffer] = useState<SheetInfo | null>(null);
  const empty = Object.keys(study.cards).length === 0 && num.sessions.length === 0 && Object.keys(user.read).length === 0;

  useEffect(() => {
    setOffer(null);
    if (!sync.url || !empty) return;
    let alive = true;
    void probeSheet().then((i) => {
      if (alive && i && i.rows + i.sets > 0) setOffer(i);
    });
    return () => {
      alive = false;
    };
  }, [sync.url, empty]);

  const commit = (): boolean => {
    const ok = setSyncUrl(url);
    setBadUrl(!ok);
    return ok;
  };
  const doTest = async () => {
    if (!commit() || !url.trim()) return;
    setTest('busy');
    const i = await testSync();
    setInfo(i);
    setTest(i ? 'ok' : 'bad');
  };
  const doRestore = async () => {
    if (!commit() || !url.trim()) return;
    setRestore('busy');
    const r = await restoreFromSheet();
    setRestored(r ? r.rows + r.sets : 0);
    setRestore(r ? 'done' : 'bad');
    if (r) setOffer(null);
  };

  return (
    <Box title="시트 기록" style={{ paddingBottom: 20 }}>
      {offer ? (
        <View style={{ backgroundColor: t.blueWeak, borderRadius: 14, padding: 14, marginTop: 6, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <T s={15} w="600" c={t.ink} style={{ flex: 1 }}>
            {`시트에 기록 ${count(offer.rows + offer.sets)}이 있습니다`}
          </T>
          <PrimaryButton label={restore === 'busy' ? '불러오는 중' : '불러오기'} a11yLabel="시트 기록 불러오기" disabled={restore === 'busy'} onPress={() => void doRestore()} style={{ minHeight: 44, paddingHorizontal: 16, alignSelf: 'auto' }} />
        </View>
      ) : null}
      <TextInput
        nativeID="sheet-url"
        accessibilityLabel="시트 웹 앱 주소"
        value={url}
        placeholder="웹 앱 주소 붙여 넣기"
        placeholderTextColor={t.faint}
        onChangeText={(v) => {
          setUrl(v);
          if (badUrl) setBadUrl(false);
        }}
        onSubmitEditing={() => void commit()}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={{
          height: 48,
          marginTop: 6,
          backgroundColor: t.layer,
          borderWidth: 1,
          borderColor: badUrl ? t.red : t.hair,
          borderRadius: 12,
          paddingHorizontal: 14,
          fontFamily: FONT_SANS,
          fontSize: 14,
          color: t.ink,
        }}
      />
      <View style={{ marginTop: 6 }}>
        {sync.url ? (
          <>
            <Row label="보낸 기록" value={count(sync.sent)} />
            <Divider />
            <Row label="마지막으로 보낸 때" value={sync.lastAt ? whenKST(sync.lastAt) : '없음'} />
            {sync.pending > 0 ? (
              <>
                <Divider />
                <Row label="보낼 기록" value={count(sync.pending)} dot={sync.failing ? t.orange : undefined} />
              </>
            ) : null}
          </>
        ) : (
          <Row label="시트" value="연결 안 됨" dot={t.p.grey400} />
        )}
        {test === 'ok' || test === 'bad' ? (
          <>
            <Divider />
            <Row label="연결 시험" value={test === 'ok' && info ? '성공' : '실패'} dot={test === 'ok' ? t.green : t.red} />
          </>
        ) : null}
        {restore === 'done' || restore === 'bad' ? (
          <>
            <Divider />
            <Row label="불러온 기록" value={restore === 'done' ? count(restored) : '실패'} dot={restore === 'done' ? t.green : t.red} />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={test === 'busy' ? '시험 중' : '연결 시험'} a11yLabel="연결 시험" disabled={!url.trim() || test === 'busy'} onPress={() => void doTest()} style={{ paddingHorizontal: 12 }} />
        </View>
        <View style={{ flex: 1.45 }}>
          <PrimaryButton label={restore === 'busy' ? '불러오는 중' : '시트에서 불러오기'} a11yLabel="시트에서 불러오기" weak disabled={!url.trim() || restore === 'busy'} onPress={() => void doRestore()} style={{ paddingHorizontal: 12 }} />
        </View>
      </View>
    </Box>
  );
}

const SHAKE: [number[], number[]] = [
  [0, 0.2, 0.4, 0.6, 0.8, 1],
  [0, -6, 6, -4, 4, 0],
];

export function SettingsScreen() {
  const t = useTheme();
  const { user, setMarket, exportData, importData, canSave, status, days } = useStore();
  const [box, setBox] = useState('');
  const [result, setResult] = useState<Result>('');
  const shake = useRef(new Animated.Value(0)).current;
  const shakeBox = useRef<any>(null);

  // 결과 표시는 잠시 머물렀다 사라진다.
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setResult(''), 2200);
    return () => clearTimeout(id);
  }, [result]);

  const say = (msg: string) => {
    try {
      AccessibilityInfo.announceForAccessibility(msg);
    } catch {
      // 알릴 수 없으면 넘어간다.
    }
  };

  const doExport = async () => {
    const json = exportData();
    setBox(json);
    try {
      if (Platform.OS === 'web') await (globalThis as any).navigator.clipboard.writeText(json);
      setResult('copied');
      say('복사됨');
    } catch {
      setResult('');
    }
  };

  const doImport = () => {
    if (box.trim() === '') return;
    if (importData(box)) {
      setResult('imported');
      say('가져옴');
      return;
    }
    setResult('bad');
    say('형식 오류');
    if (!motionOff()) {
      if (WEB) {
        webShake(shakeBox, SHAKE[0], SHAKE[1], 300, Easing.out(Easing.quad));
        return;
      }
      shake.setValue(0);
      Animated.timing(shake, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
    }
  };

  const readCount = Object.keys(user.read).length;
  const total = days.reduce((n, d) => n + d.articles.length, 0);
  const conn = status === 'live' ? ['연결됨', t.green] : status === 'loading' ? ['연결 중', t.orange] : ['오프라인', t.p.grey400];
  const shift = shake.interpolate({ inputRange: SHAKE[0], outputRange: SHAKE[1] });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar label="홈" bg={t.bg} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20 }}>
          <T s={26} w="700" lh={1.35} role="heading" level={1}>
            설정
          </T>
        </View>

        <View style={{ paddingHorizontal: 12, gap: 12 }}>
          {STANDALONE ? null : (
            <Box title="시장 비중">
              <View style={{ marginTop: 6 }}>
                <Segment value={user.settings.market} onChange={setMarket} />
              </View>
            </Box>
          )}

          <Box title="기록" style={{ paddingBottom: 20 }}>
            <Row label="읽은 기사" value={`${readCount}건`} />
            <Divider />
            <Row label="저장 위치" value={canSave ? '계정' : '이 기기'} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="내보내기" a11yLabel="기록 내보내기" icon={result === 'copied' ? 'check' : undefined} onPress={() => void doExport()} style={{ paddingHorizontal: 12 }} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="가져오기" a11yLabel="기록 가져오기" weak icon={result === 'imported' ? 'check' : undefined} disabled={box.trim() === ''} onPress={doImport} style={{ paddingHorizontal: 12 }} />
              </View>
            </View>
            <MView ref={shakeBox} style={{ marginTop: 12, transform: [{ translateX: WEB ? 0 : shift }] }}>
              <TextInput
                nativeID="records-box"
                accessibilityLabel="기록 내보내기와 가져오기 상자"
                value={box}
                placeholder="기록 붙여 넣기"
                placeholderTextColor={t.faint}
                onChangeText={(v) => {
                  setBox(v);
                  if (result === 'bad') setResult('');
                }}
                multiline
                style={{
                  minHeight: 96,
                  maxHeight: 180,
                  backgroundColor: t.layer,
                  borderWidth: 1,
                  borderColor: result === 'bad' ? t.red : t.hair,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontFamily: FONT_SANS,
                  fontSize: 13,
                  lineHeight: 19.5,
                  color: t.ink,
                  textAlignVertical: 'top',
                }}
              />
              {result === 'bad' ? (
                <View aria-hidden style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: t.red, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={12} color={t.onColor} />
                </View>
              ) : null}
            </MView>
          </Box>

          {STANDALONE ? <SheetBox /> : null}

          <Box title="정보" style={{ paddingBottom: 8 }}>
            <Row label="버전" value={APP_VERSION} />
            <Divider />
            <Row label="연결 상태" value={conn[0]} dot={conn[1]} />
            <Divider />
            <Row label="누적 기사" value={`${total}건`} />
          </Box>
        </View>
      </ScrollView>
    </View>
  );
}
