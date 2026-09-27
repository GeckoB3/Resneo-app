/**
 * Settings → Tap to Pay on iPhone (Apple checklist 3.5, 3.6, 3.8, 3.8.1, 3.9,
 * 3.9.1, 4.2, 4.3).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

type Ctx = {
  applies: boolean;
  isAdmin: boolean;
  supported: boolean | null;
  updateRequired: boolean;
  termsAccepted: boolean | null;
  preparing: boolean;
  progress: number | null;
  error: string | null;
  enable: jest.Mock;
  showEducation: jest.Mock;
  recordConnect: jest.Mock;
};
const mockCtx: Ctx = {
  applies: true,
  isAdmin: true,
  supported: true,
  updateRequired: false,
  termsAccepted: false,
  preparing: false,
  progress: null,
  error: null,
  enable: jest.fn(),
  showEducation: jest.fn(),
  recordConnect: jest.fn(),
};
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => mockCtx }));

import { TapToPaySettings } from '@/components/payments/TapToPaySettings';

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  Object.assign(mockCtx, {
    isAdmin: true,
    supported: true,
    updateRequired: false,
    termsAccepted: false,
    preparing: false,
    progress: null,
    error: null,
  });
  mockCtx.enable.mockReset();
  mockCtx.enable.mockResolvedValue({ ok: true, error: null });
  mockCtx.showEducation.mockReset();
  mockCtx.showEducation.mockResolvedValue(true);
});

describe('TapToPaySettings', () => {
  it('offers an admin a clear action to turn it on (accepting Apple’s terms)', async () => {
    await render(<TapToPaySettings />);

    await press('Set up Tap to Pay on iPhone');

    expect(mockCtx.enable).toHaveBeenCalled();
  });

  it('tells anyone else to ask an admin, with no button', async () => {
    mockCtx.isAdmin = false;
    await render(<TapToPaySettings />);

    expect(screen.getByText(/Ask an admin to turn it on here/)).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
  });

  it('shows the configuration progress while it sets up', async () => {
    mockCtx.preparing = true;
    mockCtx.progress = 0.42;
    await render(<TapToPaySettings />);

    expect(screen.getByText('Getting Tap to Pay on iPhone ready: 42%')).toBeTruthy();
  });

  it('shows the education after the terms are accepted, then invites a first try', async () => {
    mockCtx.enable.mockImplementation(async () => {
      mockCtx.termsAccepted = true;
      return { ok: true, error: null, acceptedTerms: true };
    });
    await render(<TapToPaySettings />);

    await press('Set up Tap to Pay on iPhone');

    expect(mockCtx.showEducation).toHaveBeenCalled();
    expect(screen.getByText(/You're ready to try it/)).toBeTruthy();
  });

  it('falls back to the app’s own education when Apple’s is not available', async () => {
    mockCtx.termsAccepted = true;
    mockCtx.showEducation.mockResolvedValue(false);
    await render(<TapToPaySettings />);

    await press('How to use Tap to Pay on iPhone');

    expect(screen.getByText('Take a contactless card')).toBeTruthy();
    expect(screen.getByText("If a card can't be read")).toBeTruthy();
  });

  it('shows why turning it on failed', async () => {
    mockCtx.enable.mockResolvedValue({ ok: false, error: 'Sign in with your Apple Account.' });
    await render(<TapToPaySettings />);

    await press('Set up Tap to Pay on iPhone');

    expect(screen.getByText('Sign in with your Apple Account.')).toBeTruthy();
  });

  it('says so on an iPhone that cannot use it', async () => {
    mockCtx.supported = false;
    await render(<TapToPaySettings />);

    expect(screen.getByText(/needs an iPhone XS or later/)).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
  });

  it('tells the merchant to update iOS, instead of offering a set-up that cannot work (Apple 1.4)', async () => {
    mockCtx.updateRequired = true;
    mockCtx.supported = null;
    await render(<TapToPaySettings />);

    expect(screen.getByText(/needs a newer version of iOS/)).toBeTruthy();
    expect(screen.getByText(/Settings → General → Software Update/)).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
  });
});
