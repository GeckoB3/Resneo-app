import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticWarning } from '@/lib/haptics';
import { useActOnWaitlistAlert, useWaitlistAlerts } from '@/lib/queries/useWaitlist';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { WaitlistAlert } from '@/types/waitlist';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** HH:mm from the alert, preferring the real `slot_time_hm` over the legacy alias. */
export function alertSlotTime(alert: WaitlistAlert): string {
  const raw = alert.slot_time_hm ?? alert.slot_time ?? '';
  return raw.slice(0, 5);
}

/** Calendar/practitioner label, preferring the real `calendar_name`. */
function alertCalendarName(alert: WaitlistAlert): string | null {
  return alert.calendar_name ?? alert.practitioner_name ?? null;
}

/**
 * "Availability opened for {service}{ on {calendar}} on {date} at {time}. N
 * guests match." — mirrors the web banner's `alertMessage`.
 */
export function buildAlertMessage(alert: WaitlistAlert): string {
  const service = alert.service_name ?? 'an appointment';
  const calendar = alertCalendarName(alert);
  const calendarPart = calendar ? ` on ${calendar}` : '';
  const date = alert.slot_date ? formatDayHeading(alert.slot_date) : '';
  const time = alertSlotTime(alert);
  const whenParts = [date, time].filter(Boolean).join(' at ');
  const when = whenParts ? ` on ${whenParts}` : '';
  const count = alert.matching_waitlist_count;
  const guestNote =
    count === 1 ? '1 guest on the waitlist matches.' : `${count} guests on the waitlist match.`;
  return `Availability opened for ${service}${calendarPart}${when}. ${guestNote}`;
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/**
 * Cross-dashboard open-slot nudge for `staff_choose` waitlist mode (web parity
 * with `components/dashboard/waitlist/WaitlistAvailabilityBanner.tsx`). Renders
 * nothing unless the venue is in staff_choose mode AND there is at least one
 * open slot matching a waitlisted guest. Mount once near the top of the authed
 * shell so staff see it on every tab.
 *
 * Reuses the existing `useWaitlistAlerts` / `useActOnWaitlistAlert` hooks
 * (GET/POST /api/venue/waitlist/alerts). Offer success and notify-failure are
 * surfaced via the toast host (never `Alert.alert`, a no-op on RN-web); Dismiss
 * is a two-step armed button (tap once to arm, again within 4s to confirm).
 */
export function WaitlistAvailabilityBanner() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { featureFlags } = useVenueContext();

  // Gate to staff_choose mode read from the venue's resolved/raw feature flags.
  const isEnabled = featureFlags?.resolved?.waitlist_v2 === true;
  const mode = featureFlags?.raw?.waitlist_config?.mode;
  const isStaffChoose = isEnabled && mode === 'staff_choose';

  const alertsQuery = useWaitlistAlerts(isStaffChoose);
  const actOnAlert = useActOnWaitlistAlert();

  const [actingId, setActingId] = useState<string | null>(null);
  // Two-step confirm for Dismiss — arm, then confirm within the window.
  const [dismissArmed, setDismissArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armDismiss = useCallback((id: string) => {
    setDismissArmed(id);
    hapticWarning();
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setDismissArmed(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const runAction = useCallback(
    (alertId: string, action: 'offer' | 'dismiss') => {
      if (armTimer.current) clearTimeout(armTimer.current);
      setDismissArmed(null);
      setActingId(alertId);
      actOnAlert.mutate(
        { id: alertId, action },
        {
          onSuccess: (data) => {
            setActingId(null);
            if (action === 'dismiss') {
              toast.info('Alert dismissed.');
              return;
            }
            const guest = data.guest_name ?? 'the guest';
            if (data.email_sent || data.sms_sent) {
              toast.success(`Offer sent to ${guest}. They have been notified.`);
            } else {
              toast.success(
                `Offer recorded for ${guest}. Check their contact details if no notification arrived.`,
              );
            }
          },
          onError: (error) => {
            setActingId(null);
            toast.error(
              error instanceof ApiError ? error.message : 'Could not perform that action.',
            );
          },
        },
      );
    },
    [actOnAlert, toast],
  );

  const alerts = alertsQuery.data?.alerts ?? [];
  if (!isStaffChoose || alerts.length === 0) {
    return null;
  }

  const primary = alerts[0];
  const acting = actingId === primary.id;
  const extra = alerts.length - 1;

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.banner,
        { backgroundColor: colors.brandSubtle, borderBottomColor: colors.border },
      ]}>
      <View style={styles.inner}>
        <Badge label="Waitlist" tone="brand" />
        <Text variant="bodyMedium" style={styles.message}>
          {buildAlertMessage(primary)}
        </Text>
        {extra > 0 ? (
          <Text variant="caption" tone="muted">
            +{extra} more open {extra === 1 ? 'slot' : 'slots'} on the waitlist
          </Text>
        ) : null}

        {acting ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : (
          <View style={styles.actions}>
            <Button
              label="Offer appointment"
              size="sm"
              onPress={() => runAction(primary.id, 'offer')}
              style={styles.actionBtn}
            />
            <Button
              label="View"
              size="sm"
              variant="secondary"
              onPress={() => router.push('/waitlist' as Href)}
              style={styles.actionBtn}
            />
            <Button
              label={dismissArmed === primary.id ? 'Tap to confirm' : 'Dismiss'}
              size="sm"
              variant="ghost"
              onPress={() =>
                dismissArmed === primary.id
                  ? runAction(primary.id, 'dismiss')
                  : armDismiss(primary.id)
              }
              style={styles.actionBtn}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  inner: {
    gap: spacing.xs,
  },
  message: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
  },
  pendingRow: {
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: radius.md,
  },
});
