import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Action, colors, ui } from '../../components/ui';

/**
 * Success page after `publishPost` (C18): 留在这里了 + 查看我的留话 / 回到发现 / 继续留话.
 * Shows only the place name from the route params — never a cached copy of the full text (read it via the thread).
 */
export default function PostedScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const view = () => router.push({ pathname: '/place/[id]', params: { id } });
  const discover = () => router.dismissTo('/discover');
  const again = () => { if (router.canGoBack()) router.back(); else router.replace('/leave'); };

  return <View style={ui.screen}>
    <View style={[ui.content, s.body]}>
      <View style={s.mark}><Ionicons name="checkmark" size={30} color={colors.onAccent} /></View>
      <Text accessibilityRole="header" style={ui.title}>留在这里了</Text>
      <Text style={ui.body}>{name ? `这句话留在了「${name}」。` : '这句话已经留在这个地点。'}</Text>
      <Text style={ui.muted}>路过的人走近就能看到。有人回应时会出现在「消息 › 回应」，离开现场也能继续对话。</Text>
      <View style={s.actions}>
        <Action title="查看我的留话" onPress={view} />
        <Action secondary title="回到发现" onPress={discover} />
        <Action secondary title="继续留话" onPress={again} />
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  mark: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, marginTop: 8 },
});
