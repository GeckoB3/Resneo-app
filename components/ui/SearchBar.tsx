import { SymbolView } from 'expo-symbols';
import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { hapticSelect } from '@/lib/haptics';
import { minTouchTarget, radius, spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SearchBarProps = Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Called by the clear (×) button. Defaults to clearing the text. */
  onClear?: () => void;
  /** Trailing slot — e.g. sort/filter icon buttons. */
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Shared search field — leading magnifier glyph + a clear (×) button that
 * appears once there's a query. Replaces the three hand-rolled search toolbars
 * on Calendar/Appointments/Contacts so they share one look and clear behaviour.
 *
 * No focus ring driven by React state — per the project's Fabric rule, never
 * setState in onFocus/onBlur (it drops Android focus). The static surface keeps
 * the keyboard stable.
 */
export function SearchBar({
  value,
  onChangeText,
  onClear,
  right,
  placeholder = 'Search',
  containerStyle,
  ...props
}: SearchBarProps) {
  const { colors } = useTheme();

  function handleClear() {
    hapticSelect();
    if (onClear) onClear();
    else onChangeText('');
  }

  return (
    <View style={[styles.row, containerStyle]}>
      <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SymbolView
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          tintColor={colors.textMuted}
          size={17}
          style={styles.leading}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.input, { color: colors.text }]}
          {...props}
        />
        {value.length > 0 ? (
          <Pressable
            onPress={handleClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clear}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
              tintColor={colors.textMuted}
              size={17}
            />
          </Pressable>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  leading: {
    width: 17,
    height: 17,
  },
  input: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.sm,
  },
  clear: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
