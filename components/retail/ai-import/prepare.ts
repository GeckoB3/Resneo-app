import { readFileBase64 } from '@/lib/services-setup/files';
import { planSlices, type ImagePainter } from '@/lib/services-setup/prepare-images';

/**
 * Photos and files for "Add products with AI", ready to send as data URLs in one JSON request each
 * (the web's `src/components/retail/ai-import/prepare-photos.ts`, number for number).
 *
 * The route takes JSON with base64 inside, a third larger than the bytes, and a request over about
 * 4.5 MB never reaches the server on Vercel, so each request aims under 4 million characters:
 *   - a photo is redrawn as JPEG with its long edge at most 2,048 px (the size the model reads at),
 *     and goes in a request of its own;
 *   - a picture much taller than it is wide (a long screenshot of a shop page) is cut into
 *     overlapping slices, read together, up to 8 to a request, so its text stays readable;
 *   - a file is sent as it is, and refused here when it is over 3 MB.
 *
 * The app's native build has no image library (no expo-image-manipulator), so the drawing is done
 * by the hidden WebView canvas the services set-up already uses
 * (`components/services-setup/ImagePainter.tsx`), with the same JPEG quality steps as the web.
 * Never throws.
 */

const MAX_EDGE = 2048;
/** All the base64 one request of photos carries, under Vercel's body limit with room for the JSON. */
export const MAX_REQUEST_BASE64_CHARS = 4_000_000;
/** The biggest file sent whole: 3 MB is about 4.2 MB as base64, still under the limit. */
export const MAX_FILE_MB = 3;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const TALL_ASPECT = 2.6;
const SENDABLE = /^image\/(jpeg|png|webp)$/;

export interface PickedPhoto {
  uri: string;
  /** "Photo 1": what the owner sees. */
  label: string;
  mimeType: string | null;
  width: number;
  height: number;
}

export interface PreparedPhoto {
  /** The photo's label, or "Photo 1 (part 1 of 2)" for a screenshot too long for one request. */
  label: string;
  /** One JPEG, or the slices of a long screenshot from top to bottom. */
  dataUrls: string[];
}

export type PhotoPreparation =
  | { ok: true; parts: PreparedPhoto[]; truncated: boolean }
  | { ok: false; reason: 'unreadable' | 'too_big' };

function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

/**
 * One photo in, one or more requests' worth out: a screenshot too long for one request becomes
 * "Photo 1 (part 1 of 2)" and so on, and `truncated` says it was longer still and was cut.
 */
export async function preparePhoto(photo: PickedPhoto, painter: ImagePainter | null): Promise<PhotoPreparation> {
  const b64 = await readFileBase64(photo.uri);
  if (!b64) return { ok: false, reason: 'unreadable' };
  const mime = photo.mimeType ?? 'image/jpeg';
  const bytes = base64Bytes(b64);
  const original = `data:${mime};base64,${b64}`;
  const asIs = (): PhotoPreparation =>
    SENDABLE.test(mime) && bytes <= MAX_FILE_BYTES
      ? { ok: true, parts: [{ label: photo.label, dataUrls: [original] }], truncated: false }
      : { ok: false, reason: SENDABLE.test(mime) ? 'too_big' : 'unreadable' };

  // Small, an ordinary shape and a type the reader takes: it goes as it is.
  const known = photo.width > 0 && photo.height > 0;
  if (known && SENDABLE.test(mime) && bytes <= MAX_FILE_BYTES && Math.max(photo.width, photo.height) <= MAX_EDGE && photo.height / photo.width <= TALL_ASPECT) {
    return asIs();
  }
  if (!painter) return asIs();

  let loaded: { handle: string; width: number; height: number } | null = null;
  try {
    loaded = await painter.load(original);
  } catch {
    loaded = null;
  }
  // A photo the canvas cannot draw is sent as it is only when the server can read it.
  if (!loaded || !(loaded.width > 0 && loaded.height > 0)) return asIs();
  const handle = loaded.handle;
  try {
    const tall = loaded.height / loaded.width > TALL_ASPECT;
    if (!tall && SENDABLE.test(mime) && bytes <= MAX_FILE_BYTES && Math.max(loaded.width, loaded.height) <= MAX_EDGE) return asIs();
    const { groups, truncated } = planSlices(loaded.width, loaded.height);
    const parts: PreparedPhoto[] = [];
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]!;
      // Each slice's share of the request, in bytes before base64.
      const budget = Math.floor((MAX_REQUEST_BASE64_CHARS * 3) / 4 / group.length) - 1024;
      const drawn = await painter.draw(handle, group, budget, MAX_EDGE);
      if (!drawn || drawn.length !== group.length) return { ok: false, reason: 'too_big' };
      parts.push({
        label: groups.length > 1 ? `${photo.label} (part ${g + 1} of ${groups.length})` : photo.label,
        dataUrls: drawn.map((d) => `data:image/jpeg;base64,${d}`),
      });
    }
    return { ok: true, parts, truncated };
  } catch {
    return { ok: false, reason: 'unreadable' };
  } finally {
    painter.release(handle);
  }
}

/** The file types the reader takes, by extension, with the type its data URL carries. */
export const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** What the document picker offers (some phones call a CSV by other names). */
export const PICKER_TYPES = [...Object.values(FILE_TYPES), 'text/comma-separated-values', 'application/csv'];

/** A picked file's extension for the reader, from its name (or its type when it has none), or null. */
export function fileExtension(name: string, mimeType: string | null | undefined): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (ext) return ext in FILE_TYPES ? ext : null;
  const t = (mimeType ?? '').toLowerCase();
  if (t === 'text/comma-separated-values' || t === 'application/csv') return 'csv';
  return Object.keys(FILE_TYPES).find((k) => FILE_TYPES[k] === t) ?? null;
}

export type FilePreparation =
  | { ok: true; file: { name: string; data_url: string } }
  | { ok: false; reason: 'type' | 'too_big' | 'unreadable' };

/**
 * A file sent whole (PDF, spreadsheet, Word), refused here when it is too big to arrive. Its name
 * keeps its extension, which the server reads a CSV by.
 */
export async function prepareFile(file: { uri: string; name: string; size: number | null; mimeType: string | null }): Promise<FilePreparation> {
  const ext = fileExtension(file.name, file.mimeType);
  if (!ext) return { ok: false, reason: 'type' };
  if (file.size !== null && file.size > MAX_FILE_BYTES) return { ok: false, reason: 'too_big' };
  const b64 = await readFileBase64(file.uri);
  if (!b64) return { ok: false, reason: 'unreadable' };
  if (base64Bytes(b64) > MAX_FILE_BYTES) return { ok: false, reason: 'too_big' };
  const base = file.name.trim() || 'Your file';
  const stem = base.toLowerCase().endsWith(`.${ext}`) ? base.slice(0, -(ext.length + 1)) : base;
  // The server keeps 200 characters of a name: the extension stays inside them.
  const name = `${stem.slice(0, 200 - ext.length - 1)}.${ext}`;
  return { ok: true, file: { name, data_url: `data:${FILE_TYPES[ext]};base64,${b64}` } };
}
