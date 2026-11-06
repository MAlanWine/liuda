import { useState } from 'react';
import { useFonts } from 'expo-font';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedLogo } from './AnimatedLogo';
import { router, usePathname } from 'expo-router';
import { useEntry } from '../state/entry';

type LoginMethod = '微信' | 'Apple';

export function AuthLanding() {
  const { begin, notice } = useEntry();
  const [fontsLoaded] = useFonts({
    LiudaDisplay: require('../../assets/fonts/LiudaDisplay.otf'),
    LiudaInterfaceV2: require('../../assets/fonts/LiudaInterfaceV2.otf'),
    LiudaInterfaceMedium: require('../../assets/fonts/LiudaInterfaceMedium.otf'),
  });
  const regular = fontsLoaded ? s.interfaceFont : undefined;
  const medium = fontsLoaded ? s.mediumFont : undefined;
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height - insets.top - insets.bottom < 650;
  const [method, setMethod] = useState<LoginMethod>('微信');
  const [loginOpen, setLoginOpen] = useState(false);
  function browse() {
    setLoginOpen(false);
    begin();
    router.replace('/discover');
  }
  return <SafeAreaView style={s.screen}>
    <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={[s.identity, compact && s.identityCompact]}>
        <AnimatedLogo size={compact ? 172 : 220} active={!loginOpen && (pathname === '/welcome' || pathname === '/login')} />
        <Text accessibilityRole="header" style={[s.name, fontsLoaded && s.displayFont]}>留答</Text>
        <Text style={[s.tagline, regular]}>到哪都有人陪着你</Text>
      </View>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="微信登录" onPress={() => { setMethod('微信'); setLoginOpen(true); }} style={({ pressed }) => [s.method, s.primary, pressed && s.pressed]}>
          <Ionicons name="logo-wechat" size={22} color="#111" style={s.methodIcon} /><Text style={[s.primaryText, medium]}>微信登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="通过 Apple 登录" onPress={() => { setMethod('Apple'); setLoginOpen(true); }} style={({ pressed }) => [s.method, s.secondary, pressed && s.pressed]}>
          <Ionicons name="logo-apple" size={22} color="#eee" style={s.methodIcon} /><Text style={[s.secondaryText, medium]}>通过 Apple 登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={browse} style={({ pressed }) => [s.guest, pressed && s.pressed]}><Text style={[s.guestText, regular]}>先逛逛</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')} style={s.privacy}><Text style={[s.privacyText, regular]}>隐私说明</Text></Pressable>
      {!!notice && <Text style={[s.notice, regular]}>{notice}</Text>}
    </ScrollView>
    <Modal visible={loginOpen} transparent animationType="fade" onRequestClose={() => setLoginOpen(false)}>
      <View style={s.modalBackground}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭登录说明" style={StyleSheet.absoluteFill} onPress={() => setLoginOpen(false)} />
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={s.sheetHeader}><Text accessibilityRole="header" style={[s.sheetTitle, medium]}>{method}登录</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭登录说明" hitSlop={12} onPress={() => setLoginOpen(false)}><Ionicons name="close" size={23} color="#a1a1a1" /></Pressable></View>
          <Text style={[s.sheetBody, regular]}>账号服务尚未接入。现在可以先浏览演示内容。</Text>
          <Pressable accessibilityRole="button" onPress={browse} style={({ pressed }) => [s.method, s.primary, pressed && s.pressed]}><Text style={[s.primaryText, medium]}>先逛逛</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  displayFont: { fontFamily: 'LiudaDisplay' },
  interfaceFont: { fontFamily: 'LiudaInterfaceV2' },
  mediumFont: { fontFamily: 'LiudaInterfaceMedium' },
  screen: { flex: 1, backgroundColor: '#000' },
  content: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 12 },
  identity: { flex: 1, minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingBottom: 48 },
  identityCompact: { minHeight: 240, paddingTop: 4, paddingBottom: 26 },
  name: { color: '#ededed', fontSize: 29, lineHeight: 44, fontWeight: 'normal', letterSpacing: 8, marginTop: 6, paddingLeft: 8, includeFontPadding: false },
  tagline: { color: '#999', fontSize: 12, lineHeight: 22, letterSpacing: 1.4, marginTop: 9, paddingLeft: 1.4, includeFontPadding: false },
  actions: { gap: 12, paddingBottom: 16 },
  method: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 14 },
  methodIcon: { position: 'absolute', left: 21 },
  primary: { backgroundColor: '#f4f4f4' },
  primaryText: { color: '#111', fontSize: 15, lineHeight: 22, fontWeight: 'normal', letterSpacing: 0.4, includeFontPadding: false },
  secondary: { backgroundColor: '#131313', borderWidth: 1, borderColor: '#242424' },
  secondaryText: { color: '#e8e8e8', fontSize: 15, lineHeight: 22, fontWeight: 'normal', letterSpacing: 0.4, includeFontPadding: false },
  guest: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  guestText: { color: '#a0a0a0', fontSize: 13, lineHeight: 22, letterSpacing: 0.8, includeFontPadding: false },
  privacy: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: '#7d7d7d', fontSize: 12, lineHeight: 20, letterSpacing: 0.2, includeFontPadding: false },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  notice: { color: '#aaa', fontSize: 12, lineHeight: 20, letterSpacing: 0.2, includeFontPadding: false, textAlign: 'center' },
  modalBackground: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: '#191919', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 26, gap: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sheetTitle: { fontSize: 20, fontWeight: 'normal', color: '#f4f4f4' },
  sheetBody: { color: '#aaa', fontSize: 14, lineHeight: 24, marginBottom: 4 },
});
