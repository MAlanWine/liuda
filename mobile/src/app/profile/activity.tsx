import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlaces } from '../../state/places';
import { Action, colors, Loading, ui } from '../../components/ui';

const sections = {
  owned: { title: '我的留话', empty: '还没有留下自己的声音', hint: '到一个具体地点，留下一句自己的话。' },
  joined: { title: '参与的对话', empty: '还没有接上的对话', hint: '在现场接一句，离开后也能继续。' },
  saved: { title: '想去的地方', empty: '还没有想去的地方', hint: '在发现页点书签，为下次出门留点期待。' },
};
export default function ActivityScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view = params.view && Object.prototype.hasOwnProperty.call(sections, params.view) ? params.view as keyof typeof sections : 'owned';
  const meta = sections[view];
  const store = usePlaces();
  if (!store.ready) return <Loading />;
  const places = store.places.filter(p => view === 'owned' ? p.owned : view === 'joined' ? p.participated : store.saved.includes(p.id));
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <View style={s.header}><Text style={s.title}>{meta.title}</Text><Text style={ui.muted}>仅自己可见</Text></View>
    {places.length === 0 ? <View style={ui.panel}><Text style={ui.body}>{meta.empty}</Text><Text style={ui.muted}>{meta.hint}</Text><Action secondary title="去发现" onPress={() => router.replace('/discover')} /></View>
      : places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={({ pressed }) => [ui.panel, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={s.header}><Text style={[ui.muted, { flex: 1 }]}>{place.location}</Text><Ionicons name="arrow-forward" size={17} color={colors.muted} /></View><Text style={s.placeName}>{place.name}</Text>
        <Text numberOfLines={3} style={[ui.body, { fontSize: 15 }]}>{view === 'joined' ? place.replies.at(-1)?.text || place.teaser : place.teaser}</Text><Text style={ui.muted}>{place.replies.length} 句接话</Text>
      </Pressable>)}
    <Action secondary title="回到个人中心" onPress={() => router.replace('/me')} />
    <Text style={ui.muted}>当前列表为这台设备保存的演示记录。</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { color: colors.text, fontSize: 25, lineHeight: 36, fontWeight: '500' },
  placeName: { color: colors.text, fontSize: 19, lineHeight: 28, fontWeight: '500' },
});
