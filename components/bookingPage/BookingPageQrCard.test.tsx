/**
 * Render + interaction test for the booking-page QR card (audit 12, Medium).
 *
 * `react-native-qrcode-svg` renders through `react-native-svg`; we mock it so the
 * test doesn't drive the SVG renderer, and so we can feed a deterministic
 * `getRef().toDataURL(cb)` (the real capture API) into the Share handler. The
 * native share path (`expo-file-system/legacy` + `expo-sharing`) is mocked too —
 * the on-device behaviour itself still needs a real-device smoke test.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// --- QR component: capture the value + hand the share handler a fake SVG ref. -
const mockToDataURL = jest.fn((cb: (data: string) => void) => cb('BASE64PNGDATA'));
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, getRef }: { value: string; getRef?: (c: unknown) => void }) => {
      // Mirror the real component handing back an SVG ref with toDataURL.
      if (getRef) getRef({ toDataURL: mockToDataURL });
      return React.createElement(Text, { testID: 'qr-mock' }, value);
    },
  };
});

// --- Native share stack (dynamic require()d inside the component). -----------
const mockWriteAsStringAsync = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockShareAsync = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockIsAvailableAsync = jest.fn((..._a: unknown[]) => Promise.resolve(true));
jest.mock(
  'expo-file-system/legacy',
  () => ({
    cacheDirectory: 'file:///cache/',
    writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
    EncodingType: { Base64: 'base64' },
  }),
  { virtual: true },
);
jest.mock(
  'expo-sharing',
  () => ({
    isAvailableAsync: () => mockIsAvailableAsync(),
    shareAsync: (...args: unknown[]) => mockShareAsync(...args),
  }),
  { virtual: true },
);

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { BookingPageQrCard } from '@/components/bookingPage/BookingPageQrCard';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockToDataURL.mockClear();
  mockWriteAsStringAsync.mockClear();
  mockShareAsync.mockClear();
  mockIsAvailableAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.info.mockClear();
});

describe('BookingPageQrCard', () => {
  it('renders the QR for the booking URL plus the venue name and a share action', async () => {
    await render(
      <BookingPageQrCard
        url="https://app.example.com/book/plus-1"
        venueName="Plus One Salon"
        slug="plus-1"
      />,
    );

    // The (mocked) QR encodes the public booking URL.
    expect(screen.getByTestId('qr-mock').props.children).toBe('https://app.example.com/book/plus-1');
    expect(screen.getByText('Plus One Salon')).toBeTruthy();
    expect(screen.getByText('Share QR code')).toBeTruthy();
  });

  it('captures the SVG to a PNG and opens the native share sheet on Share', async () => {
    await render(
      <BookingPageQrCard
        url="https://app.example.com/book/plus-1"
        venueName="Plus One Salon"
        slug="plus-1"
      />,
    );

    await press(() => screen.getByText('Share QR code'));

    // Captured the rendered SVG → base64 PNG…
    expect(mockToDataURL).toHaveBeenCalledTimes(1);
    // …wrote it to a cache file as base64…
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    const [uri, data, opts] = mockWriteAsStringAsync.mock.calls[0] as [
      string,
      string,
      { encoding?: string },
    ];
    expect(uri).toBe('file:///cache/booking-qr-plus-1.png');
    expect(data).toBe('BASE64PNGDATA');
    expect(opts.encoding).toBe('base64');
    // …and handed the PNG to the OS share sheet.
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    const [shareUri, shareOpts] = mockShareAsync.mock.calls[0] as [string, Record<string, unknown>];
    expect(shareUri).toBe('file:///cache/booking-qr-plus-1.png');
    expect(shareOpts.mimeType).toBe('image/png');
  });
});
