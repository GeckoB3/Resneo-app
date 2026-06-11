/**
 * Date-group helpers for the notifications feed.
 * Mirrors NotificationBell.tsx (web reference) logic.
 */

import type { VenueNotification } from '@/types/notifications';

export interface NotificationSection {
  label: string;
  data: VenueNotification[];
}

/** "Today" / "Yesterday" / "12 Jun" grouping label for a notification. */
export function dayGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const dayMs = 86_400_000;
  if (that === today) return 'Today';
  if (that === today - dayMs) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Groups notifications into SectionList-compatible sections by calendar day.
 * Assumes items are ordered newest-first (server default).
 */
export function groupByDay(items: VenueNotification[]): NotificationSection[] {
  const sections: NotificationSection[] = [];
  for (const item of items) {
    const label = dayGroupLabel(item.createdAt);
    const last = sections[sections.length - 1];
    if (last && last.label === label) {
      last.data.push(item);
    } else {
      sections.push({ label, data: [item] });
    }
  }
  return sections;
}
