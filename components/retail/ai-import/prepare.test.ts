/**
 * Photos and files for the products reader, number for number the web's `prepare-photos.ts`: a
 * small photo goes as it is; a big one is redrawn as JPEG at 2,048 px or less within one request's
 * 4 million characters; a long screenshot is cut into slices, up to 8 to a request ("part 1 of 2");
 * a picture the canvas cannot draw goes as it is only when it still arrives; files are refused over
 * 3 MB and keep their extension. The canvas sits behind a fake painter.
 */
import type { ImagePainter, SliceRegion } from '@/lib/services-setup/prepare-images';

import { fileExtension, MAX_FILE_BYTES, MAX_REQUEST_BASE64_CHARS, prepareFile, preparePhoto } from './prepare';

let mockBase64: string | null = 'QUJD';
jest.mock('@/lib/services-setup/files', () => ({
  readFileBase64: jest.fn(async () => mockBase64),
}));

function fakePainter(size: { width: number; height: number }, opts: { fail?: boolean } = {}) {
  const calls: { regions: SliceRegion[]; maxBytes: number; maxEdge: number }[] = [];
  const released: string[] = [];
  const painter: ImagePainter = {
    load: async () => ({ handle: 'h1', ...size }),
    draw: async (_handle, regions, maxBytes, maxEdge) => {
      calls.push({ regions, maxBytes, maxEdge });
      return opts.fail ? null : regions.map((_, i) => `JPEG${i}`);
    },
    release: (h) => released.push(h),
  };
  return { painter, calls, released };
}

const photo = (over: Partial<Parameters<typeof preparePhoto>[0]> = {}) => ({
  uri: 'file:///p.jpg',
  label: 'Photo 1',
  mimeType: 'image/jpeg',
  width: 4000,
  height: 3000,
  ...over,
});

beforeEach(() => {
  mockBase64 = 'QUJD';
});

describe('preparePhoto', () => {
  it('sends a small photo as it is, without the canvas', async () => {
    const { painter, calls } = fakePainter({ width: 1000, height: 800 });
    const out = await preparePhoto(photo({ mimeType: 'image/png', width: 1000, height: 800 }), painter);
    expect(out).toEqual({ ok: true, parts: [{ label: 'Photo 1', dataUrls: ['data:image/png;base64,QUJD'] }], truncated: false });
    expect(calls).toHaveLength(0);
  });

  it('redraws a big photo as one JPEG in a request of its own, and lets the canvas go', async () => {
    mockBase64 = 'A'.repeat(5_000_000);
    const { painter, calls, released } = fakePainter({ width: 4000, height: 3000 });
    const out = await preparePhoto(photo(), painter);
    expect(out).toEqual({ ok: true, parts: [{ label: 'Photo 1', dataUrls: ['data:image/jpeg;base64,JPEG0'] }], truncated: false });
    expect(calls).toEqual([{ regions: [{ sy: 0, sh: 3000 }], maxBytes: Math.floor((MAX_REQUEST_BASE64_CHARS * 3) / 4) - 1024, maxEdge: 2048 }]);
    expect(released).toEqual(['h1']);
  });

  it('cuts a long screenshot into slices, up to 8 a request, each with its share', async () => {
    const { painter, calls } = fakePainter({ width: 1000, height: 20000 });
    const out = await preparePhoto(photo({ mimeType: 'image/png', width: 1000, height: 20000 }), painter);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.parts.map((p) => p.label)).toEqual(['Photo 1 (part 1 of 2)', 'Photo 1 (part 2 of 2)']);
    expect(out.parts[0]!.dataUrls).toHaveLength(8);
    expect(calls[0]!.maxBytes).toBe(Math.floor((MAX_REQUEST_BASE64_CHARS * 3) / 4 / 8) - 1024);
    // Every request stays under the body limit.
    for (const part of out.parts) expect(part.dataUrls.join('').length).toBeLessThan(MAX_REQUEST_BASE64_CHARS);
  });

  it('says a photo is too big when the canvas cannot fit it', async () => {
    mockBase64 = 'A'.repeat(5_000_000);
    const { painter } = fakePainter({ width: 4000, height: 3000 }, { fail: true });
    expect(await preparePhoto(photo(), painter)).toEqual({ ok: false, reason: 'too_big' });
  });

  it('sends the original without a canvas only when it still arrives', async () => {
    mockBase64 = 'A'.repeat(2_000_000);
    expect(await preparePhoto(photo(), null)).toEqual({
      ok: true,
      parts: [{ label: 'Photo 1', dataUrls: [`data:image/jpeg;base64,${'A'.repeat(2_000_000)}`] }],
      truncated: false,
    });
    mockBase64 = 'A'.repeat(6_000_000);
    expect(await preparePhoto(photo(), null)).toEqual({ ok: false, reason: 'too_big' });
    mockBase64 = 'QUJD';
    expect(await preparePhoto(photo({ mimeType: 'image/heic' }), null)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it("says when a photo can't be read", async () => {
    mockBase64 = null;
    expect(await preparePhoto(photo(), null)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('prepareFile', () => {
  it('takes a PDF, Excel, CSV or Word file by its name', () => {
    expect(fileExtension('Price list.PDF', null)).toBe('pdf');
    expect(fileExtension('stock.xlsx', 'application/octet-stream')).toBe('xlsx');
    expect(fileExtension('list.csv', 'text/comma-separated-values')).toBe('csv');
    expect(fileExtension('invoice.docx', null)).toBe('docx');
    expect(fileExtension('old.xls', 'application/vnd.ms-excel')).toBeNull();
    expect(fileExtension('photo.jpg', 'image/jpeg')).toBeNull();
    expect(fileExtension('noext', 'application/csv')).toBe('csv');
  });

  it('sends it as a data URL with its extension, or says why not', async () => {
    expect(await prepareFile({ uri: 'file:///l.pdf', name: 'list.pdf', size: 3, mimeType: 'application/pdf' })).toEqual({
      ok: true,
      file: { name: 'list.pdf', data_url: 'data:application/pdf;base64,QUJD' },
    });
    // A name with no extension gets one, so the server can tell a CSV.
    expect(await prepareFile({ uri: 'content://x', name: 'Price list', size: 3, mimeType: 'text/csv' })).toEqual({
      ok: true,
      file: { name: 'Price list.csv', data_url: 'data:text/csv;base64,QUJD' },
    });
    const long = await prepareFile({ uri: 'file:///x', name: `${'a'.repeat(300)}.xlsx`, size: 3, mimeType: null });
    expect(long.ok && long.file.name.endsWith('.xlsx') && long.file.name.length <= 200).toBe(true);
    expect(await prepareFile({ uri: 'file:///l.xls', name: 'list.xls', size: 3, mimeType: null })).toEqual({ ok: false, reason: 'type' });
    expect(await prepareFile({ uri: 'file:///big.pdf', name: 'big.pdf', size: MAX_FILE_BYTES + 1, mimeType: null })).toEqual({
      ok: false,
      reason: 'too_big',
    });
    mockBase64 = null;
    expect(await prepareFile({ uri: 'file:///x.pdf', name: 'x.pdf', size: 3, mimeType: null })).toEqual({ ok: false, reason: 'unreadable' });
  });
});
