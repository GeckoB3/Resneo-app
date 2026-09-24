/**
 * The person step comes before the option step, so a person whose options are
 * priced differently shows "from" the cheapest option rather than the service's
 * own price (web QA G-4, 2026-09-23: Ada's Gents Cut read £18.00 with Long at
 * £25).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));

import { PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import type {
  AppointmentCatalogPractitioner,
  AppointmentServiceOption,
} from '@/types/appointment-catalog';

const variant = (id: string, name: string, minutes: number, pence: number, sort: number) => ({
  id,
  name,
  description: null,
  duration_minutes: minutes,
  buffer_minutes: 0,
  price_pence: pence,
  deposit_pence: null,
  sort_order: sort,
});

const practitioners = [
  {
    id: 'prac-ada',
    name: 'Ada',
    services: [
      {
        id: 'gents',
        name: 'Gents Cut',
        duration_minutes: 30,
        buffer_minutes: 0,
        price_pence: 1800,
        deposit_pence: null,
        variants: [variant('short', 'Short', 30, 1800, 0), variant('long', 'Long', 45, 2500, 1)],
      },
    ],
  },
  {
    id: 'prac-ben',
    name: 'Ben',
    services: [
      {
        id: 'gents',
        name: 'Gents Cut',
        duration_minutes: 30,
        buffer_minutes: 0,
        price_pence: 2000,
        deposit_pence: null,
      },
    ],
  },
] as unknown as AppointmentCatalogPractitioner[];

const serviceOption: AppointmentServiceOption = {
  serviceId: 'gents',
  serviceName: 'Gents Cut',
  durationMinutes: 30,
  pricePence: 1800,
  depositPence: null,
  practitionerId: 'prac-ada',
  practitionerName: 'Ada',
  addonGroups: [],
  variants: [],
};

describe('PractitionerStep option prices (web QA G-4)', () => {
  it('says "from" the cheapest option for a person whose options differ in price', async () => {
    await render(
      <PractitionerStep
        practitioners={practitioners}
        serviceOption={serviceOption}
        allowAnyAvailable={false}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText('from £18.00')).toBeTruthy();
    expect(screen.getByText('30 min · from £18.00')).toBeTruthy();
    // No options to choose between: the person's own price, as before.
    expect(screen.getByText('£20.00')).toBeTruthy();
    expect(screen.getByText('30 min · £20.00')).toBeTruthy();
  });

  it('still books the person with the service price, the options chosen next', async () => {
    const onSelect = jest.fn();
    await render(
      <PractitionerStep
        practitioners={practitioners}
        serviceOption={serviceOption}
        allowAnyAvailable={false}
        onSelect={onSelect}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Ada'));
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ practitionerId: 'prac-ada', pricePence: 1800 }),
    );
    expect(onSelect.mock.calls[0]![0].variants).toHaveLength(2);
  });
});
