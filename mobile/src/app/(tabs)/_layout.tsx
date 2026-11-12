import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, tabBarHeight } from '../../components/ui';
import { useInbox } from '../../state/inbox';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { unseen } = useInbox();
  const badge = unseen.replies + unseen.chats;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.inactive, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.chromeLine, height: tabBarHeight(insets), paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: { fontSize: 11, lineHeight: 16, marginBottom: 0 } }}>
    <Tabs.Screen name="discover" options={{ title: '发现', tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
    <Tabs.Screen name="leave" options={{ title: '留下', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
    <Tabs.Screen name="messages" options={{ title: '消息', tabBarBadge: badge > 0 ? (badge > 99 ? '99+' : badge) : undefined, tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent, fontSize: 10 }, tabBarAccessibilityLabel: badge > 0 ? `消息，${badge} 条新动态` : '消息', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
  </Tabs>;
}
