/**
 * C2: the sentences that carry a consequence.
 *
 * A dialog that opens and says the wrong thing passes any test that only asks
 * whether a dialog opened, so these read the strings. Two of them are about
 * money and one is about whether somebody turns up to an appointment without a
 * signed form.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

import { BookingDetailBody } from '@/components/customer/BookingDetailBody';
import { cancelConsequence } from '@/components/customer/BookingActions';
import type { CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';

jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

const BASE: CustomerBookingDetail = {
  booking_id: 'bk-1',
  venue_id: 'v-1',
  venue_name: 'The Studio',
  venue_phone: null,
  booking_date: '2026-09-10',
  booking_time: '10:00:00',
  booking_end_time: '10:30:00',
  party_size: 1,
  status: 'confirmed',
  booking_model: 'appointment',
  is_appointment: true,
  practitioner_id: 'pr-1',
  practitioner_name: 'Alex',
  appointment_service_id: 'svc-1',
  appointment_service_name: 'Haircut',
  event_name: null,
  class_type_name: null,
  resource_name: null,
  deposit_paid: false,
  deposit_amount_pence: null,
  cancellation_deadline: null,
  refund_notice_hours: 24,
  guest_attendance_confirmed_at: null,
  part_of_course: false,
  location: { type: 'venue', address: '1 High Street', map_url: null },
  notes: [],
  compliance_forms: [],
  compliance_forms_checked: true,
};

function renderBody(overrides: Partial<CustomerBookingDetail> = {}) {
  return render(<BookingDetailBody booking={{ ...BASE, ...overrides }} />);
}

describe('the forms section has three states, not two', () => {
  it('says nothing when the check ran and found nothing', async () => {
    const { queryByText } = await renderBody();
    expect(queryByText(/could not check/i)).toBeNull();
    expect(queryByText(/BEFORE YOU ARRIVE/)).toBeNull();
  });

  it('lists a form that is outstanding', async () => {
    const { getByText } = await renderBody({
      compliance_forms: [{ name: 'Health questionnaire', url: 'https://example.test/f/1' }],
    });
    expect(getByText('Health questionnaire')).toBeTruthy();
  });

  it('says so out loud when the check FAILED', async () => {
    /*
      The state the web went out of its way to carry across, and the one it
      would be easiest to drop. An empty list with `checked: false` means "we do
      not know", and rendering nothing would tell somebody with an unsigned
      waiver that they are ready to go. They would find out at the door.
    */
    const { getByText } = await renderBody({
      compliance_forms: [],
      compliance_forms_checked: false,
    });
    expect(getByText(/could not check whether this booking needs a form/i)).toBeTruthy();
  });
});

describe('where it happens', () => {
  it('names the venue for an ordinary booking', async () => {
    const { getByText } = await renderBody();
    expect(getByText('The Studio')).toBeTruthy();
  });

  it('does NOT print the venue address for an appointment at the customer’s own address', async () => {
    /*
      A mobile practitioner comes to you. A screen that always printed the
      venue's address would send their client to an address they should not go
      to, on the day.
    */
    const { getByText, queryByText } = await renderBody({
      location: { type: 'client_address', address: '4 Elm Road', map_url: null },
    });
    expect(getByText('At your address')).toBeTruthy();
    expect(queryByText('1 High Street')).toBeNull();
  });

  it('says online when it is online', async () => {
    const { getByText } = await renderBody({
      location: { type: 'online', address: null, map_url: null },
    });
    expect(getByText('Online')).toBeTruthy();
  });
});

describe('a session of a course says so before anything can be changed', () => {
  it('warns that a change affects this session only', async () => {
    // Somebody who reads "change booking" as "move my course" finds five
    // sessions still in the old slot.
    const { getByText } = await renderBody({ part_of_course: true });
    expect(getByText(/this session only/i)).toBeTruthy();
  });

  it('says nothing of the sort for a standalone booking', async () => {
    const { queryByText } = await renderBody();
    expect(queryByText(/this session only/i)).toBeNull();
  });
});

describe('what cancelling costs, said before the person commits', () => {
  const cancel = (o: Partial<CustomerBookingDetail> = {}) => cancelConsequence({ ...BASE, ...o });

  it('always says it cannot be undone from here', async () => {
    // The portal has no un-cancel. Booking again is a different booking, and at
    // a busy venue the slot may be gone by the time they realise.
    expect(cancel()).toMatch(/cannot be undone/i);
  });

  it('warns that a paid deposit may be lost when the free window has passed', async () => {
    /*
      The line that matters most. Somebody who cancels inside the notice period
      and only afterwards discovers the deposit is gone has been charged by a
      button that did not warn them.
    */
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const text = cancel({
      deposit_paid: true,
      deposit_amount_pence: 2000,
      cancellation_deadline: yesterday,
    });
    expect(text).toMatch(/may not be refunded/i);
  });

  it('reassures when the cancellation is still in time', async () => {
    // The same fact the other way round. Staying silent here would make every
    // cancellation feel like a loss.
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const text = cancel({
      deposit_paid: true,
      deposit_amount_pence: 2000,
      cancellation_deadline: nextWeek,
    });
    expect(text).toMatch(/should be refunded/i);
  });

  it('says nothing about deposits when none was paid', async () => {
    // A refund sentence on a booking with no deposit is a question the customer
    // then has to resolve for themselves.
    expect(cancel()).not.toMatch(/refund/i);
  });

  it('says the rest of a course stays booked', async () => {
    const text = cancel({ part_of_course: true });
    expect(text).toMatch(/rest of your course stays booked/i);
  });

  it('uses no em-dashes, which the product forbids in customer copy', async () => {
    const all = [
      cancel(),
      cancel({ part_of_course: true, deposit_paid: true, deposit_amount_pence: 2000 }),
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
