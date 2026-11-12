import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeError, type BlockEntry } from '../../api';
import { DemoBadge } from '../../components/common/DemoBadge';
import { Notice } from '../../components/common/Notice';
import { colors, ui } from '../../components/ui';
import { formatRelative } from '../../domain/time';
import { useBlocks } from '../../state/blocks';
import { useNow } from '../../state/now';

/** 已屏蔽: labels only (e.g. 在「第一张长椅」遇到的人), never user ids; 解除屏蔽 per entry. */
export default function BlockedScreen() {
  const insets = useSafeAreaInsets();
  const { blocks, loading, error: loadError, refresh: load, remove } = useBlocks();
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useNow(60_000);
  const error = actionError || (loadError ? describeError(loadError) : '');

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pullRefresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  function confirmUnblock(entry: BlockEntry) {
    Alert.alert('解除屏蔽？', `解除后会重新看到${entry.label}的留话、接话，对方也可以再向你申请私聊。`, [
      { text: '取消', style: 'cancel' },
      { text: '解除屏蔽', onPress: async () => {
        setBusyId(entry.id); setActionError('');
        try {
          await remove(entry.id);
        } catch (e) {
          setActionError(describeError(e));
        } finally {
          setBusyId(null);
        }
      } },
    ]);
  }

  const empty = blocks === null
    ? (loading || !error ? <View style={s.center}><ActivityIndicator color={colors.accent} /><Text style={ui.muted}>正在读取</Text></View> : undefined)
    : <View style={ui.panel}>
      <Text style={ui.body}>没有屏蔽任何人</Text>
      <Text style={ui.muted}>在留话、接话或私聊的「⋯」里可以举报或屏蔽对方。</Text>
    </View>;

  return <View style={s.screen}>
    <FlatList data={blocks ?? []} keyExtractor={b => b.id} contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
      ListHeaderComponent={<View style={s.header}>
        <Text style={ui.muted}>屏蔽后，你不会再看到对方的留话和回复，对方的私聊申请与消息也不会送达。这里只显示在哪里遇到，不显示对方身份。</Text>
        <DemoBadge label="本机演示数据" />
        <Notice tone="error" message={error} actionLabel={loading ? undefined : '重试'} onAction={() => { setActionError(''); load(); }} />
      </View>}
      ItemSeparatorComponent={Separator} ListEmptyComponent={empty}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={colors.accent} />}
      renderItem={({ item }) => {
        const busy = busyId === item.id;
        const when = formatRelative(item.createdAt, now);
        return <View style={s.row}>
          <View style={s.main}>
            <Text style={s.label}>{item.label}</Text>
            {when ? <Text style={s.time}>屏蔽于 {when}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`解除屏蔽：${item.label}`} accessibilityState={{ disabled: busy }} disabled={busy}
            onPress={() => confirmUnblock(item)} style={({ pressed }) => [s.button, busy && s.disabled, pressed && s.pressed]}>
            <Text style={s.buttonText}>{busy ? '处理中…' : '解除屏蔽'}</Text>
          </Pressable>
        </View>;
      }} />
  </View>;
}

function Separator() {
  return <View style={s.separator} />;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 20, paddingTop: 12, flexGrow: 1 },
  header: { gap: 10, paddingBottom: 16 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  separator: { height: 10 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.surface },
  main: { flex: 1, minWidth: 0, gap: 3 },
  label: { color: colors.text, fontSize: 15, lineHeight: 22 },
  time: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
