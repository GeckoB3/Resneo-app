import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { BookingModel } from '@/types/venue';

const SECONDARY_MODELS: { model: BookingModel; label: string; hint: string }[] = [
  { model: 'class_session', label: 'Classes', hint: 'Group sessions with attendee capacity' },
  { model: 'event_ticket', label: 'Events', hint: 'Ticketed one-off experiences' },
  { model: 'resource_booking', label: 'Resources', hint: 'Bookable rooms or equipment' },
  { model: 'table_reservation', label: 'Tables', hint: 'Restaurant-style table bookings' },
];

const MODEL_LABELS: Record<string, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  event_ticket: 'Events',
  class_session: 'Classes',
  resource_booking: 'Resources',
};

/**
 * Booking settings — which booking types appear on the public page, plus
 * guest-account requirements. Mirrors web Settings → Booking Settings (admin).
 */
export default function BookingSettingsScreen() {
  const { venue, isLoading } = useVenueContext();
  const update = useUpdateVenue();
  const isAdmin = venue?.current_user_role === 'admin';

  const [models, setModels] = useState<BookingModel[]>([]);
  const [requireLogin, setRequireLogin] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (venue && !seeded) {
    setSeeded(true);
    setModels(
      venue.active_booking_models?.length
        ? [...venue.active_booking_models]
        : [venue.booking_model],
    );
    setRequireLogin(Boolean(venue.require_account_login_for_bookings));
  }

  const header = <Stack.Screen options={{ title: 'Booking settings' }} />;

  if (isLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="Booking settings can only be changed by venue admins." />
      </Screen>
    );
  }

  const primaryModel = venue.active_booking_models?.[0] ?? venue.booking_model;
  const primaryLabel = MODEL_LABELS[primaryModel] ?? primaryModel;

  const toggleModel = (model: BookingModel, enabled: boolean) => {
    setSaved(false);
    setModels((current) => {
      const without = current.filter((m) => m !== model);
      return enabled ? [...without, model] : without;
    });
  };

  const originalModels = venue.active_booking_models?.length
    ? venue.active_booking_models
    : [venue.booking_model];
  const hasChanges =
    JSON.stringify([...models].sort()) !== JSON.stringify([...originalModels].sort()) ||
    requireLogin !== Boolean(venue.require_account_login_for_bookings);

  async function handleSave() {
    if (!venue) return;
    setError(null);
    setSaved(false);
    // The primary model always stays first; secondaries follow.
    const ordered = [primaryModel, ...models.filter((m) => m !== primaryModel)];
    try {
      await update.mutateAsync({
        active_booking_models: ordered,
        ...(requireLogin !== Boolean(venue.require_account_login_for_bookings)
          ? { require_account_login_for_bookings: requireLogin }
          : {}),
      });
      hapticSuccess();
      setSaved(true);
    } catch (e) {
      hapticWarning();
      if (e instanceof ApiError && `${e.body && (e.body as { error?: string }).error}`.includes('FUTURE_BOOKINGS')) {
        setError(
          'A booking type with upcoming bookings can’t be switched off. Cancel or complete those bookings first.',
        );
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not save booking settings.');
      }
    }
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.primaryRow}>
            <View style={styles.primaryText}>
              <Text variant="label">Primary booking type</Text>
              <Text variant="caption" tone="muted">
                Set by your plan — change it from the web dashboard.
              </Text>
            </View>
            <Badge label={primaryLabel} tone="brand" />
          </View>
        </Card>

        <Card>
          <Text variant="label">Also offer on your booking page</Text>
          <View style={styles.section}>
            {SECONDARY_MODELS.filter((row) => row.model !== primaryModel).map((row) => (
              <View key={row.model} style={styles.settingRow}>
                <View style={styles.settingText}>
                  <Text variant="bodyMedium">{row.label}</Text>
                  <Text variant="caption" tone="muted">
                    {row.hint}
                  </Text>
                </View>
                <Switch
                  value={models.includes(row.model)}
                  onValueChange={(v) => toggleModel(row.model, v)}
                  accessibilityLabel={`Offer ${row.label}`}
                />
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted">
            Switching a type on adds it to your public booking page; its catalogue is set up on
            the web dashboard.
          </Text>
        </Card>

        <Card>
          <Text variant="label">Guest accounts</Text>
          <View style={styles.section}>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text variant="bodyMedium">Require sign-in to book</Text>
                <Text variant="caption" tone="muted">
                  Guests must verify their email before completing an online booking.
                </Text>
              </View>
              <Switch
                value={requireLogin}
                onValueChange={(v) => {
                  setRequireLogin(v);
                  setSaved(false);
                }}
                accessibilityLabel="Require sign-in to book"
              />
            </View>
          </View>
        </Card>

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success">
            Saved.
          </Text>
        ) : null}

        <Button
          label="Save changes"
          fullWidth
          loading={update.isPending}
          disabled={!hasChanges}
          onPress={() => void handleSave()}
        />
        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  primaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  section: {
    marginVertical: spacing.sm,
    gap: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  spacer: {
    height: spacing.xl,
  },
});
