import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PostSummary } from '../../api';
import type { FeedSort } from '../../domain/ranking';
import type { PositionMode } from '../../state/position';
import { DemoBadge } from '../common/DemoBadge';
import { Segmented, type SegmentedOption } from '../common/Segmented';
import { Sheet } from '../common/Sheet';
import { distanceText, metaParts, primaryAction, SIMULATE_ARRIVE_METRES, SIMULATE_NEAR_METRES, tierHint } from '../feed/PlaceCard';
import { Action, colors, moods } from '../ui';

const SORT_OPTIONS: readonly SegmentedOption<FeedSort>[] = [{ value: 'recommended', label: '推荐' }, { value: 'latest', label: '最新' }];

/**
 * Bottom sheet for a map group: a scrollable 推荐/最新 list of every member (real count), or — once one is picked —
 * that post's card with 返回这组 N 条. `posts` arrive already ranked by `sort` (useNearby).
 */
export function GroupSheet({ visible, title, posts, sort, onSortChange, selectedId, onSelect, onOpen, onSimulate, mode, now, onClose }: {
  visible: boolean; title: string; posts: PostSummary[]; sort: FeedSort; onSortChange: (s: FeedSort) => void;
  selectedId: string | null; onSelect: (id: string | null) => void; onOpen: (post: PostSummary) => void;
  onSimulate: (post: PostSummary, metres: number) => void; mode: PositionMode; now: number; onClose: () => void;
}) {
  const selected = selectedId ? posts.find(p => p.id === selectedId) ?? null : null;
  return <Sheet visible={visible} onClose={onClose} title={selected ? selected.name : title}>
    {selected
      ? <PostDetail post={selected} groupSize={posts.length} onBack={() => onSelect(null)} onOpen={onOpen} onSimulate={onSimulate} mode={mode} now={now} />
      : <>
        {posts.length > 1 && <Segmented accessibilityLabel="排序" options={SORT_OPTIONS} value={sort} onChange={onSortChange} />}
        {posts.length === 0 && <Text style={s.muted}>这组留话已经不在附近了。</Text>}
        {posts.map(post => <Row key={post.id} post={post} now={now} onPress={() => onSelect(post.id)} />)}
      </>}
  </Sheet>;
}

function Row({ post, now, onPress }: { post: PostSummary; now: number; onPress: () => void }) {
  const palette = moods[post.mood] ?? moods.sage;
  const meta = metaParts(post, now);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${post.name}，${distanceText(post)}，${meta.join('，')}。${post.displayText}`}
    onPress={onPress} style={({ pressed }) => [s.row, { borderLeftColor: palette.soft }, pressed && s.pressed]}>
    <View style={s.rowTop}>
      <Text numberOfLines={1} style={s.rowName}>{post.name}</Text>
      <Text style={s.small}>{distanceText(post)}</Text>
    </View>
    <Text numberOfLines={2} style={[s.rowText, post.level === 'dot' && s.dim]}>{post.displayText}</Text>
    <View style={s.chips}>
      <Text style={s.small}>{meta.join(' · ')}</Text>
      {post.demo && <DemoBadge />}
    </View>
  </Pressable>;
}

function PostDetail({ post, groupSize, onBack, onOpen, onSimulate, mode, now }: {
  post: PostSummary; groupSize: number; onBack: () => void; onOpen: (post: PostSummary) => void;
  onSimulate: (post: PostSummary, metres: number) => void; mode: PositionMode; now: number;
}) {
  const action = primaryAction(post, mode);
  const hint = tierHint(post);
  const run = () => {
    if (action.kind === 'near') onSimulate(post, SIMULATE_NEAR_METRES);
    else if (action.kind === 'arrive') onSimulate(post, SIMULATE_ARRIVE_METRES);
    else onOpen(post);
  };
  return <View style={s.detail}>
    {groupSize > 1 && <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} style={({ pressed }) => [s.back, pressed && s.pressed]}>
      <Ionicons name="chevron-back" size={16} color={colors.accent} />
      <Text style={s.backText}>返回这组 {groupSize} 条</Text>
    </Pressable>}
    <View style={s.chips}>
      <Text style={s.small}>{[distanceText(post), ...metaParts(post, now)].join(' · ')}</Text>
      {post.demo && <DemoBadge />}
    </View>
    <Text numberOfLines={8} style={[s.detailText, post.level === 'dot' && s.dim]}>{post.displayText}</Text>
    {hint ? <Text style={s.small}>{hint}</Text> : null}
    <Action title={action.label} onPress={run} />
    {action.kind !== 'open' && <Action secondary title="打开留话" onPress={() => onOpen(post)} />}
  </View>;
}
const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  row: { minHeight: 44, gap: 4, paddingVertical: 8, paddingLeft: 12, borderLeftWidth: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, color: colors.subtle, fontSize: 14, fontWeight: '600' },
  rowText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  dim: { color: colors.muted },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  detail: { gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  detailText: { color: colors.text, fontSize: 18, lineHeight: 28, fontWeight: '500' },
});
