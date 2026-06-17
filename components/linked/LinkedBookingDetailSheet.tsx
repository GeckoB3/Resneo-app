import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { StatusPill } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { pingLinkedBookingView } from '@/lib/queries/useLinkedCalendar';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkCalendarVisibility, LinkedBooking } from '@/types/linked-venues';

function fmtTime(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

/** One label/value row in the detail list. */
function DetailRow({
  label,
  value,
  isFirst = false,
}: {
  label: string;
  value: React.ReactNode;
  isFirst?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <View style={styles.rowValue}>{value}</View>
    </View>
  );
}

/**
 * Read-only detail for a linked-venue booking the viewer cannot edit — a
 * `time_only` link, or a `full_details` link granting `act = none` (§5.3).
 * Mirrors the web `LinkedBookingDetailModal`. Fires the `viewed_booking` audit
 * ping on open.
 */
export function LinkedBookingDetailSheet({
  venueName,
  visibility,
  booking,
  visible,
  onClose,
}: {
  venueName: string;
  visibility: LinkCalendarVisibility;
  booking: LinkedBooking | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const bookingId = booking?.id;

  useEffect(() => {
    if (visible && bookingId) pingLinkedBookingView(bookingId, accessToken);
  }, [visible, bookingId, accessToken]);

  if (!booking) return null;

  const timeOnly = visibility === 'time_only';
  const timeLabel = booking.bookingEndTime
    ? `${fmtTime(booking.bookingTime)}–${fmtTime(booking.bookingEndTime)}`
    : fmtTime(booking.bookingTime);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text variant="subheading">{`Booking in ${venueName}`}</Text>
        <Text variant="bodySmall" tone="secondary">
          {timeOnly
            ? 'Read-only — this link shows busy/free time blocks only.'
            : 'Read-only — you can view this booking but cannot edit, reschedule or cancel it.'}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <DetailRow
            label="Date"
            isFirst
            value={<Text variant="bodySmall">{booking.bookingDate}</Text>}
          />
          <DetailRow
            label="Time"
            value={<Text variant="bodySmall" style={styles.tabular}>{timeLabel}</Text>}
          />
          <DetailRow label="Status" value={<StatusPill status={booking.status} />} />
          {!timeOnly ? (
            <>
              <DetailRow
                label="Client"
                value={<Text variant="bodySmall">{booking.guestName ?? '—'}</Text>}
              />
              {booking.guestEmail ? (
                <DetailRow
                  label="Email"
                  value={<Text variant="bodySmall">{booking.guestEmail}</Text>}
                />
              ) : null}
              {booking.guestPhone ? (
                <DetailRow
                  label="Phone"
                  value={<Text variant="bodySmall">{booking.guestPhone}</Text>}
                />
              ) : null}
              <DetailRow
                label="Service"
                value={<Text variant="bodySmall">{booking.serviceName ?? '—'}</Text>}
              />
              {typeof booking.partySize === 'number' ? (
                <DetailRow
                  label="Party size"
                  value={<Text variant="bodySmall">{booking.partySize}</Text>}
                />
              ) : null}
              {booking.depositStatus ? (
                <DetailRow
                  label="Deposit"
                  value={<Text variant="bodySmall">{booking.depositStatus}</Text>}
                />
              ) : null}
              {booking.specialRequests?.trim() ? (
                <View style={[styles.notesRow, { borderTopColor: colors.border }]}>
                  <Text variant="bodySmall" tone="muted">
                    Guest notes
                  </Text>
                  <Text variant="bodySmall">{booking.specialRequests}</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {timeOnly ? (
          <View style={[styles.notice, { backgroundColor: colors.surface }]}>
            <Text variant="caption" tone="muted">
              {`${venueName} shares time blocks only. Client and service detail are not visible on this link.`}
            </Text>
          </View>
        ) : (
          <View style={[styles.notice, { backgroundColor: colors.infoSurface, borderColor: colors.info, borderWidth: 1 }]}>
            <Text variant="caption" color={colors.info}>
              {`Linked read-only access — contact ${venueName} or ask them to adjust link permissions if you need to make changes.`}
            </Text>
          </View>
        )}

        <Button label="Close" variant="secondary" fullWidth onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowValue: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  notesRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
