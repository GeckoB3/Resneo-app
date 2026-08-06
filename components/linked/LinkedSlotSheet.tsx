import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import type { LinkedVenueCalendar } from '@/types/linked-venues';

/**
 * What a linked-column tap is asking to create. `time` is absent when the sheet
 * was opened from a "New booking" header button rather than an empty slot.
 */
export type LinkedSlotTarget = {
  venue: LinkedVenueCalendar;
  /** The day to book ("YYYY-MM-DD"). */
  date: string;
  /** The tapped slot time ("HH:mm"). */
  time?: string;
};

/**
 * The slot menu for a LINKED venue's calendar column — the cross-venue sibling
 * of the calendar tab's own-venue "Add at {time}" sheet (web parity: the linked
 * branch of `PractitionerCalendarView`'s slot menu, added in resneo#126).
 *
 * Two deliberate differences from the own-venue sheet:
 *
 *  · **No "Block time".** Blocking an independent venue's diary is a statement
 *    about when it may trade, and the §5.3 grant ladder only ever speaks about
 *    bookings — there is no permission concept for it. It is absent rather than
 *    shown disabled.
 *  · **No "Book a resource".** Resources are hosted on the viewing venue's own
 *    calendar columns; a linked column has none (web: `resourcesHere = []`).
 *
 * Both actions create through the SAME path — `/booking/new` scoped to the
 * linked venue by `ownerVenueId` — and differ only by `intent`, which the
 * appointment flow maps to `source: 'phone' | 'walk-in'`. Without the walk-in
 * option a walk-in into a linked chair is silently recorded as a phone booking,
 * misreporting how that client arrived in the owning venue's own books.
 *
 * Owning the navigation here (rather than taking an `onSelect`) keeps the five
 * linked create entry points from drifting apart on which params they pass —
 * they previously disagreed about the tapped time.
 */
export function LinkedSlotSheet({
  target,
  onClose,
}: {
  target: LinkedSlotTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const open = (intent: 'new' | 'walk-in') => {
    if (!target) return;
    const { venue, date, time } = target;
    onClose();
    router.push({
      pathname: '/booking/new',
      params: {
        ownerVenueId: venue.venueId,
        ownerVenueName: venue.venueName,
        date,
        // Only sent when a slot was tapped; the wizard validates the shape and
        // ignores anything else, and a bare `date` still prefills the day.
        ...(time ? { time } : {}),
        ...(intent === 'walk-in' ? { intent: 'walk-in' } : {}),
      },
    });
  };

  return (
    <Sheet visible={target !== null} onClose={onClose}>
      <Text variant="subheading">{target?.time ? `Add at ${target.time}` : 'Add to calendar'}</Text>
      {/* Which venue this lands in — the tap target is a column in the viewing
          venue's calendar, so the booking's destination has to be said out loud
          (web parity: the menu's "In {venue name}" heading). */}
      <Text variant="caption" tone="muted" style={styles.venue}>
        In {target?.venue.venueName ?? ''}
      </Text>
      <View style={styles.actions}>
        {/* Fixed labels, not `newBookingActionLabel`: that resolves the VIEWING
            venue's terminology, and the linked venue's own settings aren't in
            the calendar feed. Linked calendars are appointment venues, where
            that helper returns "New booking" anyway. */}
        <Button label="New booking" variant="primary" fullWidth onPress={() => open('new')} />
        <Button label="Walk-in" variant="secondary" fullWidth onPress={() => open('walk-in')} />
        <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  venue: {
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
