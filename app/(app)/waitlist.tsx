import { Stack, useRouter, type Href } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateWaitlistEntry, useWaitlist } from '@/lib/queries/useWaitlist';
import { spacing } from '@/theme/index';
import type { WaitlistEntry, WaitlistStatus } from '@/types/waitlist';

const STATUS_TONE: Record<string, BadgeTone> = {
  waiting: 'warning',
  offered: 'brand',
  confirmed: 'success',
  expired: 'neutral',
  cancelled: 'danger',
};

function entryGuestName(entry: WaitlistEntry): string {
  if (entry.guest_name?.trim()) return entry.guest_name;
  const parts = [entry.guest_first_name, entry.guest_last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Guest';
}

function whenLabel(entry: WaitlistEntry): string {
  const date = entry.desired_date ? formatDayHeading(entry.desired_date) : '';
  const time = entry.time_window_label ?? (entry.desired_time ? entry.desired_time.slice(0, 5) : '');
  return [date, time].filter(Boolean).join(' · ');
}

function detailLabel(entry: WaitlistEntry): string | null {
  if (entry.service_name) {
    return [entry.service_name, entry.practitioner_name].filter(Boolean).join(' · ');
  }
  if (entry.party_size) return `${entry.party_size} guests`;
  return null;
}

/** "Offer expires in 2h 10m" countdown for offered entries (recomputed per render/refresh). */
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

/** Appointment waitlist — the app is appointments-plan only (no table waitlist). */
export default function WaitlistScreen() {
  const router = useRouter();
  const query = useWaitlist('appointment');
  const update = useUpdateWaitlistEntry();

  const act = (id: string, status: WaitlistStatus, confirmText?: string) => {
    const run = () =>
      update.mutate(
        { id, status },
        {
          onSuccess: (data) => {
            if (status === 'cancelled') hapticWarning();
            else hapticSuccess();
            if (status === 'confirmed' && data.booking_id) {
              router.push(`/booking/${data.booking_id}` as Href);
            }
          },
          onError: (error) => {
            hapticWarning();
            Alert.alert(
              'Could not update',
              error instanceof ApiError ? error.message : 'Please try again.',
            );
          },
        },
      );
    if (confirmText) {
      Alert.alert(confirmText, undefined, [
        { text: 'Back', style: 'cancel' },
        { text: confirmText, style: status === 'cancelled' ? 'destructive' : 'default', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const entries = query.data?.entries ?? [];
  const busy = update.isPending;

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Waitlist' }} />

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Could not load the waitlist.'}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          {entries.length === 0 ? (
            <EmptyState
              title="No waitlist entries"
              message="Guests waiting for a slot will appear here."
            />
          ) : (
            entries.map((entry) => {
              const status = (entry.status ?? 'waiting') as string;
              const detail = detailLabel(entry);
              const isWaiting = status === 'waiting';
              const isOffered = status === 'offered';
              return (
                <Card key={entry.id}>
                  <View style={styles.entryHeader}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.entryName}>
                      {entryGuestName(entry)}
                    </Text>
                    <Badge label={status} tone={STATUS_TONE[status] ?? 'neutral'} />
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
                  {entry.notes ? (
                    <Text variant="caption" tone="muted">
                      “{entry.notes}”
                    </Text>
                  ) : null}
                  {isOffered && offerExpiryLabel(entry.expires_at) ? (
                    <Text variant="caption" tone="danger">
                      {offerExpiryLabel(entry.expires_at)}
                    </Text>
                  ) : null}

                  {isWaiting || isOffered ? (
                    <View style={styles.actions}>
                      {isWaiting ? (
                        <Button
                          label="Offer"
                          size="sm"
                          loading={busy}
                          onPress={() => act(entry.id, 'offered')}
                          style={styles.actionBtn}
                        />
                      ) : null}
                      {isOffered ? (
                        <Button
                          label="Confirm"
                          size="sm"
                          loading={busy}
                          onPress={() => act(entry.id, 'confirmed', 'Confirm booking')}
                          style={styles.actionBtn}
                        />
                      ) : null}
                      <Button
                        label="Cancel"
                        size="sm"
                        variant="ghost"
                        loading={busy}
                        onPress={() => act(entry.id, 'cancelled', 'Cancel entry')}
                        style={styles.actionBtn}
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.sm,
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
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
});
