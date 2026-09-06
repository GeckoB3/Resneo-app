/**
 * What saving a calendar's assignments changes (web `savePractitioner` in
 * `AppointmentAvailabilitySettings.tsx`): the full service set for the
 * `practitioner-services` PUT, and one move per class type, resource or event
 * whose column changed. Pure, so the sheet and its tests agree.
 *
 * A class type, a resource and a ticketed event each sit on ONE column, so
 * ticking one here moves it off wherever it was. A resource can never be left
 * without a column: unticking it moves it to another calendar, and with no
 * other calendar the save is refused.
 */

export interface AssignableItem {
  id: string;
  name: string;
  /** The column the item sits on now, or null for none. */
  calendarId: string | null;
}

export interface AssignmentDraft {
  services: ReadonlySet<string>;
  classes: ReadonlySet<string>;
  resources: ReadonlySet<string>;
  events: ReadonlySet<string>;
}

export interface AssignmentMove {
  id: string;
  name: string;
  /** The column to put it on; null takes it off this calendar. */
  calendarId: string | null;
}

export interface AssignmentPlan {
  /** The complete set of services for this calendar (the PUT replaces all). */
  serviceIds: string[];
  classes: AssignmentMove[];
  resources: (AssignmentMove & { calendarId: string })[];
  events: AssignmentMove[];
  /** Set when the plan cannot be applied (a resource would lose its column). */
  error: string | null;
}

export const RESOURCE_NEEDS_ANOTHER_CALENDAR =
  'Add another calendar column before moving a resource off this calendar.';

function movesFor(
  items: readonly AssignableItem[],
  chosen: ReadonlySet<string>,
  calendarId: string,
): AssignmentMove[] {
  const moves: AssignmentMove[] = [];
  for (const item of items) {
    const here = item.calendarId === calendarId;
    const wanted = chosen.has(item.id);
    if (wanted && !here) moves.push({ id: item.id, name: item.name, calendarId });
    else if (!wanted && here) moves.push({ id: item.id, name: item.name, calendarId: null });
  }
  return moves;
}

export function planCalendarAssignments(input: {
  calendarId: string;
  /** Another calendar a resource can move to; null when this is the only one. */
  fallbackCalendarId: string | null;
  draft: AssignmentDraft;
  classes: readonly AssignableItem[];
  resources: readonly AssignableItem[];
  events: readonly AssignableItem[];
}): AssignmentPlan {
  const { calendarId, fallbackCalendarId, draft } = input;
  const resources: (AssignmentMove & { calendarId: string })[] = [];
  let error: string | null = null;
  for (const move of movesFor(input.resources, draft.resources, calendarId)) {
    if (move.calendarId) {
      resources.push({ ...move, calendarId: move.calendarId });
    } else if (fallbackCalendarId) {
      resources.push({ ...move, calendarId: fallbackCalendarId });
    } else {
      error = RESOURCE_NEEDS_ANOTHER_CALENDAR;
    }
  }
  return {
    serviceIds: [...draft.services],
    classes: movesFor(input.classes, draft.classes, calendarId),
    resources,
    events: movesFor(input.events, draft.events, calendarId),
    error,
  };
}

/** The items a draft would move here from another column, for the sheet's "moves here from …" captions. */
export function assignmentsMovingHere(
  items: readonly AssignableItem[],
  chosen: ReadonlySet<string>,
  calendarId: string,
): AssignableItem[] {
  return items.filter(
    (item) => chosen.has(item.id) && item.calendarId != null && item.calendarId !== calendarId,
  );
}
