import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { PostSummary } from '../../api';
import { useNow } from '../../state/now';
import type { PositionMode } from '../../state/position';
import { colors } from '../ui';
import { PlaceCard } from './PlaceCard';

const viewabilityConfig = { itemVisiblePercentThreshold: 70 };

/** Clock for relative times / heat; ticks once a minute. */
export function useMinuteClock(): number {
  return useNow(60_000);
}

/**
 * Vertical pager, one place per screen. Cards have a fixed layout (no nested ScrollView, D-11), so a swipe always pages.
 * `focused` gates the typewriter so off-screen tabs stay still.
 */
export function FeedList({ posts, focused, mode, onOpen, onSimulate, onBookmark, busyIds, onRefresh }: {
  posts: PostSummary[]; focused: boolean; mode: PositionMode;
  onOpen: (post: PostSummary) => void; onSimulate: (post: PostSummary, metres: number) => void;
  onBookmark: (post: PostSummary) => void; busyIds: readonly string[]; onRefresh: () => Promise<void>;
}) {
  const now = useMinuteClock();
  const [height, setHeight] = useState(0);
  const [visibleId, setVisibleId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: PostSummary }[] }) => {
    setVisibleId(viewableItems[0]?.item.id);
  }, []);
  const pull = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  const activeId = visibleId ?? posts[0]?.id;
  return <View style={s.fill}>
    <View style={s.fill} onLayout={e => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && <FlatList
        key={height}
        data={posts}
        extraData={[activeId, focused, mode, now, busyIds]}
        keyExtractor={post => post.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        refreshing={refreshing}
        onRefresh={pull}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        renderItem={({ item }) => <PlaceCard post={item} height={height} active={focused && activeId === item.id} now={now} mode={mode}
          onOpen={onOpen} onSimulate={onSimulate} onBookmark={onBookmark} bookmarkBusy={busyIds.includes(item.id)} />}
      />}
    </View>
    {posts.length > 1 && <Text style={s.swipeHint}>向上滑，遇见下一个地方</Text>}
  </View>;
}
const s = StyleSheet.create({
  fill: { flex: 1 },
  swipeHint: { color: colors.inactive, textAlign: 'center', fontSize: 11, paddingVertical: 8 },
});
