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
  it('renders children untouched when the venue has not enabled in-person payments', async () => {
    mockVenue = { in_person_payments_enabled: false };
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.getByText('child')).toBeTruthy();
    expect(screen.queryByText('terminal-active')).toBeNull();
    expect(mockFetchConnectionToken).not.toHaveBeenCalled();
  });

  it('renders children untouched when there is no venue yet', async () => {
    mockVenue = null;
    await render(
      <TerminalProvider>
        <Text>child</Text>
      </TerminalProvider>,
    );
    expect(screen.queryByText('terminal-active')).toBeNull();
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
