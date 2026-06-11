import { StyleSheet, View } from 'react-native';

import type { LiveSyncState } from '@/lib/realtime/useVenueLiveSync';
import { useTheme } from '@/theme/useTheme';

/**
 * Small realtime-sync indicator — green when the Supabase channel is live,
 * amber while reconnecting (polling fallback), hidden when idle. Pair with
 * {@link useVenueLiveSync} on any list that should refresh from server changes.
 */
export function LiveDot({ state }: { state: LiveSyncState }) {
  const { colors } = useTheme();
  if (state === 'idle') return null;
  return (
    <View
      style={[styles.dot, { backgroundColor: state === 'live' ? colors.success : colors.warning }]}
      accessibilityLabel={state === 'live' ? 'Live sync active' : 'Reconnecting'}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
