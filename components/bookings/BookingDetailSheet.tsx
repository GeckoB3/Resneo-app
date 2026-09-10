import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { useSheetKeyboardScroll } from '@/components/bookings/sheet-scroll-context';
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
import { useAcceptUnpaidGuard } from '@/components/bookings/AcceptUnpaidSheet';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import type { LinkedBookingContext } from '@/lib/linked/linked-detail-policy';
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
  /**
   * Service label from the list row that opened the sheet — keeps the service
   * name in the hero for plain services the detail GET leaves unnamed.
   */
  fallbackServiceName?: string | null;
  /** Practitioner/staff name from the list row — the detail GET omits it. */
  fallbackPractitionerName?: string | null;
  /**
   * Set when the booking belongs to a linked venue and was reached through the
   * link (a partner's column on the diary, its row on the Bookings tab). The
   * same panel opens; the grant decides what it offers
   * (`lib/linked/linked-detail-policy`, web `linkedAct`).
   */
  linked?: LinkedBookingContext | null;
};


/**
 * The full booking command-centre — the same {@link BookingDetailContent} the
 * dedicated `/booking/[id]` screen renders, surfaced inline as a tall,
 * scrollable bottom sheet so staff can open a booking from the calendar grid,
 * the bookings list, or a contact's history without losing their place.
 *
 * The most common next step — advancing the booking's status — is pinned to a
 * bottom bar so it stays reachable however far the body is scrolled.
 */
export function BookingDetailSheet({
  bookingId,
  onClose,
  onOpenFull,
  fallbackServiceName,
  fallbackPractitionerName,
  linked = null,
}: BookingDetailSheetProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const detailQuery = useBookingDetail(bookingId ?? undefined);
  const dashboardQuery = useDashboardHome();
  const staffQuery = useStaffMe();
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const acceptUnpaidGuard = useAcceptUnpaidGuard();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, onLayout, onContentSizeChange, spacerStyle } =
    useSheetKeyboardScroll(scrollRef);

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
    const run = (acceptUnpaid: boolean) => {
      updateStatus.mutate(acceptUnpaid ? { status, accept_unpaid: true } : status, {
        onSuccess: () => {
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
          toast.error(error instanceof ApiError ? error.message : 'Could not update booking.');
        },
      });
    };
    run(false);
  };

  const openFull = () => {
    if (!bookingId) return;
    if (onOpenFull) {
      onOpenFull(bookingId);
    } else if (linked) {
      // The full-screen route has no diary to learn the link from, so the
      // context rides along as params (see `app/(app)/booking/[id].tsx`).
      router.push({
        pathname: '/booking/[id]',
        params: {
          id: bookingId,
          linkedAct: linked.act,
          linkedVenueId: linked.venueId,
          linkedVenueName: linked.venueName,
          linkedPii: linked.pii ? '1' : '0',
          ...(linked.practitionerName ? { linkedPractitionerName: linked.practitionerName } : {}),
        },
      } as Href);
    } else {
      router.push(`/booking/${bookingId}` as Href);
    }
    onClose();
  };

  const booking = detailQuery.data;

  return (
    <Sheet visible={!!bookingId} onClose={onClose} fill maxHeight="94%" keyboardAvoidance="overlay">
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text variant="subheading">{isAppointmentVenue ? 'Appointment' : 'Booking'}</Text>
          {linked ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {`Linked · ${linked.venueName}`}
            </Text>
          ) : null}
        </View>
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
      ) : detailQuery.isError || !booking ? (
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
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={onScroll}
            onLayout={onLayout}
            onContentSizeChange={onContentSizeChange}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}>
            {/* Keyboard overlays the body; this spacer adds scrollable room at the
                bottom so the focused field can be lifted clear of the keyboard. */}
            <Animated.View style={spacerStyle}>
              <BookingDetailContent
                actionLoading={updateStatus.isPending}
                booking={booking}
                detailPending={detailQuery.isPlaceholderData}
                isAdmin={isAdmin}
                isAppointmentVenue={isAppointmentVenue}
                onStatusChange={handleStatusChange}
                onDeleted={onClose}
                fallbackServiceName={fallbackServiceName}
                fallbackPractitionerName={fallbackPractitionerName}
                linked={linked}
              />
            </Animated.View>
          </ScrollView>
        </>
      )}

      {/* Inside this Sheet on purpose: a Modal nested in the presented Modal's
          own tree is the pattern that works on iOS (same as Modify/Deposit).
          A sibling would present from the root while this one is up. */}
      {acceptUnpaidGuard.sheet}
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
  headerTitle: {
    flexShrink: 1,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
});
