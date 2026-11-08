/**
 * QA 2026-11-08 DEVICE-F13: staff screens labelled money fields "(£)" whatever the business's
 * currency, so a euro salon's owner typed prices against a pound sign. The labels and amounts now
 * follow the signed-in business's currency (VenueProvider sets it from the venue bootstrap).
 */
import { cleanup, render, screen } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/lib/queries/useUpdateServiceOverride', () => ({
  useUpdateServiceOverride: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { StaffServiceOverrideSheet } from '@/components/manage/StaffServiceOverrideSheet';
import { formatCardHoldFeePence } from '@/lib/booking/card-hold';
import { setActiveVenueCurrency } from '@/lib/format';
import type { ManagedService } from '@/types/services-manage';

const SERVICE: ManagedService = {
  id: 'svc-1',
  name: 'Haircut',
  description: 'A trim',
  duration_minutes: 30,
  buffer_minutes: 10,
  price_pence: 2500,
  deposit_pence: 500,
  colour: '#3B82F6',
  staff_may_customize_price: true,
  staff_may_customize_deposit: true,
} as ManagedService;

async function renderSheet() {
  await render(
    <StaffServiceOverrideSheet
      visible
      onClose={jest.fn()}
      service={SERVICE}
      calendarChoices={[{ id: 'cal-1', name: 'Main' }]}
      selectedCalendarId="cal-1"
      onSelectCalendar={jest.fn()}
      link={null}
    />,
  );
}

afterEach(() => {
  cleanup();
  setActiveVenueCurrency(null);
});

describe('money labels follow the business currency', () => {
  it('a euro business reads euros', async () => {
    setActiveVenueCurrency('EUR');
    await renderSheet();
    expect(screen.getByText('Price (€)')).toBeTruthy();
    expect(screen.queryByText('Price (£)')).toBeNull();
    expect(formatCardHoldFeePence(2500)).toBe('€25.00');
  });

  it('a pound business reads as before', async () => {
    await renderSheet();
    expect(screen.getByText('Price (£)')).toBeTruthy();
    expect(formatCardHoldFeePence(2500)).toBe('£25.00');
  });
});
