import {
  collectiveBadge,
  collectiveServiceLines,
  collectiveStatusBadge,
  isManagedByHost,
  isParked,
} from '@/lib/services/collective-service';
import type { ServiceCollectiveBlock } from '@/types/services-manage';

const block = (over: Partial<ServiceCollectiveBlock> = {}): ServiceCollectiveBlock => ({
  role: 'replica',
  collective_id: 'col-1',
  collective_name: 'Northside',
  host_venue_name: 'Bright Cuts',
  item_id: 'item-1',
  locked_fields: [],
  delegated_fields: [],
  status: 'up_to_date',
  status_reason: null,
  last_applied_at: null,
  hidden_reasons: [],
  ...over,
});

describe('collective services', () => {
  it('says nothing outside a collective', () => {
    expect(collectiveBadge({})).toBeNull();
    expect(collectiveStatusBadge({ collective: null })).toBeNull();
    expect(collectiveServiceLines({})).toEqual([]);
    expect(isManagedByHost({})).toBe(false);
  });

  it('marks a member copy as the host’s, with only the calendar choice left to the venue', () => {
    const service = { collective: block() };
    expect(isManagedByHost(service)).toBe(true);
    expect(collectiveBadge(service)).toEqual({ label: 'From Bright Cuts', tone: 'brand' });
    expect(collectiveStatusBadge(service)).toBeNull();
    expect(collectiveServiceLines(service)[0]).toBe(
      'Bright Cuts manages this service for Northside. You choose which of your calendars offer it. For anything else, ask Bright Cuts.',
    );
  });

  it('treats a retired copy as the host’s too, and a parked service as the venue’s own', () => {
    expect(isManagedByHost({ collective: block({ role: 'retired' }) })).toBe(true);
    const parked = { collective: block({ role: 'parked', status: 'hidden' }) };
    expect(isManagedByHost(parked)).toBe(false);
    expect(isParked(parked)).toBe(true);
    expect(collectiveBadge(parked)).toEqual({ label: 'Parked', tone: 'warning' });
    expect(collectiveStatusBadge(parked)).toBeNull();
    expect(collectiveServiceLines(parked)[0]).toMatch(/^Parked while your venue is part of Northside/);
  });

  it('names the one venue where guests cannot book, and explains why', () => {
    const reason = 'Guests cannot book this at Light 3, because card payments are not set up there.';
    const service = {
      collective: block({
        role: 'master',
        status: 'hidden',
        status_reason: reason,
        hidden_reasons: [{ venue_id: 'v3', venue_name: 'Light 3', reason: 'payments' }],
      }),
    };
    expect(collectiveBadge(service)).toEqual({ label: 'Collective', tone: 'brand' });
    expect(collectiveStatusBadge(service)).toEqual({ label: 'Hidden at Light 3', tone: 'warning' });
    expect(collectiveServiceLines(service)).toEqual([
      'This service is on the Northside page. Saving it updates it at every venue.',
      reason,
    ]);
  });

  it('keeps the pill plain when the reason is not one venue', () => {
    const staffOnly = {
      collective: block({ status: 'hidden', hidden_reasons: [{ venue_id: 'v3', venue_name: 'Light 3', reason: 'staff_only' }] }),
    };
    expect(collectiveStatusBadge(staffOnly)?.label).toBe('Hidden');
    expect(collectiveStatusBadge({ collective: block({ status: 'failed' }) })).toEqual({ label: 'Could not update', tone: 'danger' });
  });

  it('never writes an em-dash', () => {
    for (const role of ['master', 'replica', 'retired', 'parked'] as const) {
      for (const line of collectiveServiceLines({ collective: block({ role }) })) {
        expect(line).not.toContain('—');
      }
    }
  });
});
