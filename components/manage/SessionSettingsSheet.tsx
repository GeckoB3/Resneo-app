import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSelect, hapticSuccess } from '@/lib/haptics';
import { useUpdateSessionSettings } from '@/lib/queries/useTeamMutations';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SessionSettingsSheetProps = {
  visible: boolean;
  currentMinutes: number;
  onClose: () => void;
};

const TIMEOUT_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 720, label: '12 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10080, label: '7 days' },
];

/** Admin-only sheet to configure the staff session auto-logout timer. */
export function SessionSettingsSheet({
  visible,
  currentMinutes,
  onClose,
}: SessionSettingsSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [selected, setSelected] = useState(currentMinutes);
  const update = useUpdateSessionSettings();

  // Sync when opened
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setSelected(currentMinutes);
  }

  async function handleSave() {
    try {
      await update.mutateAsync({ session_timeout_minutes: selected });
      hapticSuccess();
      const label =
        TIMEOUT_OPTIONS.find((o) => o.minutes === selected)?.label ?? `${selected} minutes`;
      // Toast + close fire off the resolved mutation — Alert.alert's callback is a no-op on web.
      toast.success(`Staff will be logged out after ${label} of inactivity.`);
      onClose();
    } catch (err) {
      hapticError();
      toast.error(err instanceof ApiError ? err.message : 'Failed to update session settings.');
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="80%" fill>
      <View style={styles.header}>
        <Text variant="subheading">Session timeout</Text>
        <Text variant="caption" tone="muted">
          Staff are logged out automatically after this period of inactivity.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View
          style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {TIMEOUT_OPTIONS.map((option, index) => {
            const isSelected = selected === option.minutes;
            return (
              <View key={option.minutes}>
                {index > 0 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
                <Pressable
                  onPress={() => {
                    hapticSelect();
                    setSelected(option.minutes);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && { backgroundColor: colors.surfaceRaised },
                  ]}>
                  <Text
                    variant="body"
                    color={isSelected ? colors.brand : undefined}
                    style={isSelected ? styles.selectedText : undefined}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Text variant="bodyMedium" color={colors.brand}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        <Button
          label={update.isPending ? 'Saving…' : 'Save'}
          loading={update.isPending}
          onPress={() => void handleSave()}
          fullWidth
          disabled={selected === currentMinutes}
        />

        <Button label="Cancel" variant="secondary" onPress={onClose} fullWidth />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  list: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base,
  },
  selectedText: {
    fontFamily: undefined,
  },
});
