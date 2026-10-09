import { ANNOUNCEMENT_PILL_LABEL, normaliseAnnouncements } from '@/lib/queries/usePlatformAnnouncements';

describe('platform announcements', () => {
  it('labels the severities as the web does', () => {
    expect(ANNOUNCEMENT_PILL_LABEL).toEqual({ info: 'Announcement', warning: 'Important', critical: 'Critical' });
  });

  it('keeps well-formed rows and reads an unknown severity as info', () => {
    expect(
      normaliseAnnouncements({
        announcements: [
          { id: 'a1', title: 'T', body: 'B', severity: 'critical' },
          { id: 'a2', title: 'T', body: 'B', severity: 'loud' },
          { id: 3, title: 'T', body: 'B' },
          null,
        ],
      }),
    ).toEqual([
      { id: 'a1', title: 'T', body: 'B', severity: 'critical' },
      { id: 'a2', title: 'T', body: 'B', severity: 'info' },
    ]);
  });

  it('reads anything else as none', () => {
    expect(normaliseAnnouncements(null)).toEqual([]);
    expect(normaliseAnnouncements({ announcements: 'x' })).toEqual([]);
    expect(normaliseAnnouncements('<html>')).toEqual([]);
  });
});
