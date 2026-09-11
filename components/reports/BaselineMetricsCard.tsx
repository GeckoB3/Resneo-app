/**
 * Report 8 — appointment performance (the web's `BaselineMetricsSection`).
 *
 * Every string here is the web's, word for word: the metric titles, the detail
 * lines under each figure, the reference-period banner (including when the
 * snapshot was saved) and the closing note. An owner reading the same report on
 * the phone and on the dashboard should not have to work out whether two
 * different sentences mean the same thing.
 *
 * @see _reference/Resneo/src/app/dashboard/reports/BaselineMetricsSection.tsx
 */
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VenueBaselineMetrics, BaselineMetricsSnapshot } from '@/types/reports';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatPeriodRange(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} – ${to}`;
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

/** The day a reference snapshot was taken, as the banner prints it. */
function formatSavedOn(createdAt: string): string {
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return createdAt;
  return when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) {
    const mins = Math.round(h * 60);
    return mins <= 1 ? 'under 1 minute' : `${mins} minutes`;
  }
  if (h < 24) return `${Math.round(h * 10) / 10} hours`;
  const days = Math.round((h / 24) * 10) / 10;
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatDurationFriendly(ms: number | null): string {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (rem === 0) return `${min} minute${min === 1 ? '' : 's'}`;
  return `${min} min ${rem} sec`;
}

function formatPct(rate: number): string {
  return `${rate}%`;
}

function snapshotComparison(
  current: string,
  reference: string | undefined,
  prefix: string,
): string | undefined {
  if (!reference || reference === current) return undefined;
  return `${prefix} ${reference} (your saved reference period)`;
}

// ─── tone colours ────────────────────────────────────────────────────────────
type Tone = 'amber' | 'emerald' | 'brand' | 'violet' | 'blue' | 'slate';

function useToneColors(tone: Tone): { bg: string; border: string } {
  const { colors } = useTheme();
  switch (tone) {
    case 'amber':
      return { bg: colors.warningSurface, border: colors.warning };
    case 'emerald':
      return { bg: colors.successSurface, border: colors.success };
    case 'brand':
      return { bg: colors.brandSubtle, border: colors.brandBorder };
    case 'violet':
      return { bg: colors.accentSubtle, border: colors.border };
    case 'blue':
      return { bg: colors.surfaceRaised, border: colors.border };
    default:
      return { bg: colors.surface, border: colors.border };
  }
}

// ─── InsightMetricCard ───────────────────────────────────────────────────────
function InsightMetricCard({
  title,
  value,
  detail,
  comparison,
  tone = 'slate',
}: {
  title: string;
  value: string;
  detail: string;
  comparison?: string;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  const toneColors = useToneColors(tone);

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: toneColors.bg, borderColor: toneColors.border },
      ]}>
      <Text variant="label" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text
        variant="heading"
        style={[styles.metricValue, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
        {value}
      </Text>
      <Text variant="bodySmall" tone="secondary" style={styles.metricDetail}>
        {detail}
      </Text>
      {comparison ? (
        <Text variant="caption" tone="muted" style={styles.comparison}>
          {comparison}
        </Text>
      ) : null}
    </View>
  );
}

// ─── MetricGroup ─────────────────────────────────────────────────────────────
function MetricGroup({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text variant="subheading">{heading}</Text>
        {intro ? (
          <Text variant="bodySmall" tone="secondary" style={styles.groupIntro}>
            {intro}
          </Text>
        ) : null}
      </View>
      <View style={styles.metricGrid}>{children}</View>
    </View>
  );
}

// ─── BaselineMetricsCard (public) ────────────────────────────────────────────
export interface BaselineMetricsCardProps {
  metrics: VenueBaselineMetrics | null | undefined;
  snapshot?: BaselineMetricsSnapshot | null;
}

export function BaselineMetricsCard({ metrics, snapshot }: BaselineMetricsCardProps) {
  const { colors } = useTheme();

  if (!metrics) {
    return (
      <Card>
        <Text variant="label">Appointment performance</Text>
        <Text variant="caption" tone="muted" style={styles.periodLabel}>
          Attendance, reschedules, cancellations, and how quickly your team adds bookings, for the
          date range selected above.
        </Text>
        <Text variant="bodySmall" tone="secondary" style={styles.emptyText}>
          Not enough appointment activity in this date range yet. Widen the range at the top of
          Reports or check back after more bookings are created.
        </Text>
      </Card>
    );
  }

  const snap = snapshot?.metrics;
  const periodLabel = formatPeriodRange(metrics.period.from, metrics.period.to);

  const noShowValue =
    metrics.no_show.eligible_count === 0 ? '—' : formatPct(metrics.no_show.rate_pct);

  const noShowDetail =
    metrics.no_show.eligible_count === 0
      ? 'No appointments reached Started or Completed in this period yet, so a no-show rate cannot be calculated.'
      : metrics.no_show.no_show_count === 0
        ? `No no-shows among ${metrics.no_show.eligible_count} appointment${metrics.no_show.eligible_count === 1 ? '' : 's'} that were due to take place (walk-ins are excluded).`
        : `${metrics.no_show.no_show_count} guest${metrics.no_show.no_show_count === 1 ? '' : 's'} did not arrive out of ${metrics.no_show.eligible_count} appointments that were due to take place (walk-ins excluded).`;

  const modifications = metrics.reschedule.modifications_count;
  const guestMoves = metrics.reschedule.guest_self_reschedule_count;
  const staffMoves = metrics.reschedule.staff_reschedule_count;
  const otherMoves = metrics.reschedule.unknown_actor_reschedule_count;

  const selfServeValue =
    modifications === 0 ? '—' : formatPct(metrics.reschedule.guest_self_reschedule_rate_pct);

  const knownMoves = guestMoves + staffMoves;
  const selfServeDetail =
    modifications === 0
      ? 'No appointment date or time changes were recorded in this period.'
      : knownMoves === 0
        ? `${modifications} time change${modifications === 1 ? '' : 's'} in this period; none were recorded as guest or staff (older system data).`
        : [
            `${modifications} time change${modifications === 1 ? '' : 's'} in this period.`,
            `Among ${knownMoves} where we know who moved it: ${guestMoves} by the guest online, ${staffMoves} by your team.`,
            otherMoves > 0
              ? `${otherMoves} older change${otherMoves === 1 ? '' : 's'} not attributed to guest or staff.`
              : null,
          ]
            .filter(Boolean)
            .join(' ');

  const messagingValue =
    modifications === 0 ? '—' : formatPct(metrics.reschedule.reschedule_via_email_rate_pct);

  const messagingDetail =
    modifications === 0
      ? 'No appointment moves to measure.'
      : metrics.reschedule.modification_notifications_count === 0
        ? `None of the ${modifications} move${modifications === 1 ? '' : 's'} triggered an automatic email or text to the guest. Staff moves often send an update when configured in Settings.`
        : `${metrics.reschedule.modification_notifications_count} of ${modifications} move${modifications === 1 ? '' : 's'} had an email or text sent to the guest (usually after your team changed the time).`;

  const rebookValue =
    metrics.cancellation_rebook.cancellations_with_guest === 0
      ? '—'
      : formatPct(metrics.cancellation_rebook.rebook_rate_7d_pct);

  const rebookDetail =
    metrics.cancellation_rebook.cancellations_with_guest === 0
      ? 'No cancelled appointments with a guest profile in this period.'
      : metrics.cancellation_rebook.rebooked_within_7d === 0
        ? `None of ${metrics.cancellation_rebook.cancellations_with_guest} cancellation${metrics.cancellation_rebook.cancellations_with_guest === 1 ? '' : 's'} led to another appointment within 7 days.`
        : `${metrics.cancellation_rebook.rebooked_within_7d} of ${metrics.cancellation_rebook.cancellations_with_guest} cancellation${metrics.cancellation_rebook.cancellations_with_guest === 1 ? '' : 's'} were followed by a new appointment within 7 days.`;

  const gapValue =
    metrics.cancellation_rebook.median_rebook_gap_hours == null
      ? '—'
      : formatHours(metrics.cancellation_rebook.median_rebook_gap_hours);

  const gapDetail =
    metrics.cancellation_rebook.rebooked_within_7d === 0
      ? 'When a guest books again after cancelling, the typical wait will appear here.'
      : `Median time from cancellation to the guest’s next appointment. Three quarters rebook within ${formatHours(metrics.cancellation_rebook.p75_rebook_gap_hours)}.`;

  const staffSamples = metrics.staff_time_to_book.sample_count;
  const staffValue =
    staffSamples === 0 ? '—' : formatDurationFriendly(metrics.staff_time_to_book.median_duration_ms);

  const returningMedian = metrics.staff_time_to_book.returning_guest.median_duration_ms;
  const returningCount = metrics.staff_time_to_book.returning_guest.sample_count;

  const staffDetail =
    staffSamples === 0
      ? 'Recorded when your team creates an appointment in the dashboard (from opening the form to saving). More samples appear as staff use that flow.'
      : returningCount > 0
        ? `Median across ${staffSamples} staff-created appointment${staffSamples === 1 ? '' : 's'}. Returning guests: typical ${formatDurationFriendly(returningMedian)} (${returningCount} booking${returningCount === 1 ? '' : 's'}).`
        : `Median across ${staffSamples} appointment${staffSamples === 1 ? '' : 's'} created by staff in this period.`;

  return (
    <Card>
      <Text variant="label">Appointment performance</Text>
      <Text variant="caption" tone="muted" style={styles.periodLabel}>
        {`${periodLabel} · appointment bookings only · same dates as the range above`}
      </Text>

      {snapshot ? (
        <View
          style={[
            styles.snapshotBanner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Text variant="caption" tone="secondary">
            <Text variant="caption" style={{ fontFamily: fonts.semibold }}>
              Reference period saved:{' '}
            </Text>
            {formatPeriodRange(snapshot.period_start, snapshot.period_end)}
            <Text variant="caption" tone="muted">
              {` (saved ${formatSavedOn(snapshot.created_at)}). Figures below follow the date range you selected at the top of Reports.`}
            </Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.groups}>
        <MetricGroup
          heading="Attendance"
          intro="Online and staff-booked appointments (not walk-ins) that reached Started, Completed, or were marked no-show.">
          <InsightMetricCard
            title="No-show rate"
            value={noShowValue}
            detail={noShowDetail}
            tone="amber"
            comparison={snapshotComparison(
              noShowValue,
              snap?.no_show.eligible_count ? formatPct(snap.no_show.rate_pct) : undefined,
              'Reference no-show rate was',
            )}
          />
        </MetricGroup>

        <MetricGroup
          heading="Reschedules"
          intro="Appointments moved to another date or time. Percentages below use only moves where the system recorded guest vs staff (older moves may be listed separately).">
          <InsightMetricCard
            title="Guest moved online (share of known moves)"
            value={selfServeValue}
            detail={selfServeDetail}
            tone="emerald"
            comparison={snapshotComparison(
              selfServeValue,
              snap && snap.reschedule.modifications_count > 0
                ? formatPct(snap.reschedule.guest_self_reschedule_rate_pct)
                : undefined,
              'Reference share was',
            )}
          />
          <InsightMetricCard
            title="Guest notified after a move"
            value={messagingValue}
            detail={messagingDetail}
            tone="brand"
            comparison={snapshotComparison(
              messagingValue,
              snap && snap.reschedule.modifications_count > 0
                ? formatPct(snap.reschedule.reschedule_via_email_rate_pct)
                : undefined,
              'Reference share was',
            )}
          />
        </MetricGroup>

        <MetricGroup
          heading="After a cancellation"
          intro="Cancelled appointments with a guest on file, whether the same guest booked again within seven days.">
          <InsightMetricCard
            title="Rebooked within 7 days"
            value={rebookValue}
            detail={rebookDetail}
            tone="violet"
            comparison={snapshotComparison(
              rebookValue,
              snap && snap.cancellation_rebook.cancellations_with_guest > 0
                ? formatPct(snap.cancellation_rebook.rebook_rate_7d_pct)
                : undefined,
              'Reference rate was',
            )}
          />
          <InsightMetricCard
            title="Typical wait to rebook"
            value={gapValue}
            detail={gapDetail}
            tone="slate"
            comparison={snapshotComparison(
              gapValue,
              snap?.cancellation_rebook.median_rebook_gap_hours != null
                ? formatHours(snap.cancellation_rebook.median_rebook_gap_hours)
                : undefined,
              'Reference typical wait was',
            )}
          />
        </MetricGroup>

        <MetricGroup
          heading="Team efficiency"
          intro="How long it takes staff to create an appointment in the dashboard (form open to save).">
          <InsightMetricCard
            title="Median time to create an appointment"
            value={staffValue}
            detail={staffDetail}
            tone="blue"
            comparison={snapshotComparison(
              staffValue,
              snap && snap.staff_time_to_book.sample_count > 0
                ? formatDurationFriendly(snap.staff_time_to_book.median_duration_ms)
                : undefined,
              'Reference typical time was',
            )}
          />
        </MetricGroup>
      </View>

      <Text variant="caption" tone="muted" style={styles.footnote}>
        Figures follow the report dates at the top of this page. A saved reference snapshot (updated
        weekly) lets you compare against an earlier period. Guest self-reschedule and deposit rules
        in Settings can improve attendance and cut manual rescheduling.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    marginTop: spacing.sm,
  },
  periodLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  snapshotBanner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.base,
  },
  groups: {
    gap: spacing.xl,
  },
  group: {
    gap: spacing.md,
  },
  groupHeader: {
    gap: spacing.xs,
  },
  groupIntro: {
    marginTop: spacing.xs,
  },
  metricGrid: {
    gap: spacing.sm,
  },
  metricCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricValue: {
    marginTop: spacing.xs,
  },
  metricDetail: {
    marginTop: spacing.xs,
  },
  comparison: {
    marginTop: spacing.xs,
  },
  footnote: {
    marginTop: spacing.base,
  },
});
