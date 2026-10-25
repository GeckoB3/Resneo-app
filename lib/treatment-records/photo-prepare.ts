import { requireOptionalNativeModule } from 'expo';

import { photoMimeType } from '@/lib/treatment-records/draft';

/**
 * Treatment photos are shrunk on the phone before they upload, as the web does
 * (`src/lib/guests/downscale-image.ts`): the longer edge at most 2,000 px, saved as an 85% JPEG.
 * A phone photo of 2 to 8 MB lands at a few hundred KB, which is what storage and every thumbnail
 * load then pay for. Re-saving also drops the photo's location and other metadata, and turns a PNG
 * or HEIC into the JPEG the printed PDF embeds.
 *
 * The resizer (`expo-image-manipulator`) is a native module, so an installed build without it
 * uploads the photo as the picker gave it: the server still refuses anything over 10 MB.
 */
export const PHOTO_MAX_EDGE_PX = 2000;
export const PHOTO_JPEG_QUALITY = 0.85;
/** The web's limits (`src/lib/treatment-records/schemas.ts`), which the database also enforces. */
export const PHOTOS_MAX = 20;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** The picker's own JPEG quality: light when the resizer re-saves the photo, heavier when it can't. */
export function pickerQuality(): number {
  return canResizePhotos() ? 0.9 : 0.7;
}

export function canResizePhotos(): boolean {
  return requireOptionalNativeModule('ExpoImageManipulator') != null;
}

/** The size a `width`×`height` image lands at when its longer edge is capped. */
export function fitWithinMaxEdge(width: number, height: number, maxEdge = PHOTO_MAX_EDGE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface PreparedPhoto {
  uri: string;
  /** Null when the photo is in a format the server refuses (it was not re-saved). */
  mimeType: 'image/jpeg' | 'image/png' | null;
}

/** The file to upload. Never throws: any failure returns the picker's file as it was. */
export async function preparePhotoForUpload(asset: { uri: string; mimeType?: string | null }): Promise<PreparedPhoto> {
  const original: PreparedPhoto = { uri: asset.uri, mimeType: photoMimeType(asset.mimeType, asset.uri) };
  if (!canResizePhotos()) return original;
  try {
    // Loaded only here: requiring the package in a build without its native module throws.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    // Rendered once first, so the size is the decoded image's (turned upright), not the picker's.
    let image = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const fitted = fitWithinMaxEdge(image.width, image.height);
    if (fitted.width !== image.width || fitted.height !== image.height) {
      image = await ImageManipulator.manipulate(image).resize(fitted).renderAsync();
    }
    const saved = await image.saveAsync({ compress: PHOTO_JPEG_QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: 'image/jpeg' };
  } catch {
    return original;
  }
}
