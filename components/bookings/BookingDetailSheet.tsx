import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useReduceMotion, motionSafe } from '@/lib/motion';
import { SymbolView } from 'expo-symbols';

import { BookingDetailContent } from '@/components/bookings/BookingDetailContent';
import { useSheetKeyboardScroll } from '@/components/bookings/sheet-scroll-context';
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
  /** Practitioner/staff name from the list row — the detail GET omits it. */
  fallbackPractitionerName?: string | null;
};

/**
 * Tracks soft-keyboard visibility so the pinned action bar yields while typing.
 *
 * Deliberately consumed ONLY by {@link KeyboardAwareActionBar} below, never by
 * the sheet itself. This is the one place in the app that answers keyboard
 * events with React state rather than a Reanimated shared value, because the
 * bar mounts and unmounts (it has enter/exit animations) and a shared value
 * cannot drive that. Keeping the subscription down here bounds the cost to the
 * bar: iOS re-emits `keyboardDidShow` every time the keyboard reconfigures —
 * moving between fields with different `keyboardType` produced bursts of four
 * in 20ms in a 2026-08-09 trace — and each of those used to re-render the whole
 * booking detail tree.
 */
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
 * The pinned primary-action bar, which hides itself while the keyboard is up so
 * it never sits on top of the field being typed into.
 *
 * Its own component so the keyboard subscription re-renders this bar alone. The
 * scroll body reserves room for it unconditionally, so nothing above has to know
 * whether it is currently showing.
 */
function KeyboardAwareActionBar({
  label,
  colors,
  reduceMotion,
  loading,
  actionColors,
  onPress,
}: {
  label: string;
  colors: { border: string; surfaceRaised: string };
  reduceMotion: boolean;
  loading: boolean;
  actionColors: ReturnType<typeof primaryActionColors>;
  onPress: () => void;
}) {
  const keyboardVisible = useKeyboardVisible();
  if (keyboardVisible) return null;
  return (
    <Animated.View
      entering={motionSafe(FadeInDown.duration(180), reduceMotion)}
      exiting={motionSafe(FadeOutDown.duration(120), reduceMotion)}
      style={[
        styles.actionBar,
        { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised },
      ]}>
      <Button
        label={label}
        variant="primary"
        customColors={actionColors}
        size="lg"
        fullWidth
        loading={loading}
        onPress={onPress}
      />
    </Animated.View>
  );
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
  fallbackPractitionerName,
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
  const { onScroll, spacerStyle } = useSheetKeyboardScroll(scrollRef);

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

  return (
    <Sheet visible={!!bookingId} onClose={onClose} fill maxHeight="94%" keyboardAvoidance="overlay">
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
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              // Room for the pinned bar is reserved whether or not it is showing.
              // It only hides while the keyboard is up, and the keyboard covers
              // that space anyway — so making this conditional bought nothing and
              // cost a re-render of this whole tree per keyboard event.
              primaryAction ? styles.scrollContentWithBar : null,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={onScroll}
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
                showPrimaryAction={false}
                fallbackServiceName={fallbackServiceName}
                fallbackPractitionerName={fallbackPractitionerName}
              />
            </Animated.View>
          </ScrollView>

          {primaryAction ? (
            <KeyboardAwareActionBar
              label={primaryAction.label}
              colors={colors}
              reduceMotion={reduceMotion}
              loading={updateStatus.isPending}
              actionColors={primaryActionColors(primaryAction.target)}
              onPress={() => handleStatusChange(primaryAction.target)}
            />
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
