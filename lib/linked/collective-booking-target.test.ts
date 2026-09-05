import {
  collectiveBookingParams,
  collectiveBookingTargetFor,
} from '@/lib/linked/collective-booking-target';
import type { StaffCollectiveSummary } from '@/types/linked-venues';

const COLLECTIVE: StaffCollectiveSummary = {
  id: 'col-1',
  name: 'The Hair Collective',
  host_venue_id: 'venue-host',
  member_venue_ids: ['venue-host', 'venue-member'],
  calendar_ids: ['cal-host-1', 'cal-member-1'],
};

describe('collectiveBookingTargetFor', () => {
  it('sends a member venue column with a collective calendar to the collective', () => {
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-member', 'cal-member-1')).toEqual({
      id: 'col-1',
      name: 'The Hair Collective',
    });
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-host', 'cal-host-1')).toEqual({
      id: 'col-1',
      name: 'The Hair Collective',
    });
  });

  it('opens the whole collective when no calendar is named (toolbar New and Walk-in)', () => {
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-host')).toEqual({
      id: 'col-1',
      name: 'The Hair Collective',
    });
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-host', null)).not.toBeNull();
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-host', '')).not.toBeNull();
  });

  it('keeps the per-venue form for a partner outside the collective', () => {
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-stranger', 'cal-x')).toBeNull();
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-stranger')).toBeNull();
  });

  it('keeps the per-venue form for a calendar the combined catalogue does not offer', () => {
    expect(collectiveBookingTargetFor(COLLECTIVE, 'venue-host', 'resource-room-1')).toBeNull();
  });

  it('answers null with no collective or no column venue', () => {
    expect(collectiveBookingTargetFor(null, 'venue-host', 'cal-host-1')).toBeNull();
    expect(collectiveBookingTargetFor(undefined, 'venue-host')).toBeNull();
    expect(collectiveBookingTargetFor(COLLECTIVE, null, 'cal-host-1')).toBeNull();
    expect(collectiveBookingTargetFor(COLLECTIVE, undefined)).toBeNull();
  });
});

describe('collectiveBookingParams', () => {
  it('names the collective as the owner venue for the form', () => {
    expect(collectiveBookingParams({ id: 'col-1', name: 'The Hair Collective' })).toEqual({
      ownerVenueId: 'col-1',
      ownerVenueName: 'The Hair Collective',
    });
  });

  it('adds nothing when the venue books for itself', () => {
    expect(collectiveBookingParams(null)).toEqual({});
  });
});
