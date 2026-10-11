/**
 * An extra's own settings screen while that extra is off (POS Part 5: admins switch the extras on
 * themselves). An admin is pointed at the Extras in Checkout settings, with a button to open it,
 * while ResNeo offers the extra; told it is paused by ResNeo, or that it isn't available yet,
 * otherwise; a team member is told an admin can switch it on. Nothing promises that support will
 * turn it on. The settings screens' gate shows it for each extra.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { SettingsScreen } from '@/components/pos/settings-more/parts';
import { ExtraOffState } from '@/components/pos/switches/ExtraOffState';
import { onResponse } from '@/lib/pos/switches/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: (options: { enabled?: boolean } = {}) => {
    mockEnabled.push(options.enabled);
    return { data: options.enabled === false ? undefined : mockSwitches, isLoading: mockLoading && options.enabled !== false };
  },
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' }, isLoading: false }) }));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => true }));
jest.mock('@/lib/pos/settings-more/hooks', () => ({
  usePosSettings: () => ({
    data: {
      settings: {},
      staff_capability_map: {},
      can: { is_admin: mockIsAdmin, manage_settings: true, edit_capabilities: mockIsAdmin },
      venue: { name: 'Bloom', currency: 'GBP', timezone: 'Europe/London' },
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const mockPush = jest.fn();
let mockSwitches: unknown;
let mockLoading = false;
let mockIsAdmin = true;
const mockEnabled: (boolean | undefined)[] = [];

async function show(isAdmin = true) {
  await render(<ExtraOffState extra="pos_loyalty_enabled" feature="Loyalty" isAdmin={isAdmin} venueName="Bloom" />);
}

beforeEach(() => {
  mockPush.mockReset();
  mockEnabled.length = 0;
  mockLoading = false;
  mockIsAdmin = true;
  mockSwitches = onResponse();
});

describe('ExtraOffState', () => {
  it('points an admin at the Extras in Checkout settings while ResNeo offers it', async () => {
    await show();
    expect(screen.getByText('Loyalty is switched off')).toBeTruthy();
    expect(screen.getByText('You can switch it on in Checkout settings, under Extras.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Open Checkout settings'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings');
  });

  it("says ResNeo paused it, with ResNeo's reason", async () => {
    mockSwitches = onResponse({
      switches: { pos_loyalty_enabled: { platform_state: 'blocked', public_reason: 'we are moving cards over', can_switch_on: false } },
    });
    await show();
    expect(screen.getByText('Paused by ResNeo')).toBeTruthy();
    expect(
      screen.getByText('ResNeo has paused it for your business: we are moving cards over. Contact ResNeo support if you have any questions.'),
    ).toBeTruthy();
    expect(screen.queryByText('Open Checkout settings')).toBeNull();
  });

  it("says it isn't available yet when not offered, promising nothing", async () => {
    mockSwitches = onResponse({ switches: { pos_loyalty_enabled: { offered: false, can_switch_on: false, unavailable_reason: 'not_offered' } } });
    await show();
    expect(screen.getByText("It isn't available for your business yet.")).toBeTruthy();
    expect(screen.queryByText(/turn it on for you/)).toBeNull();
    expect(screen.queryByText('Open Checkout settings')).toBeNull();
  });

  it("says it isn't available yet from a server without the switches", async () => {
    mockSwitches = undefined;
    await show();
    expect(screen.getByText("It isn't available for your business yet.")).toBeTruthy();
  });

  it('shows only the title while the switches are read', async () => {
    mockSwitches = undefined;
    mockLoading = true;
    await show();
    expect(screen.getByText('Loyalty is switched off')).toBeTruthy();
    expect(screen.queryByText("It isn't available for your business yet.")).toBeNull();
    expect(screen.queryByText('Open Checkout settings')).toBeNull();
  });

  it('tells a team member an admin can switch it on, and reads nothing', async () => {
    await show(false);
    expect(screen.getByText('An admin can switch it on in Checkout settings.')).toBeTruthy();
    expect(mockEnabled.every((e) => e === false)).toBe(true);
  });
});

describe("the settings screens' gate", () => {
  it('shows the extra off state for an extra switched off, for admins and team members', async () => {
    const gate = () => ({ featureOff: 'Online shop', extra: 'pos_online_shop_enabled' as const });
    mockSwitches = onResponse({ switches: { pos_online_shop_enabled: { offered: true, can_switch_on: true } } });
    await render(
      <SettingsScreen title="Online shop" gate={gate}>
        {() => <Text>settings body</Text>}
      </SettingsScreen>,
    );
    expect(screen.getByText('Online shop is switched off')).toBeTruthy();
    expect(screen.getByText('You can switch it on in Checkout settings, under Extras.')).toBeTruthy();
    expect(screen.queryByText('settings body')).toBeNull();

    mockIsAdmin = false;
    await render(
      <SettingsScreen title="Online shop" gate={gate}>
        {() => <Text>settings body</Text>}
      </SettingsScreen>,
    );
    expect(screen.getByText('An admin can switch it on in Checkout settings.')).toBeTruthy();
  });
});
