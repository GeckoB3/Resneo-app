/**
 * What a contact's Records section will accept: the same cap and allowlist the
 * web picker, the sign route and the storage bucket enforce (web 2026-09-05,
 * `src/lib/guests/guest-document-limits.ts`), so a refusal reads as a sentence
 * here instead of a failed request there.
 *
 * Why the limits exist: storage bills on bytes stored and bytes served, and the
 * thumbnail grid serves the original. Photos are re-encoded by the picker on the
 * way in, so 10 MB is ample for anything legitimate; the type list is an
 * allowlist because video, archives and executables are what would blow
 * through a quota. Keep both in step with the web module and the bucket.
 */

export const GUEST_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const GUEST_DOCUMENT_MAX_LABEL = '10 MB';

/** Mime types the bucket and the sign route accept. */
export const GUEST_DOCUMENT_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** For a picker that reports no type (Windows and HEIC), or a generic one. */
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * The mime type to record for a file: what the picker reported when it is on
 * the allowlist, else what the extension implies (a picker can report `''` for
 * HEIC, or `application/octet-stream` for anything unfamiliar). Null means the
 * file is not a type the Records section takes.
 */
export function resolveGuestDocumentMimeType(
  mimeType: string | null | undefined,
  fileName: string,
): string | null {
  const reported = (mimeType ?? '').trim().toLowerCase();
  if (reported && GUEST_DOCUMENT_ALLOWED_MIME_TYPES.includes(reported)) return reported;
  const byExtension = EXTENSION_TO_MIME[extensionOf(fileName)];
  if (
    byExtension &&
    (!reported || reported === 'application/octet-stream' || reported.startsWith('image/'))
  ) {
    return byExtension;
  }
  return null;
}

export type GuestDocumentCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: 'type' | 'size'; message: string };

/** One answer for the picker and the upload: accepted (with the mime to store), or why not. */
export function checkGuestDocument(input: {
  fileName: string;
  mimeType: string | null | undefined;
  sizeBytes: number;
}): GuestDocumentCheck {
  const mimeType = resolveGuestDocumentMimeType(input.mimeType, input.fileName);
  if (!mimeType) {
    return { ok: false, reason: 'type', message: `${input.fileName} is not a type we can store.` };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: 'size', message: `${input.fileName} is empty.` };
  }
  if (input.sizeBytes > GUEST_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: 'size',
      message: `${input.fileName} is larger than ${GUEST_DOCUMENT_MAX_LABEL}. Photos are resized automatically, so this is usually a PDF or scan that needs compressing first.`,
    };
  }
  return { ok: true, mimeType };
}

/** What the Records grid can show in place: photos as thumbnails, PDFs in a viewer. */
export type DocumentKind = 'image' | 'pdf' | 'other';

export function documentKind(mimeType: string | null | undefined): DocumentKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

/** "812 B", "48 KB", "1.2 MB"; null when the size is unknown. */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
