/**
 * The "Tap to Pay on iPhone" introduction (Apple checklist 3.2 / 6.2, and the
 * Existing User Flow recording).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockCtx = {
  applies: true,
  isAdmin: true,
  supported: true as boolean | null,
  termsAccepted: false as boolean | null,
  preparing: false,
  progress: null as number | null,
  error: null as string | null,
  enable: jest.fn(),
  showEducation: jest.fn(),
  recordConnect: jest.fn(),
};
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => mockCtx }));

// The text-only version (before Apple's artwork is added); the artwork has its own suite.
jest.mock('@/lib/payments/tap-to-pay-marketing', () => ({ TAP_TO_PAY_SPLASH_ARTWORK: null }));

let mockLocked = false;
jest.mock('@/providers/AppLockProvider', () => ({ useAppLock: () => ({ isLocked: mockLocked }) }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

let mockSeen = false;
const mockMarkSeen = jest.fn(async () => {});
jest.mock('@/lib/payments/tap-to-pay-intro-store', () => ({
  hasSeenTapToPayIntro: jest.fn(async () => mockSeen),
  markTapToPayIntroSeen: (...a: unknown[]) => mockMarkSeen(...(a as [])),
}));

import { TapToPayIntroduction } from '@/components/payments/TapToPayIntroduction';

async function mount() {
  await render(<TapToPayIntroduction />);
  await act(async () => {});
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  Object.assign(mockCtx, {
    applies: true,
    isAdmin: true,
    supported: true,
    termsAccepted: false,
    preparing: false,
    progress: null,
  });
  mockCtx.enable.mockReset();
  mockCtx.enable.mockResolvedValue({ ok: true, error: null, acceptedTerms: true });
  mockCtx.showEducation.mockReset();
  mockCtx.showEducation.mockResolvedValue(true);
  mockLocked = false;
  mockSeen = false;
  mockMarkSeen.mockClear();
});

describe('TapToPayIntroduction', () => {
  it('introduces Tap to Pay on iPhone to an eligible user who has not seen it', async () => {
    await mount();

    expect(screen.getByText('Tap to Pay on iPhone')).toBeTruthy();
    expect(screen.getByText('Set up Tap to Pay on iPhone')).toBeTruthy();
    expect(screen.getByText('Learn more')).toBeTruthy();
  });

  it('is shown once: not again after it has been seen', async () => {
    mockSeen = true;
    await mount();

    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
  });

  it('is not shown where Tap to Pay on iPhone does not apply, or the iPhone cannot use it', async () => {
    mockCtx.applies = false;
    await mount();
    expect(screen.queryByText('Learn more')).toBeNull();

    mockCtx.applies = true;
    mockCtx.supported = false;
    await mount();
    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('never covers the Face ID lock screen', async () => {
    mockLocked = true;
    await mount();

    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('lets an admin accept the terms here, shows the education, then gets out of the way', async () => {
    await mount();

    await press('Set up Tap to Pay on iPhone');

    expect(mockCtx.enable).toHaveBeenCalled();
    expect(mockCtx.showEducation).toHaveBeenCalled();
    expect(mockMarkSeen).toHaveBeenCalledWith('user-1');
    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('shows the app’s own education in place when Apple’s is unavailable', async () => {
    mockCtx.showEducation.mockResolvedValue(false);
    await mount();

    await press('Set up Tap to Pay on iPhone');

    expect(screen.getByText('Apple Pay and other digital wallets')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('tells a non-admin to ask an admin instead of offering the terms', async () => {
    mockCtx.isAdmin = false;
    await mount();

    expect(screen.getByText(/Ask an admin at your venue to turn it on/)).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();

    await press('Got it');
    expect(mockMarkSeen).toHaveBeenCalled();
  });

  it('opens the merchant education from "Learn more"', async () => {
    await mount();

    await press('Learn more');

    expect(mockCtx.showEducation).toHaveBeenCalled();
  });

  it('remembers "Not now" so it does not come back', async () => {
    await mount();

    await press('Not now');

    expect(mockMarkSeen).toHaveBeenCalledWith('user-1');
    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('shows why turning it on failed, and stays open', async () => {
    mockCtx.enable.mockResolvedValue({ ok: false, error: 'Sign in with your Apple Account.' });
    await mount();

    await press('Set up Tap to Pay on iPhone');

    expect(screen.getByText('Sign in with your Apple Account.')).toBeTruthy();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});
