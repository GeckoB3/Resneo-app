/**
 * The ResNeo marketplace card on Booking page (web `MarketplaceSection.tsx`): status, the switch,
 * what blocks listing with a way to fix each, up to three categories, the card preview, and the
 * read-only view staff get. jest hoists mock factories, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MarketplaceOwnerState } from '@/lib/marketplace/owner-state';

jest.mock('expo-image', () => ({ Image: 'Image' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockOpenBrowser = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a) }));
jest.mock('@/lib/env', () => ({ getWebUrl: () => 'https://web.example.com', isBackendConfigured: () => true }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockQuery: { data: MarketplaceOwnerState | undefined; isError: boolean };
const mockMutateAsync = jest.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve({}));
jest.mock('@/lib/queries/useMarketplace', () => ({
  useMarketplaceOwnerState: () => mockQuery,
  useUpdateMarketplace: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { MarketplaceSection } from '@/components/bookingPage/MarketplaceSection';

const OPTIONS = [
  { value: 'hair', label: 'Hair salons', examples: 'Cutting, colouring, styling, extensions' },
  { value: 'barber', label: 'Barbers', examples: 'Cuts, fades, beard trims' },
  { value: 'nails', label: 'Nail salons', examples: 'Manicures, pedicures' },
  { value: 'beauty', label: 'Beauty salons', examples: 'Facials, waxing' },
];

function ownerState(over: Partial<MarketplaceOwnerState> = {}): MarketplaceOwnerState {
  return {
    available: true,
    listed: true,
    categories: ['hair'],
    category_source: 'owner',
    showing: true,
    reasons: [],
    card: {
      listing_key: 'venue:v1',
      kind: 'venue',
      href: '/book/plus-1',
      name: 'Plus One Salon',
      categories: ['hair'],
      primary_category: 'hair',
      town: 'Belfast',
      about: null,
      has_bio: false,
      cover_photo_url: null,
      logo_url: null,
      models: ['appointments'],
      delivery: ['venue'],
      price_from_pence: 2500,
      currency: 'GBP',
    },
    collective: null,
    category_options: OPTIONS,
    ...over,
  };
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  mockQuery = { data: ownerState(), isError: false };
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({});
  mockPush.mockClear();
  mockOpenBrowser.mockClear();
  mockToast.success.mockClear();
});

describe('MarketplaceSection', () => {
  it('hides itself until the marketplace is available, and when the read fails', async () => {
    mockQuery = { data: ownerState({ available: false }), isError: false };
    await render(<MarketplaceSection isAdmin />);
    expect(screen.queryByTestId('marketplace-section')).toBeNull();

    mockQuery = { data: undefined, isError: true };
    await render(<MarketplaceSection isAdmin />);
    expect(screen.queryByTestId('marketplace-section')).toBeNull();
  });

  it('shows the status, the categories and the card preview', async () => {
    await render(<MarketplaceSection isAdmin />);
    expect(screen.getByText('Showing on the marketplace')).toBeTruthy();
    expect(screen.getByText('Show my business on the ResNeo marketplace')).toBeTruthy();
    expect(screen.getByText('Your categories')).toBeTruthy();
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByTestId('marketplace-preview')).toBeTruthy();
    expect(screen.getByText('Hair salon · Belfast')).toBeTruthy();
    expect(screen.getByText('From £25')).toBeTruthy();
  });

  it('switches the listing off and says so', async () => {
    await render(<MarketplaceSection isAdmin />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Show my business on the ResNeo marketplace'), 'valueChange', false);
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({ listed: false });
    expect(mockToast.success).toHaveBeenCalledWith('Your marketplace listing is switched off.');
  });

  it('lists what stops it showing, with a way to fix each in the app', async () => {
    mockQuery = {
      data: ownerState({
        showing: false,
        reasons: [
          { code: 'opted_out', text: 'You have switched your listing off.', fix_href: null },
          { code: 'no_town', text: 'Add your town to your business address.', fix_href: '/dashboard/settings?tab=profile' },
          { code: 'onboarding_incomplete', text: 'Finish setting up your account.', fix_href: '/onboarding' },
        ],
      }),
      isError: false,
    };
    await render(<MarketplaceSection isAdmin />);
    expect(screen.getByText('Not showing yet')).toBeTruthy();
    expect(screen.getByText('To appear on the marketplace:')).toBeTruthy();
    expect(screen.queryByText(/You have switched your listing off/)).toBeNull();

    const links = screen.getAllByText('Go there');
    await press(links[0]!);
    expect(mockPush).toHaveBeenCalledWith('/manage/venue-profile');
    await press(links[1]!);
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://web.example.com/onboarding');
  });

  it('asks the owner to confirm suggested categories, or change them', async () => {
    mockQuery = { data: ownerState({ category_source: 'suggested', categories: ['hair', 'nails'] }), isError: false };
    await render(<MarketplaceSection isAdmin />);
    expect(screen.getByTestId('marketplace-suggested')).toBeTruthy();
    expect(screen.queryByText('Your categories')).toBeNull();

    await press(screen.getByText('Yes, that is right'));
    expect(mockMutateAsync).toHaveBeenCalledWith({ categories: ['hair', 'nails'] });
    expect(mockToast.success).toHaveBeenCalledWith('Your marketplace categories are confirmed.');

    await press(screen.getByText('Change'));
    expect(screen.getByText('Your categories')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('allows three categories, a new main one, and saves them in order', async () => {
    await render(<MarketplaceSection isAdmin />);
    await press(screen.getByLabelText('Barbers'));
    await press(screen.getByLabelText('Nail salons'));
    // A fourth is refused while three are ticked.
    expect(screen.getByLabelText('Beauty salons').props.accessibilityState).toMatchObject({ disabled: true });
    await press(screen.getByLabelText('Make Nail salons your main category'));
    await press(screen.getByText('Save categories'));
    expect(mockMutateAsync).toHaveBeenCalledWith({ categories: ['nails', 'hair', 'barber'] });
    expect(mockToast.success).toHaveBeenCalledWith('Your marketplace categories are saved.');
  });

  it('shows the server’s refusal inline', async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    mockMutateAsync.mockRejectedValue(new ApiError('Only an admin can change the marketplace listing.', 403));
    await render(<MarketplaceSection isAdmin />);
    await press(screen.getByText('Save categories'));
    expect(screen.getByText('Only an admin can change the marketplace listing.')).toBeTruthy();
  });

  it('is read only for staff', async () => {
    mockQuery = { data: ownerState({ category_source: 'suggested', categories: ['hair'] }), isError: false };
    await render(<MarketplaceSection isAdmin={false} />);
    expect(screen.getByLabelText('Show my business on the ResNeo marketplace').props.disabled).toBe(true);
    expect(screen.queryByText('Yes, that is right')).toBeNull();
    expect(screen.queryByText('Save categories')).toBeNull();
  });

  it('names the collective that lists the appointments', async () => {
    mockQuery = {
      data: ownerState({ collective: { public_name: 'Glow', public_path: '/book/glow', is_host: false } }),
      isError: false,
    };
    await render(<MarketplaceSection isAdmin />);
    expect(
      screen.getByText('Your appointments are listed through Glow. Its listing is managed by the host venue.'),
    ).toBeTruthy();
  });
});
