/**
 * RescheduleSheet — the quick date/time/duration move behind booking detail's
 * "Reschedule" button.
 *
 * What is pinned here is the visit branch. A multi-service visit is N booking
 * rows, and this sheet used to PATCH the one it was opened on: moving it took
 * the visit's head away and left its tail behind, on a screen that gave no hint
 * the other services existed. A visit now goes through the visit endpoint, which
 * moves every service or none.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RescheduleSheet, type RescheduleTarget } from './RescheduleSheet';

/** Render Sheet children inline — avoids gesture-handler/Modal in the test env. */
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

/** Both OS pickers stand in as buttons that make one known change. */
jest.mock('@/components/ui/TimePickerField', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    TimePickerField: ({ onChange }: { onChange: (minutes: number) => void }) =>
      React.createElement(
        Pressable,
        { onPress: () => onChange(9 * 60 + 30) },
        React.createElement(Text, null, 'TIME_PICKER'),
      ),
  };
});

jest.mock('@/components/ui/DatePickerField', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    DatePickerField: ({ onChange }: { onChange: (date: string) => void }) =>
      React.createElement(
        Pressable,
        { onPress: () => onChange('2026-08-11') },
        React.createElement(Text, null, 'DATE_PICKER'),
      ),
  };
});

const mockReschedule = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useRescheduleBooking: () => ({ mutateAsync: mockReschedule, isPending: false }),
}));

const mockVisitSchedule = jest.fn();
jest.mock('@/lib/queries/useVisitMutations', () => ({
  useVisitSchedule: () => ({ mutateAsync: mockVisitSchedule, isPending: false }),
}));

jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: 'admin' } } }),
}));

const TARGET: RescheduleTarget = {
  id: 'bk-1',
  guestName: 'Alex Rivera',
  date: '2026-08-10',
  time: '14:00:00',
  durationMinutes: 60,
};

/** The same booking as one service of a three-service visit running 14:00–16:15. */
const VISIT_TARGET: RescheduleTarget = {
  ...TARGET,
  durationMinutes: 135,
  visit: {
    groupBookingId: 'grp-1',
    startHm: '14:00',
    endHm: '16:15',
    serviceCount: 3,
    serviceNames: ['Cut & Blow Dry', 'Olaplex Treatment', 'Toner'],
    leadBookingId: 'bk-lead',
    services: [
      { bookingId: 'bk-lead', startHm: '14:00', durationMinutes: 45 },
      { bookingId: 'bk-1', startHm: '14:45', durationMinutes: 60 },
      { bookingId: 'bk-3', startHm: '16:00', durationMinutes: 15 },
    ],
    spansDays: false,
  },
};

const onClose = jest.fn();

beforeEach(() => {
  mockReschedule.mockClear();
  mockReschedule.mockResolvedValue({});
  mockVisitSchedule.mockClear();
  mockVisitSchedule.mockResolvedValue({ ok: true, services: [{ id: 'bk-lead' }] });
  onClose.mockClear();
});

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

async function step(label: string, direction: 'increment' | 'decrement') {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'accessibilityAction', {
      nativeEvent: { actionName: direction },
    });
  });
}

describe('RescheduleSheet', () => {
  describe('an ordinary booking', () => {
    it('moves the one booking, as it always has', async () => {
      await render(<RescheduleSheet target={TARGET} onClose={onClose} />);
      await press('TIME_PICKER');
      await press('Confirm move');

      expect(mockVisitSchedule).not.toHaveBeenCalled();
      expect(mockReschedule).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-08-10', time: '09:30:00' }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('a multi-service visit', () => {
    it('says every service moves together, and names them', async () => {
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      expect(screen.getByText('Reschedule visit')).toBeTruthy();
      expect(
        screen.getByText('All 3 services move together: Cut & Blow Dry, Olaplex Treatment, Toner.'),
      ).toBeTruthy();
      expect(screen.getByText('Move whole visit')).toBeTruthy();
    });

    it('moves the whole visit through the visit endpoint', async () => {
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      await press('TIME_PICKER');
      await press('Move whole visit');

      // The PATCH that would have left services 2 and 3 behind.
      expect(mockReschedule).not.toHaveBeenCalled();
      expect(mockVisitSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          shift: { booking_date: '2026-08-10', booking_time: '09:30:00' },
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('carries the date as well as the time', async () => {
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      await press('DATE_PICKER');
      await press('Move whole visit');

      expect(mockVisitSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ shift: expect.objectContaining({ booking_date: '2026-08-11' }) }),
      );
    });

    it('puts an edited length on the last service, naming every row', async () => {
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      await step('Visit length', 'increment');
      await press('Move whole visit');

      const body = mockVisitSchedule.mock.calls[0][0];
      expect(body.shift).toBeUndefined();
      expect(body.known_booking_ids).toEqual(['bk-lead', 'bk-1', 'bk-3']);
      expect(body.services[2]).toEqual(
        expect.objectContaining({ booking_id: 'bk-3', booking_time: '16:00:00', duration_minutes: 16 }),
      );
    });

    it('leaves the length out when it did not change', async () => {
      // Naming the services would re-assert every row; a move stays a shift.
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      await press('TIME_PICKER');
      await press('Move whole visit');

      expect(mockVisitSchedule.mock.calls[0][0].services).toBeUndefined();
      expect(mockVisitSchedule.mock.calls[0][0].shift).toBeDefined();
    });

    it('floors the length at what the last service can give up', async () => {
      // A length change is the last service's alone (web #187): the 15-minute
      // toner can go down to 5, so the 135-minute visit floors at 125.
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      for (let i = 0; i < 130; i += 1) await step('Visit length', 'decrement');
      expect(screen.getByLabelText('Visit length').props.accessibilityValue?.text).toBe('2h 5m');
    });

    it('surfaces the endpoint’s refusal verbatim, naming the service that blocked it', async () => {
      const { ApiError } = require('@/lib/api/client');
      mockVisitSchedule.mockRejectedValue(
        new ApiError(
          'Toner cannot go to 11:45: Slot unavailable. The visit was not moved.',
          409,
          {},
        ),
      );
      await render(<RescheduleSheet target={VISIT_TARGET} onClose={onClose} />);
      await press('TIME_PICKER');
      await press('Move whole visit');

      expect(
        screen.getByText('Toner cannot go to 11:45: Slot unavailable. The visit was not moved.'),
      ).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
