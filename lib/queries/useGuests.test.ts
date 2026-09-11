import { buildGuestListPath } from '@/lib/queries/useGuests';

/**
 * The guest directory query string. The Reports → Clients list sends the same
 * params the web's does, so both lists start from the same rows.
 * @see _reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx
 */
describe('buildGuestListPath', () => {
  it('always carries page, limit and sort', () => {
    expect(buildGuestListPath({})).toBe('/api/venue/guests?page=0&limit=30&sort=last_visit_desc');
  });

  it('sends the identity scope as `filter`', () => {
    expect(buildGuestListPath({ filter: 'identified' })).toContain('filter=identified');
    expect(buildGuestListPath({ filter: 'anonymous' })).toContain('filter=anonymous');
    expect(buildGuestListPath({})).not.toContain('filter=');
  });

  it('sends a multi-tag filter comma-joined, and nothing when no tag is on', () => {
    expect(buildGuestListPath({ tags: ['vip', 'regular'] })).toContain('tags=vip%2Cregular');
    expect(buildGuestListPath({ tags: [] })).not.toContain('tags=');
    expect(buildGuestListPath({ tags: ['  '] })).not.toContain('tags=');
  });

  it('keeps the single-tag segment path working alongside it', () => {
    const path = buildGuestListPath({ segment: 'tag', segmentTag: 'vip' });
    expect(path).toContain('segment=tag');
    expect(path).toContain('segment_tag=vip');
  });
});
