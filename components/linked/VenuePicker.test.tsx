/**
 * Link with a venue's search (CQ-09, CQ-07 R1-12): each row shows "{town} · /book/{slug}", the shared
 * page it was found on, and why a venue is Unavailable; a pasted address that finds nothing says so,
 * and a name keeps the name line, as does an older server that does not say how it read the input.
 * Before this rows showed "/{slug}", no reason and no town, and one hard-coded not-found line.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import type { VenueLookupResponse, VenueSearchResponse } from '@/types/linked-venues';

let mockSearch: VenueSearchResponse | undefined;
let mockLookup: VenueLookupResponse | undefined;
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useVenueSearch: () => ({
    data: mockSearch,
    isSuccess: mockSearch !== undefined,
    isFetching: false,
    isError: false,
    error: null,
  }),
  useVenueLookup: () => ({ data: mockLookup, isFetching: false }),
}));

import { VenuePicker } from './VenuePicker';

const picker = <VenuePicker onPick={jest.fn()} onBack={jest.fn()} />;

describe('VenuePicker', () => {
  it('shows each venue with its town and booking page address, the shared page, and why not', async () => {
    mockSearch = {
      truncated: false,
      query_kind: 'address',
      results: [
        { name: 'Aura Hair Studio', slug: 'aura', eligible: true, reason: null, town: 'Belfast', collective_name: 'Plus 1' },
        {
          name: 'Aura Hair Studio',
          slug: 'light-3',
          eligible: false,
          reason: 'This is your own venue.',
          town: 'Holywood',
          collective_name: 'Plus 1',
        },
        { name: 'Light 16', slug: 'light-16', eligible: true, reason: null },
      ],
    };
    await render(picker);
    expect(screen.getByText('Belfast · /book/aura')).toBeTruthy();
    expect(screen.getByText('Holywood · /book/light-3')).toBeTruthy();
    expect(screen.getByText('/book/light-16')).toBeTruthy();
    expect(screen.getAllByText('On the Plus 1 page')).toHaveLength(2);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('This is your own venue.')).toBeTruthy();
  });

  it('says a pasted address found nothing', async () => {
    mockSearch = { truncated: false, query_kind: 'address', results: [] };
    await render(picker);
    expect(screen.getByText('We could not find a venue at that address. Check it, or search for them by name.')).toBeTruthy();
  });

  it('keeps the name line for a name, and for an older server', async () => {
    mockSearch = { truncated: false, query_kind: 'name', results: [] };
    await render(picker);
    expect(screen.getByText('No venues found. Check the name, or ask them for their booking page address.')).toBeTruthy();
    mockSearch = { truncated: false, results: [] };
    await render(picker);
    expect(screen.getAllByText('No venues found. Check the name, or ask them for their booking page address.').length).toBeGreaterThan(0);
  });

  it('says why not on a venue found by its address too (CQ-17.2)', async () => {
    mockSearch = { truncated: false, results: [] };
    mockLookup = { found: true, name: 'Light 3', slug: 'light-3', eligible: false, reason: 'You are already linked with this venue.' };
    await render(picker);
    expect(screen.getByText('Unavailable: You are already linked with this venue.')).toBeTruthy();
    mockLookup = undefined;
  });
});
