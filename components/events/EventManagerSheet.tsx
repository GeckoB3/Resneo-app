import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { EventAttendees } from '@/components/events/EventAttendees';
import { EventEditorSheet, type EventEditorTarget } from '@/components/events/EventEditorSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCancelEvent, useDeleteEvent, useManagedEvents } from '@/lib/queries/useEventsManage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedEvent } from '@/types/events-manage';

type EventManagerSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** "HH:mm" from a stored "HH:mm[:ss]" time. */
function shortTime(time: string): string {
  return time.slice(0, 5);
}

/** Payment summary line. */
function paymentSummary(event: ManagedEvent): string {
  const req = event.payment_requirement ?? 'none';
  if (req === 'full_payment') return 'Full payment online';
  if (req === 'deposit') {
    const amount = formatPence(event.deposit_amount_pence ?? null);
    return amount ? `Deposit ${amount}` : 'Deposit online';
  }
  return 'No online payment';
}

/**
 * In-app event manager — opened from a header action on /events. Lists every
 * event with its date/time, capacity, ticket tiers and payment rule, plus Edit,
 * Delete, admin Cancel-and-notify, and "New event". Replaces the previous
 * "managed on the web dashboard" dead-end.
 */
export function EventManagerSheet({ visible, onClose }: EventManagerSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';

  const query = useManagedEvents();
  const deleteEvent = useDeleteEvent();
  const cancelEvent = useCancelEvent();

  const [editorTarget, setEditorTarget] = useState<EventEditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ManagedEvent | null>(null);
  // Event whose attendee roster is open. The manager lists EVERY event,
  // including inactive / out-of-window ones that drop off the read Events
  // screen (it sources the active schedule feed), so this is the only in-app
  // path to those rosters.
  const [rosterTarget, setRosterTarget] = useState<ManagedEvent | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const allEvents = useMemo(() => query.data ?? [], [query.data]);
  // Same fields the web event-manager search matches: name, date, description.
  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.event_date.includes(q) ||
        (e.description ?? '').toLowerCase().includes(q),
    );
  }, [allEvents, search]);

  const onDelete = useCallback(() => {
    const event = deleteTarget;
    if (!event) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        hapticSuccess();
        setDeleteTarget(null);
        toast.success(`"${event.name}" deleted.`);
      },
      onError: (e) => {
        hapticWarning();
        setDeleteTarget(null);
        toast.error(
          e instanceof ApiError ? e.message : 'Could not delete the event. Please try again.',
        );
      },
    });
  }, [deleteTarget, deleteEvent, toast]);

  const onCancel = useCallback(() => {
    const event = cancelTarget;
    if (!event) return;
    cancelEvent.mutate(event.id, {
      onSuccess: () => {
        hapticSuccess();
        setCancelTarget(null);
        toast.success(`"${event.name}" cancelled — guests will be notified.`);
      },
      onError: (e) => {
        hapticWarning();
        setCancelTarget(null);
        toast.error(
          e instanceof ApiError ? e.message : 'Could not cancel the event. Please try again.',
        );
      },
    });
  }, [cancelTarget, cancelEvent, toast]);

  return (
    <>
      <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
        <View style={styles.header}>
          <Text variant="subheading">Events</Text>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={onClose}
          />
        </View>

        {query.isLoading ? (
          <ListSkeleton />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError ? query.error.message : 'Could not load events.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }>
            <Button
              label="New event"
              fullWidth
              onPress={() => setEditorTarget({ mode: 'create' })}
            />

            {allEvents.length > 0 ? (
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search events"
                accessibilityLabel="Search events"
              />
            ) : null}

            {allEvents.length === 0 ? (
              <EmptyState
                title="No events yet"
                message="Create your first ticketed event — workshops, socials, experiences — to start selling tickets."
              />
            ) : events.length === 0 ? (
              <EmptyState
                title="No matches"
                message={`No events match "${search.trim()}".`}
              />
            ) : (
              events.map((event) => {
                const ticketCount = event.ticket_types.length;
                const lowest = event.ticket_types.reduce<number | null>(
                  (min, t) => (min === null || t.price_pence < min ? t.price_pence : min),
                  null,
                );
                const fromPrice = lowest != null ? formatPence(lowest) : null;
                return (
                  <Card key={event.id} style={styles.eventCard}>
                    <View style={styles.eventHeader}>
                      <View style={styles.eventText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {event.name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {formatDayHeading(event.event_date)} · {shortTime(event.start_time)}–
                          {shortTime(event.end_time)}
                        </Text>
                      </View>
                      {event.is_active === false ? <Badge label="Inactive" tone="neutral" /> : null}
                    </View>

                    <View style={styles.metaGrid}>
                      <Text variant="caption" tone="secondary">
                        Up to {event.capacity}
                        {ticketCount > 0 ? ` · ${ticketCount} ticket type${ticketCount > 1 ? 's' : ''}` : ''}
                        {fromPrice ? ` · from ${fromPrice}` : ''}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {paymentSummary(event)}
                      </Text>
                    </View>

                    <Button
                      label="View attendees"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => setRosterTarget(event)}
                    />

                    <View style={styles.actionsRow}>
                      <Button
                        label="Edit"
                        variant="secondary"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setEditorTarget({ mode: 'edit', event })}
                      />
                      <Button
                        label="Delete"
                        variant="ghost"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setDeleteTarget(event)}
                      />
                    </View>
                    {isAdmin ? (
                      <Button
                        label="Cancel event & notify guests"
                        variant="ghost"
                        size="sm"
                        onPress={() => setCancelTarget(event)}
                      />
                    ) : null}
                  </Card>
                );
              })
            )}
            <View style={styles.spacer} />
          </ScrollView>
        )}
      </Sheet>

      {/* Create / edit an event */}
      <EventEditorSheet target={editorTarget} onClose={() => setEditorTarget(null)} />

      {/* Delete confirm */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.confirmSheet}>
          <Text variant="subheading">Delete event</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone, and will be blocked if
            the event has active bookings (cancel it first).
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setDeleteTarget(null)}
            />
            <Button
              label="Delete"
              variant="danger"
              style={styles.flex1}
              loading={deleteEvent.isPending}
              onPress={onDelete}
            />
          </View>
        </View>
      </Sheet>

      {/* Cancel-and-notify confirm (admin) */}
      <Sheet visible={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
        <View style={styles.confirmSheet}>
          <Text variant="subheading">Cancel event</Text>
          <Text variant="bodySmall" tone="secondary">
            Cancel &quot;{cancelTarget?.name}&quot;? All active bookings will be cancelled and
            refunded per your policy, and guests will be notified. This cannot be undone.
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Keep event"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setCancelTarget(null)}
            />
            <Button
              label="Cancel event"
              variant="danger"
              style={styles.flex1}
              loading={cancelEvent.isPending}
              onPress={onCancel}
            />
          </View>
        </View>
      </Sheet>

      {/* Attendee roster — reachable for EVERY managed event, including
          inactive / out-of-window ones missing from the read Events screen. */}
      <Sheet visible={rosterTarget !== null} onClose={() => setRosterTarget(null)} maxHeight="92%" fill>
        <View style={styles.header}>
          <View style={styles.rosterTitle}>
            <Text variant="subheading" numberOfLines={1}>
              {rosterTarget?.name ?? 'Attendees'}
            </Text>
            {rosterTarget ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {formatDayHeading(rosterTarget.event_date)} · {shortTime(rosterTarget.start_time)}–
                {shortTime(rosterTarget.end_time)}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={() => setRosterTarget(null)}
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.rosterContent}
          keyboardShouldPersistTaps="handled">
          {rosterTarget ? (
            <EventAttendees
              eventId={rosterTarget.id}
              eventName={rosterTarget.name}
              eventDate={rosterTarget.event_date}
              onOpenBooking={setDetailBookingId}
            />
          ) : null}
          <View style={styles.spacer} />
        </ScrollView>
      </Sheet>

      {/* Booking command-centre for a tapped attendee. */}
      <BookingDetailSheet bookingId={detailBookingId} onClose={() => setDetailBookingId(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rosterTitle: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rosterContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  eventCard: {
    gap: spacing.sm,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  eventText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  confirmSheet: {
    gap: spacing.md,
  },
});
