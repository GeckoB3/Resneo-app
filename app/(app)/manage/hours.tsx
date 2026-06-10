import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

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
  const { venue, isLoading } = useVenueContext();
  const update = useUpdateOpeningHours();
  const isAdmin = venue?.current_user_role === 'admin';

  const [draft, setDraft] = useState<OpeningHours | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (venue && !seeded) {
    setSeeded(true);
    setDraft(venue.opening_hours ?? {});
  }

  const original = JSON.stringify(venue?.opening_hours ?? {});
  const hasChanges = draft !== null && JSON.stringify(draft) !== original;

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const validation = validate(draft);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      await update.mutateAsync(draft);
      hapticSuccess();
      setSaved(true);
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <OpeningHoursEditor
            value={draft}
            editable={isAdmin}
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
        <Text variant="caption" tone="muted" style={styles.footnote}>
          Hours apply to your public booking page. One-off closures and per-service custom
          availability are managed on the web dashboard.
        </Text>
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
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
