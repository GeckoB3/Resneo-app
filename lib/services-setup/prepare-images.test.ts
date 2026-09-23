/**
 * Getting photos ready for the services setup reader (web `prepare-images.ts`): the same limits,
 * slice geometry and fall-backs, with the canvas behind a fake painter.
 */

import {
  MAX_EDGE,
  SLICES_PER_PART,
  TARGET_TOTAL_BYTES,
  planSlices,
  prepareImageForUpload,
  sendsAsIs,
  type ImagePainter,
  type PickedImage,
} from './prepare-images';

const mockWrites: { name: string; bytes: number }[] = [];
jest.mock('./files', () => ({
  readFileBase64: jest.fn(async () => 'AAAA'.repeat(1000)),
  writeCacheBase64: jest.fn(async (name: string, b64: string) => {
    mockWrites.push({ name, bytes: b64.length });
    return `file:///cache/${name}`;
  }),
}));

beforeEach(() => {
  mockWrites.length = 0;
});

describe('planSlices', () => {
  it('leaves an ordinary photo whole', () => {
    expect(planSlices(3000, 4000)).toEqual({ groups: [[{ sy: 0, sh: 4000 }]], truncated: false });
  });

  it('cuts a long screenshot into overlapping slices 1.8 widths tall', () => {
    const { groups, truncated } = planSlices(1000, 6000);
    expect(truncated).toBe(false);
    const regions = groups.flat();
    // 1,800 px tall slices, stepping 1,530 px (15% overlap), the last one short to the bottom.
    expect(regions.slice(0, 2)).toEqual([
      { sy: 0, sh: 1800 },
      { sy: 1530, sh: 1800 },
    ]);
    const last = regions[regions.length - 1]!;
    expect(last.sy + last.sh).toBe(6000);
  });

  it('sends more than 8 slices as parts, and stops at 32 with a note', () => {
    const long = planSlices(1000, 40000);
    expect(long.groups.every((g) => g.length <= SLICES_PER_PART)).toBe(true);
    expect(long.groups.flat().length).toBe(26);
    expect(long.truncated).toBe(false);
    const tooLong = planSlices(1000, 60000);
    expect(tooLong.groups.flat().length).toBe(32);
    expect(tooLong.truncated).toBe(true);
  });
});

describe('sendsAsIs', () => {
  it('sends a small, ordinary JPEG or PNG untouched', () => {
    expect(sendsAsIs({ width: 1080, height: 1920, size: 1_500_000, mimeType: 'image/png' })).toBe(true);
    // A tall phone screenshot is over the 2,048 px edge, so it is redrawn, as on the web.
    expect(sendsAsIs({ width: 1080, height: 2340, size: 1_500_000, mimeType: 'image/png' })).toBe(false);
    expect(sendsAsIs({ width: 1600, height: 1200, size: 800_000, mimeType: 'image/jpeg' })).toBe(true);
  });

  it('redraws a big photo, a long screenshot, an unknown size and other formats', () => {
    expect(sendsAsIs({ width: 4000, height: 3000, size: 900_000, mimeType: 'image/jpeg' })).toBe(false);
    expect(sendsAsIs({ width: 1000, height: 2000, size: TARGET_TOTAL_BYTES + 1, mimeType: 'image/jpeg' })).toBe(false);
    expect(sendsAsIs({ width: 1080, height: 9000, size: 900_000, mimeType: 'image/png' })).toBe(false);
    expect(sendsAsIs({ width: 1000, height: 1000, size: null, mimeType: 'image/jpeg' })).toBe(false);
    expect(sendsAsIs({ width: 1000, height: 1000, size: 1000, mimeType: 'image/heic' })).toBe(false);
  });
});

function fakePainter(size: { width: number; height: number }, opts: { failDraw?: boolean } = {}) {
  const calls: { regions: number; maxBytes: number; maxEdge: number }[] = [];
  const released: string[] = [];
  const painter: ImagePainter = {
    load: async () => ({ handle: 'h1', ...size }),
    draw: async (_handle, regions, maxBytes, maxEdge) => {
      calls.push({ regions: regions.length, maxBytes, maxEdge });
      return opts.failDraw ? null : regions.map(() => 'QUJD');
    },
    release: (h) => released.push(h),
  };
  return { painter, calls, released };
}

const photo = (over: Partial<PickedImage> = {}): PickedImage => ({
  uri: 'file:///picked/menu.jpg',
  name: 'menu.jpg',
  mimeType: 'image/jpeg',
  width: 4000,
  height: 3000,
  size: 5_000_000,
  ...over,
});

describe('prepareImageForUpload', () => {
  it('sends a small picture as it is, without the painter', async () => {
    const { painter, calls } = fakePainter({ width: 1000, height: 800 });
    const out = await prepareImageForUpload(photo({ width: 1000, height: 800, size: 200_000 }), painter);
    expect(calls).toHaveLength(0);
    expect(out).toEqual({
      parts: [{ label: 'menu.jpg', files: [{ uri: 'file:///picked/menu.jpg', name: 'menu.jpg', type: 'image/jpeg', size: 200_000 }] }],
      truncated: false,
    });
  });

  it('redraws a big photo as one JPEG at most 2,048 px, and lets the canvas go', async () => {
    const { painter, calls, released } = fakePainter({ width: 4000, height: 3000 });
    const out = await prepareImageForUpload(photo(), painter);
    expect(calls).toEqual([{ regions: 1, maxBytes: TARGET_TOTAL_BYTES, maxEdge: MAX_EDGE }]);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0]!.files[0]).toMatchObject({ name: 'menu.jpg', type: 'image/jpeg' });
    expect(released).toEqual(['h1']);
  });

  it('slices a long screenshot into parts named in order, sharing each part’s budget', async () => {
    const { painter, calls } = fakePainter({ width: 1000, height: 20000 });
    const out = await prepareImageForUpload(photo({ name: 'page.png', mimeType: 'image/png', width: 1000, height: 20000 }), painter);
    expect(out.parts.map((p) => p.label)).toEqual(['page.png (part 1 of 2)', 'page.png (part 2 of 2)']);
    expect(out.parts[0]!.files[0]!.name).toBe('page-part-1.jpg');
    expect(calls[0]).toMatchObject({ regions: 8, maxBytes: TARGET_TOTAL_BYTES / 8 });
  });

  it('sends the original when the canvas cannot make it small enough', async () => {
    const { painter } = fakePainter({ width: 4000, height: 3000 }, { failDraw: true });
    const out = await prepareImageForUpload(photo(), painter);
    expect(out.parts[0]!.files[0]!.uri).toBe('file:///picked/menu.jpg');
  });

  it('writes a pasted screenshot to a file before sending it', async () => {
    const out = await prepareImageForUpload(
      photo({ uri: null, base64: 'QUJD', name: 'Pasted screenshot', mimeType: 'image/png', width: 1080, height: 1920, size: 3 }),
      null,
    );
    expect(out.parts[0]!.files[0]).toMatchObject({ name: 'Pasted screenshot.png', type: 'image/png' });
    expect(mockWrites).toHaveLength(1);
  });
});
