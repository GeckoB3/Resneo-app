import {
  cancelOriginalCopy,
  clearPendingCrossVenueRebook,
  crossVenueMoveCopy,
  crossVenueOriginalLabel,
  markCrossVenueRebookCreated,
  peekPendingCrossVenueRebook,
  roundTimeToFiveMinutes,
  setPendingCrossVenueRebook,
  takeCrossVenueRebookIfCreated,
} from '@/lib/calendar/cross-venue-rebook';

describe('crossVenueMoveCopy (web #190)', () => {
  it('names both calendars and their accounts', () => {
    const copy = crossVenueMoveCopy({
      guestName: 'Ada Lovelace',
      sourceCalendarName: 'Kate',
      sourceVenueName: null,
      targetCalendarName: 'Jenny',
      targetVenueName: 'Bay Salon',
    });
    expect(copy.title).toBe("Ada Lovelace's booking can't move to Jenny's calendar");
    expect(copy.message).toContain('Jenny (Bay Salon) and Kate (your venue) are on different ResNeo accounts');
    expect(copy.message).toContain("make a new booking on Jenny's calendar and cancel this one");
    expect(copy.confirmLabel).toBe("Book on Jenny's calendar");
  });
});

describe('roundTimeToFiveMinutes', () => {
  it('rounds to the nearest five and stays inside the day', () => {
    expect(roundTimeToFiveMinutes('10:32')).toBe('10:30');
    expect(roundTimeToFiveMinutes('10:33')).toBe('10:35');
    expect(roundTimeToFiveMinutes('23:59')).toBe('23:55');
    expect(roundTimeToFiveMinutes('09:00')).toBe('09:00');
    expect(roundTimeToFiveMinutes('nonsense')).toBe('nonsense');
  });
});

describe('labels', () => {
  it('says when and with whom the original is', () => {
    expect(crossVenueOriginalLabel('10:30:00', '2026-09-08', 'Kate')).toBe('10:30 on Tue 8 Sep with Kate');
    expect(crossVenueOriginalLabel('10:30', 'not-a-date', 'Kate')).toBe('10:30 on not-a-date with Kate');
  });
  it('offers the cancel with the facts', () => {
    const copy = cancelOriginalCopy({ guestName: 'Ada', originalLabel: '10:30 on Tue 8 Sep with Kate', targetLabel: "Jenny's calendar" });
    expect(copy.title).toBe('Cancel the original booking?');
    expect(copy.message).toContain("The new booking is on Jenny's calendar. Ada still has the original at 10:30 on Tue 8 Sep with Kate.");
  });
});

describe('the pending record', () => {
  beforeEach(() => clearPendingCrossVenueRebook());
  const rec = { originalBookingId: 'b1', originalOwnerVenueId: null, guestName: 'Ada', originalLabel: 'x', targetLabel: 'y' };

  it('is taken only once the wizard made the booking', () => {
    setPendingCrossVenueRebook(rec);
    expect(peekPendingCrossVenueRebook()?.created).toBe(false);
    expect(takeCrossVenueRebookIfCreated()).toBeNull();
    expect(peekPendingCrossVenueRebook()).toBeNull();

    setPendingCrossVenueRebook(rec);
    markCrossVenueRebookCreated();
    expect(takeCrossVenueRebookIfCreated()).toEqual({ ...rec, created: true });
    expect(takeCrossVenueRebookIfCreated()).toBeNull();
  });

  it('ignores a created mark with nothing pending', () => {
    markCrossVenueRebookCreated();
    expect(peekPendingCrossVenueRebook()).toBeNull();
  });
});
