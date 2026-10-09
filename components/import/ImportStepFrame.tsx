import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { IMPORT_HUB_ROUTE, IMPORT_STEPS, importStepRoute, type ImportStepKey } from '@/lib/import/session-status';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/**
 * The page every import screen sits in: the header, the admin check the web's import layout
 * makes, and (on a step) the web's step bar: "Step 2 of 6, Map", a chip per step, and
 * Back to imports.
 */
export function ImportStepFrame({
  title,
  sessionId,
  step,
  children,
}: {
  title: string;
  sessionId?: string;
  step?: ImportStepKey;
  children: ReactNode;
}) {
  const { venue, isLoading } = useVenueContext();
  const header = <Stack.Screen options={{ headerShown: true, title }} />;

  if (!venue && isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (venue?.current_user_role !== 'admin') {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Only an admin can import data"
          message="Importing clients and bookings from another system is kept to admins, as it adds and changes records across your venue. Ask an admin to run it, or to make you one."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={styles.content}>
      {header}
      {sessionId && step ? <ImportStepBar sessionId={sessionId} step={step} /> : null}
      {children}
    </Screen>
  );
}

/** "Step 2 of 6, Map", a chip per step, and Back to imports. */
export function ImportStepBar({ sessionId, step }: { sessionId: string; step: ImportStepKey }) {
  const router = useRouter();
  const index = IMPORT_STEPS.findIndex((s) => s.key === step);
  const current = IMPORT_STEPS[index];
  return (
    <View style={styles.bar} accessibilityLabel="Data import steps">
      <View style={styles.barTop}>
        <Button label="Back to imports" variant="ghost" size="sm" onPress={() => router.replace(IMPORT_HUB_ROUTE)} />
        <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {`Step ${index + 1} of ${IMPORT_STEPS.length}: ${current?.label ?? ''}`}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {IMPORT_STEPS.map((s, i) => (
          <Chip
            key={s.key}
            label={`${i + 1}. ${s.label}`}
            selected={s.key === step}
            onPress={() => {
              if (s.key !== step) router.replace(importStepRoute(sessionId, s.key));
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.base, paddingBottom: spacing['3xl'] },
  bar: { gap: spacing.sm },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  chips: { gap: spacing.sm, paddingVertical: spacing.xxs },
});
