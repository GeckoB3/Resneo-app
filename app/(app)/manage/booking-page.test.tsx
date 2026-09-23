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
// The combined-page notice (R24-3) reads the venue's collectives. Most tests use a
// venue that books for itself (an empty list); the collective tests set one.
let mockCollectives: Record<string, unknown>[] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectives: () => ({ data: { collectives: mockCollectives }, isLoading: false }),
}));
// The combined scope's manager is exercised in its own tests.
jest.mock('@/components/linked/CombinedPageScopeContent', () => ({
  CombinedPageScopeContent: () => null,
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
  mockCollectives = [];
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

/** A live collective with plus-1 as its host, at the dedicated combined address. */
function liveCollective(over: Record<string, unknown> = {}) {
  return {
    id: 'col-1',
    name: 'Glow Collective',
    slug: 'glow',
    status: 'active',
    pageMode: 'unified_catalog',
    slugStrategy: 'dedicated',
    adoptedVenueId: null,
    isHost: true,
    hostVenueId: 'v1',
    myVenueId: 'v1',
    myMembershipStatus: 'active',
    activeMemberCount: 2,
    members: [
      { venueId: 'v1', venueName: 'Plus One Salon', venueSlug: 'plus-1' },
      { venueId: 'v2', venueName: 'Second Studio', venueSlug: 'second-studio' },
    ],
    ...over,
  };
}

describe('Booking page: the combined page’s embed and QR code (web 4a05756e)', () => {
  it('opens on the combined page with its own embed code and QR code, and no choice', async () => {
    mockCollectives = [liveCollective()];
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.getByText(/show the Glow Collective combined booking page/)).toBeTruthy();
    expect(screen.getByText(/<iframe src="https:\/\/app\.example\.com\/embed\/c\/glow"/)).toBeTruthy();
    expect(screen.queryByText('What to embed')).toBeNull();
    expect(screen.getByText(/Leave it empty to use the combined page’s own colour/)).toBeTruthy();
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/c/glow');

    await press(() => screen.getByText('Copy code'));
    expect(mockSetStringAsync.mock.calls[0][0]).toContain('/embed/c/glow');
  });

  it('gives a member venue the same embed and QR code as the host', async () => {
    mockCollectives = [liveCollective({ isHost: false, hostVenueId: 'v2' })];
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.getByText(/show the Glow Collective combined booking page/)).toBeTruthy();
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/c/glow');
  });

  it('points the QR code at an adopted member address, while the embed stays the collective’s', async () => {
    mockCollectives = [liveCollective({ slugStrategy: 'adopt_member', adoptedVenueId: 'v2' })];
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.getByText(/embed\/c\/glow/)).toBeTruthy();
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/second-studio');
  });

  it('carries the venue’s accent colour, one setting shared with its own widget', async () => {
    mockCollectives = [liveCollective()];
    mockVenue = { ...(mockVenue as Record<string, unknown>), embed_accent_colour: '4F46E5' };
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.getByText(/embed\/c\/glow\?accent=4f46e5/)).toBeTruthy();
  });

  it('offers the own page’s "What to embed" choice, and the QR code follows it', async () => {
    mockCollectives = [liveCollective()];
    await act(async () => {
      render(<BookingPageScreen />);
    });
    await press(() => screen.getByText('This venue’s own page'));

    expect(screen.getByText('What to embed')).toBeTruthy();
    expect(screen.getByText('This embeds only your own venue’s booking flow.')).toBeTruthy();
    expect(screen.getByText(/<iframe src="https:\/\/app\.example\.com\/embed\/plus-1"/)).toBeTruthy();
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/plus-1');

    await press(() => screen.getByLabelText('Venue collective: Glow Collective'));
    expect(screen.getByText('This embeds the combined collective booking page.')).toBeTruthy();
    expect(screen.getByText(/<iframe src="https:\/\/app\.example\.com\/embed\/c\/glow"/)).toBeTruthy();
    expect(screen.getByTestId('qr-card').props.children).toBe('https://app.example.com/book/c/glow');

    await press(() => screen.getByLabelText('My venue only (Plus One Salon)'));
    expect(screen.getByText(/embed\/plus-1"/)).toBeTruthy();
  });

  it('saves the accent, and the confirmation fades after 2.5 s as on the web', async () => {
    jest.useFakeTimers();
    try {
      mockCollectives = [liveCollective()];
      await act(async () => {
        render(<BookingPageScreen />);
      });
      // The combined scope has one colour field: the accent.
      await changeText(screen.getByPlaceholderText('#003b6f'), '#d0c0b0');
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(mockUpdateVenueAsync).toHaveBeenCalledWith({ embed_accent_colour: 'd0c0b0' });
      expect(screen.getByText('Accent colour saved.')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      expect(screen.queryByText('Accent colour saved.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows no embed for a combined page that is not live yet', async () => {
    // One active member: the screen books for itself, and no collective is offered.
    mockCollectives = [liveCollective({ activeMemberCount: 1 })];
    await act(async () => {
      render(<BookingPageScreen />);
    });

    expect(screen.queryByText('What to embed')).toBeNull();
    expect(screen.getByText(/embed\/plus-1"/)).toBeTruthy();
  });
});
