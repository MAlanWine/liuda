import * as Location from 'expo-location';
import { Linking } from 'react-native';

/** Location permission as the app sees it (D-16). `granted-reduced` = iOS 「精确位置」 off: km-level fixes can never pass the ≤30 m gate. */
export type LocationPermission = 'undetermined' | 'denied' | 'services-off' | 'granted-reduced' | 'granted';

async function servicesEnabled() {
  try { return await Location.hasServicesEnabledAsync(); }
  catch { return true; }
}

function classify(response: Location.LocationPermissionResponse, services: boolean): LocationPermission {
  if (!services && response.status !== 'undetermined') return 'services-off';
  if (response.granted) return response.ios?.accuracy === 'reduced' ? 'granted-reduced' : 'granted';
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

/** Reads the current permission without prompting. */
export async function getLocationPermission(): Promise<LocationPermission> {
  try {
    const [response, services] = await Promise.all([Location.getForegroundPermissionsAsync(), servicesEnabled()]);
    return classify(response, services);
  } catch {
    return 'denied';
  }
}

/** Shows the system prompt if it is still allowed to, then returns the resulting permission. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  try {
    const response = await Location.requestForegroundPermissionsAsync();
    return classify(response, await servicesEnabled());
  } catch {
    return getLocationPermission();
  }
}

/**
 * iOS 「精确位置」 off: asks for temporary full accuracy for this app session. In Expo SDK 58 this is
 * `expo-location/next` `Location.requestForegroundPermissions({ accuracy: FULL })`, which raises a reduced grant with the
 * `ExpoLocationFullAccuracy` purpose string the config plugin writes (app.json `locationFullAccuracyPermission`).
 * The legacy `requestTemporaryFullAccuracyAsync` does not exist in this SDK. Any failure -> the current permission
 * (callers then fall back to the Settings guidance).
 */
export async function requestTemporaryFullAccuracy(): Promise<LocationPermission> {
  try {
    const next = await import('expo-location/next');
    await next.Location.requestForegroundPermissions({ accuracy: next.RequestPermissionsAccuracyOption.FULL });
  } catch { /* module or purpose string unavailable: keep the settings route */ }
  return getLocationPermission();
}

/** True when GPS fixes can be read (approximate fixes are readable but never pass the on-site gate). */
export function canReadGps(permission: LocationPermission) {
  return permission === 'granted' || permission === 'granted-reduced';
}

/** Opens this app's page in iOS Settings (location toggles, 精确位置). */
export async function openAppSettings() {
  try { await Linking.openSettings(); return true; }
  catch { return false; }
}

/** Short Chinese explanation for a permission state; '' when nothing needs saying. */
export function permissionMessage(permission: LocationPermission): string {
  switch (permission) {
    case 'denied': return '留答没有获得定位权限。到场确认需要你的真实位置，可以去设置开启，或先改用模拟位置。';
    case 'services-off': return '系统定位服务已关闭。请在「设置 › 隐私与安全性 › 定位服务」中打开，或先改用模拟位置。';
    case 'granted-reduced': return '当前只允许大致位置，误差可达数公里，无法确认到场。请在「设置 › 留答 › 位置」打开「精确位置」。';
    case 'undetermined': return '确认你在留话现场需要定位。只在使用时读取，不会在后台记录。';
    default: return '';
  }
}
