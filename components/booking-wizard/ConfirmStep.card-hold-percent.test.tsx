/**
 * A card hold whose no-show fee is a percentage of the price (web card hold percentage plan,
 * 2026-11-25): Review & confirm works it out from the option's price plus the add-ons chosen, and
 * an option's own fixed fee is not used. jest hoists mock factories above imports, so closed-over
 * vars are `mock*`.
 */
import { render, screen, within } from '@testing-library/react-native';

import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentCatalogAddon, AppointmentServiceOption } from '@/types/appointment-catalog';

jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useCreateMultiServiceBooking', () => ({
  useCreateMultiServiceBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/booking/find-just-created-booking', () => ({ findJustCreatedBooking: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));
jest.mock('@/components/booking-wizard/staff-card-request', () => {
  const actual = jest.requireActual('@/components/booking-wizard/staff-card-request');
  return {
    ...actual,
    useStaffCardLookup: () => ({ card: null, canTakeCards: null, addSavesWith: null, refresh: jest.fn() }),
  };
});

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';

const service: AppointmentServiceOption = {
  serviceId: 'svc-1',
  serviceName: 'Colour',
  durationMinutes: 60,
  pricePence: 6000,
  depositPence: null,
  paymentRequirement: 'card_hold',
  cardHoldFeePercent: 50,
  practitionerId: 'prac-1',
  practitionerName: 'Pat',
  addonGroups: [],
  variants: [],
};

const slot: AppointmentSlot = {
  practitioner_id: 'prac-1',
  practitioner_name: 'Pat',
  service_id: 'svc-1',
  service_name: 'Colour',
  start_time: '10:00',
  duration_minutes: 60,
  price_pence: 6000,
};

const addon = (id: string, pence: number): AppointmentCatalogAddon => ({
  id,
  name: `Add-on ${id}`,
  description: null,
  additional_price_pence: pence,
  additional_duration_minutes: 0,
  sort_order: 0,
});

async function renderStep(props: Partial<Parameters<typeof ConfirmStep>[0]> = {}) {
  await render(
    <ConfirmStep
      service={service}
      date="2026-10-01"
      slot={slot}
      guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '' }}
      source="phone"
      onSuccess={jest.fn()}
      {...props}
    />,
  );
}

const holdLine = () => within(screen.getByTestId('confirm-hold-now'));

describe('a card hold set as a percentage', () => {
  it('is half the price with no add-ons', async () => {
    await renderStep();
    expect(holdLine().getByText('£30.00')).toBeTruthy();
  });

  it('includes the add-ons chosen', async () => {
    // £60 + £20 + £10 = £90, half is £45.
    await renderStep({ addons: [addon('a', 2000), addon('b', 1000)] });
    expect(holdLine().getByText('£45.00')).toBeTruthy();
  });

  it("uses the option's price and not the option's own fixed fee", async () => {
    await renderStep({
      variant: {
        id: 'var-1',
        name: 'Long hair',
        description: null,
        duration_minutes: 90,
        buffer_minutes: 0,
        price_pence: 8000,
        deposit_pence: 1500,
        sort_order: 0,
      },
      addons: [addon('a', 2000)],
    });
    expect(holdLine().getByText('£50.00')).toBeTruthy();
  });

  it('takes no hold when the fee would be under 50p', async () => {
    await renderStep({ service: { ...service, pricePence: 500, cardHoldFeePercent: 5 } });
    expect(screen.queryByTestId('confirm-hold-now')).toBeNull();
  });

  it('keeps a fixed fee as it is, add-ons left out', async () => {
    await renderStep({
      service: { ...service, depositPence: 2000, cardHoldFeePercent: null },
      addons: [addon('a', 2000)],
    });
    expect(holdLine().getByText('£20.00')).toBeTruthy();
  });
});
