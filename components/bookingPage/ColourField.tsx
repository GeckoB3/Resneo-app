import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { readableTextColor } from '@/lib/booking/bookingPageConfig';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A hex colour input with a live swatch and a Reset button, as the Booking page
 * screen uses for the brand colour and the embed accent colour.
 */
export function ColourField({
  label,
  value,
  preview,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  preview: string | null;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.colourField}>
      <View
        style={[
          styles.colourPreview,
          { backgroundColor: preview ?? colors.surface, borderColor: colors.border },
        ]}>
        {preview ? (
          <Text variant="caption" color={readableTextColor(preview)}>Aa</Text>
        ) : (
          <Text variant="caption" tone="muted">—</Text>
        )}
      </View>
      <View style={styles.flex1}>
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#003b6f"
          maxLength={7}
        />
      </View>
      {value.trim() ? (
        <IconButton
          icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt', web: 'restart_alt' }}
          accessibilityLabel={`Reset ${label}`}
          tint={colors.textSecondary}
          onPress={onReset}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  colourField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  colourPreview: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  flex1: {
    flex: 1,
  },
});
