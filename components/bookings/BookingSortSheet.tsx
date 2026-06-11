import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { minTouchTarget, spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type SortKey =
  | 'time'
  | 'client'
  | 'status'
  | 'service'
  | 'staff'
  | 'deposit'
  | 'type'
  | 'party_size';

export type SortDir = 'asc' | 'desc';

export interface SortOption {
  key: SortKey;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { key: 'time', label: 'Time' },
  { key: 'client', label: 'Client name' },
  { key: 'status', label: 'Status' },
  { key: 'service', label: 'Service' },
  { key: 'staff', label: 'Staff' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'type', label: 'Type' },
  { key: 'party_size', label: 'Party size' },
];

type BookingSortSheetProps = {
  visible: boolean;
  onClose: () => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onChangeSortKey: (key: SortKey) => void;
  onToggleSortDir: () => void;
};

/**
 * Bottom sheet that lets the user choose a sort key and direction.
 * Mirrors the web's 8-option sort select + asc/desc toggle.
 */
export function BookingSortSheet({
  visible,
  onClose,
  sortKey,
  sortDir,
  onChangeSortKey,
  onToggleSortDir,
}: BookingSortSheetProps) {
  const { colors } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text variant="subheading">Sort bookings</Text>
        <Pressable
          onPress={() => {
            hapticSelect();
            onToggleSortDir();
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.dirButton,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text variant="label" tone="secondary">
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </Text>
        </Pressable>
      </View>

      <ScrollView>
        {SORT_OPTIONS.map((option) => {
          const isActive = option.key === sortKey;
          return (
            <Pressable
              key={option.key}
              onPress={() => {
                hapticSelect();
                onChangeSortKey(option.key);
                onClose();
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: isActive ? colors.brandSubtle : 'transparent',
                  borderColor: colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Text variant="body" color={isActive ? colors.brand : colors.text}>
                {option.label}
              </Text>
              {isActive ? (
                <Text variant="caption" color={colors.brand}>
                  {sortDir === 'asc' ? '↑' : '↓'}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dirButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
});
