import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { readPosition, toFix } from '../location/device';
import { atPoint, distanceMeters, type Fix, type Point } from '../location/geo';
import { StreetViewPreview } from './StreetViewPreview';
import RealPlaceMap from './RealPlaceMap';
import { Action, ui } from './ui';

export function LivePlacePosition({ point, location, onFix }: { point: Point; location: string; onFix: (fix: Fix | null) => void }) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!tracking) return;
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 }, value => {
      if (active) setFix(toFix(value));
    }, () => {
      if (active) setNotice('定位更新中断，可以重新定位。');
    }).then(result => {
      if (active) subscription = result;
      else result.remove();
    }).catch(() => { if (active) setNotice('暂时无法持续定位，可以重新定位。'); });
    return () => { active = false; subscription?.remove(); };
  }, [tracking]);

  useEffect(() => {
    onFix(fix);
    if (!fix) return;
    const timer = setTimeout(() => setFix(null), Math.max(0, fix.timestamp + 30_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [fix, onFix]);

  async function locate() {
    setBusy(true);
    setNotice('');
    setTracking(false);
    setFix(null);
    try {
      setFix(await readPosition());
      setTracking(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '定位暂时不可用。');
    } finally {
      setBusy(false);
    }
  }

  async function directions() {
    const destination = encodeURIComponent(`${point.latitude},${point.longitude}`);
    const url = Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;
    try { await Linking.openURL(url); }
    catch { setNotice('无法打开地图，请稍后重试。'); }
  }

  return (
    <View style={{ gap: 10 }}>
      <RealPlaceMap point={point} fix={fix} />
      <Text style={ui.body}>{fix ? `直线约 ${Math.round(distanceMeters(fix, point))} 米${atPoint(fix, point) ? ' · 已到场' : ''}` : '定位后查看距离'}</Text>
      {location ? <Text style={ui.muted}>{location}</Text> : null}
      {fix?.accuracy != null && <Text style={ui.muted}>定位精度约 {Math.round(fix.accuracy)} 米</Text>}
      {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Action secondary title={busy ? '正在定位…' : fix ? '刷新定位' : '定位我'} disabled={busy} onPress={locate} />
        <Action secondary title="打开步行路线" onPress={directions} />
      </View>
      {__DEV__ && <StreetViewPreview key={`${point.latitude},${point.longitude}`} point={point} />}
    </View>
  );
}
