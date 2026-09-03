/**
 * Render + interaction test for the booking-page editor's NEW embed/QR/slug
 * surface (merged audit domains 12 + 14-embed).
 *
 * Scope: the additions this task owns — the "Embed on your website" card (iframe
 * snippet built from `getWebUrl()` + venue slug + accent, with a Copy button via
 * expo-clipboard), and that the inline slug field + QR card mount. The pure
 * snippet builder is unit-tested in `lib/embed/embedSnippet.test.ts`; the QR
 * capture/share in `components/bookingPage/BookingPageQrCard.test.tsx`.
 *
 * Heavy child sheets + the preview + QR card are stubbed so the screen renders
 * without driving image pickers / SVG. jest hoists mock factories, so closed-over
 * vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));

// Stub the public booking origin so the snippet is deterministic.
jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://app.example.com',
  isBackendConfigured: () => true,
}));

const mockSetStringAsync = jest.fn((..._a: unknown[]) => Promise.resolve(true));
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-image', () => ({ Image: () => null }));

// Stub the heavy children we don't exercise here.
jest.mock('@/components/bookingPage/BookingPagePreview', () => ({ BookingPagePreview: () => null }));
jest.mock('@/components/bookingPage/BookingPageQrCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { BookingPageQrCard: ({ url }: { url: string }) => React.createElement(Text, { testID: 'qr-card' }, url) };
});
jest.mock('@/components/bookingPage/CoverCropperSheet', () => ({ CoverCropperSheet: () => null }));
jest.mock('@/components/bookingPage/GalleryEditorSheet', () => ({ GalleryEditorSheet: () => null }));
jest.mock('@/components/bookingPage/LogoFramingSheet', () => ({ LogoFramingSheet: () => null }));
jest.mock('@/components/bookingPage/ServicePhotosSheet', () => ({ ServicePhotosSheet: () => null }));
jest.mock('@/components/bookingPage/TeamProfilesSheet', () => ({ TeamProfilesSheet: () => null }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockUpdateConfigAsync = jest.fn(() => Promise.resolve({}));
jest.mock('@/lib/queries/useBookingPage', () => ({
  useUpdateBookingPageConfig: () => ({ mutateAsync: mockUpdateConfigAsync, isPending: false }),
}));

const mockUpdateVenueAsync = jest.fn(() => Promise.resolve({}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenueAsync, isPending: false }),
}));

jest.mock('@/lib/queries/useVenueImageUpload', () => ({
  pickVenueImage: jest.fn(),
  useUploadVenueLogo: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUploadVenueCover: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// Slug availability — report the typed slug as free so the Save button enables.
const mockSlugAvail = { data: { available: true }, isFetching: false } as {
  data: { available: boolean } | undefined;
  isFetching: boolean;
};
// The editor reads the venue's categories to decide whether to offer the
// services-layout control (R23-3); this surface has none.
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: [], categories: [] } }),
}));
jest.mock('@/lib/queries/useSlugAvailable', () => ({
  useSlugAvailable: () => mockSlugAvail,
}));

let mockVenue: Record<string, unknown> | null;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, isLoading: false }),
}));

import BookingPageScreen from '@/app/(app)/manage/booking-page';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

async function changeText(node: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(node, value);
  });
}

beforeEach(() => {
  mockSetStringAsync.mockClear();
  mockUpdateVenueAsync.mockClear();
  mockUpdateConfigAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockSlugAvail.data = { available: true };
  mockSlugAvail.isFetching = false;
  mockVenue = {
    id: 'v1',
    name: 'Plus One Salon',
    slug: 'plus-1',
    current_user_role: 'admin',
    embed_accent_colour: null,
    booking_page_config: {},
  };
});

describe('Booking page — embed / QR / slug surface', () => {
  it('renders the embed snippet built from the web origin + venue slug, and the QR card', async () => {
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.getByText('Embed on your website')).toBeTruthy();
    // The iframe snippet is shown verbatim (built from getWebUrl + slug).
    expect(
      screen.getByText(/<iframe src="https:\/\/app\.example\.com\/embed\/plus-1"/),
    ).toBeTruthy();
    expect(screen.getByText(/embed\/resize\.js/)).toBeTruthy();
    // QR card mounted with the public booking URL.
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/plus-1');
  });

  it('copies the embed snippet to the clipboard on "Copy code"', async () => {
    await act(async () => {
      render(<BookingPageScreen />);
    });

    await press(() => screen.getByText('Copy code'));

    expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
    const copied = mockSetStringAsync.mock.calls[0][0] as string;
    expect(copied).toContain('<iframe src="https://app.example.com/embed/plus-1"');
    expect(copied).toContain('id="reserveni-widget"');
    expect(mockToast.success).toHaveBeenCalledWith('Embed code copied.');
  });

  it('PATCHes the slug via useUpdateVenue when a free address is saved', async () => {
    await act(async () => {
      render(<BookingPageScreen />);
    });

    // Type a new, available slug → the Save button appears and is enabled.
    await changeText(screen.getByDisplayValue('plus-1'), 'plus-one');
    await press(() => screen.getByText('Save web address'));

    expect(mockUpdateVenueAsync).toHaveBeenCalledWith({ slug: 'plus-one' });
  });
});
