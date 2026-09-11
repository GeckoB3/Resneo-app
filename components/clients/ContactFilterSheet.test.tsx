/**
 * Clients-05 (Low): ContactFilterSheet per-option helper hints.
 *
 * The web's "Who to include" + "Smart list" options each carry a one-line hint
 * (CONTACT_SHOW_OPTIONS / CONTACTS_SEGMENT_OPTIONS). The app now renders the hint
 * for the SELECTED option under each group. These tests pin that the hint copy is
 * present at parity and that it follows the selection.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({ data: { practitioners: [] }, isLoading: false }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: [] }, isLoading: false }),
}));

import {
  ContactFilterSheet,
  DEFAULT_FILTER_STATE,
  type ContactFilterState,
} from '@/components/clients/ContactFilterSheet';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

function renderSheet(value: ContactFilterState = DEFAULT_FILTER_STATE) {
  return render(
    <ContactFilterSheet
      visible
      value={value}
      onApply={jest.fn()}
      onClose={jest.fn()}
      availableTags={['vip']}
    />,
  );
}

describe('ContactFilterSheet — per-option hints', () => {
  it('renders the identity hint for the default "With contact details" option', async () => {
    await renderSheet();
    expect(
      screen.getByText('People with a name plus email or phone you can reach.'),
    ).toBeTruthy();
  });

  it('renders the default-segment ("Everyone") hint', async () => {
    await renderSheet();
    expect(
      screen.getByText('No extra rules. Show everyone allowed by Who to include above.'),
    ).toBeTruthy();
  });

  it('updates the identity hint when a different scope is chosen', async () => {
    await renderSheet();
    // Pick "Anonymous only" → its hint replaces the default one.
    await press(() => screen.getByText('Anonymous only'));
    expect(
      screen.getByText(/Guests without saved contact details/),
    ).toBeTruthy();
  });

  it('updates the segment hint when a smart list is chosen', async () => {
    await renderSheet();
    await press(() => screen.getByText('New this period'));
    expect(
      screen.getByText(/Added within your dates below/),
    ).toBeTruthy();
  });
});

/**
 * The web puts a "Booking date (optional)" pair under the last-staff and
 * last-service pickers, and the guests route bounds those two segments by it
 * (route ~336-360) — the app promised it in the segment hints but never showed
 * the pickers.
 */
describe('ContactFilterSheet — segment date ranges', () => {
  it('offers the booking date range on the last-staff list', async () => {
    await renderSheet();
    await press(() => screen.getByText('By last staff'));

    expect(screen.getByText('Booking date (optional)')).toBeTruthy();
    expect(screen.getByText('Starting')).toBeTruthy();
    expect(screen.getByText('Ending')).toBeTruthy();
  });

  it('offers it on the last-service list too', async () => {
    await renderSheet();
    await press(() => screen.getByText('By last service'));

    expect(screen.getByText('Booking date (optional)')).toBeTruthy();
  });

  it('titles the marketing dates for what they bound, and describes each option', async () => {
    await renderSheet();
    await press(() => screen.getByText('Marketing consent'));

    expect(
      screen.getByText('Happy to hear from you by email or SMS where the venue allows it.'),
    ).toBeTruthy();
    expect(screen.getByText('When consent was saved (optional)')).toBeTruthy();

    await press(() => screen.getByText('Not subscribed'));
    expect(screen.getByText('Opted out or never gave marketing permission.')).toBeTruthy();
  });
});
