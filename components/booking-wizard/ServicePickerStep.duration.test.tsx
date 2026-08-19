/**
 * Staff custom duration — reported from a device: picking a custom duration next
 * to a service is ignored and the service books at its default length.
 *
 * This drives the real interaction end to end at this step: open the duration
 * pill, choose a preset, close the sheet, tap the service row, and assert the
 * duration that reaches `onSelect`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render the Sheet's children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import { ServicePickerStep } from '@/components/booking-wizard/ServicePickerStep';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

/** One practitioner offering one 60-minute service, so no practitioner step. */
const catalog = {
  practitioners: [
    {
      id: 'prac_1',
      name: 'Alex',
      services: [
        {
          id: 'svc_1',
          name: 'Cut & finish',
          duration_minutes: 60,
          price_pence: 3000,
        },
      ],
    },
  ],
} as unknown as AppointmentCatalogResponse;

const baseProps = {
  catalog,
  isLoading: false,
  isError: false,
  onSelect: jest.fn(),
};

beforeEach(() => {
  baseProps.onSelect.mockReset();
});

describe('ServicePickerStep — staff custom duration', () => {
  it('carries the chosen duration into onSelect', async () => {
    await render(<ServicePickerStep {...baseProps} />);

    // The pill shows the service's natural duration to begin with.
    await press(() => screen.getByLabelText('Duration, 60 minutes'));
    await press(() => screen.getByText('90m'));
    await press(() => screen.getByText('Done'));

    await press(() => screen.getByText('Cut & finish'));

    expect(baseProps.onSelect).toHaveBeenCalledTimes(1);
    expect(baseProps.onSelect.mock.calls[0]![1]).toBe(90);
  });

  it('updates the pill so the choice is visible before selecting', async () => {
    await render(<ServicePickerStep {...baseProps} />);

    await press(() => screen.getByLabelText('Duration, 60 minutes'));
    await press(() => screen.getByText('90m'));
    await press(() => screen.getByText('Done'));

    expect(screen.getByLabelText('Duration, 90 minutes')).toBeTruthy();
  });

  it('passes null when the duration is left at the default', async () => {
    await render(<ServicePickerStep {...baseProps} />);

    await press(() => screen.getByText('Cut & finish'));

    expect(baseProps.onSelect.mock.calls[0]![1]).toBeNull();
  });

  it('passes null after Reset clears a custom duration', async () => {
    await render(<ServicePickerStep {...baseProps} />);

    await press(() => screen.getByLabelText('Duration, 60 minutes'));
    await press(() => screen.getByText('90m'));
    await press(() => screen.getByText('Done'));
    await press(() => screen.getByLabelText('Duration, 90 minutes'));
    await press(() => screen.getByText('Reset (60m)'));

    await press(() => screen.getByText('Cut & finish'));

    expect(baseProps.onSelect.mock.calls[0]![1]).toBeNull();
  });

  it('seeds the pill from an existing override on back-navigation', async () => {
    await render(
      <ServicePickerStep {...baseProps} selectedServiceId="svc_1" initialDurationOverride={75} />,
    );

    expect(screen.getByLabelText('Duration, 75 minutes')).toBeTruthy();
  });
});
