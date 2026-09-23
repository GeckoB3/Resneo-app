/**
 * Get a photo ready for the services setup reader (web `prepare-images.ts`, which does the same
 * in the browser with a canvas).
 *
 * @see _reference/Resneo/src/components/dashboard/appointment-services/services-setup/prepare-images.ts
 *
 * - Phone photos can be over the 4 MB the upload route accepts, so they are redrawn as JPEG with
 *   the long edge at most 2,048 px (the size the model reads at).
 * - A long scrolling screenshot of a booking page (1,080 x 9,000 px) would be squeezed until the
 *   text is unreadable, so a picture much taller than it is wide is cut into overlapping slices.
 *   The slices travel together and are read in one call, top to bottom, so a heading in one slice
 *   still applies to the services in the next.
 * - Anything that cannot be drawn is sent unchanged, and the server explains what to do with it.
 *
 * The app has no image library in its native build, so the drawing is done by a hidden WebView's
 * canvas (`components/services-setup/ImagePainter.tsx`), behind the `ImagePainter` interface here.
 * The planning is plain TypeScript, the same numbers as the web, and tested.
 */

import type { SetupFilePart } from './api';
import { readFileBase64, writeCacheBase64 } from './files';

export const MAX_EDGE = 2048;
/** Everything one photo sends, all slices together, stays under the route's 4 MB. */
export const TARGET_TOTAL_BYTES = 3.6 * 1024 * 1024;
/** The route's limit for one upload. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** A slice is at most this many widths tall; beyond it, text gets too small to read. */
const SLICE_ASPECT = 1.8;
const SLICE_OVERLAP = 0.15;
/** Cut only when the picture is clearly a long scroll, not an ordinary portrait photo. */
const TALL_ASPECT = 2.6;
/** Slices read together in one request (the route's limit), and the most one photo may make. */
export const SLICES_PER_PART = 8;
const MAX_SLICES = 32;

export interface SliceRegion {
  sy: number;
  sh: number;
}

/** Where to cut a picture of this size, grouped into requests, and whether it was cut short. */
export function planSlices(width: number, height: number): { groups: SliceRegion[][]; truncated: boolean } {
  const regions: SliceRegion[] = [];
  let truncated = false;
  if (width > 0 && height / width > TALL_ASPECT) {
    const sliceH = Math.round(width * SLICE_ASPECT);
    const step = Math.round(sliceH * (1 - SLICE_OVERLAP));
    for (let sy = 0; sy < height; sy += step) {
      if (regions.length >= MAX_SLICES) {
        truncated = true;
        break;
      }
      const sh = Math.min(sliceH, height - sy);
      regions.push({ sy, sh });
      if (sy + sh >= height) break;
    }
  } else {
    regions.push({ sy: 0, sh: height });
  }
  const groups: SliceRegion[][] = [];
  for (let i = 0; i < regions.length; i += SLICES_PER_PART) groups.push(regions.slice(i, i + SLICES_PER_PART));
  return { groups, truncated };
}

/** True when a picture can go as it is: small, not a long scroll, and a format the reader takes. */
export function sendsAsIs(img: { width: number; height: number; size: number | null; mimeType: string | null }): boolean {
  if (!(img.width > 0 && img.height > 0) || img.size === null) return false;
  const small = img.size <= TARGET_TOTAL_BYTES && Math.max(img.width, img.height) <= MAX_EDGE;
  const tall = img.height / img.width > TALL_ASPECT;
  return small && !tall && /^image\/(jpeg|png|webp)$/.test(img.mimeType ?? '');
}

/** Draws pictures for upload (the hidden WebView canvas). */
export interface ImagePainter {
  /** Decode a picture; answers its drawn size (EXIF rotation applied) and a handle for `draw`. */
  load(dataUrl: string): Promise<{ handle: string; width: number; height: number }>;
  /** JPEG base64 for each region, each at most `maxBytes`, or null when one could not be made small enough. */
  draw(handle: string, regions: SliceRegion[], maxBytes: number, maxEdge: number): Promise<string[] | null>;
  release(handle: string): void;
}

/** A picture the owner picked or pasted. `base64` is set for a pasted one, which has no file. */
export interface PickedImage {
  uri: string | null;
  name: string;
  mimeType: string | null;
  width: number;
  height: number;
  size: number | null;
  base64?: string;
}

export interface PreparedImage {
  /** The photo's own name, shown to the owner. */
  label: string;
  /** One file, or the slices of a long screenshot from top to bottom. */
  files: SetupFilePart[];
}

function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '') || 'photo';
}

function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

let fileSeq = 0;
function uniqueStem(name: string): string {
  fileSeq += 1;
  return `${Date.now().toString(36)}${fileSeq.toString(36)}-${baseName(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40)}`;
}

/** The picture exactly as picked (a pasted one is written to a file first), or null when it cannot be. */
async function asOriginal(img: PickedImage): Promise<SetupFilePart | null> {
  if (img.uri) {
    return { uri: img.uri, name: img.name, type: img.mimeType ?? 'image/jpeg', size: img.size ?? 0 };
  }
  if (!img.base64) return null;
  const type = img.mimeType ?? 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const uri = await writeCacheBase64(`${uniqueStem(img.name)}.${ext}`, img.base64);
  return uri ? { uri, name: `${baseName(img.name)}.${ext}`, type, size: base64Bytes(img.base64) } : null;
}

/**
 * One picture in, upload-ready JPEG(s) out, as one or more parts: a screenshot too long for one
 * request (over 8 slices) becomes "photo (part 1 of 2)" and so on, so nothing at the bottom is
 * dropped. `truncated` says the picture was longer still and was cut. Never throws; `parts` is
 * empty only when a pasted picture could not even be saved.
 */
export async function prepareImageForUpload(
  img: PickedImage,
  painter: ImagePainter | null,
): Promise<{ parts: PreparedImage[]; truncated: boolean }> {
  const label = img.name || 'Photo';
  const fallback = async () => {
    const original = await asOriginal(img);
    return { parts: original ? [{ label, files: [original] }] : [], truncated: false };
  };
  if (!painter || sendsAsIs(img)) return fallback();

  const b64 = img.base64 ?? (img.uri ? await readFileBase64(img.uri) : null);
  if (!b64) return fallback();
  let loaded: { handle: string; width: number; height: number };
  try {
    loaded = await painter.load(`data:${img.mimeType ?? 'image/jpeg'};base64,${b64}`);
  } catch {
    return fallback();
  }
  try {
    if (!(loaded.width > 0 && loaded.height > 0)) return fallback();
    const measured = { ...img, width: loaded.width, height: loaded.height };
    if (sendsAsIs(measured)) return fallback();

    const { groups, truncated } = planSlices(loaded.width, loaded.height);
    const total = groups.reduce((n, g) => n + g.length, 0);
    const parts: PreparedImage[] = [];
    let n = 0;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]!;
      const drawn = await painter.draw(loaded.handle, group, TARGET_TOTAL_BYTES / group.length, MAX_EDGE);
      if (!drawn || drawn.length !== group.length) return fallback();
      const files: SetupFilePart[] = [];
      for (const slice of drawn) {
        n++;
        const suffix = total > 1 ? `-part-${n}` : '';
        const name = `${baseName(img.name)}${suffix}.jpg`;
        const uri = await writeCacheBase64(`${uniqueStem(img.name)}${suffix}.jpg`, slice);
        if (!uri) return fallback();
        files.push({ uri, name, type: 'image/jpeg', size: base64Bytes(slice) });
      }
      parts.push({ label: groups.length > 1 ? `${label} (part ${g + 1} of ${groups.length})` : label, files });
    }
    return { parts, truncated };
  } finally {
    painter.release(loaded.handle);
  }
}
