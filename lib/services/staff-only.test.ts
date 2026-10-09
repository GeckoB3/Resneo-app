import {
  STAFF_ONLY_LABEL,
  collectiveNameFromServices,
  isStaffOnlyService,
  staffOnlyHelp,
} from '@/lib/services/staff-only';

describe('staff bookings only', () => {
  it('uses the web label', () => {
    expect(STAFF_ONLY_LABEL).toBe('Staff bookings only');
  });

  it('explains it for a venue on its own', () => {
    expect(staffOnlyHelp(null)).toBe(
      'Your team can book this from the diary. Guests do not see it on your booking page.',
    );
    expect(staffOnlyHelp('  ')).toBe(staffOnlyHelp(null));
  });

  it('names the combined page for a venue in a collective', () => {
    expect(staffOnlyHelp('Northside')).toBe(
      'Teams at every venue in Northside can book this from the diary. Guests do not see it on the Northside page.',
    );
  });

  it('treats only an explicit false as staff-only', () => {
    expect(isStaffOnlyService({ is_bookable_online: false })).toBe(true);
    expect(isStaffOnlyService({ is_bookable_online: true })).toBe(false);
    expect(isStaffOnlyService({ is_bookable_online: null })).toBe(false);
    expect(isStaffOnlyService({})).toBe(false);
  });

  it('reads the collective name from the services', () => {
    expect(collectiveNameFromServices([])).toBeNull();
    expect(collectiveNameFromServices([{}, { collective: { collective_name: 'Northside' } }])).toBe('Northside');
  });

  it('has no em-dash in its copy', () => {
    expect(`${STAFF_ONLY_LABEL}${staffOnlyHelp(null)}${staffOnlyHelp('X')}`).not.toContain('—');
  });
});
