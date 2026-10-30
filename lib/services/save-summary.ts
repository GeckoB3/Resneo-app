/**
 * What a host is told after saving a service on the collective page (web `CollectiveSaveSummary`,
 * CQ-11): how far the save reached, and what Put it back brought back.
 *
 * Put it back restores the service at every venue, not the calendar ticks of the same save, and says
 * so. Calendar values the save cleared by switching a permission off go back with it, and the line
 * names any that could not.
 *
 * Pure, so the card stays thin.
 */
import { areaCopy, formatVenueList } from '@/lib/collective-area/copy';
import { syncFailureReason, type CollectiveCalendarGroup, type CollectiveSync } from '@/lib/collective-area/model';

/** The PATCH answer's `collective_sync`. `audit_event_id` is what Put it back sends. */
export interface ServiceSaveSync extends CollectiveSync {
  audit_event_id?: string | null;
  /** Calendars a save with `collective_calendars` could not change, each with its own sentence. */
  calendar_failures?: { calendar_id: string; message: string }[];
}

/** A calendar's own values a save cleared, named for the line that says whether they came back. */
export interface ClearedCalendarValue {
  calendar_id: string;
  service_id: string;
  values: Record<string, number | null>;
  /** "Chair 2 at Zen Studio (price)". */
  label: string;
}

const CLEARED_VALUE_WORDS: Record<string, string> = {
  custom_price_pence: 'price',
  custom_deposit_pence: 'deposit',
  custom_duration_minutes: 'length',
  custom_buffer_minutes: 'buffer',
};

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The PATCH answer's `cleared_values`, each named from the calendars the screen has. Anything else is left out. */
export function clearedValuesFrom(
  raw: unknown,
  groups: readonly CollectiveCalendarGroup[],
  ownCalendars: readonly { id: string; name: string }[] = [],
): ClearedCalendarValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ClearedCalendarValue[] => {
    const e = (entry ?? {}) as { calendar_id?: unknown; service_id?: unknown; values?: unknown };
    if (typeof e.calendar_id !== 'string' || typeof e.service_id !== 'string') return [];
    if (!e.values || typeof e.values !== 'object') return [];
    const values = e.values as Record<string, number | null>;
    const group = groups.find((g) => g.calendars.some((c) => c.id === e.calendar_id));
    const calendar = group?.calendars.find((c) => c.id === e.calendar_id);
    const name =
      group && calendar
        ? group.is_host
          ? calendar.name
          : `${calendar.name} at ${group.venue_name}`
        : (ownCalendars.find((c) => c.id === e.calendar_id)?.name ?? 'A calendar');
    const words = Object.keys(values).flatMap((column) => (CLEARED_VALUE_WORDS[column] ? [CLEARED_VALUE_WORDS[column]!] : []));
    return [
      {
        calendar_id: e.calendar_id,
        service_id: e.service_id,
        values,
        label: words.length > 0 ? `${name} (${joinWords(words)})` : name,
      },
    ];
  });
}

export interface SaveSummaryLine {
  key: string;
  text: string;
  tone: 'ok' | 'warn' | 'bad';
}

/** How far a save reached, a line per venue that is not up to date. */
export function saveSummaryLines(sync: ServiceSaveSync, serviceName: string, venueNames: readonly string[]): SaveSummaryLine[] {
  const lines: SaveSummaryLine[] = [];
  if (sync.applied > 0 && sync.pending.length === 0 && sync.failed.length === 0) {
    lines.push({
      key: 'all-done',
      tone: 'ok',
      text: areaCopy('svc.save.allDone', { service: serviceName, venueList: formatVenueList([...venueNames]) }),
    });
  }
  for (const venue of sync.pending) {
    lines.push({
      key: `pending-${venue.venue_id}`,
      tone: 'warn',
      text: areaCopy('svc.save.pending', { venue: venue.venue_name, service: serviceName }),
    });
  }
  for (const venue of sync.failed) {
    lines.push({
      key: `failed-${venue.venue_id}`,
      tone: 'bad',
      text: areaCopy('svc.save.failed', {
        venue: venue.venue_name,
        // The reason is a sentence of its own; the line adds its own full stop.
        reason: syncFailureReason(venue.code, venue.venue_name).replace(/\.$/, ''),
      }),
    });
  }
  for (const calendar of sync.calendar_failures ?? []) {
    lines.push({ key: `calendar-${calendar.calendar_id}`, tone: 'bad', text: calendar.message });
  }
  return lines;
}

/** What Put it back did: the settings, whether calendar ticks stayed, and the cleared values. */
export function undoDoneText(input: {
  serviceName: string;
  calendarsChanged: boolean;
  cleared: readonly ClearedCalendarValue[];
  /** From the undo's answer: the values that could not be put back. */
  notRestored?: readonly { calendar_id: string; service_id: string }[] | null;
}): string {
  const parts = [
    areaCopy(input.calendarsChanged ? 'ov.undo.doneCalendarsStay' : 'ov.undo.done', { service: input.serviceName }),
  ];
  if (input.cleared.length > 0) {
    const missed = new Set((input.notRestored ?? []).map((v) => `${v.calendar_id}:${v.service_id}`));
    const labels = input.cleared.filter((c) => missed.has(`${c.calendar_id}:${c.service_id}`)).map((c) => c.label);
    parts.push(
      labels.length === 0
        ? areaCopy('ov.undo.valuesBack')
        : areaCopy('ov.undo.valuesNotBack', { list: formatVenueList(labels, 3) }),
    );
  }
  return parts.join(' ');
}
