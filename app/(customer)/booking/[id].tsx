import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { BookingActions } from '@/components/customer/BookingActions';
import { BookingCardHoldCard } from '@/components/customer/BookingCardHoldCard';
import { BookingDetailBody } from '@/components/customer/BookingDetailBody';
import { GroupActions } from '@/components/customer/GroupActions';
import { RescheduleSheet } from '@/components/customer/RescheduleSheet';
import { VisitActions } from '@/components/customer/VisitActions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import {
  bookingCardLabel,
  bookingCardOnFile,
  useBookingCardAction,
  useBookingCardRemovalText,
  type BookingCardOnFile,
} from '@/lib/queries/useBookingCardActions';
import { useCustomerBookingDetail, type CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import { useCustomerGroup } from '@/lib/queries/useCustomerGroup';
import { useCustomerVisit } from '@/lib/queries/useCustomerVisit';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * One booking, in full.
 *
 * The body is `GET /api/v1/me/bookings/[id]`, which returns the SHARED booking
 * DTO: the same object the web's own detail page renders. That is why this
 * screen is a rendering job rather than a second interpretation of a booking,
 * and why a field the web adds arrives here without a second design decision.
 *
 * A booking that is one service of a multi-service visit (`in_visit`) shows the
 * whole visit instead, and acts on it whole (web split-visit plan 6.5 to 6.7,
 * 8.9), as the web's manage page does through `GuestVisitPanel`. That holds
 * for a service the business has since cancelled: a universal link or a push
 * for it still opens the visit, rather than a cancelled booking with nothing to
 * do (G5).
 *
 * A booking a card on file secures shows its card section here (web plan §5.4, C6): "Secured by
 * your saved card (Visa ending 4242)", with "This wasn't me" and "Remove my saved card" through
 * `POST /api/v1/me/bookings/[id]/card`, the route the web portal uses.
 */
export default function CustomerBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [rescheduling, setRescheduling] = useState(false);
  const { data, isLoading, isError, refetch } = useCustomerBookingDetail(id);
  // One person's appointment of a group booking shows the whole group (web PUBLIC-19).
  const inGroup = data?.in_group === true;
  const inVisit = data?.in_visit === true && !inGroup;
  const groupQuery = useCustomerGroup(id, inGroup);
  const refetchGroup = groupQuery.refetch;
  const visitQuery = useCustomerVisit(id, inVisit);
  const refetchVisit = visitQuery.refetch;
  // A visit of one service is just a booking: today's screen, unchanged.
  const visit = visitQuery.data?.multi_service ? visitQuery.data : null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([refetch(), inVisit ? refetchVisit() : null, inGroup ? refetchGroup() : null])
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refetch, refetchVisit, refetchGroup, inVisit, inGroup]);

  if (isLoading || (inVisit && visitQuery.isLoading) || (inGroup && groupQuery.isLoading)) {
    return <LoadingState message="Loading your booking…" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load this booking"
        message="It may have been removed, or your connection dropped."
        onRetry={() => void refetch()}
      />
    );
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
  );

  if (inGroup && groupQuery.data) {
    return (
      <Screen scroll padded refreshControl={refreshControl}>
        <Stack.Screen options={{ title: 'Your group booking' }} />
        <View style={styles.stack}>
          <GroupActions bookingId={data.booking_id} group={groupQuery.data} />
          <BookingDetailBody booking={data} inGroup />
          <BookingCardSection booking={data} />
        </View>
      </Screen>
    );
  }

  // A group that could not be read falls through to this person's own appointment and its own
  // actions, which act on this person only, as they always have.

  if (inVisit && visit) {
    return (
      <Screen scroll padded refreshControl={refreshControl}>
        <Stack.Screen options={{ title: 'Your visit' }} />
        <View style={styles.stack}>
          <BookingDetailBody booking={data} visit={visit} />
          <BookingCardSection booking={data} />
          <VisitActions bookingId={data.booking_id} visit={visit} />
        </View>
      </Screen>
    );
  }

  if (inVisit && visitQuery.isError) {
    /*
      The visit could not be read. Offering this one service's change or
      cancel instead would act on part of a visit (the server refuses the
      change, and a cancel takes every service with it), so nothing is offered
      until the visit loads.
    */
    return (
      <Screen scroll padded refreshControl={refreshControl}>
        <View style={styles.stack}>
          <BookingDetailBody booking={data} />
          <Card>
            <Text variant="body">
              This booking is part of a visit with more than one service, and we could not load the rest of it.
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              loading={visitQuery.isFetching}
              onPress={() => void refetchVisit()}
              style={styles.gap}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded refreshControl={refreshControl}>
      <View style={styles.stack}>
        <BookingDetailBody booking={data} />
        <BookingCardSection booking={data} />
        <BookingActions
          booking={data}
          onReschedule={() => setRescheduling(true)}
          onCancelled={() => router.back()}
        />
      </View>
      <RescheduleSheet
        booking={data}
        visible={rescheduling}
        onClose={() => setRescheduling(false)}
      />
    </Screen>
  );
}

/** The booking's card part: its own section for a card on file, otherwise the shared card. */
function BookingCardSection({ booking }: { booking: CustomerBookingDetail }) {
  const onFile = bookingCardOnFile(booking.card_hold);
  if (onFile) {
    return (
      <CardOnFileSection
        bookingId={booking.booking_id}
        onFile={onFile}
        feePence={booking.card_hold?.fee_pence ?? 0}
        currency={booking.venue_currency ?? 'GBP'}
      />
    );
  }
  return (
    <BookingCardHoldCard
      hold={booking.card_hold}
      venueId={booking.venue_id}
      currency={booking.venue_currency ?? 'GBP'}
      manageUrl={booking.manage_booking_url}
    />
  );
}

const NOT_ME_DONE = "Thank you. Your card won't be used for this booking.";
const REMOVE_FALLBACK = "It won't be used for new bookings.";

function actionError(error: unknown): string {
  return error instanceof ApiError && error.status === 409 && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

/**
 * "Secured by your saved card" (web plan §5.4, §5.5): "This wasn't me" when the card was not saved
 * in this booking (confirm, then the business is told), and "Remove my saved card" for the
 * client's own card (the server's words, then "Remove card" or "Keep card").
 */
function CardOnFileSection({
  bookingId,
  onFile,
  feePence,
  currency,
}: {
  bookingId: string;
  onFile: BookingCardOnFile;
  feePence: number;
  currency: string;
}) {
  const toast = useToast();
  const action = useBookingCardAction(bookingId);
  const removalText = useBookingCardRemovalText(bookingId);
  const [notMeOpen, setNotMeOpen] = useState(false);
  const [removal, setRemoval] = useState<{ message: string; loading: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const label = bookingCardLabel(onFile.card);
  const fee = feePence > 0 ? `No-show fee up to ${formatPence(feePence, currency) ?? ''}.` : null;

  const openRemoval = () => {
    setRemoval({ message: '', loading: true });
    void removalText(REMOVE_FALLBACK).then((message) =>
      setRemoval((current) => (current ? { message, loading: false } : current)),
    );
  };

  return (
    <Card testID="booking-card-on-file">
      <Text variant="overline" tone="secondary">
        CARD
      </Text>
      <Text variant="bodyMedium" style={styles.gap}>
        {label ? `Secured by your saved card (${label})` : 'Secured by your saved card'}
      </Text>
      {fee ? (
        <Text variant="bodySmall" tone="secondary">
          {fee}
        </Text>
      ) : null}
      {done ? (
        <Text variant="bodySmall" style={styles.gap}>
          {done}
        </Text>
      ) : (
        <View style={styles.actions}>
          {!onFile.saved_here ? (
            <Button label="This wasn't me" variant="secondary" onPress={() => setNotMeOpen(true)} fullWidth />
          ) : null}
          {onFile.own ? (
            <Button label="Remove my saved card" variant="secondary" onPress={openRemoval} fullWidth />
          ) : null}
        </View>
      )}
      <ConfirmSheet
        visible={notMeOpen}
        title="Not your card?"
        message="If you didn't make this booking with your saved card, tell us and your card won't be used for it. The business will be told."
        confirmLabel="This wasn't me"
        cancelLabel="Go back"
        destructive={false}
        loading={action.isPending}
        onClose={() => setNotMeOpen(false)}
        onConfirm={() =>
          action.mutate(
            { action: 'not_me' },
            {
              onSuccess: (body) => {
                setNotMeOpen(false);
                setDone(body.message || NOT_ME_DONE);
              },
              onError: (error) => toast.error(actionError(error)),
            },
          )
        }
      />
      <ConfirmSheet
        visible={removal !== null}
        title="Remove your saved card?"
        message={removal?.message ?? ''}
        confirmLabel="Remove card"
        cancelLabel="Keep card"
        loading={action.isPending || Boolean(removal?.loading)}
        onClose={() => setRemoval(null)}
        onConfirm={() =>
          action.mutate(
            { action: 'remove_card' },
            {
              onSuccess: (body) => {
                setRemoval(null);
                setDone(`Your card is removed. ${body.message ?? ''}`.trim());
                toast.success('Card removed.');
              },
              onError: (error) => toast.error(actionError(error)),
            },
          )
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
  gap: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
