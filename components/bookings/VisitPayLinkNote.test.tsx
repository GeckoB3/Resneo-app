/**
 * The Payments card of a visit part while the visit's one pay link is out (web QA 2026-11-21
 * COLLECTIVE-PAY-13): the server's words, saying the link covers every business and which parts are
 * paid or still owed.
 */
import { render, screen } from '@testing-library/react-native';

import { VisitPayLinkNote } from '@/components/bookings/VisitPayLinkNote';
import type { VisitPayLink } from '@/types/booking-detail';

const link: VisitPayLink = {
  checkout_id: 'c1',
  expires_at: '2030-06-02T09:00:00Z',
  card_declined: false,
  summary:
    'One payment link covers every business in this visit. The client pays them all on that link, which is open until Sun 2 Jun, 10:00. If it is not paid by then, the whole visit is cancelled.',
  parts: [
    { venue_id: 'a', business_name: 'Aura', is_this_business: true, due_pence: 1500, hold_fee_pence: 0, status: 'paid', line: 'Aura: £15.00 deposit, paid at the desk.' },
    { venue_id: 'b', business_name: 'Light 16', is_this_business: false, due_pence: 2000, hold_fee_pence: 0, status: 'owed', line: 'Light 16: £20.00 deposit, still owed.' },
  ],
};

describe('VisitPayLinkNote', () => {
  it('says one link covers every business and lists what is paid and what is owed', async () => {
    await render(<VisitPayLinkNote link={link} />);
    expect(screen.getByText('One payment link for the whole visit')).toBeTruthy();
    expect(screen.getByText(link.summary)).toBeTruthy();
    expect(screen.getByTestId('visit-pay-link-part-paid')).toHaveTextContent('Aura: £15.00 deposit, paid at the desk.');
    expect(screen.getByTestId('visit-pay-link-part-owed')).toHaveTextContent('Light 16: £20.00 deposit, still owed.');
  });
});
