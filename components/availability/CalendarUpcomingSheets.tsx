/**
 * The two sheets that say "this calendar still has people booked on it" (web
 * QA C-11, R44-2 and R44-4):
 *
 *  - {@link CalendarPauseSheet}: shown before a calendar with upcoming bookings
 *    is switched off. Pausing is never refused; it says how many and which,
 *    says plainly what happens to them, and lets the admin go ahead or go back
 *    (web `CalendarPauseDialog`).
 *  - {@link CalendarRemoveSheet}: the remove confirm, which turns into the same
 *    list and what to do about it once the calendar is known to have upcoming
 *    bookings (web `BookableCalendarsPanel`). One sheet for both on purpose:
 *    swapping one Modal for another in a single render is unreliable on iOS.
 *
 * Wherever the list is shown the sheet is a `fill` one with a scrolling body
 * and its buttons pinned below, so they stay on screen on a small phone with
 * six bookings listed (the app's sheet scroll contract: a content-sized sheet
 * cannot scroll, and pushes its action row off the bottom).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  CALENDAR_UPCOMING_SHOWN,
  calendarPauseConsequences,
  calendarRemoveBlockedAdvice,
  calendarRemoveConfirmMessage,
  calendarUpcomingWhenLabel,
  describeUpcomingBookingCount,
  type CalendarDialogTerms,
  type CalendarRemoveCheck,
  type CalendarUpcomingBookings,
} from '@/lib/venue/calendar-upcoming-bookings';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Height of a sheet that carries the list: tall enough for six bookings and what follows. */
const LIST_SHEET_HEIGHT = '80%';

/**
 * The bookings still on a calendar: date and time, who, and what for. Short on
 * purpose: the point is "these people are still coming", and the diary is
 * where the full list lives.
 */
export function CalendarUpcomingBookingsList({ upcoming }: { upcoming: CalendarUpcomingBookings }) {
  const { colors } = useTheme();
  const shown = upcoming.bookings.slice(0, CALENDAR_UPCOMING_SHOWN);
  const more = upcoming.total - shown.length;
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  return (
    <View
      accessibilityLabel="Upcoming bookings on this calendar"
      style={[styles.list, { borderColor: colors.border }]}>
      {shown.map((booking, index) => (
        <View key={booking.key} style={[styles.row, index > 0 ? divider : null]}>
          <Text variant="bodySmall">{calendarUpcomingWhenLabel(booking)}</Text>
          <Text variant="caption" tone="secondary">
            {`${booking.who}, ${booking.what}`}
          </Text>
        </View>
      ))}
      {more > 0 ? (
        <View style={[styles.row, shown.length > 0 ? divider : null]}>
          <Text variant="caption" tone="secondary">{`and ${more} more`}</Text>
        </View>
      ) : null}
    </View>
  );
}

type PauseSheetProps = {
  /** Null hides the sheet. */
  target: { calendarName: string; upcoming: CalendarUpcomingBookings } | null;
  terms: CalendarDialogTerms;
  /** The pause is being saved. */
  loading: boolean;
  onGoBack: () => void;
  onConfirm: () => void;
};

export function CalendarPauseSheet({ target, terms, loading, onGoBack, onConfirm }: PauseSheetProps) {
  const name = target?.calendarName.trim() || 'This calendar';
  return (
    <Sheet visible={target != null} onClose={onGoBack} fill maxHeight={LIST_SHEET_HEIGHT}>
      {target ? (
        <View style={styles.fillBody}>
          <Text variant="subheading">{`Pause ${name}?`}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text variant="bodySmall" tone="secondary">
              {`${name} still has ${describeUpcomingBookingCount(target.upcoming, terms.booking)}:`}
            </Text>
            <CalendarUpcomingBookingsList upcoming={target.upcoming} />
            <Text variant="label">{`If you pause ${name}:`}</Text>
            {calendarPauseConsequences(name, target.upcoming, terms).map((line) => (
              <Text key={line} variant="bodySmall" tone="secondary">
                {`• ${line}`}
              </Text>
            ))}
            <Text variant="caption" tone="muted">
              {`You can switch ${name} back on whenever you like.`}
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label="Go back"
              variant="secondary"
              style={styles.flex1}
              disabled={loading}
              onPress={onGoBack}
            />
            <Button
              label="Pause calendar"
              style={styles.flex1}
              loading={loading}
              onPress={onConfirm}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

type RemoveSheetProps = {
  /** Null hides the sheet. */
  target: { calendarName: string; isActive: boolean } | null;
  /** Where the question "who is still booked on it?" stands. */
  check: CalendarRemoveCheck;
  terms: CalendarDialogTerms;
  /** The removal is being sent. */
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function CalendarRemoveSheet({
  target,
  check,
  terms,
  loading,
  onConfirm,
  onClose,
}: RemoveSheetProps) {
  // The list needs a scrolling, fixed-height sheet; the short confirm does not.
  const blocked = check.state === 'blocked';
  return (
    <Sheet
      visible={target != null}
      onClose={onClose}
      fill={blocked}
      maxHeight={blocked ? LIST_SHEET_HEIGHT : undefined}>
      {!target ? null : check.state === 'blocked' ? (
        <View style={styles.fillBody}>
          <Text variant="subheading">{`${target.calendarName} cannot be removed yet`}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text variant="bodySmall" tone="secondary">
              {`${target.calendarName} still has ${describeUpcomingBookingCount(check.upcoming, terms.booking)}:`}
            </Text>
            <CalendarUpcomingBookingsList upcoming={check.upcoming} />
            {calendarRemoveBlockedAdvice(target.calendarName, check.upcoming, target.isActive).map(
              (line) => (
                <Text key={line} variant="bodySmall" tone="secondary">
                  {line}
                </Text>
              ),
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Button label="Close" variant="secondary" style={styles.flex1} onPress={onClose} />
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text variant="subheading">Remove calendar?</Text>
          <Text variant="bodySmall" tone="secondary">
            {calendarRemoveConfirmMessage(target.calendarName, terms, check.state)}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={loading}
              onPress={onClose}
            />
            <Button
              label="Remove calendar"
              variant="danger"
              style={styles.flex1}
              loading={loading}
              // Held back until the question is answered; Cancel stays usable.
              disabled={check.state === 'checking'}
              onPress={onConfirm}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  fillBody: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding (they delegate it to the
    // child), so pad the body itself to match the standard sheet inset.
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  list: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
