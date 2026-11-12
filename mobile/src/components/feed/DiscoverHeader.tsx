import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { FeedSort } from '../../domain/ranking';
import type { DiscoverView } from '../../state/nearby';
import { useProfile } from '../../state/profile';
import { Avatar } from '../Avatar';
import { PositionModeChip } from '../common/PositionModeChip';
import { Segmented, type SegmentedOption } from '../common/Segmented';
import { colors } from '../ui';

const VIEW_OPTIONS: readonly SegmentedOption<DiscoverView>[] = [{ value: 'cards', label: '卡片' }, { value: 'map', label: '地图' }];
const SORT_OPTIONS: readonly SegmentedOption<FeedSort>[] = [{ value: 'recommended', label: '推荐' }, { value: 'latest', label: '最新' }];

/** Discover header: own avatar + nickname (-> /me), position source chip, 卡片/地图 and 推荐/最新 switches. */
export function DiscoverHeader({ view, onViewChange, sort, onSortChange }: {
  view: DiscoverView; onViewChange: (v: DiscoverView) => void; sort: FeedSort; onSortChange: (s: FeedSort) => void;
}) {
  const { profile } = useProfile();
  return <View style={s.wrap}>
    <View style={s.top}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开个人中心" onPress={() => router.push('/me')}
        style={({ pressed }) => [s.profile, pressed && s.pressed]}>
        <Avatar uri={profile.avatar} size={34} />
        <Text numberOfLines={1} style={s.name}>{profile.nickname}</Text>
      </Pressable>
      <PositionModeChip />
    </View>
    <View style={s.switches}>
      <View style={s.switch}><Segmented accessibilityLabel="显示方式" options={VIEW_OPTIONS} value={view} onChange={onViewChange} /></View>
      <View style={s.switch}><Segmented accessibilityLabel="排序" options={SORT_OPTIONS} value={sort} onChange={onSortChange} /></View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, gap: 8 },
  top: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, flexShrink: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  pressed: { opacity: 0.65 },
  switches: { flexDirection: 'row', gap: 10 },
  switch: { flex: 1 },
});
