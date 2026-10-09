/**
 * "SMS segments this period" at the top of Reports: web parity with
 * `src/app/dashboard/reports/SmsUsageBanner.tsx` (Settings, Reports tab, admins only).
 *
 * Reads `GET /api/venue/sms-usage-display` through `useSmsUsage`. While it loads, a placeholder
 * card holds the space; a venue with no SMS tracking, or a failed read, shows nothing, as the web.
 */
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { smsUsageOverageLine, smsUsagePercent } from '@/lib/reports/sms-usage';
import { useSmsUsage } from '@/lib/queries/useSmsUsage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export function SmsUsageBanner({ enabled = true }: { enabled?: boolean }) {
  const { colors } = useTheme();
  const { data: usage, isLoading } = useSmsUsage(enabled);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card style={styles.card} testID="sms-usage-loading">
        <Text variant="overline" tone="muted">
          Usage
        </Text>
        <Text variant="subheading">SMS segments this period</Text>
        <View style={[styles.placeholder, { backgroundColor: colors.skeleton }]} />
      </Card>
    );
  }

  if (!usage) return null;

  const overage = smsUsageOverageLine(usage);
  return (
    <Card style={styles.card} testID="sms-usage-banner">
      <Text variant="overline" tone="muted">
        Usage
      </Text>
      <Text variant="subheading">SMS segments this period</Text>
      <View
        style={[styles.track, { backgroundColor: colors.border }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: usage.messages_included, now: usage.messages_sent }}>
        <View
          style={[
            styles.fill,
            { width: `${smsUsagePercent(usage)}%` as `${number}%`, backgroundColor: colors.brand },
          ]}
        />
      </View>
      <Text variant="bodySmall" tone="secondary">
        <Text variant="bodySmall" style={styles.bold}>
          {usage.messages_sent}
        </Text>
        {` / ${usage.messages_included} included`}
        <Text variant="bodySmall" tone="muted">{` (${usage.remaining} left)`}</Text>
      </Text>
      {overage ? (
        <View
          style={[styles.overage, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Badge label="Overage" tone="warning" />
          <Text variant="bodySmall" style={styles.flex1}>
            {overage}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  placeholder: { height: 56, borderRadius: radius.md },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  bold: { fontWeight: '700' },
  overage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex1: { flex: 1, minWidth: 180 },
});
