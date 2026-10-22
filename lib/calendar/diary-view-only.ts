import type { DiaryScope } from '@/lib/roles/roles';

/**
 * The diary's columns for a View only or Hidden person (roles plan §5.11, §7.3). Someone else's
 * column is look only for them: its bars open but take no quick actions, hold-drag or resize, it
 * takes no dropped bar, and an empty slot on it adds no booking. Resources keep today's rules, so a
 * column that hosts one still offers its "Book <resource>" entries. For everyone on "Can book and
 * change" every answer is today's (the open scope allows everything).
 */

/** What an empty-slot tap on a column does. */
export type DiarySlotAnswer =
  /** The usual menu: New booking, Walk-in, Block time and any resources. */
  | 'open'
  /** Someone else's column that hosts a resource: the menu, with only the resources. */
  | 'resources_only'
  /** Someone else's column: no menu, a short note says why. */
  | 'refuse';

export function diarySlotAnswer(
  diary: Pick<DiaryScope, 'restricted' | 'allows'>,
  calendarId: string | null | undefined,
  hostsResource: boolean,
): DiarySlotAnswer {
  if (!diary.restricted || diary.allows(calendarId || null)) return 'open';
  return hostsResource ? 'resources_only' : 'refuse';
}

/** The all-calendars grid's flags for one of the venue's own columns (`AllCalendarColumn`). */
export function diaryColumnFlags(
  diary: Pick<DiaryScope, 'allows'>,
  calendarId: string,
): { readOnly?: true; acceptsDrops?: false } {
  return diary.allows(calendarId) ? {} : { readOnly: true, acceptsDrops: false };
}
