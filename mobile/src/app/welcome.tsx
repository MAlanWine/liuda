import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEntry } from '../state/entry';

export default function WelcomeScreen() {
  const { height, width } = useWindowDimensions();
  const { begin, notice } = useEntry();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const compact = availableHeight < 740;
  const heroHeight = Math.min(availableHeight * 0.36, 330);
  const headlineSize = width < 360 ? 28 : compact ? 32 : 35;
  function explore() { begin(); router.replace('/discover'); }
  return <SafeAreaView style={s.screen}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={s.top}><Text style={s.wordmark}>留答<Text style={s.wordmarkDot}> ·</Text></Text><Text style={s.edition}>让地点，成为交流的载体</Text></View>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[s.hero, { height: heroHeight }]}>
        <View style={[s.orbit, { width: Math.min(width - 40, 390), height: heroHeight * 0.56, top: heroHeight * 0.32 }]} />
        <View style={[s.orbit, s.orbitBack, { width: Math.min(width - 10, 420), height: heroHeight * 0.65, top: heroHeight * 0.22 }]} />
        <Image source={require('../../assets/liuda-comma.png')} style={[s.heroLogo, { width: heroHeight * 1.03, height: heroHeight * 1.03, right: compact ? 4 : -2, top: -16 }]} />
        <View style={[s.placeNote, { bottom: compact ? 8 : 20 }]}><View style={s.signal} /><View><Text style={s.noteTitle}>某个地方，有人留了话</Text><Text style={s.noteSub}>等一个路过的你</Text></View></View>
        <View style={[s.star, { top: 40, left: 16 }]} /><View style={[s.star, { right: 15, bottom: 44, opacity: 0.4 }]} />
      </View>
      <View style={s.copy}><Text style={s.kicker}>在场相遇，自在留答</Text><Text style={[s.headline, { fontSize: headlineSize, lineHeight: headlineSize * 1.4 }]}>{'有些话，\n走到这里才会遇见。'}</Text><Text style={s.description}>看看前人留下的声音，接上属于你的那一句。</Text></View>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={explore} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>去附近看看</Text><Ionicons name="arrow-forward" size={21} color="#171a18" /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>登录，接上我的对话</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/about-privacy')} hitSlop={10}><Text style={s.footer}>不必介绍自己，先遇见一个地方。<Text style={{ color: '#8c918a' }}> ↗</Text></Text></Pressable>
        {!!notice && <Text style={s.notice}>{notice}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { color: '#f3f3ea', fontSize: 24, fontWeight: '600', letterSpacing: 2 },
  wordmarkDot: { color: '#a9b99e' },
  edition: { color: '#7c827a', fontSize: 10, letterSpacing: 1 },
  hero: { marginTop: 17, position: 'relative', justifyContent: 'center', overflow: 'hidden' },
  heroLogo: { position: 'absolute', resizeMode: 'contain', transform: [{ rotate: '-9deg' }] },
  orbit: { position: 'absolute', alignSelf: 'center', borderWidth: 1, borderColor: '#202822', borderRadius: 200, transform: [{ rotate: '-28deg' }] },
  orbitBack: { borderColor: '#121714', transform: [{ rotate: '28deg' }] },
  placeNote: { position: 'absolute', left: 2, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  signal: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c2d5b2', marginTop: 5 },
  noteTitle: { color: '#c9cec4', fontSize: 11, lineHeight: 20 },
  noteSub: { color: '#6d766b', fontSize: 10, lineHeight: 19 },
  star: { width: 3, height: 3, backgroundColor: '#a5b39a', borderRadius: 2, position: 'absolute' },
  copy: { paddingTop: 20, paddingBottom: 24 },
  kicker: { color: '#9ba994', fontSize: 11, letterSpacing: 2, marginBottom: 15 },
  headline: { color: '#f0f1e9', fontSize: 35, lineHeight: 49, fontWeight: '500', letterSpacing: -0.8 },
  description: { color: '#858c82', fontSize: 12, lineHeight: 22, marginTop: 15 },
  actions: { marginTop: 'auto', gap: 12 },
  primary: { backgroundColor: '#edf0e5', minHeight: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 23 },
  primaryText: { color: '#171a18', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  secondary: { borderWidth: 1, borderColor: '#2c312a', minHeight: 54, borderRadius: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15 },
  secondaryText: { color: '#c6cbc0', fontSize: 14 },
  footer: { color: '#85917e', fontSize: 11, textAlign: 'center', lineHeight: 20, paddingTop: 9 },
  notice: { color: '#b9a884', fontSize: 11, lineHeight: 18 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
