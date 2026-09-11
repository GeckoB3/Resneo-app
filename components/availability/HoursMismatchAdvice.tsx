/**
 * Standing advice after a save that leaves calendar hours outside business
 * hours (or the reverse): the save went through, but guests cannot book those
 * hours until the other side widens too. Amber, with a button to the other
 * screen and a Dismiss (web: the amber advice card on both hours pages,
 * 2026-09-10). Stays until dismissed or the next save replaces it.
 */
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type Props = {
  message: string | null;
  /** The other screen: "Open business hours" → /manage/hours, etc. */
  actionLabel: string;
  actionHref: Href;
  onDismiss: () => void;
};

export function HoursMismatchAdvice({ message, actionLabel, actionHref, onDismiss }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="bodySmall" color={colors.text}>
        {message}
      </Text>
      <View style={styles.actions}>
        <Button
          label={actionLabel}
          size="sm"
          variant="secondary"
          onPress={() => router.push(actionHref)}
        />
        <Button label="Dismiss" size="sm" variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
