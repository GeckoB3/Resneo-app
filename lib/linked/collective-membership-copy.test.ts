import { ApiError } from '@/lib/api/client';
import {
  hostSettingsNote,
  isConsentRequired,
  memberSummaryIntro,
  joinOnWebCopy,
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

  it('sends a joining venue to the web, naming the collective', () => {
    const copy = joinOnWebCopy('Northside');
    expect(copy.title).toBe('Open ResNeo on the web to join');
    expect(copy.message).toContain('Joining Northside');
    expect(copy.message).not.toContain('—');
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
    expect(memberSummaryIntro({ name: 'Northside', serviceModel: 'replicas' }, 'Bright Cuts')).toMatch(
      /on your Services screen/,
    );
    expect(memberSummaryIntro({ name: 'Northside' }, 'Bright Cuts')).toMatch(/under your own Services settings/);
  });
});
