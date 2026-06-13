import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StaffDurationControl } from '@/components/booking-wizard/StaffDurationControl';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentCatalogVariant } from '@/types/appointment-catalog';

type VariantStepProps = {
  serviceName: string;
  variants: AppointmentCatalogVariant[];
  selected: AppointmentCatalogVariant | null;
  onSelect: (variant: AppointmentCatalogVariant) => void;
  /** Continue carries the selected variant's staff duration override (null = default). */
  onContinue: (durationOverride: number | null) => void;
  /** Existing override for the selected variant — seeds the pill on back-navigation. */
  initialDurationOverride?: number | null;
};

/** Step — pick the service's variant (sub-option with its own duration/price). */
export function VariantStep({
  serviceName,
  variants,
  selected,
  onSelect,
  onContinue,
  initialDurationOverride,
}: VariantStepProps) {
  const { colors } = useTheme();

  // Per-variant staff duration overrides (minutes). Seeded from the active
  // selection so going BACK to this step keeps a custom duration visible.
  const [overrides, setOverrides] = useState<Record<string, number>>(() =>
    selected && initialDurationOverride != null ? { [selected.id]: initialDurationOverride } : {},
  );

  const setOverride = (variantId: string, minutes: number | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (minutes == null) delete next[variantId];
      else next[variantId] = minutes;
      return next;
    });

  const selectedOverride = selected ? overrides[selected.id] ?? null : null;

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose an option</Text>
      <Text variant="bodySmall" tone="muted">
        {serviceName}
      </Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {variants.map((variant) => {
          const isSelected = selected?.id === variant.id;
          const override = overrides[variant.id] ?? null;
          return (
            <View
              key={variant.id}
              style={[
                styles.row,
                {
                  backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                  borderColor: isSelected ? colors.brand : colors.border,
                },
              ]}>
              <PressableScale
                haptic
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(variant)}
                style={styles.selectArea}>
                <View
                  style={[
                    styles.radio,
                    { borderColor: isSelected ? colors.brand : colors.borderStrong },
                  ]}>
                  {isSelected ? (
                    <View style={[styles.radioDot, { backgroundColor: colors.brand }]} />
                  ) : null}
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium">{variant.name}</Text>
                  {variant.price_pence != null ? (
                    <Text variant="caption" tone="muted">
                      £{(variant.price_pence / 100).toFixed(2)}
                    </Text>
                  ) : null}
                  {variant.description ? (
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {variant.description}
                    </Text>
                  ) : null}
                </View>
              </PressableScale>
              <StaffDurationControl
                naturalDuration={variant.duration_minutes}
                override={override}
                onChange={(minutes) => setOverride(variant.id, minutes)}
              />
            </View>
          );
        })}
      </ScrollView>
      <Button
        label="Continue"
        fullWidth
        onPress={() => onContinue(selectedOverride)}
        disabled={!selected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.base,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
