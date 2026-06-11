/**
 * Compact relative-time label for notification timestamps.
 * Mirrors NotificationBell.tsx (web reference) relativeTime().
 *
 * < 1 min  → "just now"
 * < 60 min → "5m"
 * < 24 h   → "3h"
 * < 7 d    → "2d"
 * else     → short date e.g. "12 Jun"
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
