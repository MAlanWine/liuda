import { StyleSheet, Text, View } from 'react-native';
import type { PositionEvidence, PostSummary } from '../../api';
import type { FeedSort } from '../../domain/ranking';
import type { PositionMode } from '../../state/position';
import { ui } from '../ui';

export type DiscoverMapProps = {
  posts: PostSummary[]; fix: PositionEvidence | null; mode: PositionMode;
  sort: FeedSort; onSortChange: (s: FeedSort) => void;
  onOpen: (post: PostSummary) => void; onSimulate: (post: PostSummary, metres: number) => void;
};

/** Web fallback; the iPhone build uses `DiscoverMap.native.tsx` (Apple Maps). */
export default function DiscoverMap({ posts }: DiscoverMapProps) {
  return <View style={s.box}>
    <Text style={ui.muted}>地图视图需要在 iPhone 上查看。附近有 {posts.length} 条留话，可切回卡片浏览。</Text>
  </View>;
}
const s = StyleSheet.create({ box: { flex: 1, padding: 24, justifyContent: 'center' } });
