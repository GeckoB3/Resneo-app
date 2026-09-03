/**
 * The tick-first picker (R23-4, web 2026-09-02): services are ticked, up to
 * four, and a bar under the list carries the count, the total time at the
 * chosen lengths and Continue. Pick order is visit order.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import { pickerBarSummary, ServicePickerStep, type ServiceRow } from '@/components/booking-wizard/ServicePickerStep';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

const service = (id: string, name: string, duration_minutes: number, price_pence: number | null) => ({
  id,
  name,
  duration_minutes,
  buffer_minutes: 0,
  price_pence,
  deposit_pence: null,
});

const catalog = {
  practitioners: [
    {
      id: 'prac_1',
      name: 'Alex',
      services: [
        service('cut', 'Cut', 30, 2500),
        service('colour', 'Colour', 60, 5000),
        service('blow', 'Blow-dry', 20, 1500),
        service('treat', 'Treatment', 15, null),
        service('fringe', 'Fringe trim', 10, 800),
      ],
    },
  ],
} as unknown as AppointmentCatalogResponse;

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

function row(id: string, name: string, durationMinutes: number, fromPricePence: number | null): ServiceRow {
  return {
    option: {
      serviceId: id,
      serviceName: name,
      durationMinutes,
      pricePence: fromPricePence,
      depositPence: null,
      practitionerId: 'prac_1',
      practitionerName: 'Alex',
      addonGroups: [],
      variants: [],
    },
    fromPricePence,
    multiplePractitioners: false,
    practitionerCount: 1,
  };
}

describe('pickerBarSummary', () => {
  it('totals the visit at the chosen lengths and sums the priced services', () => {
    const summary = pickerBarSummary([
      { row: row('cut', 'Cut', 30, 2500), durationOverride: 45 },
      { row: row('treat', 'Treatment', 15, null), durationOverride: null },
    ]);
    expect(summary).toEqual({ count: 2, totalMinutes: 60, fromPence: 2500, names: 'Cut + Treatment' });
    expect(pickerBarSummary([]).fromPence).toBeNull();
  });
});

describe('ServicePickerStep in multi mode', () => {
  it('ticks on tap, shows the bar, and continues with the picks in visit order', async () => {
    const onToggleService = jest.fn();
    const onContinueSelection = jest.fn();
    await render(
      <ServicePickerStep
        catalog={catalog}
        isLoading={false}
        isError={false}
        onSelect={jest.fn()}
        selectionMode="multi"
        selectedServiceIds={['colour', 'cut']}
        onToggleService={onToggleService}
        onContinueSelection={onContinueSelection}
      />,
    );
    // Two ticked: colour first, then cut (pick order is visit order).
    expect(screen.getByText(/2 services · 90 min · from £75\.00/)).toBeTruthy();
    expect(screen.getByText('Colour + Cut')).toBeTruthy();

    await press(() => screen.getByText('Blow-dry'));
    expect(onToggleService).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'blow' }));

    await press(() => screen.getByText('Continue'));
    expect(onContinueSelection).toHaveBeenCalledWith([
      { option: expect.objectContaining({ serviceId: 'colour' }), durationOverride: null },
      { option: expect.objectContaining({ serviceId: 'cut' }), durationOverride: null },
    ]);
  });

  it('shows no bar until something is ticked', async () => {
    await render(
      <ServicePickerStep
        catalog={catalog}
        isLoading={false}
        isError={false}
        onSelect={jest.fn()}
        selectionMode="multi"
        selectedServiceIds={[]}
      />,
    );
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('clears through the bar', async () => {
    const onClearSelection = jest.fn();
    await render(
      <ServicePickerStep
        catalog={catalog}
        isLoading={false}
        isError={false}
        onSelect={jest.fn()}
        selectionMode="multi"
        selectedServiceIds={['cut']}
        onClearSelection={onClearSelection}
      />,
    );
    expect(screen.getByText(/1 service · 30 min/)).toBeTruthy();
    await press(() => screen.getByText('Clear'));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('stops at four services and says so', async () => {
    const onToggleService = jest.fn();
    await render(
      <ServicePickerStep
        catalog={catalog}
        isLoading={false}
        isError={false}
        onSelect={jest.fn()}
        selectionMode="multi"
        selectedServiceIds={['cut', 'colour', 'blow', 'treat']}
        onToggleService={onToggleService}
      />,
    );
    expect(screen.getByText(/most a visit can hold \(4\)/)).toBeTruthy();
    // A fifth cannot be ticked; an already-ticked one can still be unticked.
    await press(() => screen.getByText('Fringe trim'));
    expect(onToggleService).not.toHaveBeenCalled();
    await press(() => screen.getByText('Cut'));
    expect(onToggleService).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'cut' }));
  });
});
