/**
 * QA 2026-11-08 DEVICE-F4: in a collective, the practitioner list named nobody's business, so staff
 * at light-3 picked Andrew and booked, and created a client, at Light 16 without knowing. The web's
 * New appointment names the business under every person; the app now does the same, keeps each
 * business's team together, and the review and confirmation say "Booked at Light 16".
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));

import { PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import { groupedByBusiness, practitionerBusinessLine } from '@/lib/booking/collective-business-line';
import type {
  AppointmentCatalogPractitioner,
  AppointmentServiceOption,
} from '@/types/appointment-catalog';

const cut = (pence: number) => ({
  id: 'cut',
  name: 'Cut',
  duration_minutes: 30,
  buffer_minutes: 0,
  price_pence: pence,
  deposit_pence: null,
});

const person = (id: string, name: string, venueId?: string, label?: string) =>
  ({
    id,
    name,
    services: [cut(3000)],
    ...(venueId ? { owning_venue_id: venueId, owning_venue_name: label, owning_venue_label: label } : {}),
  }) as unknown as AppointmentCatalogPractitioner;

const serviceOption: AppointmentServiceOption = {
  serviceId: 'cut',
  serviceName: 'Cut',
  durationMinutes: 30,
  pricePence: 3000,
  practitionerId: '',
  practitionerName: '',
} as AppointmentServiceOption;

describe('collective practitioner list names each business', () => {
  it('shows the business under each person, each team together', async () => {
    await render(
      <PractitionerStep
        practitioners={[
          person('p-aisha', 'Aisha', 'v-light3', 'Aura Hair Studio'),
          person('p-andrew', 'Andrew', 'v-light16', 'Light 16'),
          person('p-ella', 'Ella', 'v-light3', 'Aura Hair Studio'),
        ]}
        serviceOption={serviceOption}
        allowAnyAvailable={false}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('practitioner-business-p-andrew')).toHaveTextContent('Light 16');
    expect(screen.getByTestId('practitioner-business-p-aisha')).toHaveTextContent('Aura Hair Studio');
    expect(screen.getByLabelText(/^Andrew, Light 16, 30 min/)).toBeTruthy();
    // Aisha and Ella (one business) before Andrew.
    const names = screen.getAllByText(/^(Aisha|Andrew|Ella)$/).map((n) => n.props.children);
    expect(names).toEqual(['Aisha', 'Ella', 'Andrew']);
  });

  it("a venue's own list is unchanged: no business line", async () => {
    await render(
      <PractitionerStep
        practitioners={[person('p-ada', 'Ada'), person('p-ben', 'Ben')]}
        serviceOption={serviceOption}
        allowAnyAvailable={false}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('practitioner-business-p-ada')).toBeNull();
  });
});

describe('practitionerBusinessLine', () => {
  it('prefers the staff label, and is left out when the name already carries it', () => {
    expect(
      practitionerBusinessLine({
        name: 'Andrew',
        owning_venue_id: 'v',
        owning_venue_name: 'Aura Hair Studio',
        owning_venue_label: 'Aura Hair Studio (/book/light-3)',
      }),
    ).toBe('Aura Hair Studio (/book/light-3)');
    expect(
      practitionerBusinessLine({ name: 'Andrew · Light 16', owning_venue_id: 'v', owning_venue_label: 'Light 16' }),
    ).toBeNull();
    expect(practitionerBusinessLine({ name: 'Andrew' })).toBeNull();
  });

  it('groups by first appearance and keeps order within a business', () => {
    expect(groupedByBusiness(['a1', 'b1', 'a2', 'c1', 'b2'], (x) => x[0])).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
  });
});
