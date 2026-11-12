import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Pressable, Platform, Text, View } from 'react-native';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { EntryProvider } from '../state/entry';
import { ProfileProvider } from '../state/profile';
import { SessionProvider } from '../state/session';
import { PositionProvider } from '../state/position';
import { NearbyProvider } from '../state/nearby';
import { InboxProvider } from '../state/inbox';
import { DraftProvider } from '../state/draft';
import { ErrorView } from '../components/common/ErrorView';
import { colors } from '../components/ui';

/** Root render-error fallback (D-24); rendered without the providers, so it must stay store-free. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, backgroundColor: colors.background }}><StatusBar style="light" />
    <ErrorView fullScreen title="页面出了点问题" message={`留答遇到了一个意外错误，你的内容保存在本机。${__DEV__ && error?.message ? `\n${error.message}` : ''}`}
      onRetry={() => { retry(); }} />
  </View>;
}

function CloseLogin() {
  return <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={12} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
    onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/discover'); }}>
    <Text style={{ color: colors.authButton, fontSize: 16 }}>关闭</Text>
  </Pressable>;
}

export default function RootLayout() {
  return <View style={{ flex: 1, backgroundColor: colors.chrome }}><View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center' }}>
    <ThemeProvider value={DarkTheme}><SessionProvider><ProfileProvider><PositionProvider><NearbyProvider><InboxProvider><DraftProvider><EntryProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false, headerBackTitle: '返回', contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, contentStyle: { backgroundColor: colors.black } }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', headerShown: true, headerTransparent: true, title: '', headerLeft: () => <CloseLogin />, contentStyle: { backgroundColor: colors.black } }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="street-view-demo" options={{ title: '街景预览' }} />
        <Stack.Screen name="about-privacy" options={{ title: '匿名与数据' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="me" options={{ headerShown: false }} />
        <Stack.Screen name="profile/edit" options={{ title: '编辑资料' }} />
        <Stack.Screen name="profile/activity" options={{ title: '我的记录' }} />
        <Stack.Screen name="place/[id]" options={{ title: '这个地方' }} />
        <Stack.Screen name="posted/[id]" options={{ title: '已留下', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: '私聊' }} />
        <Stack.Screen name="account" options={{ title: '账号与登录' }} />
        <Stack.Screen name="settings/demo" options={{ title: '演示与模拟' }} />
        <Stack.Screen name="settings/blocked" options={{ title: '已屏蔽' }} />
      </Stack>
    </EntryProvider></DraftProvider></InboxProvider></NearbyProvider></PositionProvider></ProfileProvider></SessionProvider></ThemeProvider>
  </View></View>;
}
