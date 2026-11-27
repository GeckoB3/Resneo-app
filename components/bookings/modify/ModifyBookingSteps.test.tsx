import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// The month grid is the wizard's own and has its own tests: stand it in with its Continue.
jest.mock('@/components/booking-wizard/MonthDatePicker', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    MonthDatePicker: ({ onContinue, availabilityHint }: { onContinue: () => void; availabilityHint: string }) =>
      React.createElement(
        Pressable,
        { onPress: onContinue, accessibilityLabel: 'Continue' },
        React.createElement(Text, null, availabilityHint),
      ),
  };
});

import type { ModifyBookingTarget } from '@/components/bookings/ModifyBookingSheet';
import {
  ModifyDateStep,
  ModifyTimeStep,
  ModifyVisitServiceStep,
  type ModifyDateStepProps,
  type ModifyTimeStepProps,
  type ModifyVisitServiceStepProps,
} from '@/components/bookings/modify/ModifyBookingSteps';
import type { AppointmentCatalogService } from '@/types/appointment-catalog';

const target = { id: 'b1', guestName: 'Sam', date: '2026-11-27', time: '10:00' } as ModifyBookingTarget;

const cut = { id: 's1', name: 'Cut', variants: [] } as unknown as AppointmentCatalogService;
const colour = {
  id: 's2',
  name: 'Colour',
  variants: [
    { id: 'v1', name: 'Short', duration_minutes: 60 },
    { id: 'v2', name: 'Long', duration_minutes: 90 },
  ],
} as unknown as AppointmentCatalogService;

describe('ModifyVisitServiceStep', () => {
  function props(extra: Partial<ModifyVisitServiceStepProps> = {}): ModifyVisitServiceStepProps {
    return {
      pickerServiceId: null,
      services: [cut, colour],
      pickerLineIndex: null,
      visitServiceOptions: [cut, colour],
      commitServicePick: jest.fn(),
      setPickerServiceId: jest.fn(),
      setPickerLineIndex: jest.fn(),
      setMode: jest.fn(),
      onClose: jest.fn(),
      ...extra,
    };
  }

  it('adds a service with no options straight away', async () => {
    const p = props();
    await render(<ModifyVisitServiceStep {...p} />);
    expect(screen.getByText('Add a service')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cut'));
    expect(p.commitServicePick).toHaveBeenCalledWith('s1', null);
  });

  it('asks for the option of a service that has them', async () => {
    const p = props();
    await render(<ModifyVisitServiceStep {...p} />);
    await fireEvent.press(screen.getByText('Colour'));
    expect(p.setPickerServiceId).toHaveBeenCalledWith('s2');
    expect(p.commitServicePick).not.toHaveBeenCalled();
  });

  it('commits the chosen option when changing a service', async () => {
    const p = props({ pickerServiceId: 's2', pickerLineIndex: 0 });
    await render(<ModifyVisitServiceStep {...p} />);
    expect(screen.getByText('Change service')).toBeTruthy();
    await fireEvent.press(screen.getByText('Long (90m)'));
    expect(p.commitServicePick).toHaveBeenCalledWith('s2', 'v2');
  });

  it('goes back to the form on Cancel', async () => {
    const p = props();
    await render(<ModifyVisitServiceStep {...p} />);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(p.setPickerLineIndex).toHaveBeenCalledWith(null);
    expect(p.setPickerServiceId).toHaveBeenCalledWith(null);
    expect(p.setMode).toHaveBeenCalledWith('form');
  });
});

describe('ModifyDateStep', () => {
  function props(extra: Partial<ModifyDateStepProps> = {}): ModifyDateStepProps {
    return {
      monthAnchor: '',
      target,
      setMonthAnchor: jest.fn(),
      today: '2026-11-27',
      date: '2026-11-27',
      setDate: jest.fn(),
      isVisit: false,
      availableDates: null,
      monthQuery: { isLoading: false },
      timeZone: 'Europe/London',
      setMode: jest.fn(),
      onClose: jest.fn(),
      ...extra,
    };
  }

  it('goes on to the time for one appointment', async () => {
    const p = props();
    await render(<ModifyDateStep {...p} />);
    expect(screen.getByText('Green dates can fit this appointment.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(p.setMode).toHaveBeenCalledWith('time');
  });

  it('goes back to the form for a visit', async () => {
    const p = props({ isVisit: true });
    await render(<ModifyDateStep {...p} />);
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(p.setMode).toHaveBeenCalledWith('form');
  });
});

describe('ModifyTimeStep', () => {
  function props(extra: Partial<ModifyTimeStepProps> = {}): ModifyTimeStepProps {
    return {
      date: '2026-11-27',
      effectiveDuration: 45,
      availability: { isLoading: false },
      slotPeriods: [
        {
          title: 'Morning',
          slots: [
            { practitioner_id: 'cal-1', start_time: '10:00:00' },
            { practitioner_id: 'cal-1', start_time: '10:30:00' },
          ] as ModifyTimeStepProps['slotPeriods'][number]['slots'],
        },
      ],
      target,
      originalTime: '10:00',
      selectedTime: '10:00',
      setMinutes: jest.fn(),
      setMode: jest.fn(),
      onClose: jest.fn(),
      ...extra,
    };
  }

  it('marks the current slot and takes a new one', async () => {
    const p = props();
    await render(<ModifyTimeStep {...p} />);
    expect(screen.getByText('10:00 · now')).toBeTruthy();
    await fireEvent.press(screen.getByText('10:30'));
    expect(p.setMinutes).toHaveBeenCalledWith(10 * 60 + 30);
    expect(p.setMode).toHaveBeenCalledWith('form');
  });

  it('says when the day has no free slots', async () => {
    await render(<ModifyTimeStep {...props({ slotPeriods: [] })} />);
    expect(screen.getByText(/No free slots on this day/)).toBeTruthy();
  });

  it('goes back to the date', async () => {
    const p = props();
    await render(<ModifyTimeStep {...p} />);
    await fireEvent.press(screen.getByText('Back'));
    expect(p.setMode).toHaveBeenCalledWith('date');
  });
});
