/**
 * Inviting any venue, and the venues joining (web CollectiveInvitePanel, InvitedVenueStatus and
 * CollectiveLinkTodos, 2026-10-28). One invitation covers linking with every venue and joining:
 * only a link already in force with less than full access holds a venue up.
 */
import {
  actionableLinkTodos,
  inviteBlocked,
  inviteLinkWords,
  inviteSentMessage,
  invitedVenueStatus,
  linkTodoText,
} from '@/lib/collective-area/invite-links';
import type { InviteCheck, InviteeLinkTodo, LinkNeed } from '@/types/collectives';

const need = (overrides: Partial<LinkNeed>): LinkNeed => ({
  venue_id: 'v-host',
  venue_name: 'Bright Cuts',
  venue_slug: 'bright',
  is_host: true,
  state: 'none',
  link_id: null,
  ...overrides,
});

const check = (links: LinkNeed[], overrides: Partial<InviteCheck> = {}): InviteCheck => ({
  venue: { id: 'v-new', name: 'Light 3', slug: 'light-3' },
  already: null,
  standing: { standing: 'ok', reason: null, detail: null },
  links,
  ...overrides,
});

describe('the invite checklist', () => {
  it("reads the host's own link: the request goes with the invitation, or it is linked as they join", () => {
    expect(inviteLinkWords(need({ state: 'none' }), 'Light 3')).toBe('Your link request goes with the invitation.');
    // A request either way is accepted at full access as they join.
    expect(inviteLinkWords(need({ state: 'their_request' }), 'Light 3')).toBe('Your link request goes with the invitation.');
    expect(inviteLinkWords(need({ state: 'my_request' }), 'Light 3')).toBe('Linked with Light 3 when they join.');
    expect(inviteLinkWords(need({ state: 'full' }), 'Light 3')).toBe('Linked.');
    expect(inviteLinkWords(need({ state: 'not_full' }), 'Light 3')).toBe(
      // The app's name for Linked Accounts (CQ-10.11, app-place-names.ts).
      'Your link with Light 3 gives less than full access both ways. Change it in Linked venues, or they cannot join.',
    );
  });

  it("reads a member's link: linked when they join, unless it has less than full access", () => {
    const member = need({ venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false });
    for (const state of ['none', 'their_request', 'my_request'] as const) {
      expect(inviteLinkWords({ ...member, state }, 'Light 3')).toBe('Linked with Light 3 when they join.');
    }
    expect(inviteLinkWords({ ...member, state: 'full' }, 'Light 3')).toBe('Linked.');
    expect(inviteLinkWords({ ...member, state: 'not_full' }, 'Light 3')).toBe(
      'Its link with Light 3 gives less than full access both ways, so Zen Studio must change it before Light 3 can join. They will be asked.',
    );
  });

  it('cannot be sent to a venue already in or invited, or one that cannot join', () => {
    expect(inviteBlocked(check([]))).toBe(false);
    expect(inviteBlocked(check([], { already: 'invited' }))).toBe(true);
    expect(inviteBlocked(check([], { standing: { standing: 'blocked', reason: 'Uses EUR, not GBP', detail: null } }))).toBe(true);
    expect(inviteBlocked(check([], { standing: { standing: 'no_payments', reason: 'No Stripe', detail: null } }))).toBe(false);
  });

  it('says one acceptance links and joins, once it is sent', () => {
    const zen = need({ venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false });
    expect(inviteSentMessage(check([need({}), zen]))).toBe(
      'Invitation sent to Light 3. When they accept it, they are linked with every venue here and join, in one step.',
    );
  });
});

describe('an invited venue on the Venues tab', () => {
  it('names only the venues whose link has less than full access, "you" for the host', () => {
    const links = [
      need({ state: 'not_full' }),
      need({ venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false, state: 'not_full' }),
      need({ venue_id: 'v-ash', venue_name: 'Ash', is_host: false, state: 'none' }),
    ];
    expect(invitedVenueStatus(check(links), 'Light 3')).toBe(
      'Light 3 cannot join until its link with you and Zen Studio has full access both ways.',
    );
  });

  it('waits on the venue itself when every other link is made as it joins', () => {
    const links = [
      need({ state: 'none' }),
      need({ venue_id: 'v-zen', is_host: false, state: 'my_request' }),
      need({ venue_id: 'v-ash', is_host: false, state: 'their_request' }),
    ];
    expect(invitedVenueStatus(check(links), 'Light 3')).toBe('Waiting for Light 3 to accept.');
  });
});

describe('Venues joining', () => {
  const todo = (state: InviteeLinkTodo['state']): InviteeLinkTodo => ({
    collective_id: 'col-1',
    collective_name: 'Northside',
    venue_id: 'v-new',
    venue_name: 'Light 3',
    venue_slug: 'light-3',
    state,
    link_id: state === 'none' ? null : 'link-1',
  });

  it('shows only a link with less than full access: every other is made as they join (web 2026-10-28)', () => {
    expect(actionableLinkTodos([todo('none'), todo('my_request'), todo('their_request'), todo('not_full')]).map((t) => t.state)).toEqual([
      'not_full',
    ]);
    expect(actionableLinkTodos(undefined)).toEqual([]);
  });

  it('says what holds them up', () => {
    expect(linkTodoText(todo('not_full'))).toBe(
      'Light 3 is invited to join Northside, but your link with them gives less than full access both ways, so they cannot join until you change it.',
    );
  });
});
