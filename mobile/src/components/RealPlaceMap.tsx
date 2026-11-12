import { Text } from 'react-native';
import { ui } from './ui';

type MapPoint = { latitude: number; longitude: number };
/** `fix` accepts a `PositionEvidence` or the legacy `Fix`; only coordinates and accuracy are used. */
export type RealPlaceMapProps = {
  point: MapPoint; fix: (MapPoint & { accuracy: number | null }) | null; currentOnly?: boolean;
  /** Pan/zoom + 回到我 / 跟随 / 全览 controls. Defaults to `!currentOnly`. */
  interactive?: boolean;
};

/** Web fallback: react-native-maps is native only. */
export default function RealPlaceMap({ fix, currentOnly }: RealPlaceMapProps) {
  if (currentOnly) return null;
  return <Text style={ui.muted}>{fix ? '在手机 App 上可以同时看到你和留话点。' : '在手机 App 上可以查看真实底图。'}</Text>;
}
