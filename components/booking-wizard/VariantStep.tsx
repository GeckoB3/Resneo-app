import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentCatalogVariant } from '@/types/appointment-catalog';

type VariantStepProps = {
  serviceName: string;
  variants: AppointmentCatalogVariant[];
  selected: AppointmentCatalogVariant | null;
  onSelect: (variant: AppointmentCatalogVariant) => void;
  onContinue: () => void;
};

function variantMeta(variant: AppointmentCatalogVariant): string {
  const parts = [`${variant.duration_minutes} min`];
  if (variant.price_pence != null) {
    parts.push(`£${(variant.price_pence / 100).toFixed(2)}`);
  }
  return parts.join(' · ');
}

/** Step — pick the service's variant (sub-option with its own duration/price). */
export function VariantStep({
  serviceName,
  variants,
  selected,
  onSelect,
  onContinue,
}: VariantStepProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose an option</Text>
      <Text variant="bodySmall" tone="muted">
        {serviceName}
      </Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {variants.map((variant) => {
          const isSelected = selected?.id === variant.id;
          return (
            <Pressable
              key={variant.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                hapticSelect();
                onSelect(variant);
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                  borderColor: isSelected ? colors.brand : colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}>
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
                <Text variant="caption" tone="muted">
                  {variantMeta(variant)}
                </Text>
                {variant.description ? (
                  <Text variant="caption" tone="muted" numberOfLines={2}>
                    {variant.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button label="Continue" fullWidth onPress={onContinue} disabled={!selected} />
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
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
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
