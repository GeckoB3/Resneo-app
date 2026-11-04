/**
 * The Collective area says whose calendars a lapsed subscription has taken off the page (web
 * `CollectiveLapsedNotice`, 2026-11-04): Light 16's plan ended and its only service left the page
 * while the area still said it was on it.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

import { LapsedVenuesNotice } from '@/components/collective-area/AreaPieces';

const members = [
  { venueId: 'host', venueName: 'Aura Hair Studio', status: 'active', lapsed: false },
  { venueId: 'l16', venueName: 'Light 16', status: 'active', lapsed: true },
  { venueId: 'inv', venueName: 'Light 21', status: 'invited', lapsed: true },
];

describe('LapsedVenuesNotice', () => {
  it('names each active venue whose subscription has lapsed, word for word the web', async () => {
    await render(<LapsedVenuesNotice collectiveName="Aura Hair Studio" myVenueId="host" members={members} />);
    expect(
      screen.getByText(
        "Light 16's subscription has lapsed, so its calendars are hidden from the Aura Hair Studio page until it is put right.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Light 21/)).toBeNull();
  });

  it('speaks to the venue itself when its own subscription has lapsed', async () => {
    await render(<LapsedVenuesNotice collectiveName="Aura Hair Studio" myVenueId="l16" members={members} />);
    expect(
      screen.getByText('Your subscription has lapsed, so your calendars are hidden from the Aura Hair Studio page until it is renewed.'),
    ).toBeTruthy();
  });

  it('shows nothing while every venue is paid up, or for an older server that does not say', async () => {
    await render(
      <LapsedVenuesNotice
        collectiveName="Aura Hair Studio"
        myVenueId="host"
        members={[{ venueId: 'host', venueName: 'Aura Hair Studio', status: 'active' }]}
      />,
    );
    expect(screen.queryByTestId('collective-lapsed-notice')).toBeNull();
  });
});
