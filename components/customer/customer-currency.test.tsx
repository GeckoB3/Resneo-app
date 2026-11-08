/**
 * QA 2026-11-08 DEVICE-F13: every amount on the client side of the app was shown in pounds, so a
 * euro business's clients saw their deposits, balances and visit payments priced in pounds. Each
 * amount now reads in the currency of the business it belongs to; a pound business is unchanged.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { paymentsLine } from '@/components/customer/CustomerVisitCards';
import { OutstandingPaymentsCard } from '@/components/customer/OutstandingPaymentsCard';
import { VenueHistorySection } from '@/components/customer/VenueHistorySection';
import { venueCurrencyFor, type CustomerHome } from '@/lib/queries/useCustomerHome';

const home = (over: Partial<CustomerHome> = {}) =>
  ({
    venues: [
      { id: 'v-eur', name: 'Studio Dublin', currency: 'EUR' },
      { id: 'v-gbp', name: 'Studio Belfast', currency: 'GBP' },
    ],
    outstanding_payments: [],
    venue_history: [],
    venue_history_hidden: 0,
    ...over,
  }) as unknown as CustomerHome;

describe('client amounts in the business currency', () => {
  it("a visit's payments line names each business's own currency", () => {
    expect(paymentsLine({ paid_pence: 1000, refunded_pence: 500 }, 'EUR')).toBe('Paid €10.00. Refunded €5.00.');
    expect(paymentsLine({ paid_pence: 1000, refunded_pence: 0 })).toBe('Paid £10.00.');
  });

  it('reads the currency from the venue list, pounds when unknown', () => {
    expect(venueCurrencyFor(home(), 'v-eur')).toBe('EUR');
    expect(venueCurrencyFor(home(), 'v-missing')).toBeNull();
    expect(venueCurrencyFor({} as CustomerHome, 'v-eur')).toBeNull();
  });

  it('still to pay: euros for the euro business, pounds for the pound one', async () => {
    const booking = (id: string, venue_id: string) => ({
      id,
      venue_id,
      booking_date: '2026-12-01',
      booking_time: '10:00:00',
      status: 'Booked',
      booking_model: 'unified_scheduling',
      booking_total_price_pence: 4500,
      amount_paid_pence: 1000,
    });
    const { getByText } = await render(
      <OutstandingPaymentsCard
        home={home({ outstanding_payments: [booking('b1', 'v-eur'), booking('b2', 'v-gbp')] })}
      />,
    );
    expect(getByText('€35.00')).toBeTruthy();
    expect(getByText('£35.00')).toBeTruthy();
  });

  it('deposits paid at a euro business read in euros', async () => {
    const { getByText } = await render(
      <VenueHistorySection
        home={home({
          venue_history: [
            {
              venue: { id: 'v-eur', name: 'Studio Dublin', slug: 'studio-dublin' },
              visits: 2,
              first_booked_at: '2026-01-10T00:00:00.000Z',
              last_booked_at: '2026-08-01T00:00:00.000Z',
              deposits_paid_minor: 2000,
              next_booking: null,
              rebook_href: null,
            },
          ],
        })}
      />,
    );
    expect(getByText('€20.00 in deposits paid')).toBeTruthy();
  });
});
