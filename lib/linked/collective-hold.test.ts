/**
 * Links that hold a collective together (CQ-01): the same predicate as the web's
 * `grantsHoldCollective` (the join rule, D2 option ii), and the words the warning and the link's
 * screen read from the server's plan.
 */
import { ApiError } from '@/lib/api/client';
import {
  acknowledgementFor,
  breakFromHold,
  collectiveHoldLine,
  collectiveHoldShort,
  grantsHoldCollective,
  linkBreakCase,
  linkBreakConfirmLabel,
  linkBreakFromError,
  linkBreakFromResponse,
  linkBreakInstead,
  linkBreakLines,
  linkBreakNeedsName,
  removalEnds,
  typedNameMatches,
} from '@/lib/linked/collective-hold';
import type { LinkBreakPlan, LinkCollectiveHold, LinkGrant } from '@/types/linked-venues';

const FULL: LinkGrant = { calendar: 'full_details', pii: true, act: 'create_edit_cancel', calendarIds: null };

const host = { venueId: 'v-host', name: 'Aura Hair Studio' };
const me = { venueId: 'v-me', name: 'Aura Hair Studio in Holywood' };
const l16 = { venueId: 'v-16', name: 'Light 16' };

function hold(ifIChange: LinkBreakPlan, ifTheyChange: LinkBreakPlan = ifIChange): LinkCollectiveHold {
  return {
    collectiveId: 'col-1',
    collectiveName: 'Plus 1',
    hostVenueId: 'v-host',
    hostName: 'Aura Hair Studio',
    iAmHost: false,
    otherIsHost: true,
    ifIChange,
    ifTheyChange,
  };
}

describe('grantsHoldCollective (the join rule)', () => {
  it('holds only at full calendar detail with create, edit and cancel, both ways, with no calendar limits', () => {
    expect(grantsHoldCollective(FULL, FULL)).toBe(true);
    expect(grantsHoldCollective(FULL, { ...FULL, calendarIds: [] })).toBe(true);
    // Less on either side breaks it.
    expect(grantsHoldCollective(FULL, { ...FULL, act: 'edit_existing' })).toBe(false);
    expect(grantsHoldCollective({ ...FULL, calendar: 'time_only' }, FULL)).toBe(false);
    expect(grantsHoldCollective(FULL, { ...FULL, pii: false })).toBe(false);
    expect(grantsHoldCollective(FULL, { ...FULL, calendarIds: ['c1'] })).toBe(false);
    expect(grantsHoldCollective({ calendar: 'none', pii: false, act: 'none' }, FULL)).toBe(false);
  });
});

describe('the plan in words', () => {
  const youLeave: LinkBreakPlan = { leaving: [me], remaining: [host, l16], outcome: 'continues' };
  const theyLeave: LinkBreakPlan = { leaving: [l16], remaining: [host, me], outcome: 'continues' };
  const ends: LinkBreakPlan = { leaving: [me], remaining: [host], outcome: 'ends' };
  const waits: LinkBreakPlan = { leaving: [me], remaining: [host], outcome: 'waits' };

  it('picks the wording from who leaves and whether the collective ends', () => {
    expect(linkBreakCase(youLeave, 'v-me')).toBe('youLeave');
    expect(linkBreakCase(theyLeave, 'v-me')).toBe('theyLeave');
    expect(linkBreakCase(ends, 'v-me')).toBe('ends');
  });

  it('names the confirm button for each action', () => {
    const info = breakFromHold(hold(youLeave), 'ifIChange');
    expect(linkBreakConfirmLabel('unlink', info, 'v-me')).toBe('Unlink and leave Plus 1');
    expect(linkBreakConfirmLabel('reduce', { ...info, plan: theyLeave }, 'v-me')).toBe(
      'Reduce access and take Light 16 off the page',
    );
    expect(linkBreakConfirmLabel('accept', { ...info, plan: ends }, 'v-me')).toBe('Accept and end Plus 1');
  });

  it("says on the link's screen what changing it does", () => {
    expect(collectiveHoldLine(hold(youLeave), 'v-me')).toBe(
      'Holds Plus 1 together. Unlinking, or giving each other less than full access, takes you out of Plus 1.',
    );
    expect(collectiveHoldLine(hold(theyLeave), 'v-me')).toBe(
      'Holds Plus 1 together. Unlinking, or giving each other less than full access, takes Light 16 out of Plus 1.',
    );
    expect(collectiveHoldLine(hold(ends), 'v-me')).toBe(
      'Holds Plus 1 together. Unlinking, or giving each other less than full access, ends Plus 1.',
    );
    expect(collectiveHoldShort(hold(youLeave))).toBe('Holds Plus 1 together');
  });

  it('lists who leaves, then whether the collective carries on, waits or ends', () => {
    const info = breakFromHold(hold(youLeave), 'ifIChange');
    expect(linkBreakLines(info, 'v-me')).toEqual([
      'You leave Plus 1. You keep every service, calendar and booking, the services from Aura Hair Studio become yours to edit, and guests book you on your own booking page again.',
      'Plus 1 carries on with Aura Hair Studio and Light 16.',
    ]);
    expect(linkBreakLines({ ...info, plan: theyLeave }, 'v-me')[0]).toBe(
      'Light 16 leaves Plus 1. It keeps every service, calendar and booking, and its own booking page comes back. Its calendars come off the Plus 1 page straight away.',
    );
    expect(linkBreakLines({ ...info, plan: ends }, 'v-me')[1]).toMatch(/^Plus 1 needs at least two venues, so it ends\./);
    expect(linkBreakLines({ ...info, plan: waits }, 'v-me')[1]).toBe(
      'Only Aura Hair Studio would be left, so the Plus 1 page stops taking bookings until another venue joins.',
    );
  });

  it('asks for the name only when the collective would end, compared trimmed and in any case', () => {
    expect(linkBreakNeedsName({ plan: ends })).toBe(true);
    expect(linkBreakNeedsName({ plan: youLeave })).toBe(false);
    expect(linkBreakNeedsName(null)).toBe(false);
    expect(typedNameMatches('  plus 1 ', 'Plus 1')).toBe(true);
    expect(typedNameMatches('Plus', 'Plus 1')).toBe(false);
  });

  it('offers Remove to the host on a link with a member, and Leave to a member', () => {
    expect(linkBreakInstead({ iAmHost: true, otherIsHost: false })).toBe('remove');
    expect(linkBreakInstead({ iAmHost: false, otherIsHost: true })).toBe('leave');
    expect(linkBreakInstead({ iAmHost: false, otherIsHost: false })).toBe('leave');
    expect(removalEnds({ plan: { leaving: [l16], remaining: [host], outcome: 'ends' } }, 'v-16')).toBe(true);
    expect(removalEnds({ plan: theyLeave }, 'v-16')).toBe(false);
  });

  it('acknowledges exactly the plan it showed', () => {
    expect(acknowledgementFor('col-1', youLeave)).toEqual({ collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' });
  });
});

describe("the server's 409", () => {
  const body = {
    error: 'Plus 1 has changed since you opened this. Check what happens now and confirm again.',
    code: 'LINK_HOLDS_COLLECTIVE',
    collectiveBreak: {
      collectiveId: 'col-1',
      collectiveName: 'Plus 1',
      hostVenueId: 'v-host',
      hostName: 'Aura Hair Studio',
      iAmHost: false,
      otherIsHost: true,
      plan: { leaving: [me], remaining: [host], outcome: 'ends' },
    },
  };

  it('reads the plan and the sentence from LINK_HOLDS_COLLECTIVE, and nothing else', () => {
    expect(linkBreakFromResponse(body)?.plan.outcome).toBe('ends');
    expect(linkBreakFromResponse({ ...body, code: 'FORBIDDEN' })).toBeNull();
    expect(linkBreakFromResponse({ code: 'LINK_HOLDS_COLLECTIVE' })).toBeNull();
    const read = linkBreakFromError(new ApiError(body.error, 409, body));
    expect(read?.info.collectiveId).toBe('col-1');
    expect(read?.message).toBe(body.error);
    expect(linkBreakFromError(new ApiError('Nope', 409, { error: 'Nope' }))).toBeNull();
    expect(linkBreakFromError(new Error('offline'))).toBeNull();
  });
});
