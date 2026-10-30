import { ApiError } from '@/lib/api/client';
import {
  collectiveMembersLine,
  hostSettingsNote,
  isConsentRequired,
  memberSummaryIntro,
  leaveCollectiveMessage,
} from '@/lib/linked/collective-membership-copy';

describe('collective membership words', () => {
  it('recognises the consent refusal from the one-tap accept', () => {
    const refusal = new ApiError('Please read what joining involves.', 409, {
      error: 'Please read what joining involves.',
      code: 'COLLECTIVE_CONSENT_REQUIRED',
    });
    expect(isConsentRequired(refusal)).toBe(true);
    expect(isConsentRequired(new ApiError('Nope', 409, { error: 'Nope', code: 'COLLECTIVE_NOT_HOST' }))).toBe(false);
    expect(isConsentRequired(new Error('offline'))).toBe(false);
  });

  it('marks your own venue "(you)" in the members line, beside a member of the same name (CQ-07)', () => {
    const line = collectiveMembersLine({
      activeMemberCount: 3,
      myVenueId: 'v-me',
      members: [
        { venueId: 'v-host', venueName: 'Aura Hair Studio' },
        { venueId: 'v-me', venueName: 'Aura Hair Studio' },
        { venueId: 'v-16', venueName: 'Light 16' },
      ],
    });
    expect(line).toBe('3 active members · Aura Hair Studio, Aura Hair Studio (you), Light 16');
    // Without the venue's id (an older caller), names stay as they are.
    expect(collectiveMembersLine({ activeMemberCount: 1, members: [{ venueName: 'Light 3' }] })).toBe(
      '1 active member · Light 3',
    );
  });

  it('tells a shared-services member its own page comes back, and keeps the older wording otherwise', () => {
    expect(leaveCollectiveMessage({ name: 'Northside', serviceModel: 'replicas' })).toMatch(
      /Guests who visit your own booking page will book your own services there again\.$/,
    );
    expect(leaveCollectiveMessage({ name: 'Northside', serviceModel: 'replicas' })).not.toContain('unaffected');
    expect(leaveCollectiveMessage({ name: 'Northside' })).toBe(
      'Your venue will be removed from "Northside". Your own booking page is unaffected.',
    );
  });

  it('says the host sets services and sign-in on shared services, and keeps the older notes otherwise', () => {
    expect(hostSettingsNote({ serviceModel: 'replicas' }, 'Bright Cuts')).toMatch(/are Bright Cuts's, and apply at every venue/);
    expect(hostSettingsNote({ serviceModel: 'legacy_copies' }, 'Bright Cuts')).toMatch(/each member venue/);
    // Members choose their calendars in Manage Collective, and so can the host (CQ-10.6, R2-15).
    expect(memberSummaryIntro({ name: 'Northside', serviceModel: 'replicas' }, 'Bright Cuts')).toMatch(
      /You and Bright Cuts can each choose which of your calendars offer each one, in Manage Collective/,
    );
    expect(memberSummaryIntro({ name: 'Northside' }, 'Bright Cuts')).toMatch(/under your own Services settings/);
  });
});
