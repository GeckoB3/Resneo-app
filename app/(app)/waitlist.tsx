import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticWarning } from '@/lib/haptics';
import {
  useActOnWaitlistAlert,
  useDeleteWaitlistEntry,
  useUpdateWaitlistEntry,
  useWaitlist,
  useWaitlistAlerts,
} from '@/lib/queries/useWaitlist';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { WaitlistEntry, WaitlistStatus } from '@/types/waitlist';

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<string, BadgeTone> = {
  waiting: 'warning',
  offered: 'brand',
  confirmed: 'success',
  expired: 'neutral',
  cancelled: 'danger',
};

/** Status-strip colour matching the web's coloured left edge. */
function statusStripColor(
  status: string,
  colors: { warning: string; brand: string; success: string; textMuted: string; danger: string },
): string {
  switch (status) {
    case 'waiting':   return colors.warning;
    case 'offered':   return colors.brand;
    case 'confirmed': return colors.success;
    case 'expired':   return colors.textMuted;
    case 'cancelled': return colors.danger;
    default:          return colors.textMuted;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function entryGuestName(entry: WaitlistEntry): string {
  if (entry.guest_name?.trim()) return entry.guest_name;
  const parts = [entry.guest_first_name, entry.guest_last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Guest';
}

function whenLabel(entry: WaitlistEntry): string {
  const date = entry.desired_date ? formatDayHeading(entry.desired_date) : '';
  const time =
    entry.time_window_label ?? (entry.desired_time ? entry.desired_time.slice(0, 5) : '');
  return [date, time].filter(Boolean).join(' · ');
}

function detailLabel(entry: WaitlistEntry): string | null {
  if (entry.service_name) {
    return [entry.service_name, entry.practitioner_name].filter(Boolean).join(' · ');
  }
  if (entry.party_size) return `${entry.party_size} guests`;
  return null;
}

/** Active = still in the queue (waiting). Matches web `isActiveWaitlistEntry` for appointments. */
function isActive(entry: WaitlistEntry): boolean {
  return entry.status === 'waiting';
}

function isDeletable(entry: WaitlistEntry): boolean {
  return entry.status === 'expired' || entry.status === 'cancelled';
}

/**
 * "Offer expires in 2h 10m" countdown for offered entries.
 * Bug fix: result is computed once and stored — not called twice on the same render.
 */
function offerExpiryLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(remainingMs)) return null;
  if (remainingMs <= 0) return 'Offer expired';
  const totalMinutes = Math.round(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `Offer expires in ${span}`;
}

function formatJoinedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAlertSlot(date?: string, time?: string): string {
  const parts: string[] = [];
  if (date) parts.push(formatDayHeading(date));
  if (time) parts.push(time.slice(0, 5));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type FilterTab = 'active' | 'all';

/** Appointment waitlist — the app is appointments-plan only (no table waitlist). */
export default function WaitlistScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const venueId = venue?.id ?? null;

  const [filter, setFilter] = useState<FilterTab>('active');
  // Tick every 60s so expiry countdowns update without a manual refresh.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const query = useWaitlist('appointment');
  const update = useUpdateWaitlistEntry();
  const deleteMutation = useDeleteWaitlistEntry();

  const waitlistMode = query.data?.waitlist_mode ?? 'notify_in_order';
  const isStaffChoose = waitlistMode === 'staff_choose';

  // Alerts only relevant in staff_choose mode
  const alertsQuery = useWaitlistAlerts(isStaffChoose);
  const actOnAlert = useActOnWaitlistAlert();

  // Realtime subscription — 30s polling fallback
  const onRefresh = useCallback(() => {
    void query.refetch();
    if (isStaffChoose) void alertsQuery.refetch();
  }, [query, alertsQuery, isStaffChoose]);

  const liveState = useVenueLiveSync({
    venueId,
    onRefresh,
    subscriptions: venueId
      ? [{ table: 'waitlist_entries', filter: `venue_id=eq.${venueId}` }]
      : [],
    enabled: !!venueId,
  });

  // Per-entry loading tracking (fixes the "all cards freeze" bug)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Two-step confirm for destructive actions. `Alert.alert` confirms are a
  // no-op on react-native-web (the dev-preview path), so we arm a button (label
  // flips to "Tap to confirm") and disarm after a few seconds if unconfirmed.
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armConfirm = useCallback((token: string) => {
    setPendingConfirm(token);
    hapticWarning();
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setPendingConfirm(null), 4000);
  }, []);

  const clearConfirm = useCallback(() => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setPendingConfirm(null);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const startPending = (id: string) =>
    setPendingIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
  const endPending = (id: string) =>
    setPendingIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  const act = (id: string, status: WaitlistStatus) => {
    clearConfirm();
    startPending(id);
    update.mutate(
      { id, status },
      {
        onSuccess: (data) => {
          endPending(id);
          if (status === 'cancelled') {
            toast.info('Entry cancelled.');
          } else if (status === 'offered') {
            toast.success('Spot offered to the guest.');
          } else {
            toast.success('Booking confirmed.');
          }
          // notify_failed warning — Alert.alert is a web no-op, so toast it.
          if (data.notify_failed) {
            toast.error('Spot offered, but we could not email or SMS the guest. Contact them directly.');
          }
          if (status === 'confirmed' && data.booking_id) {
            router.push(`/booking/${data.booking_id}` as Href);
          }
        },
        onError: (error) => {
          endPending(id);
          toast.error(error instanceof ApiError ? error.message : 'Could not update. Please try again.');
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    clearConfirm();
    startPending(id);
    deleteMutation.mutate(id, {
      onSuccess: () => {
        endPending(id);
        toast.success('Entry removed.');
      },
      onError: (error) => {
        endPending(id);
        toast.error(error instanceof ApiError ? error.message : 'Could not remove. Please try again.');
      },
    });
  };

  const handleAlertAction = (alertId: string, action: 'offer' | 'dismiss') => {
    clearConfirm();
    startPending(`alert-${alertId}`);
    actOnAlert.mutate(
      { id: alertId, action },
      {
        onSuccess: () => {
          endPending(`alert-${alertId}`);
          toast.success(action === 'offer' ? 'Slot offered to matching guests.' : 'Alert dismissed.');
        },
        onError: (error) => {
          endPending(`alert-${alertId}`);
          toast.error(error instanceof ApiError ? error.message : 'Could not perform that action.');
        },
      },
    );
  };

  // Filter
  const allEntries = query.data?.entries ?? [];
  const displayedEntries =
    filter === 'active' ? allEntries.filter(isActive) : allEntries;

  const alerts = alertsQuery.data?.alerts ?? [];

  const liveColor =
    liveState === 'live'
      ? colors.success
      : liveState === 'reconnecting'
        ? colors.warning
        : colors.textMuted;
  const liveLabel =
    liveState === 'live' ? 'Live' : liveState === 'reconnecting' ? 'Reconnecting…' : '';

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen
        options={{
          title: 'Waitlist',
          headerRight: () =>
            liveState !== 'idle' ? (
              <View style={styles.liveRow}>
                <View style={[styles.liveDot, { backgroundColor: liveColor }]} />
                <Text variant="caption" color={liveColor}>
                  {liveLabel}
                </Text>
              </View>
            ) : null,
        }}
      />

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load the waitlist.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <>
          {/* Filter tabs */}
          <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
            <Segmented<FilterTab>
              options={[
                { value: 'active', label: `Active${filter === 'active' ? ` (${displayedEntries.length})` : ''}` },
                { value: 'all', label: `All (${allEntries.length})` },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
              />
            }>
            {/* Staff-choose alerts panel */}
            {isStaffChoose && alerts.length > 0 ? (
              <View style={styles.alertsSection}>
                <Text
                  variant="overline"
                  tone="secondary"
                  style={styles.sectionLabel}>
                  Open slot alerts
                </Text>
                {alerts.map((alert) => {
                  const alertPending = pendingIds.has(`alert-${alert.id}`);
                  return (
                    <Card key={alert.id} padded={false}>
                      <View style={[styles.alertStrip, { backgroundColor: colors.warning }]} />
                      <View style={styles.alertContent}>
                        <Text variant="bodyMedium">
                          {alert.service_name ?? 'Open slot'}
                        </Text>
                        <Text variant="bodySmall" tone="secondary">
                          {formatAlertSlot(alert.slot_date, alert.slot_time)}
                        </Text>
                        {alert.practitioner_name ? (
                          <Text variant="caption" tone="muted">
                            {alert.practitioner_name}
                          </Text>
                        ) : null}
                        <Text variant="caption" tone="muted">
                          {alert.matching_waitlist_count}{' '}
                          {alert.matching_waitlist_count === 1 ? 'guest' : 'guests'} waiting
                        </Text>
                        <View style={styles.actions}>
                          {alertPending ? (
                            <ActivityIndicator size="small" color={colors.brand} />
                          ) : (
                            <>
                              <Button
                                label="Offer"
                                size="sm"
                                onPress={() => handleAlertAction(alert.id, 'offer')}
                                style={styles.actionBtn}
                              />
                              <Button
                                label={
                                  pendingConfirm === `alert-dismiss-${alert.id}`
                                    ? 'Tap to confirm'
                                    : 'Dismiss'
                                }
                                size="sm"
                                variant="ghost"
                                onPress={() =>
                                  pendingConfirm === `alert-dismiss-${alert.id}`
                                    ? handleAlertAction(alert.id, 'dismiss')
                                    : armConfirm(`alert-dismiss-${alert.id}`)
                                }
                                style={styles.actionBtn}
                              />
                            </>
                          )}
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : null}

            {/* Main list */}
            {displayedEntries.length === 0 ? (
              <EmptyState
                title={filter === 'active' ? 'No active entries' : 'No waitlist entries'}
                message={
                  filter === 'active'
                    ? 'When guests join the waitlist, they will appear here. Switch to "All" to see history.'
                    : 'There is nothing in the waitlist history yet.'
                }
              />
            ) : (
              displayedEntries.map((entry) => {
                const status = (entry.status ?? 'waiting') as string;
                const stripColor = statusStripColor(status, colors);
                const detail = detailLabel(entry);
                const isWaiting = status === 'waiting';
                const isOffered = status === 'offered';
                const canDelete = isDeletable(entry);
                const entryPending = pendingIds.has(entry.id);

                // can_offer gating
                const offerDisabled = isWaiting && entry.can_offer === false;

                // Expiry countdown — only for notify_in_order mode
                const expiryLabel =
                  isOffered && waitlistMode === 'notify_in_order'
                    ? offerExpiryLabel(entry.expires_at)
                    : null;

                // joined-at
                const joinedLabel = entry.created_at
                  ? `Joined ${formatJoinedAt(entry.created_at)}`
                  : null;

                return (
                  <Card key={entry.id} style={styles.entryCard} padded={false}>
                    {/* Left status strip */}
                    <View
                      style={[styles.statusStrip, { backgroundColor: stripColor }]}
                    />
                    <View style={styles.cardBody}>
                      <View style={styles.entryHeader}>
                        <Text
                          variant="bodyMedium"
                          numberOfLines={1}
                          style={styles.entryName}>
                          {entryGuestName(entry)}
                        </Text>
                        <Badge
                          label={status === 'confirmed' ? 'Complete' : status}
                          tone={STATUS_TONE[status] ?? 'neutral'}
                        />
                      </View>
                      <Text variant="bodySmall" tone="secondary">
                        {whenLabel(entry)}
                      </Text>
                      {detail ? (
                        <Text variant="caption" tone="muted">
                          {detail}
                        </Text>
                      ) : null}
                      {entry.guest_phone ? (
                        <Text variant="caption" tone="muted">
                          {entry.guest_phone}
                        </Text>
                      ) : null}
                      {entry.guest_email ? (
                        <Text variant="caption" tone="muted">
                          {entry.guest_email}
                        </Text>
                      ) : null}
                      {joinedLabel ? (
                        <Text variant="caption" tone="muted">
                          {joinedLabel}
                        </Text>
                      ) : null}
                      {entry.notes ? (
                        <Text variant="caption" tone="muted">
                          &quot;{entry.notes}&quot;
                        </Text>
                      ) : null}
                      {/* offer_unavailable_reason */}
                      {offerDisabled && entry.offer_unavailable_reason ? (
                        <Text variant="caption" color={colors.warning}>
                          {entry.offer_unavailable_reason}
                        </Text>
                      ) : null}
                      {/* Expiry countdown (notify_in_order only) */}
                      {expiryLabel ? (
                        <Text variant="caption" tone="danger">
                          {expiryLabel}
                        </Text>
                      ) : null}

                      {/* Action row */}
                      {entryPending ? (
                        <View style={styles.pendingRow}>
                          <ActivityIndicator size="small" color={colors.brand} />
                        </View>
                      ) : (
                        <>
                          {isWaiting || isOffered ? (
                            <View style={styles.actions}>
                              {isWaiting ? (
                                <Button
                                  label="Offer"
                                  size="sm"
                                  disabled={offerDisabled}
                                  onPress={() => act(entry.id, 'offered')}
                                  style={styles.actionBtn}
                                />
                              ) : null}
                              {/* No "Confirm" button: appointment waitlist entries
                                  are completed server-side at the offer step, so a
                                  client confirm always 400s. (Web shows no confirm
                                  for appointment offers either.) */}
                              <Button
                                label={
                                  pendingConfirm === `cancel-${entry.id}`
                                    ? 'Tap to confirm'
                                    : 'Cancel'
                                }
                                size="sm"
                                variant="ghost"
                                onPress={() =>
                                  pendingConfirm === `cancel-${entry.id}`
                                    ? act(entry.id, 'cancelled')
                                    : armConfirm(`cancel-${entry.id}`)
                                }
                                style={styles.actionBtn}
                              />
                            </View>
                          ) : null}
                          {canDelete ? (
                            <View style={styles.actions}>
                              <Button
                                label={
                                  pendingConfirm === `delete-${entry.id}`
                                    ? 'Tap to confirm'
                                    : 'Remove'
                                }
                                size="sm"
                                variant="ghost"
                                onPress={() =>
                                  pendingConfirm === `delete-${entry.id}`
                                    ? handleDelete(entry.id)
                                    : armConfirm(`delete-${entry.id}`)
                                }
                                style={styles.actionBtn}
                              />
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
            <View style={styles.spacer} />
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

const STRIP_WIDTH = 4;

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  alertsSection: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
  },
  alertStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: STRIP_WIDTH,
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  alertContent: {
    paddingLeft: STRIP_WIDTH + spacing.sm,
    paddingRight: spacing.base,
    paddingVertical: spacing.base,
    gap: spacing.xs,
  },
  entryCard: {
    overflow: 'hidden',
    paddingLeft: 0,
    paddingRight: spacing.base,
    paddingVertical: spacing.base,
    flexDirection: 'row',
  },
  statusStrip: {
    width: STRIP_WIDTH,
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  cardBody: {
    flex: 1,
    paddingLeft: spacing.sm,
    gap: spacing.xs,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  entryName: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  pendingRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
