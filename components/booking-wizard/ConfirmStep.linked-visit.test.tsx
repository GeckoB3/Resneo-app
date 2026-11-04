/**
 * The confirm step for a visit across businesses (web Docs/split-staff-visit-plan.md 7.1, 6.9, 8.5):
 * each business's own deposit and card-hold choice, sent by business, and the visit's one pay link
 * shown to staff when the create answers with a linked checkout.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import type { VisitBusinessPart } from '@/lib/booking/visit-plan';
import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

const mockCreateMulti = jest.fn();
jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useCreateMultiServiceBooking', () => ({
  useCreateMultiServiceBooking: () => ({ mutate: mockCreateMulti, isPending: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/booking/find-just-created-booking', () => ({ findJustCreatedBooking: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));
const mockCopy = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockCopy(text) }));

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';

const service: AppointmentServiceOption = {
  serviceId: 'svc-cut',
  serviceName: 'Cut',
  durationMinutes: 30,
  pricePence: 2500,
  depositPence: 1000,
  paymentRequirement: 'deposit',
  practitionerId: 'p-steph',
  practitionerName: 'Steph',
  addonGroups: [],
  variants: [],
};

const slot: AppointmentSlot = {
  practitioner_id: 'p-steph',
  practitioner_name: 'Steph',
  service_id: 'svc-cut',
  service_name: 'Cut',
  start_time: '10:00',
  duration_minutes: 65,
  price_pence: 2500,
};

const segments: MultiServiceSegment[] = [
  {
    serviceId: 'svc-cut',
    serviceName: 'Cut',
    practitionerId: 'p-steph',
    practitionerName: 'Steph',
    startTime: '10:00',
    durationMinutes: 30,
    naturalDurationMinutes: 30,
    bufferMinutes: 10,
    pricePence: 2500,
    chargePence: 1000,
    chargeLabel: 'deposit',
    venueId: 'v-studio',
  },
  {
    serviceId: 'svc-gel',
    serviceName: 'Gel Manicure',
    practitionerId: 'p-bea',
    practitionerName: 'Bea',
    startTime: '10:35',
    durationMinutes: 30,
    naturalDurationMinutes: 30,
    bufferMinutes: 0,
    pricePence: 3000,
    chargePence: 1500,
    chargeLabel: 'card_hold',
    venueId: 'v-nails',
  },
];

const parts: VisitBusinessPart[] = [
  { venueId: 'v-studio', name: 'SV Studio', segmentIndexes: [0], depositPence: 1000, chargeLabel: 'deposit', holdPence: 0 },
  { venueId: 'v-nails', name: 'SV Nails', segmentIndexes: [1], depositPence: 0, chargeLabel: 'deposit', holdPence: 1500 },
];

async function renderConfirm(extra: Partial<Parameters<typeof ConfirmStep>[0]> = {}) {
  await render(
    <ConfirmStep
      service={service}
      date="2099-06-10"
      slot={slot}
      guest={{ first_name: 'Sam', last_name: 'Carter', email: 'sam@example.com', phone: '' }}
      source="phone"
      venueId="collective-1"
      onSuccess={jest.fn()}
      onChangeRequireDeposit={jest.fn()}
      multiServiceSegments={segments}
      businessParts={parts}
      {...extra}
    />,
  );
}

beforeEach(() => {
  mockCreateMulti.mockReset();
  mockCopy.mockClear();
});

describe('ConfirmStep: a visit across businesses', () => {
  it("names each service's person and gives each business its own money choices", async () => {
    await renderConfirm();
    expect(screen.getByText('65 min · Steph and Bea')).toBeTruthy();
    expect(screen.getByText(/Gel Manicure with Bea/)).toBeTruthy();

    const byBusiness = within(screen.getByTestId('staff-charges-by-business'));
    expect(byBusiness.getByText('SV Studio')).toBeTruthy();
    expect(byBusiness.getByText('SV Nails')).toBeTruthy();
    // The single visit-wide toggles give way to the businesses' own.
    expect(screen.getAllByLabelText(/^Require deposit/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Card hold/)).toHaveLength(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Card hold/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Create visit'));
    });
    const body = mockCreateMulti.mock.calls[0][0];
    expect(body.require_deposit_by_venue).toEqual({ 'v-studio': false, 'v-nails': false });
    expect(body.require_card_hold_by_venue).toEqual({ 'v-studio': false, 'v-nails': true });
    expect(body.services.map((s: { practitioner_id: string; start_time: string }) => [s.practitioner_id, s.start_time])).toEqual([
      ['p-steph', '10:00'],
      ['p-bea', '10:35'],
    ]);
  });

  it('says only what is ticked is taken now, and the no-show fee only once a hold is ticked', async () => {
    // 2026-11-04 on the phone: "Pay now £30.00" sat beside an unticked "Require payment".
    await renderConfirm();
    expect(screen.queryByTestId('confirm-charge-now')).toBeNull();
    expect(screen.queryByTestId('confirm-hold-now')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Require deposit/));
    });
    expect(within(screen.getByTestId('confirm-charge-now')).getByText('£10.00')).toBeTruthy();
    expect(within(screen.getByTestId('confirm-charge-now')).getByText('Deposit')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Card hold/));
    });
    expect(within(screen.getByTestId('confirm-hold-now')).getByText('£15.00')).toBeTruthy();
  });

  it('offers nothing for a business that cannot take cards', async () => {
    await renderConfirm({ noCardVenueIds: ['v-nails'] });
    const byBusiness = within(screen.getByTestId('staff-charges-by-business'));
    expect(byBusiness.getByText('SV Studio')).toBeTruthy();
    expect(byBusiness.queryByText('SV Nails')).toBeNull();
  });

  it('shows the visit pay link the lead business sent, with a copy button', async () => {
    mockCreateMulti.mockImplementation(
      (_payload: unknown, options: { onSuccess: (res: Record<string, unknown>) => void }) =>
        options.onSuccess({
          group_booking_id: 'g-1',
          booking_ids: ['b-1'],
          primary_booking_id: 'b-1',
          requires_deposit: true,
          total_deposit_pence: 1000,
          status: 'Pending',
          payment_mode: 'linked',
          payment_url: 'https://www.resneo.com/pay/visit/chk-1',
          linked_checkout: { id: 'chk-1', payment_url: 'https://www.resneo.com/pay/visit/chk-1' },
        }),
    );
    await renderConfirm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Require deposit/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Create visit'));
    });

    expect(screen.getByText('Waiting for payment')).toBeTruthy();
    const link = within(screen.getByTestId('linked-pay-link'));
    expect(
      link.getByText(
        'We sent the client this link to pay each business for the visit in one go. It works for 24 hours. You can copy it here too.',
      ),
    ).toBeTruthy();
    expect(link.getByText('https://www.resneo.com/pay/visit/chk-1')).toBeTruthy();
    await act(async () => {
      fireEvent.press(link.getByText('Copy link'));
    });
    expect(mockCopy).toHaveBeenCalledWith('https://www.resneo.com/pay/visit/chk-1');
    expect(screen.queryByText('A deposit payment link has been sent to the guest.')).toBeNull();
  });
});
