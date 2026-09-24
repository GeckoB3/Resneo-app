/**
 * "from" prices for a service whose options are priced differently (web QA G-4,
 * 2026-09-23). Gents Cut costs £18 as a service, with options Short £18 and
 * Long £25: showing £18.00 read as the price, and staff first saw £25 on the
 * review. With no option chosen yet the picker says "from" the cheapest option.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import {
  dedupeCatalogServices,
  optionFromPricePence,
  ServicePickerStep,
} from '@/components/booking-wizard/ServicePickerStep';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

const variant = (id: string, name: string, minutes: number, pence: number | null, sort: number) => ({
  id,
  name,
  description: null,
  duration_minutes: minutes,
  buffer_minutes: 0,
  price_pence: pence,
  deposit_pence: null,
  sort_order: sort,
});

const service = (id: string, name: string, pence: number, variants: ReturnType<typeof variant>[] = []) => ({
  id,
  name,
  duration_minutes: 30,
  buffer_minutes: 0,
  price_pence: pence,
  deposit_pence: null,
  sort_order: 0,
  variants,
});

const catalog = {
  practitioners: [
    {
      id: 'prac-ada',
      name: 'Ada',
      services: [
        service('gents', 'Gents Cut', 1800, [
          variant('short', 'Short', 30, 1800, 0),
          variant('long', 'Long', 45, 2500, 1),
        ]),
        service('fringe', 'Fringe Trim', 1000, [
          variant('quick', 'Quick', 10, 1200, 0),
          variant('full', 'Full', 15, 1200, 1),
        ]),
        service('blow', 'Blow Dry', 2000),
      ],
    },
  ],
} as unknown as AppointmentCatalogResponse;

describe('optionFromPricePence', () => {
  it('is the cheapest option when the options are priced differently', () => {
    expect(optionFromPricePence([{ price_pence: 2500 }, { price_pence: 1800 }])).toBe(1800);
    expect(optionFromPricePence([{ price_pence: 2500 }, { price_pence: null }, { price_pence: 1800 }])).toBe(1800);
  });

  it('is null when there is nothing to choose between', () => {
    expect(optionFromPricePence([{ price_pence: 1200 }, { price_pence: 1200 }])).toBeNull();
    expect(optionFromPricePence([{ price_pence: 1200 }, { price_pence: null }])).toBeNull();
    expect(optionFromPricePence([])).toBeNull();
    expect(optionFromPricePence(undefined)).toBeNull();
  });
});

describe('dedupeCatalogServices option prices', () => {
  it('prices a row from its cheapest option, and only when the options differ', () => {
    const rows = dedupeCatalogServices(catalog);
    const byId = Object.fromEntries(rows.map((row) => [row.option.serviceId, row]));
    expect(byId.gents).toMatchObject({ fromPricePence: 1800, optionPricesVary: true });
    expect(byId.fringe).toMatchObject({ fromPricePence: 1000, optionPricesVary: false });
    expect(byId.blow).toMatchObject({ fromPricePence: 2000, optionPricesVary: false });
    // The service's own price still books the service: only the label changes.
    expect(byId.gents!.option.pricePence).toBe(1800);
  });

  it('uses the cheapest option even when it is below the service price', () => {
    const cheaperOption = {
      practitioners: [
        {
          id: 'prac-ada',
          name: 'Ada',
          services: [
            service('gents', 'Gents Cut', 2000, [
              variant('short', 'Short', 30, 1500, 0),
              variant('long', 'Long', 45, 2500, 1),
            ]),
          ],
        },
      ],
    } as unknown as AppointmentCatalogResponse;
    expect(dedupeCatalogServices(cheaperOption)[0]!.fromPricePence).toBe(1500);
  });
});

describe('ServicePickerStep option prices', () => {
  it('says "from" the cheapest option, and the plain price otherwise', async () => {
    await render(<ServicePickerStep catalog={catalog} isLoading={false} isError={false} onSelect={jest.fn()} />);
    expect(screen.getByText('from £18.00')).toBeTruthy();
    // Options at one price leave the service's own price standing.
    expect(screen.getByText('£10.00')).toBeTruthy();
    expect(screen.getByText('£20.00')).toBeTruthy();
  });
});
