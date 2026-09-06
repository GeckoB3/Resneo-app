import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useAcceptUnpaidGuard } from '@/components/bookings/AcceptUnpaidSheet';
import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import type { LinkedBookingContext } from '@/lib/linked/linked-detail-policy';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { isAppointmentExperience } from '@/lib/venue/venue-experience';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import type { BookingStatus } from '@/types/booking-detail';
import type { LinkActionLevel } from '@/types/linked-venues';

const LINK_ACTS: readonly LinkActionLevel[] = ['none', 'edit_existing', 'create_edit_cancel'];

type Params = {
  id: string;
  /**
   * A linked venue's booking opened full screen from the diary's sheet: the
   * grant and the venue ride along, since this route has no diary to learn
   * them from. Absent for our own booking.
   */
  linkedAct?: string;
  linkedVenueId?: string;
  linkedVenueName?: string;
  linkedPii?: string;
  linkedPractitionerName?: string;
};

export default function BookingDetailScreen() {
  const { id, linkedAct, linkedVenueId, linkedVenueName, linkedPii, linkedPractitionerName } =
    useLocalSearchParams<Params>();
  const router = useRouter();
  const toast = useToast();
  const bookingId = typeof id === 'string' ? id : undefined;
  const detailQuery = useBookingDetail(bookingId);
  const dashboardQuery = useDashboardHome();
  const staffQuery = useStaffMe();
  const { venue } = useVenueContext();
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const acceptUnpaidGuard = useAcceptUnpaidGuard();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  // The link context, only when the params spell out a real grant and venue.
  const linked = useMemo<LinkedBookingContext | null>(() => {
    const act = LINK_ACTS.find((a) => a === linkedAct);
    if (!act || typeof linkedVenueId !== 'string' || !linkedVenueId) return null;
    return {
      act,
      venueId: linkedVenueId,
      venueName: typeof linkedVenueName === 'string' && linkedVenueName ? linkedVenueName : 'Linked venue',
      pii: linkedPii === '1',
      practitionerName:
        typeof linkedPractitionerName === 'string' && linkedPractitionerName
          ? linkedPractitionerName
          : null,
    };
  }, [linkedAct, linkedVenueId, linkedVenueName, linkedPii, linkedPractitionerName]);

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
    const run = (acceptUnpaid: boolean) => {
      updateStatus.mutate(acceptUnpaid ? { status, accept_unpaid: true } : status, {
        onSuccess: () => {
          // Warning buzz for the destructive states; success for forward progress.
          if (status === 'Cancelled' || status === 'No-Show') {
            hapticWarning();
          } else {
            hapticSuccess();
          }
        },
        onError: (error) => {
          // Accepting a Pending booking whose deposit is still owed: offer the
          // payment link or an explicit accept rather than an error toast.
          if (!acceptUnpaid && acceptUnpaidGuard.intercept(bookingId, error, () => run(true))) {
            return;
          }
          hapticWarning();
          toast.error(error instanceof ApiError ? error.message : 'Could not update booking.');
        },
      });
    };
    run(false);
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
          fallbackPractitionerName={linked?.practitionerName}
          linked={linked}
        />
      </ScrollView>
      {acceptUnpaidGuard.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});
