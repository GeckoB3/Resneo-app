/**
 * The More tab's Checkout tile while Checkout is off (POS Part 5, C1): an admin of an offered venue
 * keeps the tile while the offer is available or paused, with "New" only while the door is open
 * (`feature_offers.pos_door`, the web's rule: offered, no sale yet, not hidden), so a venue that
 * switched Checkout off is not pitched again. A dismissal on the server, or "Hide this" on this
 * phone, takes "New" away at once. Team members, and an older server's admins, see no tile.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import MoreScreen from '@/app/(app)/(tabs)/settings';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/PlatformAnnouncementBanners', () => ({ PlatformAnnouncementBanners: () => null }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// Safe areas come from jest.setup.js's zero-inset mock.
jest.mock('@/components/more/MoreHero', () => ({ MoreHero: () => null }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('@/providers/AppLockProvider', () => ({
  useAppLock: () => ({ appLockEnabled: false, setAppLockEnabled: jest.fn(), supported: false }),
}));
jest.mock('@/lib/queries/useCollectives', () => ({ useCollectives: () => ({ data: { collectives: [] } }) }));
jest.mock('@/lib/queries/useOrders', () => ({ useOrdersTile: () => ({ enabled: false, newCount: null }) }));
jest.mock('@/lib/queries/usePos', () => ({ usePosBootstrap: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  usePosWayBack: () => ({ orders: false, ordersNewCount: null, salesHistory: false }),
}));
jest.mock('@/lib/queries/useNotifications', () => ({ useNotifications: () => ({ data: { unreadCount: 0 } }) }));
// One site: no site picker (web roles plan §6.2c has its own tests in settings.test.tsx).
jest.mock('@/lib/queries/useMeSites', () => ({ useMeSites: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', name: 'Sam', email: 'sam@example.com', role: mockRole } }, isLoading: false }),
}));
jest.mock('@/lib/queries/useBillingStatus', () => ({ useBillingStatus: () => ({ data: undefined }) }));
jest.mock('@/lib/queries/useVenueSettings', () => ({ useUpdateVenue: () => ({ mutateAsync: jest.fn() }) }));
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => ({ applies: false }) }));
jest.mock('@/lib/pos/switches/offer-dismissal', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/switches/offer-dismissal')>('@/lib/pos/switches/offer-dismissal'),
  useOfferHidden: () => mockHiddenHere,
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, name: 'Bloom', isLoading: false }),
}));

let mockRole: 'admin' | 'staff' = 'admin';
let mockHiddenHere = false;
let mockVenue: Record<string, unknown> = {};

function venue(offers?: Record<string, unknown>, dismissed?: string[]) {
  return {
    id: 'venue-1',
    pricing_tier: 'appointments',
    booking_model: 'unified_scheduling',
    active_booking_models: ['unified_scheduling'],
    enabled_models: [],
    feature_flags: { resolved: {}, raw: {} },
    ...(offers ? { feature_offers: offers } : {}),
    ...(dismissed ? { dismissed_prompts: dismissed } : {}),
  };
}

const AVAILABLE = { state: 'available', reason: null, public_reason: null };

beforeEach(() => {
  mockRole = 'admin';
  mockHiddenHere = false;
});

describe('the More tab Checkout tile while Checkout is off', () => {
  it('says "New" while the door is open', async () => {
    mockVenue = venue({ pos: AVAILABLE, pos_door: true }, []);
    await render(<MoreScreen />);
    expect(screen.getByLabelText('Checkout, New')).toBeTruthy();
  });

  it('keeps the tile without "New" at a venue that has used Checkout', async () => {
    mockVenue = venue({ pos: AVAILABLE, pos_door: false }, []);
    await render(<MoreScreen />);
    expect(screen.getByLabelText('Checkout')).toBeTruthy();
    expect(screen.queryByLabelText('Checkout, New')).toBeNull();
  });

  it('drops "New" once the admin hid the offer, on the server or on this phone', async () => {
    mockVenue = venue({ pos: AVAILABLE, pos_door: true }, ['pos_offer']);
    await render(<MoreScreen />);
    expect(screen.queryByLabelText('Checkout, New')).toBeNull();
    expect(screen.getByLabelText('Checkout')).toBeTruthy();

    mockVenue = venue({ pos: AVAILABLE, pos_door: true }, []);
    mockHiddenHere = true;
    await render(<MoreScreen />);
    expect(screen.queryByLabelText('Checkout, New')).toBeNull();
  });

  it('keeps the tile while ResNeo pauses Checkout, without "New"', async () => {
    mockVenue = venue({ pos: { state: 'paused', reason: 'blocked', public_reason: null }, pos_door: false });
    await render(<MoreScreen />);
    expect(screen.getByLabelText('Checkout')).toBeTruthy();
    expect(screen.getByText('Paused by ResNeo')).toBeTruthy();
  });

  it('shows no tile to a team member, nor to an older server, which sends no offer', async () => {
    mockRole = 'staff';
    mockVenue = venue({ pos: AVAILABLE, pos_door: true });
    await render(<MoreScreen />);
    expect(screen.queryByLabelText(/^Checkout/)).toBeNull();

    mockRole = 'admin';
    mockVenue = venue(undefined);
    await render(<MoreScreen />);
    expect(screen.queryByLabelText(/^Checkout/)).toBeNull();
  });
});
