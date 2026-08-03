import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { isAppointmentExperience } from '@/lib/venue/venue-experience';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import type { BookingStatus } from '@/types/booking-detail';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const bookingId = typeof id === 'string' ? id : undefined;
  const detailQuery = useBookingDetail(bookingId);
  const dashboardQuery = useDashboardHome();
  const staffQuery = useStaffMe();
  const { venue } = useVenueContext();
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const actionLoading = updateStatus.isPending;

  const payload = dashboardQuery.data;
  const isAppointmentVenue = payload
    ? isAppointmentExperience(
        payload.pricing_tier,
        payload.booking_model,
        payload.enabled_models,
        Boolean(payload.table_focus_secondaries_enabled),
      )
    : isAppointmentExperience(
        venue?.pricing_tier,
        venue?.booking_model,
        venue?.enabled_models,
        false,
      );

  const handleStatusChange = (status: BookingStatus) => {
    if (!bookingId) {
      return;
    }
    updateStatus.mutate(status, {
      onSuccess: () => {
        // Warning buzz for the destructive states; success for forward progress.
        if (status === 'Cancelled' || status === 'No-Show') {
          hapticWarning();
        } else {
          hapticSuccess();
        }
      },
      onError: (error) => {
        hapticWarning();
        toast.error(error instanceof ApiError ? error.message : 'Could not update booking.');
      },
    });
  };

  if (!bookingId) {
    return (
      <Screen>
        <ErrorState message="Missing booking id in the route." />
      </Screen>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Screen padded={false}>
        <DetailSkeleton />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : detailQuery.error?.message ?? 'Could not load this booking.';
    return (
      <Screen>
        <ErrorState message={message} onRetry={() => void detailQuery.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <BookingDetailContent
          actionLoading={actionLoading}
          booking={detailQuery.data}
          detailPending={detailQuery.isPlaceholderData}
          isAdmin={isAdmin}
          isAppointmentVenue={isAppointmentVenue}
          onStatusChange={handleStatusChange}
          onDeleted={() => router.back()}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});
