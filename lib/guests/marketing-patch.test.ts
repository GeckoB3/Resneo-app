/**
 * The optimistic half of the marketing toggles: what the cached contact should
 * look like the instant a Switch is tapped, before the PATCH answers. Follows
 * the route (`api/venue/guests/[guestId]` PATCH), so the refetch that lands a
 * moment later agrees with it.
 */
import { applyGuestMarketingPatch, touchesMarketing } from '@/lib/guests/marketing-patch';
import type { GuestDetailResponse } from '@/types/guest-detail';

const NOW = '2026-09-11T09:00:00.000Z';

function detail(overrides: {
  marketing_consent?: boolean;
  marketing_opt_out?: boolean;
  marketing_consent_at?: string | null;
}): GuestDetailResponse {
  return {
    guest: {
      id: 'g1',
      marketing_consent: false,
      marketing_opt_out: false,
      marketing_consent_at: null,
      ...overrides,
    },
    stats: {},
    booking_history: [],
    communications: [],
    custom_field_definitions: [],
  } as unknown as GuestDetailResponse;
}

describe('touchesMarketing', () => {
  it('is true only for an update carrying a marketing flag', () => {
    expect(touchesMarketing({ marketing_consent: true })).toBe(true);
    expect(touchesMarketing({ marketing_opt_out: false })).toBe(true);
    expect(touchesMarketing({})).toBe(false);
  });
});

describe('applyGuestMarketingPatch', () => {
  it('records a consent, lifting a standing opt-out and stamping the date', () => {
    const next = applyGuestMarketingPatch(
      detail({ marketing_opt_out: true }),
      { marketing_consent: true },
      NOW,
    );
    expect(next.guest.marketing_consent).toBe(true);
    expect(next.guest.marketing_opt_out).toBe(false);
    expect(next.guest.marketing_consent_at).toBe(NOW);
  });

  it('leaves a standing consent’s own date alone', () => {
    const next = applyGuestMarketingPatch(
      detail({ marketing_consent: true, marketing_consent_at: '2026-01-02T00:00:00.000Z' }),
      { marketing_consent: true },
      NOW,
    );
    expect(next.guest.marketing_consent_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('withdraws the consent when the contact opts out', () => {
    const next = applyGuestMarketingPatch(
      detail({ marketing_consent: true, marketing_consent_at: NOW }),
      { marketing_opt_out: true },
      NOW,
    );
    expect(next.guest.marketing_opt_out).toBe(true);
    expect(next.guest.marketing_consent).toBe(false);
    expect(next.guest.marketing_consent_at).toBeNull();
  });

  it('clears the date when the consent is turned off', () => {
    const next = applyGuestMarketingPatch(
      detail({ marketing_consent: true, marketing_consent_at: NOW }),
      { marketing_consent: false },
      NOW,
    );
    expect(next.guest.marketing_consent).toBe(false);
    expect(next.guest.marketing_consent_at).toBeNull();
  });

  it('applies both flags as sent when the screen sends the pair', () => {
    const next = applyGuestMarketingPatch(
      detail({ marketing_consent: true, marketing_consent_at: NOW }),
      { marketing_opt_out: true, marketing_consent: false },
      NOW,
    );
    expect(next.guest.marketing_opt_out).toBe(true);
    expect(next.guest.marketing_consent).toBe(false);
  });

  it('leaves a contact untouched by an update about something else', () => {
    const before = detail({ marketing_consent: true });
    expect(applyGuestMarketingPatch(before, {}, NOW)).toBe(before);
  });
});
