import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useReduceMotion, motionSafe } from '@/lib/motion';
import { SymbolView } from 'expo-symbols';

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { SheetScrollProvider } from '@/components/bookings/sheet-scroll-context';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { primaryActionColors } from '@/lib/booking/booking-action-colors';
import { bookingDetailActions } from '@/lib/booking/booking-status-actions';
import { isTableReservationBooking } from '@/lib/booking/infer-booking-row-model';
import { useToast } from '@/providers/ToastProvider';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useScreenCaptureProtection } from '@/lib/security/useScreenCaptureProtection';
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
  /**
   * Service label from the list row that opened the sheet — keeps the service
   * name in the hero for plain services the detail GET leaves unnamed.
   */
  fallbackServiceName?: string | null;
};

/** Tracks soft-keyboard visibility so the pinned action bar yields while typing. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Engages screen-capture protection for as long as it stays mounted. Rendered
 * only while the sheet is open, so its `useFocusEffect` cleanup (which fires on
 * unmount as well as blur) releases protection the moment the sheet closes —
 * giving the focus-scoped helper an explicit open/closed gate. The booking
 * detail shows guest PII (name, phone, email, notes, visit history).
 */
function SheetScreenCaptureGuard() {
  useScreenCaptureProtection('booking-detail');
  return null;
}

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
}: BookingDetailSheetProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const toast = useToast();
  const { venue } = useVenueContext();
  const detailQuery = useBookingDetail(bookingId ?? undefined);
  const dashboardQuery = useDashboardHome();
  const staffQuery = useStaffMe();
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const scrollRef = useRef<ScrollView>(null);
  const keyboardVisible = useKeyboardVisible();

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

  const booking = detailQuery.data;
  const isTable = booking ? isTableReservationBooking(booking) : false;
  // The pinned bar surfaces only the forward transition (Confirm / Start /
  // Complete); reverts and destructive actions stay in the scrollable body.
  const primaryAction = booking
    ? bookingDetailActions(booking.status, isTable).find((a) => a.kind === 'primary')
    : undefined;
  const showActionBar = !!primaryAction && !keyboardVisible;

  return (
    <Sheet visible={!!bookingId} onClose={onClose} fill maxHeight="94%">
      {/* Block screenshots / recording while booking PII is on screen. Mounted
          only while open so protection releases the instant the sheet closes. */}
      {bookingId ? <SheetScreenCaptureGuard /> : null}
      <View style={styles.header}>
        <Text variant="subheading">{isAppointmentVenue ? 'Appointment' : 'Booking'}</Text>
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
          <SheetScrollProvider scrollRef={scrollRef}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                showActionBar && styles.scrollContentWithBar,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}>
              <BookingDetailContent
                actionLoading={updateStatus.isPending}
                booking={booking}
                isAdmin={isAdmin}
                isAppointmentVenue={isAppointmentVenue}
                onStatusChange={handleStatusChange}
                onDeleted={onClose}
                showPrimaryAction={false}
                fallbackServiceName={fallbackServiceName}
              />
            </ScrollView>
          </SheetScrollProvider>

          {showActionBar && primaryAction ? (
            <Animated.View
              entering={motionSafe(FadeInDown.duration(180), reduceMotion)}
              exiting={motionSafe(FadeOutDown.duration(120), reduceMotion)}
              style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
              <Button
                label={primaryAction.label}
                variant="primary"
                customColors={primaryActionColors(primaryAction.target)}
                size="lg"
                fullWidth
                loading={updateStatus.isPending}
                onPress={() => handleStatusChange(primaryAction.target)}
              />
            </Animated.View>
          ) : null}
        </>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  scrollContentWithBar: {
    // Clear the pinned action bar so the last card isn't hidden behind it.
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  actionBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
