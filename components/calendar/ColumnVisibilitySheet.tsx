/**
 * Bottom sheet to toggle which practitioner columns are visible in the
 * multi-column day grid. Mirrors web's CalendarColumnsChecklist.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

type ColumnVisibilitySheetProps = {
  visible: boolean;
  onClose: () => void;
  practitioners: Practitioner[];
  visibleIds: Set<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
};

/** Sheet with practitioner checkboxes to show/hide calendar columns. */
export function ColumnVisibilitySheet({
  visible,
  onClose,
  practitioners,
  visibleIds,
  onToggle,
  onShowAll,
}: ColumnVisibilitySheetProps) {
  const { colors } = useTheme();
  const allVisible = visibleIds.size === practitioners.length;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">
            Calendar
          </Text>
          <Text variant="title">Column visibility</Text>
        </View>

        <View style={styles.list}>
          {practitioners.map((p) => {
            const checked = visibleIds.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  hapticSelect();
                  onToggle(p.id);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                style={({ pressed }) => [
                  styles.row,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: checked ? colors.brand : colors.borderStrong,
                      backgroundColor: checked ? colors.brand : 'transparent',
                    },
                  ]}>
                  {checked ? (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'done', web: 'done' }}
                      tintColor={colors.onBrand}
                      size={12}
                    />
                  ) : null}
                </View>
                <Text variant="body">{p.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          {!allVisible ? (
            <Button
              label="Show all"
              variant="secondary"
              onPress={() => {
                onShowAll();
              }}
              style={styles.actionBtn}
            />
          ) : null}
          <Button label="Done" onPress={onClose} style={styles.actionBtn} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});
