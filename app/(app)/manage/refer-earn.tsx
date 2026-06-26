import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import { useReferrals, type ReferralRowForUi } from '@/lib/queries/useReferrals';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map a referral status to a Badge tone (credited = success, void/failed = danger). */
function statusTone(status: ReferralRowForUi['status']): BadgeTone {
  switch (status) {
    case 'credited':
      return 'success';
    case 'referee_signed_up':
      return 'brand';
    case 'failed':
    case 'void':
      return 'danger';
    case 'pending':
    default:
      return 'neutral';
  }
}

/** ISO date → "5 Jun 2026" (placeholder dash when missing/unparseable). */
export function formatReferralDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── How it works ─────────────────────────────────────────────────────────────

/** A single numbered step in the "How it works" explainer. */
function HowItWorksStep({ index, title, body }: { index: number; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: colors.brandSubtle }]}>
        <Text variant="bodyMedium" color={colors.brand}>
          {index}
        </Text>
      </View>
      <View style={styles.stepText}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="bodySmall" tone="secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

/** Explainer card describing how the Refer & Earn scheme works. */
function HowItWorksCard() {
  return (
    <Card>
      <Text variant="label">How Refer & Earn works</Text>
      <View style={styles.steps}>
        <HowItWorksStep
          index={1}
          title="Share your link"
          body="Send your referral code or link to another venue that isn’t on Resneo yet."
        />
        <HowItWorksStep
          index={2}
          title="They sign up"
          body="When they create a venue using your link, the referral appears in the list below."
        />
        <HowItWorksStep
          index={3}
          title="You both earn"
          body="You and the venue you referred each get one month of subscription credit — applied once they’re an active, paying venue."
        />
      </View>
      <Text variant="caption" tone="muted" style={styles.howFootnote}>
        Credit is applied automatically and shown under “Credit remaining”. Referrals may be voided
        if the venue already had an account or doesn’t stay active.
      </Text>
    </Card>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ReferralRow({ row, isFirst }: { row: ReferralRowForUi; isFirst: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.referralRow,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}>
      <View style={styles.referralMain}>
        <View style={styles.referralHeader}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.referralName}>
            {row.refereeName}
          </Text>
          <Badge label={row.statusLabel} tone={statusTone(row.status)} />
        </View>
        <View style={styles.referralMeta}>
          <Text variant="caption" tone="muted">
            {formatReferralDate(row.occurredAt)}
          </Text>
          {row.rewardDisplay ? (
            <Text variant="caption" tone="secondary">
              {row.rewardDisplay}
            </Text>
          ) : null}
        </View>
        {row.voidReason ? (
          <Text variant="caption" color={colors.danger} style={styles.voidReason}>
            {row.voidReason}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

/**
 * Refer & Earn: the venue's referral dashboard (web Settings → Refer a venue).
 * Admin-only: the route returns 403 for non-admins and when the programme is
 * disabled, so non-admins never reach the query and a 403 shows the disabled copy.
 */
export default function ReferEarnScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const query = useReferrals(isAdmin);
  const data = query.data;

  // Hoist the optional-chained value so the manual useCallback memo stays
  // preservable by the React compiler (deps must be plain identifiers).
  const shareableLink = data?.shareableLink;

  const handleCopy = useCallback(async () => {
    if (!shareableLink) return;
    hapticTap();
    await Clipboard.setStringAsync(shareableLink);
    toast.success('Referral link copied.');
  }, [shareableLink, toast]);

  const handleShare = useCallback(async () => {
    if (!shareableLink) return;
    hapticTap();
    try {
      const available =
        typeof Sharing.isAvailableAsync === 'function' ? await Sharing.isAvailableAsync() : false;
      if (!available || typeof Sharing.shareAsync !== 'function') {
        // No share sheet (e.g. web / simulator); fall back to copying the link.
        await Clipboard.setStringAsync(shareableLink);
        toast.info('Sharing isn’t available here, so the link was copied instead.');
        return;
      }
      await Sharing.shareAsync(shareableLink, {
        dialogTitle: 'Share your Resneo referral link',
      });
    } catch {
      toast.error('Could not open the share sheet.');
    }
  }, [shareableLink, toast]);

  const header = <Stack.Screen options={{ headerShown: true, title: 'Refer & Earn' }} />;

  if (staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  // Non-admins never reach the route; the programme is admin-managed.
  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="Refer & Earn is only available to venue admins." />
      </Screen>
    );
  }

  if (query.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  // A 403 means the referral programme is disabled for this venue (web parity).
  const isDisabled = query.error instanceof ApiError && query.error.status === 403;
  if (isDisabled) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Refer & Earn isn’t available"
          message="The referral programme isn’t enabled for your venue yet. Contact the Resneo team to take part."
        />
      </Screen>
    );
  }

  if (query.isError || !data) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load Refer & Earn.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const creditRemaining = formatPence(data.creditRemainingPence) ?? '—';
  const totalCredited = formatPence(data.totalCreditedPence) ?? '—';

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }>
        {/* How it works explainer */}
        <HowItWorksCard />

        {/* Share card: code + link */}
        <Card>
          <Text variant="label">Your referral code</Text>
          <View style={[styles.codePill, { backgroundColor: colors.brandSubtle }]}>
            <Text variant="title" color={colors.brand} style={styles.code}>
              {data.code}
            </Text>
          </View>

          <Text variant="caption" tone="muted" style={styles.linkLabel}>
            Shareable link
          </Text>
          <Text variant="bodySmall" numberOfLines={2} style={styles.link}>
            {data.shareableLink}
          </Text>

          <View style={styles.shareActions}>
            <Button
              label="Copy link"
              variant="secondary"
              style={styles.flex1}
              onPress={() => void handleCopy()}
            />
            <Button
              label="Share"
              variant="primary"
              style={styles.flex1}
              onPress={() => void handleShare()}
            />
          </View>
        </Card>

        {/* KPI cards */}
        <View style={styles.kpiGrid}>
          <StatTile
            label="Total credited"
            value={totalCredited}
            caption={`${data.counts.credited} credited`}
            style={styles.kpiTile}
          />
          <StatTile
            label="Credit remaining"
            value={creditRemaining}
            caption={`${data.counts.pending} pending`}
            style={styles.kpiTile}
          />
          <StatTile
            label="Total referrals"
            value={String(data.counts.total)}
            style={styles.kpiTile}
          />
        </View>

        {/* Referrals list */}
        <Card padded={false}>
          <View style={styles.listHeader}>
            <Text variant="label">Your referrals</Text>
          </View>
          {data.referralsForUi.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text variant="bodySmall" tone="muted" style={styles.center}>
                No referrals yet
              </Text>
              <Text variant="caption" tone="muted" style={styles.center}>
                Share your link and credited referrals show up here.
              </Text>
            </View>
          ) : (
            data.referralsForUi.map((row, index) => (
              <ReferralRow key={row.id} row={row} isFirst={index === 0} />
            ))
          )}
        </Card>

        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  codePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginVertical: spacing.sm,
  },
  code: {
    letterSpacing: 1,
  },
  linkLabel: {
    marginTop: spacing.sm,
  },
  link: {
    marginTop: spacing.xxs,
  },
  shareActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  flex1: {
    flex: 1,
  },
  steps: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: spacing.xxs,
  },
  howFootnote: {
    marginTop: spacing.base,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 140,
  },
  listHeader: {
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  emptyWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xl,
    gap: spacing.xxs,
  },
  center: {
    textAlign: 'center',
  },
  referralRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  referralMain: {
    flex: 1,
    gap: spacing.xxs,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  referralName: {
    flex: 1,
  },
  referralMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  voidReason: {
    marginTop: spacing.xxs,
  },
  spacer: {
    height: spacing.xl,
  },
});
