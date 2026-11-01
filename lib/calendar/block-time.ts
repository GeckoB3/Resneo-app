/**
 * The Block time form's rules, web parity with `src/lib/calendar/block-time.ts`: keep the two in step.
 * Pure, so the sheet, the plus menus and their tests share one source of truth.
 */

const LAST_MINUTE_OF_DAY = 23 * 60 + 59;
/** The latest start a new block is offered, so it can still run for its full default length. */
const LATEST_DEFAULT_START = 23 * 60;
const DEFAULT_BLOCK_MINUTES = 60;
const DEFAULT_START_ON_ANOTHER_DAY = 9 * 60;

/** The server's limit on a block's reason when one is created. */
export const BLOCK_REASON_MAX_LENGTH = 200;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toHm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** When a block starting at `startHm` ends by default: an hour on, kept within the day. */
export function defaultBlockEnd(startHm: string): string {
  return toHm(Math.min(toMinutes(startHm) + DEFAULT_BLOCK_MINUTES, LAST_MINUTE_OF_DAY));
}

/** Where a block not opened from a slot starts: the next half hour today, otherwise 09:00. */
export function defaultBlockStart(date: string, todayIso: string, nowMinutes: number): string {
  if (date !== todayIso) return toHm(DEFAULT_START_ON_ANOTHER_DAY);
  return toHm(Math.min((Math.floor(nowMinutes / 30) + 1) * 30, LATEST_DEFAULT_START));
}

/** "Tue 4 Nov" from yyyy-mm-dd, whatever the device's timezone. */
function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** What to say after a save: the block may be on a day or a calendar the screen is not showing. */
export function blockSavedMessage(input: {
  edited: boolean;
  calendarName: string | null | undefined;
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const lead = input.edited ? 'Block updated' : 'Time blocked';
  const who = input.calendarName ? ` for ${input.calendarName}` : '';
  return `${lead}${who} on ${shortDay(input.date)}, ${input.startTime} to ${input.endTime}`;
}

/**
 * The calendar a new block starts on: the one in view when this person may block it, otherwise the
 * first they may, and none when they may block nothing.
 */
export function defaultBlockCalendarId(
  calendars: readonly { id: string }[],
  preferredId: string | null | undefined,
): string | null {
  if (preferredId && calendars.some((c) => c.id === preferredId)) return preferredId;
  return calendars[0]?.id ?? null;
}
