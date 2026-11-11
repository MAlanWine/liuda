import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { Place, usePlaces } from '../../state/places';
import { useProfile } from '../../state/profile';
import { Avatar } from '../../components/Avatar';
import { colors, Loading, moods, Screen } from '../../components/ui';

const placeArt = new Map<string, ImageSourcePropType>([
  ['bench', require('../../../assets/place-art/bench.jpg')],
  ['stairs', require('../../../assets/place-art/stairs.jpg')],
  ['corner', require('../../../assets/place-art/corner.jpg')],
]);

const viewabilityConfig = { itemVisiblePercentThreshold: 70 };

function PlaceCard({ place, height, active }: { place: Place; height: number; active: boolean }) {
  const store = usePlaces();
  const palette = moods[place.mood];
  const illustration = placeArt.get(place.id);
  const hasIllustration = illustration !== undefined;
  const artHeight = Math.min(200, Math.round(height * 0.29));
  const onsite = store.arrived.includes(place.id);
  const unlocked = onsite || place.participated;
  const [closer, setCloser] = useState(false);
  const distance = closer ? Math.min(15, place.distance) : place.distance;
  const nearby = distance <= 25;
  const available = Array.from(unlocked ? place.text : place.teaser.replace(/[.…]+$/, ''))
    .slice(0, unlocked ? undefined : nearby ? 22 : 9);
  const [revealed, setRevealed] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted && !changed) setReduceMotion(value); })
      .catch(() => { if (mounted && !changed) setReduceMotion(false); });
    return () => { mounted = false; listener.remove(); };
  }, []);

  const visibleCount = reduceMotion ? available.length : Math.min(revealed, available.length);
  const finished = visibleCount === available.length;
  const lastLetter = available[visibleCount - 1];
  const pause = lastLetter && /[，。？！]/.test(lastLetter) ? 160 : 48;
  useEffect(() => {
    if (!active || finished || reduceMotion === null) return;
    const timer = setTimeout(() => setRevealed(count => count + 1), pause);
    return () => clearTimeout(timer);
  }, [active, finished, pause, reduceMotion, revealed]);

  function advance() {
    if (place.point || unlocked) open();
    else if (nearby) store.arrive(place.id);
    else setCloser(true);
  }
  const saved = store.saved.includes(place.id);
  const open = () => router.push({ pathname: '/place/[id]', params: { id: place.id } });
  return <View style={{ height, paddingHorizontal: 16, paddingVertical: 10 }}>
    <LinearGradient
      colors={hasIllustration ? [palette.background, palette.background, '#141d1a'] : [palette.background, '#141d1a']}
      locations={hasIllustration ? [0, Math.min(0.95, artHeight / Math.max(1, height - 20)), 1] : undefined}
      style={styles.card}
    >
      {hasIllustration && (
        <View style={[styles.artFrame, { height: artHeight }]}>
          <Image source={illustration} style={styles.art} resizeMode="cover" accessible={false} />
          <LinearGradient
            pointerEvents="none"
            colors={[`${palette.background}00`, `${palette.background}00`, `${palette.background}99`, palette.background]}
            locations={[0, 0.43, 0.77, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      <ScrollView scrollEnabled={available.length > 36 || height < (hasIllustration ? 560 : 520)} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={[styles.cardContent, hasIllustration && styles.illustratedContent]}>
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.placeName, { color: palette.soft }]}>{place.name}</Text>
          <Text style={[styles.distanceText, { color: palette.soft }]}>
            {place.point ? '真实地点' : onsite ? '演示已到场' : `约 ${distance} 米`}
          </Text>
        </View>
        <View style={styles.story}>
          <Text
            accessibilityLabel={available.join('')}
            style={[styles.storyText, hasIllustration && styles.illustratedStoryText, { color: palette.ink }]}
          >
            {available.slice(0, visibleCount).join('')}
            {finished && !unlocked ? '…' : ''}
            <Text style={styles.unrevealed}>{available.slice(visibleCount).join('')}{!finished && !unlocked ? '…' : ''}</Text>
          </Text>
          {!unlocked && (
            <View style={styles.storyHint}>
              {finished && <Text style={[styles.distanceText, { color: palette.soft }]}>再走近一点，就能看到更多</Text>}
            </View>
          )}
        </View>
        <View style={styles.cardBottom}>
          <Pressable accessibilityRole="button" onPress={advance} style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
            <Text style={[styles.openText, { color: palette.ink }]}>{place.point ? '查看位置' : unlocked ? '继续对话' : nearby ? '模拟到场' : '模拟走近'}</Text>
            <Ionicons name="arrow-forward" size={17} color={palette.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? '取消想去' : '标记想去'} onPress={() => store.save(place.id)} style={styles.save}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={palette.soft} />
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  </View>;
}

export default function DiscoverScreen() {
  const store = usePlaces();
  const { profile, ready: profileReady } = useProfile();
  const [height, setHeight] = useState(0);
  const [visibleId, setVisibleId] = useState<string>();
  const focused = usePathname() === '/discover';
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: Place }[] }) => {
    setVisibleId(viewableItems[0]?.item.id);
  }, []);
  if (!store.ready || !profileReady) return <Loading />;
  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开个人中心" onPress={() => router.push('/me')} style={({ pressed }) => [styles.profile, pressed && { opacity: 0.65 }]}>
        <Avatar uri={profile.avatar} size={34} />
        <Text numberOfLines={1} style={styles.profileName}>{profile.nickname}</Text>
      </Pressable>
      <Text style={styles.demo}>本机体验</Text>
    </View>
    {store.notice ? <Text style={styles.notice}>{store.notice}</Text> : null}
    <View style={styles.feed} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      {height > 0 && <FlatList key={Math.round(height)} data={store.places} extraData={[store.arrived, store.saved, visibleId, focused]} viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged} keyExtractor={place => place.id} pagingEnabled decelerationRate="fast" showsVerticalScrollIndicator={false} initialNumToRender={2} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, index) => ({ length: height, offset: height * index, index })} renderItem={({ item }) => <PlaceCard place={item} height={height} active={focused && visibleId === item.id} />} />}
    </View>
    <Text style={styles.swipeHint}>向上滑，遇见下一个地方</Text>
  </Screen>;
}
const styles = StyleSheet.create({
  header: { height: 65, paddingHorizontal: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, flexShrink: 1, minWidth: 0 },
  profileName: { color: colors.text, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  demo: { color: colors.muted, fontSize: 11 },
  notice: { color: '#d3bf99', fontSize: 12, paddingHorizontal: 24 },
  feed: { flex: 1 },
  card: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  artFrame: { backgroundColor: '#e6d8bf', overflow: 'hidden' },
  art: { width: '100%', height: '100%' },
  illustratedContent: { paddingTop: 16, paddingBottom: 16 },
  illustratedStoryText: { fontSize: 23, lineHeight: 34 },
  cardContent: { flexGrow: 1, padding: 24 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  placeName: { flex: 1, fontSize: 13, lineHeight: 20 },
  distanceText: { fontSize: 11 },
  story: { flexGrow: 1, justifyContent: 'center', paddingVertical: 22 },
  storyHint: { minHeight: 24, paddingTop: 7 },
  unrevealed: { color: 'transparent' },
  storyText: { fontSize: 28, lineHeight: 41, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff20', paddingTop: 6 },
  open: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  openText: { fontWeight: '600', fontSize: 14 },
  save: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  pressed: { opacity: 0.65 },
  swipeHint: { color: '#777e76', textAlign: 'center', fontSize: 11, paddingVertical: 8 },
});
