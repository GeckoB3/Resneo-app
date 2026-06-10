import { Pressable, StyleSheet, Text, View } from 'react-native';

import { minTouchTarget, radius, spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type SignInMode = 'password' | 'magic';

type SignInModeTabsProps = {
  mode: SignInMode;
  onModeChange: (mode: SignInMode) => void;
};

/**
 * Password / Magic Link toggle — matches the segmented control on the web login page.
 * Staff login defaults to Password first (same as reserve-ni /login).
 */
export function SignInModeTabs({ mode, onModeChange }: SignInModeTabsProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surface }]}>
      <ModeTab
        label="Password"
        selected={mode === 'password'}
        onPress={() => {
          onModeChange('password');
        }}
      />
      <ModeTab
        label="Magic Link"
        selected={mode === 'magic'}
        onPress={() => {
          onModeChange('magic');
        }}
      />
    </View>
  );
}

type ModeTabProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function ModeTab({ label, selected, onPress }: ModeTabProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.tab,
        selected
          ? {
              backgroundColor: colors.surfaceRaised,
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
              elevation: 1,
            }
          : undefined,
      ]}>
      <Text
        style={[
          styles.tabLabel,
          { color: selected ? colors.text : colors.textSecondary },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    minHeight: minTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  tabLabel: {
    ...typography.label,
  },
});
