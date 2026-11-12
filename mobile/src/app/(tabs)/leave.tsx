import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AlignedTextInput, KeyboardAlignedScrollView } from '../../components/KeyboardAlignedScrollView';
import RealPlaceMap from '../../components/RealPlaceMap';
import { router, usePathname } from 'expo-router';
import { describePosition, readPosition, readPositionIfAllowed, type PositionDescription } from '../../location/device';
import { usableFix, type Fix } from '../../location/geo';
import { usePlaces } from '../../state/places';
import { Action, colors, Loading, Screen, ui } from '../../components/ui';

export default function LeaveScreen() {
  const store = usePlaces();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [text, setText] = useState('');
  const [naming, setNaming] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<{ fix: Fix; description: PositionDescription | null }>();
  const description = resolvedAddress?.fix === fix ? resolvedAddress.description : null;
  const [locating, setLocating] = useState(false);
  const isHere = usePathname() === '/leave';

  useEffect(() => {
    if (!isHere) return;
    let active = true;
    readPositionIfAllowed()
      .then(value => { if (active && value) setFix(current => current && current.timestamp > value.timestamp ? current : value); })
      .catch(() => {});
    return () => { active = false; };
  }, [isHere]);

  useEffect(() => {
    if (!fix) return;
    let active = true;
    describePosition(fix).then(description => { if (active) setResolvedAddress({ fix, description }); });
    return () => { active = false; };
  }, [fix]);

  async function locate() {
    setLocating(true);
    setNotice('');
    try {
      setFix(await readPosition());
    } catch (error) {
      setFix(null);
      setNotice(error instanceof Error ? error.message : '无法获取位置，请重试。');
    } finally {
      setLocating(false);
    }
  }

  async function publish() {
    setBusy(true);
    setNotice('');
    try {
      const fix = await readPosition();
      setFix(fix);
      if (!usableFix(fix)) {
        setNotice('定位还不够准。可以走到开阔处，再试一次。');
        return;
      }
      const id = store.create(name, location, text, { latitude: fix.latitude, longitude: fix.longitude });
      setName(''); setLocation(''); setText(''); setDetailsOpen(false); setNaming(false);
      router.push({ pathname: '/place/[id]', params: { id } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法获取位置，请重试。');
    } finally {
      setBusy(false);
    }
  }
  if (!store.ready) return <Loading />;
  return <Screen><KeyboardAlignedScrollView contentContainerStyle={ui.content}>
      <Text style={ui.title}>想在这里留句话？</Text>
      <View style={styles.position}>
        <View style={styles.positionRow}>
          <Ionicons name="location-outline" size={20} color={colors.accent} />
          <View style={styles.positionText}>
            <Text style={styles.positionTitle}>当前位置</Text>
            <Text style={ui.muted}>
              {locating ? '正在定位…' : fix ? name.trim() || description?.area || description?.address || '已定位' : '等待获取位置'}
            </Text>
            {fix && !name.trim() && description?.landmark ? <Text style={ui.muted}>附近地标 · {description.landmark}</Text> : null}
            {fix?.accuracy != null && <Text style={ui.muted}>精度约 {Math.round(fix.accuracy)} 米</Text>}
          </View>
          <Pressable accessibilityRole="button" disabled={locating || busy} onPress={locate} style={styles.locate}>
            <Text style={styles.locateText}>{fix ? '刷新' : '获取位置'}</Text>
          </Pressable>
        </View>
        {fix && <RealPlaceMap point={fix} fix={fix} currentOnly />}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: naming }} onPress={() => setNaming(open => !open)} style={styles.locate}>
          <Text style={styles.locateText}>{naming ? '完成' : name.trim() ? '修改地点名' : '补充或纠正地点名'}</Text>
        </Pressable>
        {naming && <AlignedTextInput value={name} onChangeText={setName} maxLength={40} placeholder="输入小区、建筑或店铺名称" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="实际地点名（选填）" />}
      </View>
      <View>
        <AlignedTextInput value={text} onChangeText={setText} multiline maxLength={300} placeholder="一个吐槽、提醒，或者一句玩笑……" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 150 }]} textAlignVertical="top" accessibilityLabel="留话内容" />
        <Text style={[ui.muted, { textAlign: 'right', marginTop: 8 }]}>{text.length} / 300</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(open => !open)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={ui.muted}>{detailsOpen ? '收起地点线索' : '＋ 补充地点线索（选填）'}</Text>
      </Pressable>
      {detailsOpen && <>
        <View><Text style={ui.label}>现场怎么找</Text><AlignedTextInput value={location} onChangeText={setLocation} maxLength={80} placeholder="例如：进西门右转，梧桐树下" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="现场线索（选填）" /></View>
      </>}
      <Action title={busy ? '正在获取现场位置…' : '定位并留在这里'} disabled={busy || locating || !text.trim()} onPress={publish} />
      {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}
      <Text style={ui.muted}>地点坐标和留话保存在这台设备上。</Text>
    </KeyboardAlignedScrollView></Screen>;
}

const styles = StyleSheet.create({
  position: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 10 },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionText: { flex: 1 },
  positionTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  locate: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  locateText: { color: colors.accent, fontSize: 13 },
});
