import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_TO_PAY_ON_IPHONE } from '@/lib/payments/tap-to-pay-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Tap to Pay on iPhone is getting ready" (checklist 3.9.1, and 5.7's
 * "initializing" screen).
 *
 * Apple's guidance: an INDETERMINATE indicator by default, and a determinate one
 * only once the ProximityReader API reports configuration progress
 * (`PaymentCardReader.Event.updateProgress`, surfaced by the SDK as the reader
 * update events). So a spinner until the first report, then a filling bar.
 */
export function TapToPayProgress({ progress }: { progress: number | null }) {
  const { colors } = useTheme();
  const percent = progress != null ? Math.round(progress * 100) : null;

  return (
    <View
      style={styles.block}
      accessibilityRole="progressbar"
      accessibilityValue={percent != null ? { min: 0, max: 100, now: percent } : undefined}>
      <View style={styles.row}>
        {percent == null ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        <Text variant="bodySmall" tone="muted">
          {`Getting ${TAP_TO_PAY_ON_IPHONE} ready${percent != null ? `: ${percent}%` : '…'}`}
        </Text>
      </View>
      {percent != null ? (
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { backgroundColor: colors.brand, width: `${percent}%` }]} />
        </View>
      ) : null}
      <Text variant="caption" tone="muted">
        {`${TAP_TO_PAY_ON_IPHONE} can't take payments until this finishes.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
  },
});
