/**
 * New-booking screen — the bottom safe area is reserved ONCE.
 *
 * This screen used to add `insets.bottom` to the flow container on top of the
 * one `Screen` already reserves, on the mistaken reading that `Screen` "only
 * insets the top (edges={['top']})". That is true of the SafeAreaView EDGES;
 * the bottom strip comes from `Screen`'s separate `bottomInset` prop, which is
 * on by default. The result was a dead band of background under every wizard
 * step — reported from a device as a white bar covering "Continue" on the guest
 * details step, which is the longest step and the one with the least room to
 * spare.
 *
 * Pinned as a number rather than a snapshot so the intent is legible: whatever
 * padding is in effect at the foot of this screen, the indicator strip appears
 * in it exactly once.
 *
 * @see components/ui/Screen.test.tsx — the other half of the contract.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => mockInsets,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), setParams: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));

jest.mock('@/lib/analytics', () => ({ ANALYTICS_EVENTS: { createBookingStarted: 'x' }, track: jest.fn() }));

const mockForm = {
  venueId: 'venue_1',
  enabledModels: ['practitioner_appointment'],
  bookingModel: 'practitioner_appointment',
  pricingTier: 'appointments',
  isLoading: false,
  isError: false,
};
jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => mockForm,
}));

jest.mock('@/providers/LinkedVenueProvider', () => {
  const React = require('react');
  return {
    useLinkedVenueContext: () => ({ ownerVenueId: null, ownerVenueName: null }),
    LinkedVenueContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  };
});

// The flows own their own scrolling; here they only need to be findable.
jest.mock('@/components/booking-wizard/ServiceBookingFlow', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ServiceBookingFlow: () => React.createElement(Text, null, 'FLOW') };
});
jest.mock('@/components/booking-wizard/ClassBookingFlow', () => ({ ClassBookingFlow: () => null }));
jest.mock('@/components/booking-wizard/EventBookingFlow', () => ({ EventBookingFlow: () => null }));
jest.mock('@/components/booking-wizard/ResourceBookingFlow', () => ({ ResourceBookingFlow: () => null }));

import NewBookingScreen from '@/app/(app)/booking/new';
import { spacing } from '@/theme/index';

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

type TreeNode = { parent: TreeNode | null; props: { style?: unknown } };

/** Every bottom padding between the flow and the root, summed. */
function totalBottomPad(): number {
  let node = screen.getByText('FLOW') as unknown as TreeNode | null;
  let total = 0;
  for (let i = 0; node && i < 12; i += 1) {
    const pad = flatten(node.props?.style).paddingBottom;
    if (typeof pad === 'number') total += pad;
    node = node.parent;
  }
  return total;
}

describe('New booking screen — bottom safe area', () => {
  it('reserves the home-indicator strip exactly once', async () => {
    await render(<NewBookingScreen />);

    // Screen's own padding (`padded`) plus ONE indicator strip. The bug added a
    // second 34, which is what the device saw as a white bar under the step.
    expect(totalBottomPad()).toBe(spacing.base + mockInsets.bottom);
  });

  it('reserves nothing extra on a device with no home indicator', async () => {
    mockInsets.bottom = 0;
    try {
      await render(<NewBookingScreen />);
      expect(totalBottomPad()).toBe(spacing.base);
    } finally {
      mockInsets.bottom = 34;
    }
  });
});
