/**
 * The booking sheet has NO pinned action bar (2026-09-10). It used to pin the
 * forward status action at the bottom, where it sat behind Android's
 * navigation bar, started only one row of a multi-service visit, and was not
 * visit-aware. The primary action now lives in the body's own actions card
 * (`BookingDetailContent`, alongside Take payment / Arrived / Confirm), which
 * hides it for a visit because every row of the visit carries its own.
 *
 * These tests pin that: no bar-level action, and the body not re-rendering
 * when the keyboard toggles (there is no keyboard subscription left to do so).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// The body is the expensive tree this change exists to protect. Counting its
// renders is the actual assertion.
const mockContentRender = jest.fn();
jest.mock('@/components/bookings/BookingDetailContent', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    BookingDetailContent: (props: Record<string, unknown>) => {
      mockContentRender(props);
      return React.createElement(Text, null, '__detail_body__');
    },
  };
});

jest.mock('@/components/bookings/sheet-scroll-context', () => ({
  useSheetKeyboardScroll: () => ({ onScroll: jest.fn(), spacerStyle: {} }),
}));

// "Pending" is the status whose primary action is plain "Accept"; "Booked"
// maps to Seat/Start, which the appointment branch relabels.
const mockBooking = {
  id: 'bk-1',
  status: 'Pending',
  booking_date: '2026-08-10',
  booking_time: '09:00',
  booking_model: 'unified_scheduling',
};
jest.mock('@/lib/queries/useBookingDetail', () => ({
  // The hook resolves to the booking itself, not a { booking } envelope.
  useBookingDetail: () => ({
    data: mockBooking,
    isLoading: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/lib/queries/useDashboardHome', () => ({
  useDashboardHome: () => ({ data: { pricing_tier: 'appointments', booking_model: 'unified_scheduling', enabled_models: [] } }),
}));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: 'admin' } } }),
}));
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useUpdateBookingStatus: () => ({ mutate: jest.fn(), isPending: false }),
  // Feeds the unpaid-promotion guard's "Send payment link" action.
  useSendDepositPaymentLinkById: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { pricing_tier: 'appointments', booking_model: 'unified_scheduling', enabled_models: [] } }),
}));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';

/**
 * Capture what the component subscribes, and fire it by hand. `Keyboard.emit`
 * is not exposed by the jest-expo mock, and going through the real emitter
 * would couple this suite to RN internals.
 */
type KeyboardEventName = 'keyboardDidShow' | 'keyboardDidHide';
const listeners: Record<KeyboardEventName, Set<() => void>> = {
  keyboardDidShow: new Set(),
  keyboardDidHide: new Set(),
};

beforeEach(() => {
  listeners.keyboardDidShow.clear();
  listeners.keyboardDidHide.clear();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((
    event: KeyboardEventName,
    callback: () => void,
  ) => {
    listeners[event]?.add(callback);
    return { remove: () => listeners[event]?.delete(callback) };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function emitKeyboard(event: KeyboardEventName) {
  await act(async () => {
    for (const callback of listeners[event]) callback();
  });
}

function renderSheet() {
  return render(<BookingDetailSheet bookingId="bk-1" onClose={jest.fn()} />);
}

/**
 * A linked venue's booking opens the same sheet and hands the grant to the
 * body, which decides what to offer (web: no actions bar on a view-only link).
 */
describe('BookingDetailSheet for a linked booking', () => {
  function renderLinked(act: 'none' | 'edit_existing' | 'create_edit_cancel') {
    return render(
      <BookingDetailSheet
        bookingId="bk-1"
        onClose={jest.fn()}
        linked={{ act, venueId: 'v1', venueName: 'light2', pii: true }}
      />,
    );
  }

  it('names the venue and hands the body the link, never a bar-level action', async () => {
    await act(async () => {
      renderLinked('none');
    });
    expect(screen.getByText('Linked · light2')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    const props = mockContentRender.mock.calls.at(-1)![0] as { linked?: { act: string }; showPrimaryAction?: boolean };
    expect(props.linked?.act).toBe('none');
    expect(props.showPrimaryAction).not.toBe(false);
  });
});

describe('BookingDetailSheet has no pinned action bar', () => {
  it('leaves the primary action to the body', async () => {
    await act(async () => {
      renderSheet();
    });
    // "Pending" would offer Accept as its primary action; the sheet itself draws none.
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText('__detail_body__')).toBeTruthy();
    const props = mockContentRender.mock.calls.at(-1)![0] as { showPrimaryAction?: boolean };
    expect(props.showPrimaryAction).not.toBe(false);
  });

  it('does NOT re-render the detail body when the keyboard toggles', async () => {
    await act(async () => {
      renderSheet();
    });
    mockContentRender.mockClear();

    await emitKeyboard('keyboardDidShow');
    await emitKeyboard('keyboardDidHide');
    await emitKeyboard('keyboardDidShow');
    await emitKeyboard('keyboardDidHide');

    expect(mockContentRender).not.toHaveBeenCalled();
  });
});
