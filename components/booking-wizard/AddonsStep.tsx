import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentCatalogAddonGroup } from '@/types/appointment-catalog';

type AddonsStepProps = {
  groups: AppointmentCatalogAddonGroup[];
  /** Selected addon ids (flat across groups). */
  value: string[];
  onChange: (ids: string[]) => void;
  onContinue: () => void;
};

function extraLabel(pricePence: number, durationMinutes: number): string | null {
  const parts: string[] = [];
  if (pricePence > 0) parts.push(`+£${(pricePence / 100).toFixed(2)}`);
  if (durationMinutes > 0) parts.push(`+${durationMinutes} min`);
  return parts.length ? parts.join(' · ') : null;
}

function requirementLabel(group: AppointmentCatalogAddonGroup['group']): string | null {
  const { selection_type, min_select, max_select } = group;
  if (min_select > 0 && max_select != null && min_select === max_select) {
    return `Choose ${min_select}`;
  }
  if (min_select > 0) return `Choose at least ${min_select}`;
  if (selection_type === 'single') return 'Optional · choose one';
  if (max_select != null) return `Optional · up to ${max_select}`;
  return 'Optional';
}

/** Step — select service add-ons (single/multi per group, min/max enforced). */
export function AddonsStep({ groups, value, onChange, onContinue }: AddonsStepProps) {
  const { colors } = useTheme();
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (group: AppointmentCatalogAddonGroup, addonId: string) => {
    hapticSelect();
    const groupAddonIds = group.addons.map((a) => a.id);
    const selectedInGroup = groupAddonIds.filter((id) => selected.has(id));
    const isSelected = selected.has(addonId);
    const next = new Set(selected);

    if (group.group.selection_type === 'single') {
      // Replace any current choice in this group.
      groupAddonIds.forEach((id) => next.delete(id));
      if (!isSelected || group.group.min_select > 0) {
        next.add(addonId);
      }
    } else if (isSelected) {
      next.delete(addonId);
    } else {
      const max = group.group.max_select;
      if (max != null && selectedInGroup.length >= max) {
        return; // at cap — ignore
      }
      next.add(addonId);
    }
    onChange([...next]);
  };

  const allGroupsValid = groups.every((g) => {
    const count = g.addons.filter((a) => selected.has(a.id)).length;
    return count >= g.group.min_select;
  });

  return (
    <View style={styles.container}>
      <Text variant="heading">Add-ons</Text>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {groups.map((group) => (
          <View key={group.group.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text variant="label">{group.group.name}</Text>
              {requirementLabel(group.group) ? (
                <Text variant="caption" tone="muted">
                  {requirementLabel(group.group)}
                </Text>
              ) : null}
            </View>
            {group.group.prompt_to_client ? (
              <Text variant="bodySmall" tone="secondary">
                {group.group.prompt_to_client}
              </Text>
            ) : null}
            {group.addons.map((addon) => {
              const isSelected = selected.has(addon.id);
              const extra = extraLabel(addon.additional_price_pence, addon.additional_duration_minutes);
              return (
                <Pressable
                  key={addon.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => toggle(group, addon.id)}
                  style={({ pressed }) => [
                    styles.addonRow,
                    {
                      backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                      borderColor: isSelected ? colors.brand : colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}>
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: isSelected ? colors.brand : colors.borderStrong,
                        backgroundColor: isSelected ? colors.brand : 'transparent',
                      },
                    ]}>
                    {isSelected ? (
                      <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text>
                    ) : null}
                  </View>
                  <View style={styles.addonText}>
                    <Text variant="bodyMedium">{addon.name}</Text>
                    {extra ? (
                      <Text variant="caption" tone="muted">
                        {extra}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <Button label="Continue" fullWidth onPress={onContinue} disabled={!allGroupsValid} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  scroll: {
    gap: spacing.lg,
    paddingBottom: spacing.base,
  },
  group: {
    gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  addonText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
