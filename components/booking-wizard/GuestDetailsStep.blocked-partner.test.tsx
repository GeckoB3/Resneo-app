/**
 * The blocked-client warning when booking at another business of the collective (QA 2026-11-19):
 * the block is read with the business the booking is at, so that business's block rules apply and
 * a client picked from another member's records is still checked.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

const mockUseClientBlock = jest.fn();
jest.mock('@/lib/queries/useClientBlock', () => ({
  useClientBlock: (...args: unknown[]) => mockUseClientBlock(...args),
}));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));

import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { ViewerAccess } from '@/lib/roles/roles';

const VIEWER: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

beforeEach(() => {
  mockUseClientBlock.mockReset();
  mockUseClientBlock.mockReturnValue({
    data: { blocks: [{ own: false, venue_name: 'Jenny at Aura' }] },
  });
});

it('reads the block at the business the booking is at and warns', async () => {
  await render(
    <ViewerAccessProvider value={VIEWER}>
      <GuestDetailsStep
        value={{ guest_id: 'g-jane', first_name: 'Jane', last_name: 'Doe', phone: '+447700900123', email: '' }}
        onChange={() => {}}
        onContinue={() => {}}
        bookingVenueId="venue-b"
      />
    </ViewerAccessProvider>,
  );
  expect(mockUseClientBlock).toHaveBeenCalledWith('g-jane', { bookingVenueId: 'venue-b' });
  expect(screen.getByTestId('staff-blocked-client-warning')).toBeTruthy();
  expect(screen.getByText('Jenny at Aura has blocked this client from booking online. You can still book them here.')).toBeTruthy();
});

it('reads it at the signed-in business when the booking is there', async () => {
  await render(
    <ViewerAccessProvider value={VIEWER}>
      <GuestDetailsStep
        value={{ guest_id: 'g-jane', first_name: 'Jane', last_name: 'Doe', phone: '', email: '' }}
        onChange={() => {}}
        onContinue={() => {}}
      />
    </ViewerAccessProvider>,
  );
  expect(mockUseClientBlock).toHaveBeenCalledWith('g-jane', { bookingVenueId: null });
});
