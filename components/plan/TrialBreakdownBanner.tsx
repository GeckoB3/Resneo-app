/**
 * Free-trial countdown and where its days came from, web parity with `TrialBreakdownBanner` in
 * `src/app/dashboard/settings/SettingsView.tsx`. Green when a referral added days, brand
 * otherwise. Renders only while trialling. The countdown refreshes hourly for a screen left open.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { trialBannerView, type VenueTrialBreakdown } from '@/lib/billing/trial-breakdown';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const HOUR_MS = 60 * 60 * 1000;

export function TrialBreakdownBanner({
  planStatus,
  periodStart,
  periodEnd,
  server,
}: {
  planStatus: string | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
  server?: VenueTrialBreakdown | null;
}) {
  const { colors } = useTheme();
  // Wall-clock as state so the countdown stays fresh; the lazy initialiser keeps render pure.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const view = trialBannerView({ planStatus, periodStart, periodEnd, server, nowMs });
  const trialling = view !== null;

  useEffect(() => {
    if (!trialling) return;
    const id = setInterval(() => setNowMs(Date.now()), HOUR_MS);
    return () => clearInterval(id);
  }, [trialling]);

  if (!view) return null;

  const fg = view.hasReferralBonus ? colors.success : colors.brand;
  const bg = view.hasReferralBonus ? colors.successSurface : colors.brandSubtle;
  const b = view.breakdown;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]} testID="trial-breakdown">
      <Text variant="label" color={fg}>
        {view.headline}
      </Text>
      {view.firstCharge ? (
        <Text variant="caption" color={fg}>
          {view.firstCharge}
        </Text>
      ) : null}
      {b ? (
        <Text variant="caption" color={fg} style={styles.breakdown}>
          {'Trial breakdown: '}
          <Text variant="caption" color={fg} style={styles.bold}>{`${b.standardDays} days`}</Text>
          {' standard signup trial'}
          {b.referralBonusDays > 0 ? (
            <>
              {' + '}
              <Text variant="caption" color={fg} style={styles.bold}>{`${b.referralBonusDays} days`}</Text>
              {' from referral by '}
              <Text variant="caption" color={fg} style={styles.bold}>
                {b.referrerLabel}
              </Text>
            </>
          ) : null}
          {b.totalDays > 0 ? (
            <>
              {' = '}
              <Text variant="caption" color={fg} style={styles.bold}>{`${b.totalDays} days`}</Text>
              {' total.'}
            </>
          ) : (
            '.'
          )}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: spacing.md, borderRadius: radius.sm, gap: spacing.xs },
  breakdown: { marginTop: spacing.xxs },
  bold: { fontWeight: '700' },
});
