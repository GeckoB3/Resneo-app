import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AvailabilityBlocksSection } from '@/components/manage/AvailabilityBlocksSection';
import { OpeningHoursEditor } from '@/components/manage/OpeningHoursEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateOpeningHours } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours } from '@/types/venue';

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
  const update = useUpdateOpeningHours();
  const isAdmin = venue?.current_user_role === 'admin';

  // Seed draft via useEffect to avoid setState-during-render in React 18 strict mode.
  const [draft, setDraft] = useState<OpeningHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (venue && draft === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(venue.opening_hours ?? {});
    }
  }, [venue, draft]);

  const original = JSON.stringify(venue?.opening_hours ?? {});
  const hasChanges = draft !== null && JSON.stringify(draft) !== original;

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
      hapticSuccess();
      setSaved(true);
      // Auto-clear the success message after 2500 ms so it doesn't linger indefinitely.
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save opening hours.');
    }
  }

  const header = <Stack.Screen options={{ title: 'Business hours' }} />;

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

        {isAdmin ? (
          <Button
            label="Save hours"
            fullWidth
            loading={update.isPending}
            disabled={!hasChanges}
            onPress={() => void handleSave()}
          />
        ) : null}

        {/* ---- Closures & Exceptions card ---- */}
        <AvailabilityBlocksSection isAdmin={isAdmin} />

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
  cardUnsaved: {
    borderWidth: 2,
  },
  unsavedHint: {
    marginBottom: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
