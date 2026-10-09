/**
 * Report files download with the Bearer token, keep the server's filename and open the share
 * sheet; a refusal comes back with the server's own sentence (web `useCsvDownload`).
 */
const mockDownload = jest.fn();
const mockRead = jest.fn();
const mockMove = jest.fn(async () => undefined);
const mockDelete = jest.fn(async () => undefined);
const mockShare = jest.fn(async () => undefined);

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: (...args: unknown[]) => mockDownload(...args),
  readAsStringAsync: (...args: unknown[]) => mockRead(...args),
  moveAsync: (...args: unknown[]) => mockMove(...(args as [])),
  deleteAsync: (...args: unknown[]) => mockDelete(...(args as [])),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: (...args: unknown[]) => mockShare(...(args as [])),
}));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getApiUrl: () => 'https://api.test',
}));

import { downloadReportFile } from '@/lib/reports/pos-report-download';

beforeEach(() => jest.clearAllMocks());

it('downloads with Bearer, names the file as the server does and shares it', async () => {
  mockDownload.mockResolvedValue({
    status: 200,
    uri: 'file:///cache/report-1.download',
    headers: { 'content-disposition': 'attachment; filename="takings-by-method-2026-10-05-2026-10-11.csv"' },
  });
  const res = await downloadReportFile({
    path: '/api/venue/reports/takings?grain=day&preset=this-week&format=csv&card=by_method',
    accessToken: 'tok',
    fallbackFilename: 'report.csv',
    mimeType: 'text/csv',
  });
  expect(res).toEqual({ ok: true, filename: 'takings-by-method-2026-10-05-2026-10-11.csv' });
  const [url, , opts] = mockDownload.mock.calls[0] as [string, string, { headers: Record<string, string> }];
  expect(url).toBe('https://api.test/api/venue/reports/takings?grain=day&preset=this-week&format=csv&card=by_method');
  expect(opts.headers.Authorization).toBe('Bearer tok');
  expect(mockMove).toHaveBeenCalledWith({
    from: 'file:///cache/report-1.download',
    to: 'file:///cache/takings-by-method-2026-10-05-2026-10-11.csv',
  });
  expect(mockShare).toHaveBeenCalledWith('file:///cache/takings-by-method-2026-10-05-2026-10-11.csv', expect.objectContaining({ mimeType: 'text/csv' }));
});

it("returns the server's sentence when it refuses", async () => {
  mockDownload.mockResolvedValue({ status: 403, uri: 'file:///cache/report-2.download', headers: {} });
  mockRead.mockResolvedValue(JSON.stringify({ error: "You don't have permission to export at Studio.", code: 'POS_PERMISSION_DENIED' }));
  const res = await downloadReportFile({ path: '/x', accessToken: 'tok', fallbackFilename: 'r.csv', mimeType: 'text/csv' });
  expect(res).toEqual({ ok: false, message: "You don't have permission to export at Studio.", status: 403 });
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/report-2.download', { idempotent: true });
});

it('says nothing of its own when the request never arrived', async () => {
  mockDownload.mockRejectedValue(new Error('offline'));
  const res = await downloadReportFile({ path: '/x', accessToken: 'tok', fallbackFilename: 'r.csv', mimeType: 'text/csv' });
  expect(res).toEqual({ ok: false, message: null });
});
