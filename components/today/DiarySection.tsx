import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingStatus } from '@/types/booking-detail';
import type { DashboardRecentBooking } from '@/types/dashboard';

type DiarySectionProps = {
  recentBookings: DashboardRecentBooking[];
  isAppointment: boolean;
  tableFocusSecondariesEnabled: boolean;
  totalCount?: number;
};

export function DiarySection({
  recentBookings,
  isAppointment,
  tableFocusSecondariesEnabled,
  totalCount,
}: DiarySectionProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const unit = isAppointment && !tableFocusSecondariesEnabled ? 'appointments' : 'bookings';

  const diaryTitle = tableFocusSecondariesEnabled
    ? "Today's diary · all types"
    : isAppointment
    ? "Today's appointments"
    : "Today's bookings";

  const allBookingsLabel = isAppointment && !tableFocusSecondariesEnabled
    ? 'All appointments'
    : 'All bookings';

  function openBooking(id: string) {
    hapticSelect();
    setSelectedBookingId(id);
  }

  function handleOpenFull(id: string) {
    setSelectedBookingId(null);
    router.push(`/(app)/booking/${id}` as Href);
  }

  const showTypeColumn =
    tableFocusSecondariesEnabled ||
    recentBookings.some((b) => b.booking_model && b.booking_model !== 'table_reservation');

  const hasMore = typeof totalCount === 'number' && totalCount > recentBookings.length;

  return (
    <>
      <Card padded={false}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <Text variant="overline" tone="muted">
              DIARY
            </Text>
            <Text variant="label">{diaryTitle}</Text>
          </View>
          <Pressable
            onPress={() => {
              hapticSelect();
              router.push('/(app)/(tabs)/bookings' as Href);
            }}
            style={styles.headerAction}
            accessibilityRole="link"
          >
            <Text variant="caption" color={colors.brand}>
              {allBookingsLabel} →
            </Text>
          </Pressable>
        </View>

        {recentBookings.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              title={isAppointment ? 'No appointments today' : 'No bookings today'}
              message={
                isAppointment
                  ? 'Appointments will appear here as they come in.'
                  : 'Bookings will appear here as they come in.'
              }
            />
          </View>
        ) : (
          <View>
            {recentBookings.map((booking, index) => {
              const isLast = index === recentBookings.length - 1;
              return (
                <Pressable
                  key={booking.id}
                  onPress={() => openBooking(booking.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open booking for ${booking.guest_name} at ${booking.time}`}
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                    pressed && { backgroundColor: colors.surface },
                  ]}
                >
                  <Text variant="bodyMedium" style={styles.timeCol}>
                    {booking.time}
                  </Text>
                  <View style={styles.textCol}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {booking.guest_name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {[
                        booking.party_size > 0 ? String(booking.party_size) : null,
                        showTypeColumn ? (booking.kind_label ?? null) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.pills}>
                    <StatusPill
                      status={booking.status as BookingStatus}
                      isTableReservation={booking.booking_model === 'table_reservation'}
                    />
                    {booking.deposit_status && booking.deposit_status !== 'N/A' ? (
                      <Badge label={booking.deposit_status} tone="neutral" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {hasMore && totalCount ? (
          <Pressable
            onPress={() => {
              hapticSelect();
              router.push('/(app)/(tabs)/bookings' as Href);
            }}
            style={[styles.footer, { borderTopColor: colors.border }]}
            accessibilityRole="link"
          >
            <Text variant="caption" color={colors.brand}>
              {totalCount - recentBookings.length} more {unit}, view all →
            </Text>
          </Pressable>
        ) : null}
      </Card>

      <BookingDetailSheet
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onOpenFull={handleOpenFull}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    gap: 1,
  },
  headerAction: {
    padding: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  empty: {
    padding: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  timeCol: {
    width: 48,
    fontVariant: ['tabular-nums'],
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: 120,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
});
