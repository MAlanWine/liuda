import { useState } from 'react';
import { useFonts } from 'expo-font';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { AnimatedLogo } from './AnimatedLogo';
import { SignInSheet } from './account/SignInSheet';
import { colors } from './ui';
import { describeError, type AuthMethod } from '../api';
import { useEntry } from '../state/entry';
import { useSession } from '../state/session';

/**
 * `/welcome` (first screen) and `/login` (modal, the shell adds 关闭). 微信 / Apple / 游客 open the mock `SignInSheet`;
 * 先逛逛 continues as the device guest (signing in as guest first when signed out).
 * The subset fonts (`LiudaDisplay`, `LiudaInterface*`) only cover the original copy; every newer string uses the system font.
 */
export function AuthLanding() {
  const { started, notice: entryNotice } = useEntry();
  const { ready: sessionReady, session, notice: sessionNotice, signIn } = useSession();
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
  const [method, setMethod] = useState<AuthMethod | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState('');

  /** Leaves the landing without stacking a second discover (D-8): back when possible, else replace. */
  function leave() {
    setMethod(null);
    if (router.canGoBack()) router.back();
    else router.replace(started ? '/discover' : '/onboarding');
  }
  async function browse() {
    if (browsing) return;
    setError('');
    if (!session) {
      setBrowsing(true);
      try { await signIn('guest'); }
      catch (cause) { setError(describeError(cause)); setBrowsing(false); return; }
      setBrowsing(false);
    }
    leave();
  }
  const notice = error || sessionNotice || entryNotice;
  return <SafeAreaView style={s.screen}>
    <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={[s.identity, compact && s.identityCompact]}>
        <AnimatedLogo size={compact ? 172 : 220} active={method === null && (pathname === '/welcome' || pathname === '/login')} />
        <Text accessibilityRole="header" style={[s.name, fontsLoaded && s.displayFont]}>留答</Text>
        <Text style={[s.tagline, regular]}>到哪都有人陪着你</Text>
      </View>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="微信登录（演示）" onPress={() => setMethod('wechat')} style={({ pressed }) => [s.method, s.primary, pressed && s.pressed]}>
          <Ionicons name="logo-wechat" size={22} color={colors.black} style={s.methodIcon} /><Text style={[s.primaryText, medium]}>微信登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="通过 Apple 登录（演示）" onPress={() => setMethod('apple')} style={({ pressed }) => [s.method, s.secondary, pressed && s.pressed]}>
          <Ionicons name="logo-apple" size={22} color={colors.text} style={s.methodIcon} /><Text style={[s.secondaryText, medium]}>通过 Apple 登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="游客登录（演示）" onPress={() => setMethod('guest')} style={({ pressed }) => [s.method, s.outline, pressed && s.pressed]}>
          <Ionicons name="person-outline" size={20} color={colors.muted} style={s.methodIcon} /><Text style={s.outlineText}>游客登录</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ busy: browsing }} disabled={browsing || !sessionReady} onPress={browse} style={({ pressed }) => [s.guest, pressed && s.pressed]}>
          {browsing ? <ActivityIndicator color={colors.muted} /> : <Text style={[s.guestText, regular]}>先逛逛</Text>}
        </Pressable>
      </View>
      <Text style={s.current}>{session ? `当前：${session.accountLabel}` : sessionReady ? '尚未登录 · 演示账号不会连接微信或 Apple' : '正在准备演示账号…'}</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')} style={s.privacy}><Text style={[s.privacyText, regular]}>隐私说明</Text></Pressable>
      {!!notice && <Text accessibilityLiveRegion="polite" style={[s.notice, error && s.error]}>{notice}</Text>}
    </ScrollView>
    <SignInSheet method={method} onClose={() => setMethod(null)} onSignedIn={leave} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  displayFont: { fontFamily: 'LiudaDisplay' },
  interfaceFont: { fontFamily: 'LiudaInterfaceV2' },
  mediumFont: { fontFamily: 'LiudaInterfaceMedium' },
  screen: { flex: 1, backgroundColor: colors.black },
  content: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 12 },
  identity: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingBottom: 40 },
  identityCompact: { minHeight: 220, paddingTop: 4, paddingBottom: 20 },
  name: { color: colors.text, fontSize: 29, lineHeight: 44, fontWeight: 'normal', letterSpacing: 8, marginTop: 6, paddingLeft: 8, includeFontPadding: false },
  tagline: { color: colors.muted, fontSize: 12, lineHeight: 22, letterSpacing: 1.4, marginTop: 9, paddingLeft: 1.4, includeFontPadding: false },
  actions: { gap: 12, paddingBottom: 8 },
  method: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 14 },
  methodIcon: { position: 'absolute', left: 21 },
  primary: { backgroundColor: colors.authButton },
  primaryText: { color: colors.black, fontSize: 15, lineHeight: 22, fontWeight: 'normal', letterSpacing: 0.4, includeFontPadding: false },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: 'normal', letterSpacing: 0.4, includeFontPadding: false },
  outline: { minHeight: 48, borderWidth: 1, borderColor: colors.line },
  outlineText: { color: colors.subtle, fontSize: 15, lineHeight: 22, letterSpacing: 0.4 },
  guest: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  guestText: { color: colors.muted, fontSize: 13, lineHeight: 22, letterSpacing: 0.8, includeFontPadding: false },
  current: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  privacy: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: colors.muted, fontSize: 12, lineHeight: 20, letterSpacing: 0.2, includeFontPadding: false },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 20, letterSpacing: 0.2, textAlign: 'center' },
  error: { color: colors.danger },
});
