/**
 * TerminalProvider frictionless-off guarantee (Tap to Pay design doc §1.3/§3.2,
 * §11 "frictionless regression checks").
 *
 * A venue that has not enabled in-person payments must get children rendered
 * UNTOUCHED: no Terminal provider in the tree, no token minting, no network
 * calls. The same must hold when the Terminal SDK is missing from the build,
 * which is the state of every currently-shipped app binary.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockFetchConnectionToken = jest.fn(async () => ({ secret: 's', location_id: 'loc_1' }));
jest.mock('@/lib/payments/connection-token', () => ({
  fetchConnectionToken: () => mockFetchConnectionToken(),
  clearTerminalLocationCache: jest.fn(),
}));

let mockVenue: { in_person_payments_enabled?: boolean } | null = null;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue }),
}));
jest.mock('@/providers/LinkedVenueProvider', () => ({
  useLinkedVenueContext: () => ({ ownerVenueId: null }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

let mockSdk: { StripeTerminalProvider: unknown; useStripeTerminal: unknown } | null = null;
jest.mock('@/lib/payments/terminal-sdk', () => ({
  getTerminalSdk: () => mockSdk,
}));

let mockKey: string | null = 'pk_test_123';
jest.mock('@/lib/env', () => ({ getStripePublishableKey: () => mockKey }));

// Tap to Pay on iPhone has its own suite (TapToPayProvider.test.tsx); here it is
// a pass-through so this file stays about the frictionless-off guarantee.
jest.mock('@/providers/TapToPayProvider', () => ({
  TapToPayProvider: ({ children }: { children: unknown }) => children,
}));

import { TerminalProvider } from '@/providers/TerminalProvider';

/** Stand-in for the SDK provider that marks the tree when it renders. */
function makeSdk() {
  const React = require('react');
  return {
    StripeTerminalProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Text, null, 'terminal-active'),
        children,
      ),
    useStripeTerminal: () => ({}),
  };
}

beforeEach(() => {
  mockFetchConnectionToken.mockClear();
  mockSdk = makeSdk();
  mockKey = 'pk_test_123';
  mockVenue = null;
});

describe('frictionless off', () => {
  /**
   * The SDK provider mounts on the BUILD (see "turning in-person payments on or
   * off mid-session" below for why), so "off" is now a promise about behaviour:
   * no initialisation and no connection token, which is the network call.
   */
  it('never initialises or fetches a token for a venue that has not enabled it', async () => {
    mockVenue = { in_person_payments_enabled: false };
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.getByText('child')).toBeTruthy();
    expect(mockFetchConnectionToken).not.toHaveBeenCalled();
  });

  it('never initialises or fetches a token before there is a venue', async () => {
    mockVenue = null;
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.getByText('child')).toBeTruthy();
    expect(mockFetchConnectionToken).not.toHaveBeenCalled();
  });

  it('renders children untouched when the Terminal SDK is not in this build', async () => {
    mockVenue = { in_person_payments_enabled: true };
    mockSdk = null;
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.getByText('child')).toBeTruthy();
    expect(screen.queryByText('terminal-active')).toBeNull();
  });

  it('renders children untouched when no Stripe publishable key is configured', async () => {
    mockVenue = { in_person_payments_enabled: true };
    mockKey = null;
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.queryByText('terminal-active')).toBeNull();
  });
});

describe('enabled venue', () => {
  it('mounts the Terminal provider around children', async () => {
    mockVenue = { in_person_payments_enabled: true };
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.getByText('terminal-active')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('does not mint a connection token until the SDK asks for one', async () => {
    mockVenue = { in_person_payments_enabled: true };
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    // Token minting is lazy: the provider only supplies the callback.
    expect(mockFetchConnectionToken).not.toHaveBeenCalled();
  });
});

describe('turning in-person payments on or off mid-session', () => {
  /**
   * Found on device: toggling "Take card payments at your venue" in Settings
   * threw the screen back to the top. The provider was wrapping the app only
   * while the venue flag was on, so flipping the flag changed the tree's shape
   * and React rebuilt EVERYTHING beneath it — every screen, its scroll position
   * and its state.
   */
  it('keeps the app beneath it mounted when the venue flag flips', async () => {
    const React = require('react');
    const mounts = jest.fn();
    function Screen() {
      React.useEffect(() => {
        mounts();
      }, []);
      return <Text>screen</Text>;
    }

    mockVenue = { in_person_payments_enabled: false };
    const { rerender } = await render(
      <TerminalProvider>
        <Screen />
      </TerminalProvider>,
    );
    mockVenue = { in_person_payments_enabled: true };
    await rerender(
      <TerminalProvider>
        <Screen />
      </TerminalProvider>,
    );
    mockVenue = { in_person_payments_enabled: false };
    await rerender(
      <TerminalProvider>
        <Screen />
      </TerminalProvider>,
    );

    expect(mounts).toHaveBeenCalledTimes(1);
  });
});
