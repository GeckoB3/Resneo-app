/**
 * Shared client lists: the lines the Remove and End sheets gain, and the "What needs you" rows
 * (web review 2026-11-15; plan P7).
 */
import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import { clientSharingTodos, endSharingLine, joinedSharingLine, removeSharingLine } from '@/lib/collective-area/client-sharing-lines';
import type { ClientSharingStatusResponse, VenueClientSharingSummary } from '@/types/client-sharing';

function status(over: Partial<ClientSharingStatusResponse> = {}): ClientSharingStatusResponse {
  return {
    collective: { id: 'c1', name: 'Northside', isHost: true },
    offered: true,
    me: {
      venueId: 'aura',
      name: 'Aura',
      state: 'on',
      started: true,
      askFirst: false,
      excludedVenueIds: [],
      request: null,
      nudgeDismissed: false,
    },
    venues: [],
    counts: { here: 10, fromOthers: 4, inBoth: 2, shared: 12 },
    progress: null,
    arriving: 0,
    todo: { toCheck: 0, changes: 0 },
    undecidedCount: 0,
    sharingVenueIds: ['aura', 'l16'],
    ...over,
  };
}

function summary(over: Partial<VenueClientSharingSummary> = {}): VenueClientSharingSummary {
  return {
    collectiveId: 'c1',
    offered: true,
    state: 'undecided',
    started: false,
    showNudge: false,
    toCheck: 0,
    canManage: true,
    request: null,
    sharingVenueIds: [],
    ...over,
  };
}

describe('removeSharingLine', () => {
  it('speaks only about a venue whose clients pass to another venue now', () => {
    expect(removeSharingLine(status(), 'l16', 'Light 16')).toBe(clientSharingCopy('cs.leave.remove', { venue: 'Light 16' }));
    expect(removeSharingLine(status(), 's3', 'Studio 3')).toBeNull();
  });

  it('says nothing on an older server, or when the collective does not offer sharing', () => {
    expect(removeSharingLine(status({ sharingVenueIds: undefined }), 'l16', 'Light 16')).toBeNull();
    expect(removeSharingLine(status({ offered: false }), 'l16', 'Light 16')).toBeNull();
    expect(removeSharingLine(undefined, 'l16', 'Light 16')).toBeNull();
  });
});

describe('endSharingLine', () => {
  it('speaks only while some venue shares', () => {
    expect(endSharingLine(status())).toBe(clientSharingCopy('cs.leave.end'));
    expect(endSharingLine(status({ sharingVenueIds: [] }))).toBeNull();
  });

  it('says nothing on an older server', () => {
    expect(endSharingLine(status({ sharingVenueIds: undefined }))).toBeNull();
  });
});

describe('clientSharingTodos', () => {
  it('carries the request to share and the clients to check', () => {
    expect(
      clientSharingTodos(summary({ request: { byVenueName: 'Aura', at: '2026-11-15T10:00:00Z' }, toCheck: 3 }), 'c1'),
    ).toEqual({ askedBy: 'Aura', toCheck: 3 });
  });

  it('shows clients to check to owners and admins only', () => {
    expect(clientSharingTodos(summary({ toCheck: 3, canManage: false }), 'c1')).toBeNull();
  });

  it('shows nothing for another collective, with nothing to do, or on an older server', () => {
    expect(clientSharingTodos(summary({ toCheck: 3 }), 'c2')).toBeNull();
    expect(clientSharingTodos(summary(), 'c1')).toBeNull();
    expect(clientSharingTodos(summary({ request: undefined }), 'c1')).toBeNull();
    expect(clientSharingTodos(undefined, 'c1')).toBeNull();
  });
});

describe('joinedSharingLine (review 2026-11-21)', () => {
  it('tells a venue that joined with Share now where to follow its lists coming together', () => {
    expect(joinedSharingLine(true, 'share')).toBe(clientSharingCopy('cs.join.started'));
  });

  it('says nothing for Not now, no answer, or a collective that does not offer sharing', () => {
    expect(joinedSharingLine(true, 'not_now')).toBeNull();
    expect(joinedSharingLine(true, null)).toBeNull();
    expect(joinedSharingLine(false, 'share')).toBeNull();
    expect(joinedSharingLine(undefined, 'share')).toBeNull();
  });
});
