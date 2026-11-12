import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { devApiUrl } from './api';
import type { Fix, Point } from './geo';

export function toFix(location: Location.LocationObject): Fix {
  const { latitude, longitude, accuracy } = location.coords;
  return { latitude, longitude, accuracy, timestamp: location.timestamp };
}

export async function readPositionIfAllowed() {
  const permission = await Location.getForegroundPermissionsAsync();
  return permission.granted ? currentFix() : null;
}

export async function readPosition() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('请在系统设置中允许留答访问位置。');
  return currentFix();
}

async function currentFix() {
  try {
    return toFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  } catch {
    throw new Error('暂时无法定位，试试走到室外再刷新。');
  }
}

export type PositionDescription = { landmark: string; address: string; area?: string };

export async function describePosition(point: Point): Promise<PositionDescription | null> {
  if (__DEV__) {
    const url = devApiUrl('/api/place-name');
    if (url) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: point.latitude, longitude: point.longitude }),
        });
        if (response.ok) {
          const data = await response.json() as PositionDescription;
          if (data.area || data.address || data.landmark) return data;
        }
      } catch {
        // Use the system address when the preview server is unavailable.
      }
    }
  }
  if (Platform.OS === 'web') return null;
  try {
    const [result] = await Location.reverseGeocodeAsync(point);
    if (!result) return null;
    const parts = [result.city, result.district, result.street?.match(/^\d+号线$/) ? null : result.street, result.streetNumber]
      .flatMap(part => part?.trim() ? [part.trim()] : []);
    const address = [...new Set(parts)].join(' ') || result.formattedAddress?.trim() || '';
    const name = result.name?.trim() || '';
    const normalize = (value: string) => value.toLowerCase().replace(/[\s,，、·-]+/g, '');
    // Geocoders also return street numbers or repeat the address in the name field.
    const normalizedName = normalize(name);
    const looksLikeAddress = [...parts, result.region, result.subregion, result.formattedAddress, address]
      .some(part => part && normalize(part).includes(normalizedName));
    const landmark = normalizedName && !looksLikeAddress && !/^\d+[a-z号栋楼-]*$/i.test(normalizedName)
      ? name
      : '';
    return { landmark, address };
  } catch {
    return null;
  }
}
