import {
  GUEST_DOCUMENT_ALLOWED_MIME_TYPES,
  GUEST_DOCUMENT_MAX_BYTES,
  checkGuestDocument,
  documentKind,
  formatFileSize,
  resolveGuestDocumentMimeType,
} from '@/lib/guests/guest-document-limits';

describe('resolveGuestDocumentMimeType', () => {
  it('keeps a reported type that is on the allowlist', () => {
    expect(resolveGuestDocumentMimeType('image/jpeg', 'a.jpg')).toBe('image/jpeg');
    expect(resolveGuestDocumentMimeType('APPLICATION/PDF', 'a.pdf')).toBe('application/pdf');
  });

  it('falls back to the extension when the picker reports nothing or something generic', () => {
    expect(resolveGuestDocumentMimeType('', 'scan.HEIC')).toBe('image/heic');
    expect(resolveGuestDocumentMimeType(null, 'notes.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(resolveGuestDocumentMimeType('application/octet-stream', 'report.pdf')).toBe(
      'application/pdf',
    );
    expect(resolveGuestDocumentMimeType('image/unknown', 'photo.png')).toBe('image/png');
  });

  it('refuses types outside the allowlist, extension or not', () => {
    expect(resolveGuestDocumentMimeType('video/mp4', 'clip.mp4')).toBeNull();
    expect(resolveGuestDocumentMimeType('', 'archive.zip')).toBeNull();
    expect(resolveGuestDocumentMimeType('application/octet-stream', 'tool.exe')).toBeNull();
    // A reported non-image type never borrows an image extension's answer.
    expect(resolveGuestDocumentMimeType('text/plain', 'photo.jpg')).toBeNull();
  });

  it('the allowlist matches the bucket migration', () => {
    expect(GUEST_DOCUMENT_ALLOWED_MIME_TYPES).toHaveLength(11);
    expect(GUEST_DOCUMENT_ALLOWED_MIME_TYPES).toContain('image/heif');
    expect(GUEST_DOCUMENT_ALLOWED_MIME_TYPES).toContain('application/vnd.ms-excel');
  });
});

describe('checkGuestDocument', () => {
  it('accepts a file at the cap and refuses one byte over it', () => {
    expect(
      checkGuestDocument({ fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: GUEST_DOCUMENT_MAX_BYTES }),
    ).toMatchObject({ ok: true, mimeType: 'image/jpeg' });
    expect(
      checkGuestDocument({ fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: GUEST_DOCUMENT_MAX_BYTES + 1 }),
    ).toMatchObject({ ok: false, reason: 'size' });
  });

  it('refuses an empty file and an unknown type, each with a sentence', () => {
    expect(checkGuestDocument({ fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 0 })).toEqual({
      ok: false,
      reason: 'size',
      message: 'a.jpg is empty.',
    });
    expect(checkGuestDocument({ fileName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 100 })).toEqual({
      ok: false,
      reason: 'type',
      message: 'clip.mp4 is not a type we can store.',
    });
  });

  it('records the resolved type, not the reported one', () => {
    expect(
      checkGuestDocument({ fileName: 'scan.heic', mimeType: '', sizeBytes: 2048 }),
    ).toEqual({ ok: true, mimeType: 'image/heic' });
  });
});

describe('documentKind and formatFileSize', () => {
  it('sorts files into what the grid can show in place', () => {
    expect(documentKind('image/heic')).toBe('image');
    expect(documentKind('application/pdf')).toBe('pdf');
    expect(documentKind('application/msword')).toBe('other');
    expect(documentKind(null)).toBe('other');
  });

  it('formats sizes and answers null for an unknown size', () => {
    expect(formatFileSize(812)).toBe('812 B');
    expect(formatFileSize(48 * 1024)).toBe('48 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(-1)).toBeNull();
  });
});
