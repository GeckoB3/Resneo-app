/**
 * New booking inside a live collective keeps the venue's own booking types.
 *
 * The collective's profile answers with no enabled models (it is an
 * appointments business), so the screen used to show only Appointments: the
 * classes, events and resources the venue runs could not be booked from the
 * collective at all. The web keeps the venue's own tabs there
 * (`StaffSurfaceBookingStack`): appointments book for the collective, classes
 * and events list the venue's own plus the members' listed ones, and resources
 * stay the venue's own.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

let mockForm: Record<string, unknown> = {};
jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => mockForm,
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      name: 'Sept 19 Hair',
      booking_model: 'unified_scheduling',
      active_booking_models: [],
      enabled_models: ['class_session', 'event_ticket', 'resource_booking'],
    },
  }),
}));

// The resource flow reports the linked venue it sees, so the test can tell
// whether it runs for the collective or for the venue itself.
jest.mock('@/providers/LinkedVenueProvider', () => {
  const React = require('react');
  const Ctx = React.createContext({ ownerVenueId: 'collective-1', ownerVenueName: 'Sept 19 and Sept 20' });
  return {
    LinkedVenueContext: Ctx,
    useLinkedVenueContext: () => React.useContext(Ctx),
  };
});
jest.mock('@/components/booking-wizard/ServiceBookingFlow', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ServiceBookingFlow: () => React.createElement(Text, null, 'SERVICE FLOW') };
});
jest.mock('@/components/booking-wizard/ClassBookingFlow', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { useLinkedVenueContext } = require('@/providers/LinkedVenueProvider');
  return {
    ClassBookingFlow: () =>
      React.createElement(Text, null, `CLASS FLOW for ${useLinkedVenueContext().ownerVenueId ?? 'own'}`),
  };
});
jest.mock('@/components/booking-wizard/EventBookingFlow', () => ({ EventBookingFlow: () => null }));
jest.mock('@/components/booking-wizard/ResourceBookingFlow', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { useLinkedVenueContext } = require('@/providers/LinkedVenueProvider');
  return {
    ResourceBookingFlow: () =>
      React.createElement(Text, null, `RESOURCE FLOW for ${useLinkedVenueContext().ownerVenueId ?? 'own'}`),
  };
});

import NewBookingScreen from '@/app/(app)/booking/new';

const COLLECTIVE_FORM = {
  venueId: 'collective-1',
  venueName: 'Sept 19 and Sept 20',
  enabledModels: [],
  bookingModel: 'unified_scheduling',
  pricingTier: null,
  isCollective: true,
  isLoading: false,
  isForbidden: false,
  error: null,
};

beforeEach(() => {
  mockForm = { ...COLLECTIVE_FORM };
});

describe('New booking in a collective', () => {
  it("offers the venue's own classes, events and resources beside appointments", async () => {
    await render(<NewBookingScreen />);
    for (const label of ['Appointments', 'Classes', 'Events', 'Resources']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText('SERVICE FLOW')).toBeTruthy();
  });

  it('books classes through the collective, so listed ones book for it', async () => {
    await render(<NewBookingScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Classes'));
    });
    expect(screen.getByText('CLASS FLOW for collective-1')).toBeTruthy();
    expect(screen.getByText(/your own classes, and the ones other members list/)).toBeTruthy();
  });

  it('books resources with the venue itself, not the collective', async () => {
    await render(<NewBookingScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Resources'));
    });
    expect(screen.getByText('RESOURCE FLOW for own')).toBeTruthy();
    expect(screen.getByText('Resources are booked with Sept 19 Hair, not the collective.')).toBeTruthy();
  });

  it('leaves a partner venue on its own models', async () => {
    mockForm = { ...COLLECTIVE_FORM, isCollective: false, enabledModels: ['class_session'], bookingModel: 'class_session' };
    await render(<NewBookingScreen />);
    expect(screen.queryByLabelText('Resources')).toBeNull();
    expect(screen.queryByLabelText('Events')).toBeNull();
  });
});
