import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useProfile } from '../state/profile';
import { usePlaces } from '../state/places';
import { Avatar } from '../components/Avatar';
import { colors, Loading, Screen } from '../components/ui';

export default function MeScreen() {
  const { profile, ready, notice } = useProfile();
  const store = usePlaces();
  if (!ready || !store.ready) return <Loading />;
  const items = [
    { key: 'owned', icon: 'create-outline' as const, title: '我的留话', description: '在某个地方，留下的声音', count: store.places.filter(p => p.owned).length },
    { key: 'joined', icon: 'chatbubble-ellipses-outline' as const, title: '参与的对话', description: '离开现场，也能接着聊', count: store.places.filter(p => p.participated).length },
    { key: 'saved', icon: 'bookmark-outline' as const, title: '想去的地方', description: '给下一次出门留点期待', count: store.saved.filter(id => store.places.some(p => p.id === id)).length },
  ];
  return <Screen><ScrollView contentContainerStyle={s.content}>
    <View style={s.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/discover'); }} style={s.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={s.pageTitle}>我</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="编辑我的资料" onPress={() => router.push('/profile/edit')} style={({ pressed }) => [s.identity, pressed && { opacity: 0.7 }]}>
      <Avatar uri={profile.avatar} size={74} /><View style={{ flex: 1, gap: 7 }}><Text numberOfLines={2} style={s.nickname}>{profile.nickname}</Text><Text style={s.edit}>编辑头像与昵称</Text></View><Ionicons name="chevron-forward" size={18} color="#757c72" />
    </Pressable>
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
    <View style={s.sectionHeader}><Text style={s.sectionTitle}>我的记录</Text><View style={s.private}><Ionicons name="lock-closed-outline" size={11} color="#8d9786" /><Text style={s.privateText}>仅自己可见</Text></View></View>
    <View style={s.menu}>{items.map((item, index) => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.title}，${item.count} 条`} onPress={() => router.push({ pathname: '/profile/activity', params: { view: item.key } })} style={({ pressed }) => [s.menuItem, index > 0 && s.divider, pressed && { opacity: 0.6 }]}>
      <Ionicons name={item.icon} size={22} color="#d4ddca" /><View style={{ flex: 1, gap: 5 }}><Text style={s.menuTitle}>{item.title}</Text><Text style={s.description}>{item.description}</Text></View><Text style={s.count}>{item.count}</Text><Ionicons name="chevron-forward" size={15} color="#72796c" />
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={s.setting}><Text style={s.settingText}>账号与登录</Text><Text style={s.edit}>尚未接入</Text><Ionicons name="chevron-forward" size={15} color="#72796c" /></Pressable>
    <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')} style={s.setting}><Text style={s.settingText}>匿名与数据</Text><Ionicons name="chevron-forward" size={15} color="#72796c" /></Pressable>
    <Text style={s.footer}>本机体验 · 资料和记录暂不支持跨设备恢复</Text>
  </ScrollView></Screen>;
}
const s = StyleSheet.create({
  content: { padding: 24, paddingTop: 26, paddingBottom: 40 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  pageTitle: { color: colors.text, fontSize: 26, fontWeight: '500' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingBottom: 34 },
  nickname: { color: colors.text, fontSize: 23, fontWeight: '500', lineHeight: 32 },
  edit: { color: '#8a9184', fontSize: 12, lineHeight: 20 },
  notice: { color: '#c1af8e', fontSize: 12, lineHeight: 21, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, gap: 8 },
  sectionTitle: { color: '#d0d6c8', fontSize: 13 },
  private: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privateText: { color: '#8d9786', fontSize: 11 },
  menu: { backgroundColor: '#1a1e1a', borderRadius: 22, paddingHorizontal: 19, marginBottom: 25 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 91, paddingVertical: 19 },
  divider: { borderTopColor: '#ffffff0b', borderTopWidth: StyleSheet.hairlineWidth },
  menuTitle: { color: colors.text, fontSize: 15, lineHeight: 22 },
  description: { color: '#858e7e', fontSize: 11, lineHeight: 18 },
  count: { color: '#c1c9b8', fontSize: 14 },
  setting: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ffffff0c' },
  settingText: { color: '#bec6b6', fontSize: 14, flex: 1 },
  footer: { color: '#7d8577', fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 28 },
});
