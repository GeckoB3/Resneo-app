import {
  buildMapsSearchUrl,
  formatClientAddressOneLine,
  resolveStaffBookingLocation,
  staffBookingLocationPillLabel,
} from '@/lib/booking/staff-booking-location';

/**
 * Staff-facing "where is this happening" derivation (pure). Business-venue and
 * legacy bookings resolve to null; the two off-site kinds each carry their own
 * gap reason so the callout can explain an absence rather than show a blank.
 */

describe('formatClientAddressOneLine', () => {
  it('joins the recorded parts in order', () => {
    expect(
      formatClientAddressOneLine({
        line1: '12 Elm Row',
        line2: 'Flat 2',
        city: 'Edinburgh',
        postcode: 'EH7 4AA',
      }),
    ).toBe('12 Elm Row, Flat 2, Edinburgh, EH7 4AA');
  });

  it('skips blank and whitespace-only parts', () => {
    expect(
      formatClientAddressOneLine({ line1: '12 Elm Row', line2: '   ', city: null, postcode: 'EH7 4AA' }),
    ).toBe('12 Elm Row, EH7 4AA');
  });

  it('is null when nothing was recorded', () => {
    expect(formatClientAddressOneLine({})).toBeNull();
    expect(formatClientAddressOneLine({ line1: '  ', city: '' })).toBeNull();
  });
});

describe('buildMapsSearchUrl', () => {
  it('percent-encodes the address into a universal maps link', () => {
    expect(buildMapsSearchUrl('12 Elm Row, Edinburgh')).toBe(
      'https://www.google.com/maps/search/?api=1&query=12%20Elm%20Row%2C%20Edinburgh',
    );
  });

  it('is null for an empty or missing address', () => {
    expect(buildMapsSearchUrl(null)).toBeNull();
    expect(buildMapsSearchUrl('   ')).toBeNull();
  });
});

describe('resolveStaffBookingLocation', () => {
  it('is null at the business venue, and for legacy rows with no snapshot', () => {
    expect(resolveStaffBookingLocation({ location_type: 'business_venue' })).toBeNull();
    expect(resolveStaffBookingLocation({ location_type: null })).toBeNull();
    expect(resolveStaffBookingLocation({})).toBeNull();
  });

  it('still surfaces an address recorded before the location snapshot existed', () => {
    // Diverges from web, which drops these rows: the address is real and the app
    // showed it before this callout replaced the plain location row.
    expect(
      resolveStaffBookingLocation({
        location_type: null,
        client_address_line1: '12 Elm Row',
        client_address_city: 'Edinburgh',
      }),
    ).toMatchObject({ kind: 'client_address', address: '12 Elm Row, Edinburgh', gap: 'none' });
  });

  it('does not invent a location from a blank legacy address', () => {
    expect(resolveStaffBookingLocation({ location_type: null, client_address_line1: '  ' })).toBeNull();
  });

  it('resolves a client address with a maps link', () => {
    const view = resolveStaffBookingLocation({
      location_type: 'client_address',
      client_address_line1: '12 Elm Row',
      client_address_city: 'Edinburgh',
      client_address_postcode: 'EH7 4AA',
    });
    expect(view).toMatchObject({
      kind: 'client_address',
      address: '12 Elm Row, Edinburgh, EH7 4AA',
      joinUrl: null,
      gap: 'none',
    });
    expect(view?.mapsUrl).toContain('12%20Elm%20Row');
  });

  it('distinguishes an unrecorded address from one hidden by permissions', () => {
    expect(resolveStaffBookingLocation({ location_type: 'client_address' })?.gap).toBe(
      'address_not_recorded',
    );
    expect(
      resolveStaffBookingLocation({ location_type: 'client_address', addressHidden: true })?.gap,
    ).toBe('address_hidden');
  });

  it('has no maps link when there is no address to search', () => {
    expect(resolveStaffBookingLocation({ location_type: 'client_address' })?.mapsUrl).toBeNull();
  });

  it('resolves an online booking with its joining details', () => {
    expect(
      resolveStaffBookingLocation({
        location_type: 'online',
        online_meeting_url: '  https://meet.example.com/abc  ',
        online_meeting_info: '  Dial in five minutes early  ',
      }),
    ).toMatchObject({
      kind: 'online',
      joinUrl: 'https://meet.example.com/abc',
      joinInfo: 'Dial in five minutes early',
      address: null,
      mapsUrl: null,
      gap: 'none',
    });
  });

  it('reports a missing meeting link once the full detail has loaded', () => {
    expect(resolveStaffBookingLocation({ location_type: 'online' })?.gap).toBe('no_link');
    expect(
      resolveStaffBookingLocation({ location_type: 'online', online_meeting_url: '   ' })?.gap,
    ).toBe('no_link');
  });

  it('waits rather than accusing while the summary placeholder is showing', () => {
    // /summary spreads the booking row (so location_type is there) but never the
    // joining details, which only the full GET resolves from the service.
    expect(
      resolveStaffBookingLocation({ location_type: 'online', detailPending: true })?.gap,
    ).toBe('link_pending');
  });

  it('shows the link as soon as it arrives, pending or not', () => {
    expect(
      resolveStaffBookingLocation({
        location_type: 'online',
        online_meeting_url: 'https://meet.example.com/abc',
        detailPending: true,
      })?.gap,
    ).toBe('none');
  });

  it('does not treat a pending client-address booking as incomplete', () => {
    // The address rides on the row, so it is already final on the placeholder.
    expect(
      resolveStaffBookingLocation({ location_type: 'client_address', detailPending: true })?.gap,
    ).toBe('address_not_recorded');
  });
});

describe('staffBookingLocationPillLabel', () => {
  it('names each kind in a couple of words', () => {
    expect(staffBookingLocationPillLabel('online')).toBe('Online');
    expect(staffBookingLocationPillLabel('client_address')).toBe('Client address');
  });
});
