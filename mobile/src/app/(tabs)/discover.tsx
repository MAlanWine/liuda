import { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Place, usePlaces } from '../../state/places';
import { useProfile } from '../../state/profile';
import { Avatar } from '../../components/Avatar';
import { colors, Loading, moods, Screen } from '../../components/ui';

const placeArt = new Map<string, ImageSourcePropType>([
  ['bench', require('../../../assets/place-art/bench.jpg')],
  ['stairs', require('../../../assets/place-art/stairs.jpg')],
  ['corner', require('../../../assets/place-art/corner.jpg')],
]);

function PlaceCard({ place, height }: { place: Place; height: number }) {
  const store = usePlaces();
  const palette = moods[place.mood];
  const illustration = placeArt.get(place.id);
  const hasIllustration = illustration !== undefined;
  const artHeight = Math.min(200, Math.round(height * 0.29));
  const joined = store.arrived.includes(place.id) || place.participated;
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
      <ScrollView scrollEnabled={height < (hasIllustration ? 560 : 520)} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={[styles.cardContent, hasIllustration && styles.illustratedContent]}>
        <View style={styles.meta}><Text style={[styles.location, { color: palette.soft }]}>{place.location}</Text><View style={styles.distance}><Ionicons name="walk-outline" color={palette.ink} size={14} /><Text style={styles.distanceText}>{store.arrived.includes(place.id) ? '演示已到场' : `约 ${place.distance} 米`}</Text></View></View>
        <Text style={[styles.placeName, hasIllustration && styles.illustratedName, { color: palette.ink }]}>{place.name}</Text>
        <View style={[styles.story, hasIllustration && styles.illustratedStory]}><Text style={[styles.storyText, hasIllustration && styles.illustratedStoryText, { color: palette.ink }]}>{place.teaser}</Text></View>
        {place.task && <Pressable onPress={open} style={styles.task}><Ionicons name="flag-outline" color={palette.soft} size={17} /><Text style={[styles.taskText, { color: palette.ink }]}>{place.task.title}</Text><Text style={[styles.reward, { color: palette.soft }]}>¥{place.task.reward} · 演示任务</Text></Pressable>}
        <View style={styles.cardBottom}>
          <View style={styles.stats}><Text style={[styles.statsText, { color: palette.soft }]}>♡ {place.likes}　接话 {place.replies.length}</Text><Pressable accessibilityLabel={saved ? '取消想去' : '标记想去'} onPress={() => store.save(place.id)} hitSlop={12}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={23} color={palette.ink} /></Pressable></View>
          <Pressable onPress={open} style={({ pressed }) => [styles.open, { backgroundColor: palette.ink, opacity: pressed ? 0.8 : 1 }]}><Text style={styles.openText}>{joined ? '回到这里的对话' : '走近看看'}</Text><Ionicons name="arrow-forward" size={20} color="#202921" /></Pressable>
          <Text style={[styles.hint, { color: palette.soft }]}>{joined ? '你参与过的对话，离场也能继续' : '到场后，读完整留话、接上这段对话'}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  </View>;
}

export default function DiscoverScreen() {
  const store = usePlaces();
  const { profile, ready: profileReady } = useProfile();
  const [height, setHeight] = useState(0);
  if (!store.ready || !profileReady) return <Loading />;
  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开个人中心" onPress={() => router.push('/me')} style={({ pressed }) => [styles.profile, pressed && { opacity: 0.65 }]}>
        <Avatar uri={profile.avatar} size={34} />
        <Text numberOfLines={1} style={styles.profileName}>{profile.nickname}</Text>
      </Pressable>
      <Text style={styles.demo}>演示体验 · 模拟位置</Text>
    </View>
    {store.notice ? <Text style={styles.notice}>{store.notice}</Text> : null}
    <View style={styles.feed} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      {height > 0 && <FlatList key={Math.round(height)} data={store.places} extraData={[store.arrived, store.saved]} keyExtractor={place => place.id} pagingEnabled decelerationRate="fast" showsVerticalScrollIndicator={false} initialNumToRender={2} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, index) => ({ length: height, offset: height * index, index })} renderItem={({ item }) => <PlaceCard place={item} height={height} />} />}
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
  illustratedName: { marginTop: 9, fontSize: 27, lineHeight: 38 },
  illustratedStory: { minHeight: 0, paddingVertical: 12 },
  illustratedStoryText: { fontSize: 20, lineHeight: 31 },
  cardContent: { flexGrow: 1, padding: 24 },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  location: { flex: 1, fontSize: 12, lineHeight: 21 },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  distanceText: { fontSize: 11, color: '#e4e8dc' },
  placeName: { marginTop: 28, fontSize: 31, lineHeight: 43, fontWeight: '600' },
  story: { flexGrow: 1, justifyContent: 'center', paddingVertical: 26, minHeight: 150 },
  storyText: { fontSize: 23, lineHeight: 38, fontWeight: '400' },
  task: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#ffffff20' },
  taskText: { flex: 1, fontSize: 13, lineHeight: 20 },
  reward: { fontSize: 11 },
  cardBottom: { paddingTop: 10, gap: 15 },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsText: { fontSize: 13 },
  open: { minHeight: 54, borderRadius: 17, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openText: { color: '#202921', fontWeight: '600', fontSize: 16 },
  hint: { textAlign: 'center', fontSize: 11, lineHeight: 18 },
  swipeHint: { color: '#777e76', textAlign: 'center', fontSize: 11, paddingVertical: 8 },
});
