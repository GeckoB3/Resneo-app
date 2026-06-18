/**
 * Domain 11 (Services High): StaffServiceOverrideSheet field gating. Verifies
 * that ONLY the fields the admin permitted via `staff_may_customize_*` render,
 * that the calendar picker appears only with >1 managed calendar, and that Save
 * sends the diffed PATCH body (null-when-equals-base) to the override mutation.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// haptics are NOT mocked here — the global jest.setup mocks expo-haptics so the
// real lib/haptics (hapticTap on Button press) resolves cleanly.

const mockUpdateMutateAsync = jest.fn(() => Promise.resolve({ success: true }));
jest.mock('@/lib/queries/useUpdateServiceOverride', () => ({
  useUpdateServiceOverride: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
}));

import { StaffServiceOverrideSheet } from '@/components/manage/StaffServiceOverrideSheet';
import type { ManagedService } from '@/types/services-manage';

const BASE: ManagedService = {
  id: 'svc-1',
  name: 'Haircut',
  description: 'A trim',
  duration_minutes: 30,
  buffer_minutes: 10,
  price_pence: 2500,
  deposit_pence: 0,
  colour: '#3B82F6',
};

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => mockUpdateMutateAsync.mockClear());
// Each test mounts fresh; ensure no prior tree leaks into `screen`.
afterEach(cleanup);

describe('StaffServiceOverrideSheet field gating', () => {
  it('renders only the fields whose staff_may_customize_* flag is on', async () => {
    const service: ManagedService = {
      ...BASE,
      staff_may_customize_name: true,
      staff_may_customize_duration: true,
      // price + deposit + description + buffer + colour OFF
    };
    await render(
      <StaffServiceOverrideSheet
        visible
        onClose={jest.fn()}
        service={service}
        calendarChoices={[{ id: 'cal-1', name: 'Main' }]}
        selectedCalendarId="cal-1"
        onSelectCalendar={jest.fn()}
        link={null}
      />,
    );

    expect(screen.getByText('Display name')).toBeTruthy();
    expect(screen.getByText('Duration (mins)')).toBeTruthy();
    // Disallowed fields are absent.
    expect(screen.queryByText('Price (£)')).toBeNull();
    expect(screen.queryByText('Require deposit')).toBeNull();
    expect(screen.queryByText('Colour')).toBeNull();
  });

  it('hides the calendar picker with a single managed calendar', async () => {
    const service: ManagedService = { ...BASE, staff_may_customize_price: true };
    await render(
      <StaffServiceOverrideSheet
        visible
        onClose={jest.fn()}
        service={service}
        calendarChoices={[{ id: 'cal-1', name: 'Main' }]}
        selectedCalendarId="cal-1"
        onSelectCalendar={jest.fn()}
        link={null}
      />,
    );
    expect(screen.queryByText('Calendar')).toBeNull();
  });

  it('shows the calendar picker when the staff member manages several', async () => {
    const service: ManagedService = { ...BASE, staff_may_customize_price: true };
    await render(
      <StaffServiceOverrideSheet
        visible
        onClose={jest.fn()}
        service={service}
        calendarChoices={[
          { id: 'cal-1', name: 'Main' },
          { id: 'cal-2', name: 'Spa' },
        ]}
        selectedCalendarId="cal-1"
        onSelectCalendar={jest.fn()}
        link={null}
      />,
    );
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Spa')).toBeTruthy();
  });

  it('shows no override fields when none is customisable', async () => {
    await render(
      <StaffServiceOverrideSheet
        visible
        onClose={jest.fn()}
        service={BASE}
        calendarChoices={[{ id: 'cal-1', name: 'Main' }]}
        selectedCalendarId="cal-1"
        onSelectCalendar={jest.fn()}
        link={null}
      />,
    );
    // No permitted fields → the shell renders (Save button) but no editable field
    // labels do.
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.queryByText('Display name')).toBeNull();
    expect(screen.queryByText('Price (£)')).toBeNull();
    expect(screen.queryByText('Colour')).toBeNull();
  });

  it('Save sends a diffed PATCH (changed price only) and keeps unchanged fields null', async () => {
    const service: ManagedService = {
      ...BASE,
      staff_may_customize_name: true,
      staff_may_customize_price: true,
    };
    await render(
      <StaffServiceOverrideSheet
        visible
        onClose={jest.fn()}
        service={service}
        calendarChoices={[{ id: 'cal-1', name: 'Main' }]}
        selectedCalendarId="cal-1"
        onSelectCalendar={jest.fn()}
        link={null}
      />,
    );

    // Change only the price; leave the name at the venue default. The seed effect
    // sets "25.00" during the awaited render above.
    const priceField = screen.getByDisplayValue('25.00');
    await act(async () => {
      fireEvent.changeText(priceField, '40.00');
    });

    await press(() => screen.getByText('Save changes'));

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      service_id: 'svc-1',
      custom_name: null, // unchanged → cleared
      custom_price_pence: 4000, // changed → sent
    });
  });
});
