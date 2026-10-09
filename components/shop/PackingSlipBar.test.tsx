/**
 * The Orders list's select-mode bar (UX spec §8.6): "Print packing slips" fetches each ticked
 * order's slip PDF, opens the share sheet for the first, waits for "Share" for each after it, names
 * a slip that failed while still sharing the rest, and opens the web page on a server without the
 * PDF route.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }));
const mockDownload = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/lib/share/share-binary-file', () => ({
  downloadFileToCache: (args: unknown) => mockDownload(args),
  downloadAndShareFile: jest.fn(),
  shareCachedFile: (uri: string, opts: unknown) => mockShareFile(uri, opts),
}));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getApiUrl: () => 'https://api.example.test',
  getWebUrl: () => 'https://web.example.test',
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { PackingSlipBar } from './PackingSlipBar';

const three = [
  { id: 'o3', number: 20 },
  { id: 'o1', number: 12 },
  { id: 'o2', number: 15 },
];

function slipFor(url: string) {
  const id = /orders\/(\w+)\//.exec(url)?.[1];
  return `file:///cache/${id}.pdf`;
}

beforeEach(() => {
  mockDownload.mockReset();
  mockShareFile.mockReset();
  mockOpenBrowser.mockClear();
  mockToast.info.mockClear();
});

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

it('asks for orders until one is ticked', async () => {
  await render(<PackingSlipBar selected={[]} accessToken="token-A" />);
  expect(screen.getByText('Tap the orders you want packing slips for.')).toBeTruthy();
  await press('Print packing slips');
  expect(mockDownload).not.toHaveBeenCalled();
});

it('shares each slip in turn, in order number order', async () => {
  mockDownload.mockImplementation(async ({ url }: { url: string }) => ({ ok: true, uri: slipFor(url) }));
  mockShareFile.mockResolvedValue({ ok: true });
  await render(<PackingSlipBar selected={three} accessToken="token-A" />);
  expect(screen.getByText('3 selected')).toBeTruthy();
  await press('Print packing slips');

  const first = mockDownload.mock.calls[0]![0] as { url: string; headers: Record<string, string> };
  expect(first.url).toBe('https://api.example.test/api/venue/shop/orders/o1/packing-slip.pdf');
  expect(first.headers.Authorization).toBe('Bearer token-A');
  // The first sheet opens straight away; the next waits for "Share".
  expect(mockShareFile).toHaveBeenCalledTimes(1);
  expect(mockShareFile).toHaveBeenLastCalledWith('file:///cache/o1.pdf', { mimeType: 'application/pdf', dialogTitle: 'Print packing slips' });
  expect(screen.getByText('Packing slip 2 of 3: Order 15')).toBeTruthy();

  await press('Share');
  expect(mockShareFile).toHaveBeenLastCalledWith('file:///cache/o2.pdf', expect.anything());
  expect(screen.getByText('Packing slip 3 of 3: Order 20')).toBeTruthy();
  await press('Share');
  expect(mockShareFile).toHaveBeenCalledTimes(3);
  expect(screen.getByText('3 selected')).toBeTruthy();
});

it('names the slip that failed and still shares the rest', async () => {
  mockDownload.mockImplementation(async ({ url }: { url: string }) =>
    url.includes('/o2/') ? { ok: false, message: 'Download failed (500).', status: 500 } : { ok: true, uri: slipFor(url) },
  );
  mockShareFile.mockResolvedValue({ ok: true });
  await render(<PackingSlipBar selected={three} accessToken="token-A" />);
  await press('Print packing slips');
  expect(screen.getByText("We couldn't get the packing slip for Order 15. You can still share the others.")).toBeTruthy();
  // The message stays in view: nothing opens until "Share".
  expect(mockShareFile).not.toHaveBeenCalled();
  expect(screen.getByText('Packing slip 1 of 2: Order 12')).toBeTruthy();
  await press('Share');
  expect(mockShareFile).toHaveBeenLastCalledWith('file:///cache/o1.pdf', expect.anything());
  await press('Share');
  expect(mockShareFile).toHaveBeenLastCalledWith('file:///cache/o3.pdf', expect.anything());
});

it('stops part way when asked', async () => {
  mockDownload.mockImplementation(async ({ url }: { url: string }) => ({ ok: true, uri: slipFor(url) }));
  mockShareFile.mockResolvedValue({ ok: true });
  await render(<PackingSlipBar selected={three} accessToken="token-A" />);
  await press('Print packing slips');
  await press('Stop');
  expect(mockShareFile).toHaveBeenCalledTimes(1);
  expect(screen.getByText('3 selected')).toBeTruthy();
});

it('says so when every slip fails', async () => {
  mockDownload.mockResolvedValue({ ok: false, message: 'Network request failed' });
  await render(<PackingSlipBar selected={three} accessToken="token-A" />);
  await press('Print packing slips');
  expect(screen.getByText("We couldn't get the packing slips. Check your connection and try again.")).toBeTruthy();
  expect(mockShareFile).not.toHaveBeenCalled();
  expect(mockOpenBrowser).not.toHaveBeenCalled();
});

it('opens the web page when the server has no PDF route yet (every slip 404)', async () => {
  mockDownload.mockResolvedValue({ ok: false, message: 'Download failed (404).', status: 404 });
  await render(<PackingSlipBar selected={three} accessToken="token-A" />);
  await press('Print packing slips');
  expect(mockOpenBrowser).toHaveBeenCalledWith('https://web.example.test/dashboard/orders/packing-slips?ids=o1,o2,o3');
  expect(mockToast.info).toHaveBeenCalledWith('The packing slips open on the web, where you can print them.');
  expect(mockShareFile).not.toHaveBeenCalled();
});
