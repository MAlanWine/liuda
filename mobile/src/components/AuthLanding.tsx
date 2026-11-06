import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, usePathname } from 'expo-router';
import { useEntry } from '../state/entry';

type LoginMethod = '微信' | 'Apple';

export function AuthLanding() {
  const { begin, notice } = useEntry();
  const { height, width } = useWindowDimensions();
  const pathname = usePathname();
  const focused = pathname === '/welcome' || pathname === '/login';
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const compact = availableHeight < 650;
  const artSize = Math.min(width, availableHeight * (compact ? 0.37 : 0.47), 440);
  const [method, setMethod] = useState<LoginMethod>('微信');
  const [loginOpen, setLoginOpen] = useState(false);
  function browse() {
    setLoginOpen(false);
    begin();
    router.replace('/discover');
  }
  return <SafeAreaView style={s.screen}>
    {focused && <StatusBar style="dark" />}
    <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={[s.identity, compact && s.identityCompact]}>
        <View accessible={false} style={{ width: artSize, height: artSize }}>
          <Image source={require('../../assets/arrival-collage-v1.png')} style={s.art} />
          <LinearGradient pointerEvents="none" colors={['#f3f1eb', '#f3f1eb00']} style={s.fadeTop} />
          <LinearGradient pointerEvents="none" colors={['#f3f1eb00', '#f3f1eb']} style={s.fadeBottom} />
        </View>
        <Text accessibilityRole="header" style={s.name}>留答</Text>
      </View>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="微信登录" onPress={() => { setMethod('微信'); setLoginOpen(true); }} style={({ pressed }) => [s.method, s.primary, pressed && s.pressed]}>
          <Ionicons name="logo-wechat" size={22} color="#faf9f6" style={s.methodIcon} /><Text style={s.primaryText}>微信登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="通过 Apple 登录" onPress={() => { setMethod('Apple'); setLoginOpen(true); }} style={({ pressed }) => [s.method, s.secondary, pressed && s.pressed]}>
          <Ionicons name="logo-apple" size={22} color="#222" style={s.methodIcon} /><Text style={s.secondaryText}>通过 Apple 登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={browse} style={({ pressed }) => [s.guest, pressed && s.pressed]}><Text style={s.guestText}>先逛逛</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')} style={s.privacy}><Text style={s.privacyText}>隐私说明</Text></Pressable>
      {!!notice && <Text style={s.notice}>{notice}</Text>}
    </ScrollView>
    <Modal visible={loginOpen} transparent animationType="fade" onRequestClose={() => setLoginOpen(false)}>
      <View style={s.modalBackground}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭登录说明" style={StyleSheet.absoluteFill} onPress={() => setLoginOpen(false)} />
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={s.sheetHeader}><Text accessibilityRole="header" style={s.sheetTitle}>{method}登录</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭登录说明" hitSlop={12} onPress={() => setLoginOpen(false)}><Ionicons name="close" size={23} color="#706b62" /></Pressable></View>
          <Text style={s.sheetBody}>账号服务尚未接入。现在可以先浏览演示内容。</Text>
          <Pressable accessibilityRole="button" onPress={browse} style={({ pressed }) => [s.method, s.primary, pressed && s.pressed]}><Text style={s.primaryText}>先逛逛</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f1eb' },
  content: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 12 },
  identity: { flex: 1, minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 28 },
  identityCompact: { minHeight: 240, paddingTop: 4, paddingBottom: 16 },
  art: { width: '100%', height: '100%', resizeMode: 'contain' },
  fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 36 },
  fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36 },
  name: { color: '#24221f', fontSize: 27, lineHeight: 40, fontWeight: '500', letterSpacing: 7, marginTop: 8, paddingLeft: 7 },
  actions: { gap: 12, paddingBottom: 16 },
  method: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 14 },
  methodIcon: { position: 'absolute', left: 21 },
  primary: { backgroundColor: '#20201e' },
  primaryText: { color: '#faf9f6', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  secondary: { backgroundColor: '#f3f1eb', borderWidth: 1, borderColor: '#d5d2ca' },
  secondaryText: { color: '#272622', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  guest: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  guestText: { color: '#6a675f', fontSize: 13, lineHeight: 20 },
  privacy: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: '#77746c', fontSize: 11, lineHeight: 18 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  notice: { color: '#70685c', fontSize: 11, lineHeight: 18, textAlign: 'center' },
  modalBackground: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: '#f3f1eb', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 26, gap: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: '#24221f' },
  sheetBody: { color: '#706b62', fontSize: 14, lineHeight: 24, marginBottom: 4 },
});
