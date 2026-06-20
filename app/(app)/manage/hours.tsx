import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvailabilityBlocksSection } from '@/components/manage/AvailabilityBlocksSection';
import { OpeningHoursEditor } from '@/components/manage/OpeningHoursEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateOpeningHours } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours, OpeningHoursDay } from '@/types/venue';

/**
 * Normalize a stored day to the canonical `{closed}` / `{periods}` shape. The
 * backend (and `validate`) only accept those two; older venue rows may still
 * hold a legacy day-level `{ open, close }`. The web canonicalizes on load
 * (getDayConfig) — do the same here so an UNTOUCHED legacy day can't 400 the
 * whole save and drop the admin's other edits.
 */
function canonicalDay(day: OpeningHoursDay | undefined): OpeningHoursDay | undefined {
  if (!day) return day;
  if ('closed' in day && day.closed === true) return { closed: true };
  if ('periods' in day && Array.isArray(day.periods)) return day;
  const legacy = day as unknown as { open?: string; close?: string };
  if (legacy.open && legacy.close) return { periods: [{ open: legacy.open, close: legacy.close }] };
  return day;
}

function canonicalizeOpeningHours(raw: OpeningHours | null | undefined): OpeningHours {
  if (!raw) return {};
  const out: OpeningHours = {};
  for (const [key, day] of Object.entries(raw)) {
    const canonical = canonicalDay(day);
    if (canonical) out[key as keyof OpeningHours] = canonical;
  }
  return out;
}

function validate(hours: OpeningHours): string | null {
  for (const day of Object.values(hours)) {
    if (!day || ('closed' in day && day.closed === true)) continue;
    if ('periods' in day) {
      for (const period of day.periods) {
        if (period.open >= period.close) {
          return `Close time must be after open time (${period.open}–${period.close}).`;
        }
      }
      const [first, second] = day.periods;
      if (first && second && second.open < first.close) {
        return 'The second period must start after the first one ends.';
      }
    }
  }
  return null;
}

/** Business hours — weekly opening-hours editor (admin) / read-only view (staff). */
export default function BusinessHoursScreen() {
  const { venue, isLoading, refetch } = useVenueContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const update = useUpdateOpeningHours();
  const isAdmin = venue?.current_user_role === 'admin';

  // Seed draft via useEffect to avoid setState-during-render in React 18 strict mode.
  const [draft, setDraft] = useState<OpeningHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Save anyway?" — when narrowing hours orphans upcoming bookings the route
  // replies 409 `{ requires_confirmation, message }`. We surface the message in
  // a ConfirmSheet and re-save with `acknowledge: true`. (Alert.alert's confirm
  // is a no-op on web, so this uses the Sheet — web parity with window.confirm.)
  const [ackConfirm, setAckConfirm] = useState<{ message: string } | null>(null);

  useEffect(() => {
    if (venue && draft === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(canonicalizeOpeningHours(venue.opening_hours));
    }
  }, [venue, draft]);

  // Compare canonical-to-canonical so a legacy-shape venue isn't flagged dirty on load.
  const original = JSON.stringify(canonicalizeOpeningHours(venue?.opening_hours));
  const hasChanges = draft !== null && JSON.stringify(draft) !== original;

  function markSaved() {
    hapticSuccess();
    setSaved(true);
    // Auto-clear the success message after 2500 ms so it doesn't linger indefinitely.
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const validation = validate(draft);
    if (validation) {
      setError(validation);
      hapticWarning();
      return;
    }
    try {
      await update.mutateAsync(draft);
      markSaved();
    } catch (e) {
      // 409 with requires_confirmation → ask, then re-save acknowledged.
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        setAckConfirm({
          message:
            e.body.message ??
            'Some upcoming bookings fall outside the new hours. Save these hours anyway?',
        });
        return;
      }
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save opening hours.');
    }
  }

  /** User confirmed the orphan-bookings warning — re-save with the acknowledge flag. */
  async function handleConfirmAck() {
    if (!draft) return;
    try {
      await update.mutateAsync({ ...draft, acknowledge: true });
      setAckConfirm(null);
      markSaved();
    } catch (e) {
      setAckConfirm(null);
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save opening hours.');
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: 'Business hours' }} />;

  if (isLoading || draft === null) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refetch();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }>

        {/* ---- Weekly hours card ---- */}
        <View style={styles.sectionHeader}>
          <Text variant="heading">Weekly opening hours</Text>
          <Text variant="bodySmall" tone="secondary">
            Set the hours you are normally open each day. This is used for availability and guest
            messaging — review carefully before publishing.
          </Text>
        </View>

        <Card style={hasChanges ? [styles.cardUnsaved, { borderColor: colors.warning }] : undefined}>
          {hasChanges ? (
            <Text variant="caption" tone="muted" style={styles.unsavedHint}>
              Unsaved changes
            </Text>
          ) : null}
          <OpeningHoursEditor
            value={draft}
            editable={isAdmin && !update.isPending}
            onChange={(next) => {
              setDraft(next);
              setSaved(false);
            }}
          />
        </Card>

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success">
            Hours saved.
          </Text>
        ) : null}

        {/* ---- Closures & Exceptions card ---- */}
        <AvailabilityBlocksSection isAdmin={isAdmin} />

        <View style={styles.spacer} />
      </ScrollView>

      {/* Sticky save bar — keeps the explicit save action in reach while the
          admin reviews the full week. Disabled until the draft is dirty. */}
      {isAdmin ? (
        <View
          style={[
            styles.stickyBar,
            {
              backgroundColor: colors.surfaceRaised,
              borderTopColor: colors.border,
              paddingBottom: spacing.md + insets.bottom,
            },
          ]}>
          <Button
            label="Save opening hours"
            fullWidth
            loading={update.isPending}
            disabled={!hasChanges}
            onPress={() => void handleSave()}
          />
        </View>
      ) : null}

      {/* "Save anyway?" — orphan-bookings confirmation (409 requires_confirmation). */}
      <ConfirmSheet
        visible={ackConfirm != null}
        title="Save these hours anyway?"
        message={ackConfirm?.message}
        confirmLabel="Save anyway"
        destructive={false}
        loading={update.isPending}
        onConfirm={() => void handleConfirmAck()}
        onClose={() => {
          if (!update.isPending) setAckConfirm(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  cardUnsaved: {
    borderWidth: 2,
  },
  unsavedHint: {
    marginBottom: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
  stickyBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
});
