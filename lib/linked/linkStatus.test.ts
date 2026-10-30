/**
 * A Past link's line on Linked venues (CQ-07, A8-21): when it ended, so two links with one venue, or
 * with two venues of one name, read apart. Before this the row showed the reason alone.
 */
import { pastLinkLine } from '@/lib/linked/linkStatus';

describe('pastLinkLine', () => {
  it('says why and when the link ended', () => {
    expect(
      pastLinkLine({ terminationReason: 'unlinked', terminatedAt: '2026-10-29T10:00:00Z', respondedAt: '2026-09-01T10:00:00Z' }),
    ).toBe('Unlinked on 29 Oct 2026');
    // A declined request has no reason: when it was answered.
    expect(pastLinkLine({ terminationReason: null, terminatedAt: null, respondedAt: '2026-10-02T10:00:00Z' })).toBe(
      'Ended 2 Oct 2026',
    );
    expect(pastLinkLine({ terminationReason: 'request_expired', terminatedAt: null, respondedAt: null })).toBe(
      'Request expired',
    );
    expect(pastLinkLine({ terminationReason: null, terminatedAt: 'not a date', respondedAt: null })).toBeUndefined();
  });
});
