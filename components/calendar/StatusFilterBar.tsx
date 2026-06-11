/**
 * Horizontal status filter pill row for the calendar grid.
 *
 * Selecting a status hides non-matching bookings from the grid (client-side
 * filter). "All" clears the filter. Mirrors the web's filter panel pill bar.
 */
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { spacing } from '@/theme/index';

export type CalendarStatusFilter =
  | 'All'
  | 'Pending'
  | 'Booked'
  | 'Confirmed'
  | 'Seated'
  | 'Completed'
  | 'No-Show';

const FILTERS: CalendarStatusFilter[] = [
  'All',
  'Pending',
  'Booked',
  'Confirmed',
  'Seated',
  'Completed',
  'No-Show',
];

type StatusFilterBarProps = {
  selected: CalendarStatusFilter;
  onChange: (filter: CalendarStatusFilter) => void;
  /** Optional per-status booking counts for the chip badge. */
  counts?: Partial<Record<CalendarStatusFilter, number>>;
};

/**
 * Apply a CalendarStatusFilter to a list of bookings.
 * Returns the same array reference when filter is 'All'.
 */
export function applyStatusFilter<T extends { status: string }>(
  bookings: T[],
  filter: CalendarStatusFilter,
): T[] {
  if (filter === 'All') return bookings;
  return bookings.filter((b) => b.status === filter);
}

/** Horizontal scroll strip of status filter chips. */
export function StatusFilterBar({ selected, onChange, counts }: StatusFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}>
      {FILTERS.map((f) => (
        <Chip
          key={f}
          label={f}
          selected={selected === f}
          count={f !== 'All' ? counts?.[f] : undefined}
          onPress={() => onChange(f)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
});
