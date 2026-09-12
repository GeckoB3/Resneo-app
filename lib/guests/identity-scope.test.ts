import { hiddenByIdentityScopeCopy } from '@/lib/guests/identity-scope';

describe('hiddenByIdentityScopeCopy', () => {
  it('says nothing when the scope is hiding nobody', () => {
    expect(hiddenByIdentityScopeCopy({ hiddenCount: 0, search: 'zz', label: 'contact' })).toBeNull();
    expect(hiddenByIdentityScopeCopy({ hiddenCount: -1, search: null, label: 'contact' })).toBeNull();
  });

  it('names the search and the count', () => {
    // The device case: two guests booked in by name alone, invisible to a
    // search that plainly matches them.
    expect(hiddenByIdentityScopeCopy({ hiddenCount: 2, search: 'ZZ', label: 'contact' })).toEqual({
      message:
        '2 contacts match "ZZ" but have no saved email or phone. The \'With contact details\' filter is hiding them.',
      actionLabel: 'Show them',
    });
  });

  it('agrees with itself for a single match', () => {
    expect(hiddenByIdentityScopeCopy({ hiddenCount: 1, search: 'alpha', label: 'client' })).toEqual({
      message:
        '1 client matches "alpha" but has no saved email or phone. The \'With contact details\' filter is hiding them.',
      actionLabel: 'Show them',
    });
  });

  it('drops the search clause when simply browsing', () => {
    expect(hiddenByIdentityScopeCopy({ hiddenCount: 3, search: '   ', label: 'patient' })?.message).toBe(
      "3 patients have no saved email or phone. The 'With contact details' filter is hiding them.",
    );
    expect(hiddenByIdentityScopeCopy({ hiddenCount: 1, search: null, label: 'contact' })?.message).toBe(
      "1 contact has no saved email or phone. The 'With contact details' filter is hiding them.",
    );
  });
});
