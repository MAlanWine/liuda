import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { EntryProvider } from '../state/entry';
import { ProfileProvider } from '../state/profile';
import { PlacesProvider } from '../state/places';
import { colors } from '../components/ui';

export default function RootLayout() {
  return <View style={{ flex: 1, backgroundColor: '#090c0b' }}><View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center' }}><ThemeProvider value={DarkTheme}><PlacesProvider><ProfileProvider><EntryProvider><StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="about-privacy" options={{ title: '匿名与数据' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit" options={{ title: '编辑资料', headerBackTitle: '返回' }} />
      <Stack.Screen name="profile/activity" options={{ title: '我的记录', headerBackTitle: '返回' }} />
      <Stack.Screen name="place/[id]" options={{ title: '这个地方', headerBackTitle: '返回' }} />
    </Stack>
  </EntryProvider></ProfileProvider></PlacesProvider></ThemeProvider></View></View>;
}
