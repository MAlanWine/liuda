import { Image } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { placeArtImages } from '../common/placeArt';

/** Server limit for one post photo (decoded JPEG bytes). */
export const PHOTO_MAX_BYTES = 512 * 1024;

/** Same shape as `Draft['photo']`. */
export type CapturedPhoto = { uri: string; base64: string; simulated: boolean };

export type CaptureResult =
  | { kind: 'ok'; photo: CapturedPhoto }
  | { kind: 'canceled' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable' };

/** Compression ladder: longest side ≤1280 px at JPEG 0.6, then 0.45, then 960 px, until the bytes fit. */
const ATTEMPTS: { side: number; compress: number }[] = [
  { side: 1280, compress: 0.6 },
  { side: 1280, compress: 0.45 },
  { side: 960, compress: 0.45 },
  { side: 720, compress: 0.4 },
];

/** Decoded byte length of a base64 string (no data-URI prefix). */
export function decodedBytes(base64: string): number {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor(clean.length * 3 / 4) - padding;
}

export class PhotoTooLargeError extends Error {
  constructor() {
    super('照片太大，请重新拍摄。');
    this.name = 'PhotoTooLargeError';
  }
}

/** Resizes and re-encodes `uri` as JPEG until it is ≤512 KB; throws `PhotoTooLargeError` if it never fits. */
export async function compressPhoto(uri: string, simulated: boolean): Promise<CapturedPhoto> {
  const loader = ImageManipulator.manipulate(uri);
  const original: ImageRef = await loader.renderAsync();
  loader.release();
  try {
    const landscape = original.width >= original.height;
    const longest = Math.max(original.width, original.height);
    for (const attempt of ATTEMPTS) {
      let context = ImageManipulator.manipulate(original);
      if (longest > attempt.side) context = context.resize(landscape ? { width: attempt.side } : { height: attempt.side });
      const image = await context.renderAsync();
      context.release();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: attempt.compress, base64: true });
      image.release();
      if (saved.base64 && decodedBytes(saved.base64) <= PHOTO_MAX_BYTES) return { uri: saved.uri, base64: saved.base64, simulated };
    }
  } finally {
    original.release();
  }
  throw new PhotoTooLargeError();
}

/**
 * Whether this device has a camera to launch. On the iOS simulator `launchCameraAsync` throws a native
 * NSInvalidArgumentException ('Source type 1 not available') that JS cannot catch, so it must never be called there.
 * Uses `expo-device`'s native `isDevice`; a build without that module (older dev build) is treated as no camera.
 */
export function cameraAvailable(): boolean {
  const device = requireOptionalNativeModule<{ isDevice?: boolean }>('ExpoDevice');
  return device?.isDevice === true;
}

/** Opens the in-app camera (back camera, photo only, no album, no editing) and compresses the shot. */
export async function capturePhoto(): Promise<CaptureResult> {
  if (!cameraAvailable()) return { kind: 'unavailable' };
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'denied', canAskAgain: permission.canAskAgain };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], cameraType: ImagePicker.CameraType.back, allowsEditing: false, quality: 0.9, exif: false, base64: false,
    });
  } catch {
    // Other camera failures that do reject in JS.
    return { kind: 'unavailable' };
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { kind: 'canceled' };
  return { kind: 'ok', photo: await compressPhoto(asset.uri, false) };
}

const demoArt = Object.values(placeArtImages);
let demoIndex = 0;

/** 模拟拍摄: a bundled place illustration processed like a camera shot, marked `simulated`. */
export async function demoPhoto(): Promise<CapturedPhoto> {
  const source = demoArt[demoIndex % demoArt.length];
  demoIndex += 1;
  const resolved = Image.resolveAssetSource(source);
  if (!resolved?.uri) throw new Error('演示照片暂不可用。');
  return compressPhoto(resolved.uri, true);
}
