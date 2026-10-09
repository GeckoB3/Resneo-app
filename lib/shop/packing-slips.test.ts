/**
 * Packing slips for several orders (UX spec §8.6): the web's rules (not cancelled, at most 50),
 * each slip fetched from the single-order PDF route with the Bearer token, one failure not
 * stopping the rest, and every slip 404 meaning a server without the route.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
const mockDownload = jest.fn();
const mockDownloadAndShare = jest.fn();
jest.mock('@/lib/share/share-binary-file', () => ({
  downloadFileToCache: (args: unknown) => mockDownload(args),
  downloadAndShareFile: (args: unknown) => mockDownloadAndShare(args),
}));

import {
  canPrintPackingSlip,
  fetchPackingSlips,
  joinOrderNames,
  PACKING_SLIP_LIMIT,
  slipOrdersInPrintOrder,
  slipRouteMissing,
  webPackingSlipsUrl,
} from '@/lib/shop/packing-slips';

const pathFor = (id: string) => `/api/venue/shop/orders/${id}/packing-slip.pdf`;

beforeEach(() => {
  mockDownload.mockReset();
  mockDownloadAndShare.mockReset();
});

describe('which orders get a slip', () => {
  it('prints every order but a cancelled one, as the web does', () => {
    for (const s of ['new', 'preparing', 'ready', 'dispatched', 'collected', 'delivered']) {
      expect(canPrintPackingSlip({ fulfilment_status: s })).toBe(true);
    }
    expect(canPrintPackingSlip({ fulfilment_status: 'cancelled' })).toBe(false);
  });

  it('prints in order number order, at most 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `o${60 - i}`, number: 60 - i }));
    const out = slipOrdersInPrintOrder(many);
    expect(PACKING_SLIP_LIMIT).toBe(50);
    expect(out).toHaveLength(50);
    expect(out[0]).toEqual({ id: 'o1', number: 1 });
    expect(out[49]).toEqual({ id: 'o50', number: 50 });
  });
});

describe('the words and the web page', () => {
  it('joins order names the way a person would say them', () => {
    expect(joinOrderNames([])).toBe('');
    expect(joinOrderNames(['Order 12'])).toBe('Order 12');
    expect(joinOrderNames(['Order 12', 'Order 15'])).toBe('Order 12 and Order 15');
    expect(joinOrderNames(['Order 12', 'Order 15', 'Order 20'])).toBe('Order 12, Order 15 and Order 20');
  });

  it('builds the web bulk page with the ids', () => {
    expect(webPackingSlipsUrl('https://web.example.test', ['a', 'b'])).toBe('https://web.example.test/dashboard/orders/packing-slips?ids=a,b');
  });

  it('treats every slip 404 as a server without the PDF route, and nothing else', () => {
    expect(slipRouteMissing({ ready: [], failed: [{ id: 'a', number: 1, status: 404 }] })).toBe(true);
    expect(slipRouteMissing({ ready: [], failed: [{ id: 'a', number: 1, status: 404 }, { id: 'b', number: 2 }] })).toBe(false);
    expect(slipRouteMissing({ ready: [{ id: 'a', number: 1, uri: 'file:///a' }], failed: [{ id: 'b', number: 2, status: 404 }] })).toBe(false);
    expect(slipRouteMissing({ ready: [], failed: [] })).toBe(false);
  });
});

describe('fetching the slips', () => {
  const orders = [
    { id: 'o1', number: 12 },
    { id: 'o2', number: 15 },
    { id: 'o3', number: 20 },
  ];

  it('fetches each with the Bearer token and keeps going past a failure', async () => {
    mockDownload
      .mockResolvedValueOnce({ ok: true, uri: 'file:///cache/packing-slip-12.pdf' })
      .mockResolvedValueOnce({ ok: false, message: 'Download failed (500).', status: 500 })
      .mockResolvedValueOnce({ ok: true, uri: 'file:///cache/packing-slip-20.pdf' });
    const progress: number[] = [];
    const result = await fetchPackingSlips({
      orders,
      apiUrl: 'https://api.example.test',
      headers: { Authorization: 'Bearer token-A' },
      pathFor,
      onProgress: (current) => progress.push(current),
    });
    expect(mockDownload).toHaveBeenCalledTimes(3);
    expect(mockDownload.mock.calls[0]![0]).toEqual({
      url: 'https://api.example.test/api/venue/shop/orders/o1/packing-slip.pdf',
      filename: 'packing-slip-12.pdf',
      headers: { Authorization: 'Bearer token-A' },
    });
    expect(progress).toEqual([1, 2, 3]);
    expect(result.ready.map((r) => r.number)).toEqual([12, 20]);
    expect(result.failed).toEqual([{ id: 'o2', number: 15, status: 500 }]);
    expect(result.stopped).toBe(false);
  });

  it('stops before the next slip when asked', async () => {
    let stop = false;
    mockDownload.mockImplementation(async () => {
      stop = true;
      return { ok: true, uri: 'file:///cache/x.pdf' };
    });
    const result = await fetchPackingSlips({ orders, apiUrl: '', headers: {}, pathFor, shouldStop: () => stop });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(result.stopped).toBe(true);
  });
});
