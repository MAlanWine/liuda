import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../components/ui';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: '#81867f', tabBarStyle: { backgroundColor: colors.background, borderTopColor: '#292d29', height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: { fontSize: 11, lineHeight: 16, marginBottom: 0 } }}>
    <Tabs.Screen name="discover" options={{ title: '发现', tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
    <Tabs.Screen name="leave" options={{ title: '留下', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
    <Tabs.Screen name="messages" options={{ title: '消息', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
    <Tabs.Screen name="me" options={{ title: '我', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={typeof color === 'string' ? color : colors.muted} /> }} />
  </Tabs>;
}
