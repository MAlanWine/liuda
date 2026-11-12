import Constants from 'expo-constants';
import { Platform } from 'react-native';

// API Route 在浏览器里有 origin，可以用相对路径；原生端（尤其 Expo Go）没有 origin，
// fetch('/api/...') 会直接失败，必须拼成开发服务器的绝对地址。
// 局域网与 tunnel 两种模式的 hostUri 都带端口，直接拼即可。
// development build 的 expoConfig 里可能没有 hostUri：这时退回相对路径，保持原来的行为
// （失败后由调用方改用系统反向地理编码）。
export function devApiUrl(path: string): string {
  if (Platform.OS === 'web') return path;
  const legacy = Constants as unknown as { manifest?: { debuggerHost?: string } };
  const raw = Constants.expoConfig?.hostUri ?? legacy.manifest?.debuggerHost;
  const host = raw?.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
  return host ? `http://${host}${path}` : path;
}
