import {
  datesWithNoPlacesLeft,
  groupsWithNoPlacesLeft,
  sessionForDirectPick,
  staffCreateOwnerVenueId,
} from '@/lib/booking/offering-availability';

type S = { key: string; date: string; time: string; left: number };
const s = (key: string, date: string, time: string, left: number): S => ({ key, date, time, left });
const dateOf = (x: S) => x.date;
const left = (x: S) => x.left;

describe('datesWithNoPlacesLeft (E-9)', () => {
  it('returns dates whose every session is full, sorted', () => {
    const sessions = [
      s('yoga', '2030-01-07', '09:00', 0),
      s('yoga', '2030-01-05', '09:00', 0),
      s('yoga', '2030-01-06', '09:00', 0),
      s('yoga', '2030-01-06', '18:00', 3),
    ];
    expect(datesWithNoPlacesLeft(sessions, dateOf, left)).toEqual(['2030-01-05', '2030-01-07']);
  });

  it('returns nothing when every date has a place', () => {
    expect(datesWithNoPlacesLeft([s('yoga', '2030-01-05', '09:00', 1)], dateOf, left)).toEqual([]);
    expect(datesWithNoPlacesLeft([], dateOf, left)).toEqual([]);
  });
});

describe('groupsWithNoPlacesLeft (E-9)', () => {
  it('returns only groups with no open session at all, keeping their sessions', () => {
    const sessions = [
      s('sold-out-gala', '2030-01-05', '19:00', 0),
      s('open-evening', '2030-01-05', '18:00', 0),
      s('open-evening', '2030-01-12', '18:00', 5),
      s('sold-out-gala', '2030-01-12', '19:00', 0),
    ];
    const groups = groupsWithNoPlacesLeft(sessions, (x) => x.key, left);
    expect(groups.map((g) => g.key)).toEqual(['sold-out-gala']);
    expect(groups[0]!.items.map((x) => x.date)).toEqual(['2030-01-05', '2030-01-12']);
  });
});

describe('sessionForDirectPick (E-9)', () => {
  it("goes straight to a date's only session when it has places", () => {
    const only = s('yoga', '2030-01-05', '09:00', 2);
    expect(sessionForDirectPick([only], left)).toBe(only);
  });

  it('lists the times when a full session shares the date, or there are several', () => {
    expect(
      sessionForDirectPick([s('yoga', '2030-01-05', '09:00', 2), s('yoga', '2030-01-05', '18:00', 0)], left),
    ).toBeNull();
    expect(sessionForDirectPick([s('yoga', '2030-01-05', '09:00', 0)], left)).toBeNull();
    expect(sessionForDirectPick([], left)).toBeNull();
  });
});

describe('staffCreateOwnerVenueId (E-5)', () => {
  const COLLECTIVE = 'collective-1';

  it("books a collective's listed item for the collective", () => {
    expect(
      staffCreateOwnerVenueId(COLLECTIVE, { venue_id: 'member-2', collective_listing_id: 'listing-1' }),
    ).toBe(COLLECTIVE);
  });

  it("books the venue's own unlisted item as its own, with no owner", () => {
    expect(staffCreateOwnerVenueId(COLLECTIVE, { venue_id: 'own-venue' })).toBeUndefined();
    expect(
      staffCreateOwnerVenueId(COLLECTIVE, { venue_id: 'own-venue', collective_listing_id: null }),
    ).toBeUndefined();
  });

  it('sends a linked partner venue as before when nothing is tagged', () => {
    expect(staffCreateOwnerVenueId('partner-venue', {})).toBe('partner-venue');
  });

  it('sends nothing on the own venue', () => {
    expect(staffCreateOwnerVenueId(null, { venue_id: 'own-venue' })).toBeUndefined();
    expect(staffCreateOwnerVenueId(undefined, {})).toBeUndefined();
  });
});
