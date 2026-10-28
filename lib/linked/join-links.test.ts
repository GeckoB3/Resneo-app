/**
 * The venue's links with every venue in a collective it is joining (web JoinLinksChecklist and
 * joinLinkNames, 2026-10-28): joining makes every one but a link already in force with less than
 * full access, in the same step.
 */
import { checklistLinks, joinLinkNames, joinLinkStateWords } from '@/lib/linked/join-links';
import type { LinkNeed } from '@/types/collectives';

const need = (venue: string, state: LinkNeed['state'], linkId: string | null = null): LinkNeed => ({
  venue_id: `v-${venue}`,
  venue_name: venue,
  venue_slug: venue.toLowerCase(),
  is_host: false,
  state,
  link_id: linkId,
});

describe('the join links checklist', () => {
  it('shows nothing when every link is there', () => {
    expect(checklistLinks([need('Ash', 'full')])).toEqual([]);
    expect(checklistLinks(undefined)).toEqual([]);
  });

  it('leaves out the request under review alongside', () => {
    const links = [need('Bright', 'their_request', 'link-1'), need('Zen', 'not_full', 'link-2')];
    expect(checklistLinks(links, 'link-1').map((l) => l.venue_name)).toEqual(['Zen']);
    expect(checklistLinks([need('Bright', 'their_request', 'link-1')], 'link-1')).toEqual([]);
  });

  it('reads every link joining makes as linked when you join, and only one with less access as needing a change', () => {
    expect(joinLinkStateWords('full')).toBe('Already linked');
    expect(joinLinkStateWords('their_request')).toBe('Linked when you join');
    expect(joinLinkStateWords('my_request')).toBe('Linked when you join');
    expect(joinLinkStateWords('none')).toBe('Linked when you join');
    expect(joinLinkStateWords('not_full')).toBe('Linked with less than full access both ways. Change it first.');
  });
});

describe('the venues joining links this one with', () => {
  const links = [
    need('Bright', 'their_request', 'link-1'),
    need('Zen', 'none'),
    need('Ash', 'full', 'link-3'),
    need('Oak', 'my_request', 'link-4'),
    need('Elm', 'not_full', 'link-5'),
  ];

  it('names every link not there yet, but not one with less than full access', () => {
    expect(joinLinkNames(links)).toBe('Bright, Zen and Oak');
  });

  it('leaves out the request under review', () => {
    expect(joinLinkNames(links, 'link-1')).toBe('Zen and Oak');
  });

  it('is null when there is nothing to make', () => {
    expect(joinLinkNames([need('Ash', 'full'), need('Elm', 'not_full', 'l')])).toBeNull();
    expect(joinLinkNames(undefined)).toBeNull();
  });
});
