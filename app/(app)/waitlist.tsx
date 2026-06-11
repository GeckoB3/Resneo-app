import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useActOnWaitlistAlert,
  useDeleteWaitlistEntry,
  useUpdateWaitlistEntry,
  useWaitlist,
  useWaitlistAlerts,
} from '@/lib/queries/useWaitlist';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
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

  const act = (id: string, status: WaitlistStatus, confirmText?: string) => {
    const run = () => {
      startPending(id);
      update.mutate(
        { id, status },
        {
          onSuccess: (data) => {
            endPending(id);
            if (status === 'cancelled') {
              hapticWarning();
            } else {
              hapticSuccess();
            }
            // notify_failed warning
            if (data.notify_failed) {
              Alert.alert(
                'Spot offered',
                'We could not send email or SMS to the guest. Contact them directly.',
                [{ text: 'OK' }],
              );
            }
            if (status === 'confirmed' && data.booking_id) {
              router.push(`/booking/${data.booking_id}` as Href);
            }
          },
          onError: (error) => {
            endPending(id);
            hapticWarning();
            Alert.alert(
              'Could not update',
              error instanceof ApiError ? error.message : 'Please try again.',
            );
          },
        },
      );
    };

    if (confirmText) {
      Alert.alert(confirmText, undefined, [
        { text: 'Back', style: 'cancel' },
        {
          text: confirmText,
          style: status === 'cancelled' ? 'destructive' : 'default',
          onPress: run,
        },
      ]);
    } else {
      run();
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remove entry', 'Permanently remove this expired or cancelled entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          startPending(id);
          deleteMutation.mutate(id, {
            onSuccess: () => {
              endPending(id);
              hapticSuccess();
            },
            onError: (error) => {
              endPending(id);
              hapticWarning();
              Alert.alert(
                'Could not remove',
                error instanceof ApiError ? error.message : 'Please try again.',
              );
            },
          });
        },
      },
    ]);
  };

  const handleAlertAction = (alertId: string, action: 'offer' | 'dismiss') => {
    const label = action === 'offer' ? 'Offer to guests' : 'Dismiss';
    Alert.alert(
      label,
      action === 'dismiss'
        ? 'Dismiss this open slot alert?'
        : 'Offer this slot to matching waitlist guests?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: action === 'dismiss' ? 'destructive' : 'default',
          onPress: () => {
            startPending(`alert-${alertId}`);
            actOnAlert.mutate(
              { id: alertId, action },
              {
                onSuccess: () => {
                  endPending(`alert-${alertId}`);
                  hapticSuccess();
                },
                onError: (error) => {
                  endPending(`alert-${alertId}`);
                  hapticWarning();
                  Alert.alert(
                    'Could not perform action',
                    error instanceof ApiError ? error.message : 'Please try again.',
                  );
                },
              },
            );
          },
        },
      ],
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
                                label="Dismiss"
                                size="sm"
                                variant="ghost"
                                onPress={() => handleAlertAction(alert.id, 'dismiss')}
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
                              {isOffered ? (
                                <Button
                                  label="Confirm"
                                  size="sm"
                                  onPress={() =>
                                    act(entry.id, 'confirmed', 'Confirm booking')
                                  }
                                  style={styles.actionBtn}
                                />
                              ) : null}
                              <Button
                                label="Cancel"
                                size="sm"
                                variant="ghost"
                                onPress={() => act(entry.id, 'cancelled', 'Cancel entry')}
                                style={styles.actionBtn}
                              />
                            </View>
                          ) : null}
                          {canDelete ? (
                            <View style={styles.actions}>
                              <Button
                                label="Remove"
                                size="sm"
                                variant="ghost"
                                onPress={() => handleDelete(entry.id)}
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
