import { Text } from 'react-native';
import type { Fix, Point } from '../location/geo';
import { ui } from './ui';

export type RealPlaceMapProps = { point: Point; fix: Fix | null; currentOnly?: boolean };

export default function RealPlaceMap({ fix, currentOnly }: RealPlaceMapProps) {
  if (currentOnly) return null;
  return <Text style={ui.muted}>{fix ? '在手机 App 上可以同时看到你和留话点。' : '在手机 App 上可以查看真实底图。'}</Text>;
}
