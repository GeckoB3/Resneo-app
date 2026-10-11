/**
 * "Finish setting up Checkout" (design 6.6, drawn as B15 and C3; OB8): on Today and at the top of
 * Checkout settings, for admins while Checkout is on and a step that applies is left. The count and
 * the lines are the server's; each line opens its screen ("Take cards on your phone" opens "Get
 * this phone ready"); "Continue" opens the first screen neither done nor skipped; "Hide" is kept on
 * the server. Once it is gone, Checkout settings keeps "Run set-up again".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PosSetupCard } from '@/components/pos/setup/SetupCard';
import { setupStatus, setupSteps, setupVenue } from '@/lib/pos/setup/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: mockVenue }) }));
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole } } }) }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
let mockStatus: unknown = null;
const mockEnabled: (boolean | undefined)[] = [];
const mockHide = jest.fn();
jest.mock('@/lib/queries/usePosSetup', () => ({
  usePosSetupStatus: (options: { enabled?: boolean }) => {
    mockEnabled.push(options.enabled);
    return { data: options.enabled ? mockStatus : undefined };
  },
  useHideSetupCard: () => ({ mutate: mockHide, isPending: false }),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockHide.mockReset();
  mockToast.info.mockClear();
  mockToast.error.mockClear();
  mockEnabled.length = 0;
  mockRole = 'admin';
  mockVenue = setupVenue();
  mockStatus = setupStatus({
    steps: setupSteps({ cards: { state: 'done' }, tips: { state: 'skipped' }, details: { state: 'done' } }),
    next_screen: 'tips',
    answers: { cards: 'phone' },
  });
});

describe('PosSetupCard', () => {
  it("shows what is left with the server's count", async () => {
    await render(<PosSetupCard place="today" />);
    expect(screen.getByText('Finish setting up Checkout')).toBeTruthy();
    expect(screen.getByText('2 of 5 done')).toBeTruthy();
    expect(screen.getByText('Decide about tips')).toBeTruthy();
    // A step skipped in the wizard says so.
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getByText('Add your products')).toBeTruthy();
    expect(screen.getByText('Try a practice sale')).toBeTruthy();
    expect(screen.queryByText('Take cards on your phone')).toBeNull();
    expect(screen.queryByText('Choose what your team can do')).toBeNull();
  });

  it('opens each line and continues where the owner stopped', async () => {
    await render(<PosSetupCard place="today" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add your products'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/products');
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/tips');
  });

  it('opens "Get this phone ready" for taking cards on a phone', async () => {
    mockStatus = setupStatus({ answers: { cards: 'phone' } });
    await render(<PosSetupCard place="today" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Take cards on your phone'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/phone');
  });

  it('hides on the server, and says so', async () => {
    mockHide.mockImplementation((_v: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
    await render(<PosSetupCard place="today" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Hide'));
    });
    expect(mockHide).toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith('Hidden. You can finish setting up any time from Checkout settings.');
  });

  it('says so when it could not hide', async () => {
    mockHide.mockImplementation((_v: unknown, opts: { onError: () => void }) => opts.onError());
    await render(<PosSetupCard place="today" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Hide'));
    });
    expect(mockToast.error).toHaveBeenCalledWith("We couldn't hide this. Please try again.");
  });

  it('is gone once hidden or done; Checkout settings keeps "Run set-up again"', async () => {
    mockStatus = setupStatus({ show_card: false, card_hidden: true });
    await render(<PosSetupCard place="today" />);
    expect(screen.queryByText('Finish setting up Checkout')).toBeNull();
    expect(screen.queryByText('Run set-up again')).toBeNull();
    await render(<PosSetupCard place="hub" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Run set-up again'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/welcome');
  });

  it('asks nothing for a team member, or with Checkout off', async () => {
    mockRole = 'staff';
    mockVenue = setupVenue({ current_user_role: 'staff' });
    await render(<PosSetupCard place="today" />);
    expect(screen.queryByText('Finish setting up Checkout')).toBeNull();
    mockRole = 'admin';
    mockVenue = setupVenue({ feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } });
    await render(<PosSetupCard place="hub" />);
    expect(screen.queryByText('Finish setting up Checkout')).toBeNull();
    expect(screen.queryByText('Run set-up again')).toBeNull();
    expect(mockEnabled.every((e) => e === false)).toBe(true);
  });
});
