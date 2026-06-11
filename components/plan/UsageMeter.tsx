import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type UsageMeterProps = {
  label: string;
  used: number;
  /** null = unlimited (no track rendered). */
  total: number | null;
  color: string;
  note?: string;
};

/** Labelled progress bar for plan usage (calendars, SMS) — web Plan tab meters. */
export function UsageMeter({ label, used, total, color, note }: UsageMeterProps) {
  const { colors } = useTheme();
  const unlimited = total === null || !Number.isFinite(total);
  const pct = unlimited || total === 0 ? 0 : Math.max(0, Math.min(100, (used / total) * 100));

  return (
    <View style={styles.meterRow}>
      <View style={styles.meterLabelRow}>
        <Text variant="bodySmall" tone="secondary">
          {label}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {unlimited ? `${used} used · Unlimited` : `${used} / ${total}`}
        </Text>
      </View>
      {!unlimited && (
        <View style={[styles.meterTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${pct}%` as `${number}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      )}
      {note && (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meterRow: {
    gap: spacing.xs,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterFill: {
    height: 6,
    borderRadius: 3,
  },
});
