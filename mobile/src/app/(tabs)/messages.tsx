import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlaces } from '../../state/places';
import { Action, colors, Loading, Screen, ui } from '../../components/ui';

export default function MessagesScreen() {
  const store = usePlaces();
  const [tab, setTab] = useState<'joined' | 'saved'>('joined');
  if (!store.ready) return <Loading />;
  const places = store.places.filter(place => tab === 'joined' ? place.participated : store.saved.includes(place.id));
  return <Screen><ScrollView contentContainerStyle={ui.content}>
    <Text style={ui.title}>{tab === 'joined' ? '把对话带走' : '下次，去这里'}</Text>
    <Text style={ui.muted}>{tab === 'joined' ? '曾在现场接上的话，离开后也能继续。' : '收藏一个地点，为下次出门留点期待。'}</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}>{(['joined', 'saved'] as const).map(value => <Pressable key={value} onPress={() => setTab(value)} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} style={{ flex: 1, borderRadius: 16, padding: 15, backgroundColor: tab === value ? colors.accent : colors.surface }}><Text style={{ textAlign: 'center', color: tab === value ? '#172015' : colors.muted, fontWeight: '600' }}>{value === 'joined' ? '我的对话' : '想去的地方'}</Text></Pressable>)}</View>
    {places.length === 0 ? <View style={ui.panel}><Text style={ui.body}>{tab === 'joined' ? '还没有接上的对话' : '还没有想去的地方'}</Text><Text style={ui.muted}>{tab === 'joined' ? '在地点详情里模拟到场，发出第一句接话。' : '刷到感兴趣的地点，点一下书签。'}</Text><Action secondary title="去发现一个地方" onPress={() => router.navigate('/')} /></View> : places.map(place => <Pressable key={place.id} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={({ pressed }) => [ui.panel, { opacity: pressed ? 0.7 : 1, gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[ui.muted, { flex: 1 }]}>{place.location}</Text><Ionicons name="arrow-forward" color={colors.muted} size={18} /></View>
      <Text style={{ fontSize: 21, color: colors.text, fontWeight: '600', lineHeight: 30 }}>{place.name}</Text><Text numberOfLines={2} style={[ui.body, { fontSize: 15, color: '#c2c7be' }]}>{place.replies.at(-1)?.text || place.teaser}</Text>
      <Text style={[ui.muted, { color: colors.accent }]}>{tab === 'joined' ? `${place.replies.length} 句接话 · 可离场继续` : '已加入想去'}</Text>
    </Pressable>)}
    <Text style={ui.muted}>本机演示记录 · 暂未接入跨设备消息</Text>
  </ScrollView></Screen>;
}
