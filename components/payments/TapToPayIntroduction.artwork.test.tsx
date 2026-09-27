/**
 * The introduction with Apple's artwork: the artwork carries the headline and
 * copy, and its own button ("Get started") is the real one.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/payments/tap-to-pay-marketing', () => ({
  TAP_TO_PAY_SPLASH_ARTWORK: {
    source: { uri: 'splash.jpg' },
    aspectRatio: 2160 / 3840,
    accessibilityLabel: 'Tap to Pay on iPhone. Your customer simply holds their device.',
    cta: { region: { left: 0.1, top: 0.82, width: 0.27, height: 0.06 }, label: 'Get started' },
  },
}));

const mockCtx = {
  applies: true,
  isAdmin: true,
  supported: true,
  termsAccepted: false as boolean | null,
  preparing: false,
  progress: null,
  error: null,
  enable: jest.fn(async () => ({ ok: true, error: null, acceptedTerms: true })),
  showEducation: jest.fn(async () => true),
  recordConnect: jest.fn(),
};
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => mockCtx }));
jest.mock('@/providers/AppLockProvider', () => ({ useAppLock: () => ({ isLocked: false }) }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/lib/payments/tap-to-pay-intro-store', () => ({
  hasSeenTapToPayIntro: jest.fn(async () => false),
  markTapToPayIntroSeen: jest.fn(async () => {}),
}));

import { TapToPayIntroduction } from '@/components/payments/TapToPayIntroduction';

async function mount() {
  await render(<TapToPayIntroduction />);
  await act(async () => {});
}

beforeEach(() => {
  mockCtx.termsAccepted = false;
  mockCtx.enable.mockClear();
  mockCtx.showEducation.mockClear();
});

it('lets the artwork speak for itself: no second headline or set-up button', async () => {
  await mount();

  expect(screen.queryByText('Tap to Pay on iPhone')).toBeNull();
  expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
  expect(screen.getByLabelText('Tap to Pay on iPhone. Your customer simply holds their device.')).toBeTruthy();
  // Learn more and Not now stay on offer beside the artwork's own button.
  expect(screen.getByText('Learn more')).toBeTruthy();
  expect(screen.getByText('Not now')).toBeTruthy();
});

it('sets Tap to Pay on iPhone up from the artwork’s "Get started" (terms, then education)', async () => {
  await mount();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Get started'));
  });

  expect(mockCtx.enable).toHaveBeenCalled();
  expect(mockCtx.showEducation).toHaveBeenCalled();
});

it('opens the education from "Get started" once it is already on', async () => {
  mockCtx.termsAccepted = true;
  await mount();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Get started'));
  });

  expect(mockCtx.enable).not.toHaveBeenCalled();
  expect(mockCtx.showEducation).toHaveBeenCalled();
  expect(screen.getByText('Got it')).toBeTruthy();
});
