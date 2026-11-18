/**
 * The Collective area's sections as one control (web Docs/card-on-file-plan.md §21.3 item 4, D28):
 * six tabs do not fit a phone, so the control shows the current section with a chevron
 * ("Settings ▾") and opens the list of sections under it. Tapping a section chooses it and closes
 * the list. Screen readers hear "Section: Settings, collapsed" and each option's selected state.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { settingsCopy } from '@/lib/collective-area/settings-copy';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export interface SectionOption<T extends string> {
  value: T;
  label: string;
}

export function SectionPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SectionOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  const sectionWord = settingsCopy('set.tabPicker');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sectionWord}: ${current?.label ?? ''}`}
        accessibilityHint="Opens the list of sections"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          hapticSelect();
          setOpen((o) => !o);
        }}
        testID="collective-section-picker"
        style={({ pressed }) => [
          styles.control,
          { borderColor: open ? colors.brand : colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
        ]}>
        <View style={styles.controlText}>
          <Text variant="caption" tone="muted">
            {sectionWord}
          </Text>
          <Text variant="bodyMedium">{current?.label ?? ''}</Text>
        </View>
        <Text variant="bodyMedium" tone="brand" importantForAccessibility="no" accessibilityElementsHidden>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {open ? (
        <View
          style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}
          accessibilityRole="menu"
          testID="collective-section-list">
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  hapticSelect();
                  setOpen(false);
                  if (!selected) onChange(option.value);
                }}
                style={({ pressed }) => [
                  styles.option,
                  index > 0 ? [styles.divider, { borderTopColor: colors.border }] : null,
                  { backgroundColor: selected ? colors.brandSubtle : pressed ? colors.surfaceRaised : 'transparent' },
                ]}>
                <Text variant="body" tone={selected ? 'brand' : 'default'}>
                  {option.label}
                </Text>
                {selected ? (
                  <Text variant="body" tone="brand" importantForAccessibility="no" accessibilityElementsHidden>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  control: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  controlText: { flex: 1, gap: spacing.xxs },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
