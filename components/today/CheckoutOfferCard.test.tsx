/**
 * The Checkout offer on Today (POS Part 5, design section 12, step 1): shown only while the door is
 * open (`feature_offers.pos_door`, the web's one rule: offered, the venue never made a sale, and
 * this admin has not hidden it), so a venue that used Checkout and switched it off is not pitched
 * again. "See how it works" opens the landing; "Hide this" is kept on the server and the card goes
 * at once. Nobody else sees it, nor does an older server's admin (no door).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CheckoutOfferCard } from '@/components/today/CheckoutOfferCard';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: mockVenue }) }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole } } }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/pos/switches/offer-dismissal', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/switches/offer-dismissal')>('@/lib/pos/switches/offer-dismissal'),
  useOfferHidden: (scope: string | null) => {
    mockScopes.push(scope);
    return mockHiddenHere;
  },
}));
jest.mock('@/lib/queries/useFeatureSwitches', () => ({ useHidePosOffer: () => ({ mutate: mockHide, isPending: false }) }));

const mockPush = jest.fn();
let mockVenue: Record<string, unknown> | null = null;
let mockRole = 'admin';
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
let mockHiddenHere = false;
const mockScopes: (string | null)[] = [];
const mockHide = jest.fn();

function venue(
  offers: Record<string, unknown> | undefined,
  extra: { resolved?: Record<string, boolean>; dismissed?: string[] } = {},
) {
  return {
    id: 'venue-1',
    feature_flags: { raw: {}, resolved: extra.resolved ?? {} },
    ...(offers ? { feature_offers: offers } : {}),
    ...(extra.dismissed ? { dismissed_prompts: extra.dismissed } : {}),
  };
}

const OFFERED = { pos: { state: 'available', reason: null, public_reason: null }, pos_door: true };

beforeEach(() => {
  mockPush.mockReset();
  mockHide.mockReset();
  mockToast.info.mockClear();
  mockToast.error.mockClear();
  mockScopes.length = 0;
  mockRole = 'admin';
  mockHiddenHere = false;
  mockVenue = venue(OFFERED, { dismissed: [] });
});

describe('CheckoutOfferCard', () => {
  it('offers Checkout to an admin while the door is open', async () => {
    await render(<CheckoutOfferCard />);
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Take payments on your phone and at your desk')).toBeTruthy();
    expect(screen.getByText(/Included in your plan\.$/)).toBeTruthy();
    expect(mockScopes).toContain('venue-1_staff-1');
  });

  it('opens the landing', async () => {
    await render(<CheckoutOfferCard />);
    await act(async () => {
      fireEvent.press(screen.getByText('See how it works'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout');
  });

  it('hides on the server and says where Checkout is', async () => {
    mockHide.mockImplementation((_vars: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
    await render(<CheckoutOfferCard />);
    await act(async () => {
      fireEvent.press(screen.getByText('Hide this'));
    });
    expect(mockHide).toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith('Hidden. You can find Checkout any time in More.');
  });

  it('says so when it could not hide', async () => {
    mockHide.mockImplementation((_vars: unknown, opts: { onError: () => void }) => opts.onError());
    await render(<CheckoutOfferCard />);
    await act(async () => {
      fireEvent.press(screen.getByText('Hide this'));
    });
    expect(mockToast.error).toHaveBeenCalledWith("We couldn't hide this. Please try again.");
  });

  it('is not shown to a venue that has used Checkout (the door is shut), though it is still offered', async () => {
    mockVenue = venue({ ...OFFERED, pos_door: false });
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();
  });

  it("goes once hidden: by the server's record, or at once on this phone", async () => {
    mockVenue = venue(OFFERED, { dismissed: ['pos_offer'] });
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();

    mockVenue = venue(OFFERED);
    mockHiddenHere = true;
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();
  });

  it('shows nothing to a team member, once Checkout is on, or from an older server (no door)', async () => {
    mockRole = 'staff';
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();
    expect(mockScopes.every((s) => s === null)).toBe(true);

    mockRole = 'admin';
    mockVenue = venue({ pos: { state: 'on', reason: null, public_reason: null }, pos_door: false }, { resolved: { pos_enabled: true } });
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();

    // An older server: an offer without a door, or nothing at all.
    mockVenue = venue({ pos: { state: 'available', reason: null, public_reason: null } });
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();
    mockVenue = venue(undefined);
    await render(<CheckoutOfferCard />);
    expect(screen.queryByText('See how it works')).toBeNull();
  });
});
