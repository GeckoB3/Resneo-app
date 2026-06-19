import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Thin top banner shown when the device has no network connection, so staff
 * know a booking change may not have saved. Rendered in the tab shell, ABOVE the
 * per-screen SafeAreaView, so it must clear the status bar itself (otherwise its
 * text paints under the notch on edge-to-edge devices). The frame-aware
 * SafeAreaView on the screen below collapses its now-redundant top inset.
 */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetInfo();

  // `isConnected` is null until the first reading — only warn when explicitly offline.
  if (isConnected !== false) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: colors.warningSurface,
          borderBottomColor: colors.warning,
        },
      ]}>
      <Text variant="caption" color={colors.warning} style={styles.text}>
        You&apos;re offline — changes won&apos;t save until you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
