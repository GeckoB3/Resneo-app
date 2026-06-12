import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { ErrorState } from '@/components/ui/ErrorState';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/providers/ToastProvider';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import { isAppointmentExperience } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingStatus } from '@/types/booking-detail';

type BookingDetailSheetProps = {
  /** When set, the sheet is visible and loads this booking. */
  bookingId: string | null;
  onClose: () => void;
  /** Optional — open the standalone full-screen detail (the dedicated route). */
  onOpenFull?: (bookingId: string) => void;
};

/**
 * The full booking command-centre — the same {@link BookingDetailContent} the
 * dedicated `/booking/[id]` screen renders, surfaced inline as a tall,
 * scrollable bottom sheet so staff can open a booking from the calendar grid,
 * the bookings list, or a contact's history without losing their place.
 */
export function BookingDetailSheet({ bookingId, onClose, onOpenFull }: BookingDetailSheetProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const detailQuery = useBookingDetail(bookingId ?? undefined);
  const dashboardQuery = useDashboardHome();
  const staffQuery = useStaffMe();
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const payload = dashboardQuery.data;
  const isAppointmentVenue = payload
    ? isAppointmentExperience(
        payload.pricing_tier,
        payload.booking_model,
        payload.enabled_models,
        Boolean(payload.table_focus_secondaries_enabled),
      )
    : isAppointmentExperience(venue?.pricing_tier, venue?.booking_model, venue?.enabled_models, false);

  const handleStatusChange = (status: BookingStatus) => {
    if (!bookingId) return;
    updateStatus.mutate(status, {
      onSuccess: () => {
        if (status === 'Cancelled' || status === 'No-Show') {
          hapticWarning();
        } else {
          hapticSuccess();
        }
      },
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : 'Could not update booking.');
      },
    });
  };

  const openFull = () => {
    if (!bookingId) return;
    if (onOpenFull) {
      onOpenFull(bookingId);
    } else {
      router.push(`/booking/${bookingId}` as Href);
    }
    onClose();
  };

  return (
    <Sheet visible={!!bookingId} onClose={onClose} fill maxHeight="94%">
      <View style={styles.header}>
        <Text variant="subheading">
          {isAppointmentVenue ? 'Appointment' : 'Booking'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open full screen"
            hitSlop={8}
            onPress={openFull}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <SymbolView
              name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }}
              tintColor={colors.textMuted}
              size={18}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              tintColor={colors.textMuted}
              size={18}
            />
          </Pressable>
        </View>
      </View>

      {detailQuery.isLoading ? (
        <View style={styles.stateBody}>
          <DetailSkeleton />
        </View>
      ) : detailQuery.isError || !detailQuery.data ? (
        <View style={styles.stateBody}>
          <ErrorState
            message={
              detailQuery.error instanceof ApiError
                ? detailQuery.error.message
                : detailQuery.error?.message ?? 'Could not load this booking.'
            }
            onRetry={() => void detailQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BookingDetailContent
            actionLoading={updateStatus.isPending}
            booking={detailQuery.data}
            isAdmin={isAdmin}
            isAppointmentVenue={isAppointmentVenue}
            onStatusChange={handleStatusChange}
            onDeleted={onClose}
          />
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
});
