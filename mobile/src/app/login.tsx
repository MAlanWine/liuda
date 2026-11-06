import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEntry } from '../state/entry';

export default function LoginScreen() {
  const { begin } = useEntry();
  return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <View style={s.nav}><Pressable accessibilityRole="button" accessibilityLabel="返回欢迎页" hitSlop={14} onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')}><Ionicons name="arrow-back" size={24} color="#e5e9df" /></Pressable><Text style={s.navTitle}>留答 · 账号</Text></View>
    <Image source={require('../../assets/liuda-comma.png')} style={s.logo} />
    <Text style={s.kicker}>把那段对话，带在身边</Text>
    <Text style={s.title}>{'留下声音，\n不必留下姓名。'}</Text>
    <Text style={s.description}>登录用于找回你的留话与对话。{ '\n' }对其他人，你依然匿名。</Text>
    <View style={s.privacy}><Ionicons name="finger-print-outline" color="#aebda2" size={23} /><Text style={s.privacyText}>以地点相识，以一句话开始。</Text></View>
    <View style={s.actions}>
      <View style={s.method}><Ionicons name="logo-wechat" size={23} color="#86a782" /><Text style={s.methodText}>微信登录</Text><Text style={s.soon}>待接入</Text></View>
      <View style={s.method}><Ionicons name="logo-apple" size={25} color="#e5e7e0" /><Text style={s.methodText}>通过 Apple 登录</Text><Text style={s.soon}>待接入</Text></View>
      <Text style={s.demo}>账号服务尚未接入，当前可先体验本机演示。</Text>
      <Pressable accessibilityRole="button" style={s.browse} onPress={() => { begin(); router.replace('/discover'); }}><Text style={s.browseText}>先匿名逛逛</Text><Ionicons name="arrow-forward" color="#dee7d6" size={18} /></Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')}><Text style={s.about}>关于匿名与数据 ↗</Text></Pressable>
    </View>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  content: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 22, paddingBottom: 28 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { color: '#717a6c', fontSize: 11, letterSpacing: 2 },
  logo: { height: 134, width: 134, alignSelf: 'flex-end', marginTop: 26, marginRight: -10 },
  kicker: { color: '#9cab92', fontSize: 11, letterSpacing: 2, marginTop: 8 },
  title: { color: '#f0f1e9', fontSize: 36, lineHeight: 50, fontWeight: '500', marginTop: 18 },
  description: { color: '#858e7d', fontSize: 13, lineHeight: 24, marginTop: 19 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 28, paddingBottom: 32 },
  privacyText: { color: '#b4bdae', fontSize: 12 },
  actions: { marginTop: 'auto', gap: 12 },
  method: { minHeight: 57, borderWidth: 1, borderColor: '#292e26', borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 19, gap: 13 },
  methodText: { color: '#a4ad9d', fontSize: 14, flex: 1 },
  soon: { color: '#636e5d', fontSize: 10 },
  demo: { fontSize: 10, color: '#7d8675', lineHeight: 20, textAlign: 'center' },
  browse: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  browseText: { color: '#dee7d6', fontSize: 14 },
  about: { color: '#67745f', fontSize: 11, textAlign: 'center', lineHeight: 24 },
});
