/**
 * C7: what an empty hub shows, and the one label that must not slip.
 *
 * A customer with nothing booked is rarely a customer with no history: they
 * have been to a salon twice and have no appointment right now. The web's own
 * answer is venue history with a way back to each, and this mirrors it, because
 * a first-run banner would tell that person nothing they did not know.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { VenueHistorySection } from '@/components/customer/VenueHistorySection';
import type { CustomerHome } from '@/lib/queries/useCustomerHome';

const venue = (over: Record<string, unknown> = {}) => ({
  venue: { id: 'v-1', name: 'The Studio', slug: 'the-studio' },
  visits: 3,
  first_booked_at: '2026-01-10T00:00:00.000Z',
  last_booked_at: '2026-08-01T00:00:00.000Z',
  deposits_paid_minor: 0,
  next_booking: null,
  rebook_href: '/book/the-studio',
  ...over,
});

const home = (over: Partial<CustomerHome> = {}) =>
  ({
    venue_history: [venue()],
    venue_history_hidden: 0,
    ...over,
  }) as unknown as CustomerHome;

describe('an account with history but nothing booked', () => {
  it('names the venue and offers a way back', async () => {
    const { getByText } = await render(<VenueHistorySection home={home()} />);
    expect(getByText('The Studio')).toBeTruthy();
    expect(getByText('Book again')).toBeTruthy();
  });

  it('says plainly that nothing is booked there', async () => {
    const { getByText } = await render(<VenueHistorySection home={home()} />);
    expect(getByText('Nothing booked at the moment.')).toBeTruthy();
  });

  it('shows the next booking instead when there is one', async () => {
    const { queryByText, getByText } = await render(
      <VenueHistorySection
        home={home({
          venue_history: [
            venue({ next_booking: { id: 'bk-1', booking_date: '2026-09-10' } }),
          ],
        } as never)}
      />,
    );
    expect(queryByText('Nothing booked at the moment.')).toBeNull();
    expect(getByText(/^Next:/)).toBeTruthy();
  });

  it('offers no way back when the server gives no link', async () => {
    // A venue with no bookable page. A dead button is worse than no button.
    const { queryByText } = await render(
      <VenueHistorySection home={home({ venue_history: [venue({ rebook_href: null })] } as never)} />,
    );
    expect(queryByText('Book again')).toBeNull();
  });
});

describe('the money label, which must never say "spent"', () => {
  it('calls it deposits paid', async () => {
    /*
      The figure sums PAID DEPOSITS only and excludes the whole payments
      ledger. A customer who paid five hundred pounds in full would see the
      fifty pound deposit, so calling it spend tells them ResNeo has lost the
      rest. The web carries the same warning on the field itself.
    */
    const { getByText, queryByText } = await render(
      <VenueHistorySection home={home({ venue_history: [venue({ deposits_paid_minor: 5000 })] } as never)} />,
    );
    expect(getByText(/deposits paid/i)).toBeTruthy();
    expect(queryByText(/spent/i)).toBeNull();
  });

  it('says nothing at all when no deposit was paid', async () => {
    // A zero on every venue that takes no deposit is noise.
    const { queryByText } = await render(<VenueHistorySection home={home()} />);
    expect(queryByText(/deposits paid/i)).toBeNull();
  });
});

describe('nothing is silently cut', () => {
  it('says how many venues are not shown', async () => {
    const { getByText } = await render(<VenueHistorySection home={home({ venue_history_hidden: 2 } as never)} />);
    expect(getByText(/2 more venues are not shown/i)).toBeTruthy();
  });

  it('renders nothing at all for a genuinely new account', async () => {
    // No bookings and no venues. The "nothing booked" card above is the honest
    // state for somebody who arrived before their first booking.
    const { toJSON } = await render(<VenueHistorySection home={home({ venue_history: [] } as never)} />);
    expect(toJSON()).toBeNull();
  });
});
