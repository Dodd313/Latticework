import React, { useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { BackBar } from '../nav';
import { STANDALONE, useStore } from '../store';
import { FONT_MONO, useTheme } from '../theme';
import { Market } from '../types';
import { Card, Divider, T, Tap } from '../ui';

export const APP_VERSION = '0.1.0';

const MARKETS: { id: Market; label: string }[] = [
  { id: 'kr', label: '한국 중심' },
  { id: 'both', label: '한국 · 미국' },
  { id: 'us', label: '미국 중심' },
];

function Group({ title, children, foot }: { title: string; children: React.ReactNode; foot?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T s={13} w="600" c={t.sub} style={{ paddingHorizontal: 4 }} role="heading" level={2}>
        {title}
      </T>
      {children}
      {foot ? (
        <T s={13} c={t.sub} style={{ paddingHorizontal: 4 }}>
          {foot}
        </T>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52 }}>
      <T s={16}>{label}</T>
      <T s={15} c={t.sub} mono>
        {value}
      </T>
    </View>
  );
}

export function SettingsScreen() {
  const t = useTheme();
  const { user, setMarket, exportData, importData, canSave, status, days } = useStore();
  const [box, setBox] = useState('');
  const [note, setNote] = useState('');

  const doExport = async () => {
    const json = exportData();
    setBox(json);
    try {
      if (Platform.OS === 'web') await (globalThis as any).navigator.clipboard.writeText(json);
      setNote('기록을 복사했습니다. 아래 상자에서도 직접 복사할 수 있습니다.');
    } catch {
      setNote('아래 상자의 내용을 길게 눌러 복사해 주세요.');
    }
  };

  const doImport = () => {
    if (box.trim() === '') {
      setNote('가져올 기록을 아래 상자에 붙여 넣어 주세요.');
      return;
    }
    setNote(importData(box) ? '기록을 가져와 지금 기록과 합쳤습니다.' : '형식이 맞지 않아 가져오지 못했습니다. 내보낸 내용을 그대로 붙여 넣어 주세요.');
  };

  const readCount = Object.keys(user.read).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      <BackBar label="오늘" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 20 }}>
        <T s={28} w="700" style={{ paddingHorizontal: 4 }} role="heading" level={1}>
          설정
        </T>

        {STANDALONE ? null : (
        <Group title="편집 기준 · 시장 비중" foot="다음 발행분부터 적용됩니다.">
          <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: t.field }}>
            {MARKETS.map((m) => {
              const on = user.settings.market === m.id;
              return (
                <Tap key={m.id} onPress={() => setMarket(m.id)} selected={on} label={m.label} style={{ flex: 1, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.card : 'transparent' }}>
                  <T s={14} w={on ? '700' : '500'}>
                    {m.label}
                  </T>
                </Tap>
              );
            })}
          </View>
        </Group>
        )}

        <Group title="알림" foot="발행이 끝나면 Claude 앱으로 알림을 보냅니다.">
          <Card style={{ paddingVertical: 0, borderRadius: 14 }}>
            <Row label="발행 알림" value="평일 오전 7:15 전후" />
            <Divider />
            <Row label="주말" value="휴간" />
          </Card>
        </Group>

        <Group title="열람 기록" foot="기기를 바꿀 때 사용합니다. 내보낸 내용을 붙여 넣고 가져오기를 누르면 기존 기록과 병합됩니다.">
          <Card style={{ paddingVertical: 0, borderRadius: 14 }}>
            <Row label="읽은 기사" value={`${readCount}건`} />
            <Divider />
            <Row label="저장 위치" value={canSave ? '계정에 저장됨' : '이 기기에 저장됨'} />
          </Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tap onPress={() => void doExport()} label="기록 내보내기" style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}>
              <T s={15} w="600" c={t.onInverse}>
                내보내기
              </T>
            </Tap>
            <Tap onPress={doImport} label="기록 가져오기" style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
              <T s={15} w="600">
                가져오기
              </T>
            </Tap>
          </View>
          {note ? (
            <T s={13} c={t.blue} style={{ paddingHorizontal: 4 }}>
              {note}
            </T>
          ) : null}
          <TextInput
            nativeID="records-box"
            accessibilityLabel="기록 내보내기와 가져오기 상자"
            value={box}
            onChangeText={setBox}
            multiline
            placeholder="가져올 기록을 여기에 붙여 넣습니다"
            placeholderTextColor={t.mute}
            style={{ minHeight: 96, maxHeight: 180, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, fontFamily: FONT_MONO, fontSize: 12, lineHeight: 18, color: t.ink, textAlignVertical: 'top' }}
          />
        </Group>

        <Group title="정보">
          <Card style={{ paddingVertical: 0, borderRadius: 14 }}>
            <Row label="버전" value={APP_VERSION} />
            <Divider />
            <Row label="연결 상태" value={status === 'live' ? '연결됨' : status === 'loading' ? '연결 중' : '오프라인'} />
            <Divider />
            <Row label="누적 기사" value={`${days.reduce((n, d) => n + d.articles.length, 0)}건`} />
          </Card>
        </Group>
      </ScrollView>
    </View>
  );
}
