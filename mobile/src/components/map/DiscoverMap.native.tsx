import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ui } from '../ui';
import type { DiscoverMapProps } from './DiscoverMap';
import { nativeMapsAvailable } from './nativeMaps';

// Loaded lazily on purpose: AppleDiscoverMap imports react-native-maps, which crashes Expo Go at module load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppleDiscoverMap: ComponentType<DiscoverMapProps> | null = nativeMapsAvailable ? require('./AppleDiscoverMap').default : null;

/** Discover map on iPhone: Apple Maps in a development build; Expo Go has no map module, so it points back to the cards. */
export default function DiscoverMap(props: DiscoverMapProps) {
  if (AppleDiscoverMap) return <AppleDiscoverMap {...props} />;
  return <View style={s.box}>
    <Text style={ui.muted}>Expo Go 里没有原生地图，地图视图需要开发版本（development build）。附近有 {props.posts.length} 条留话，可切回卡片浏览。</Text>
  </View>;
}
const s = StyleSheet.create({ box: { flex: 1, padding: 24, justifyContent: 'center' } });
