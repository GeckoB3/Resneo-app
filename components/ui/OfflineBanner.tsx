import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Thin top banner shown when the device has no network connection, so staff
 * know a booking change may not have saved. Rendered in the tab shell.
 */
export function OfflineBanner() {
  const { colors } = useTheme();
  const { isConnected } = useNetInfo();

  // `isConnected` is null until the first reading — only warn when explicitly offline.
  if (isConnected !== false) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.warningSurface, borderBottomColor: colors.warning },
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
