/**
 * The Team tab (reports release 2, 2026-10-13; web repo `reports/release-2-screen-spec.md`): each
 * calendar's figures for the shared range and Showing choice, with the change against the earlier
 * period under each, and a Total. On a phone the table is a card per calendar with the seven
 * figures in a two-column grid, as the spec allows. Admins only, like its endpoint.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ComparisonCaption } from '@/components/reports/ComparisonParts';
import { CalendarScopeNote } from '@/components/reports/ReportCalendarFilter';
import { CardHeader } from '@/components/reports/ReportCardParts';
import { MeasureDefinitions, MeasuresLoadProblem } from '@/components/reports/SalonMeasuresCards';
import { Card } from '@/components/ui/Card';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { formatReportRangeLabel } from '@/lib/dates/venue-dates';
import { reportCalendarCopy } from '@/lib/reports/report-calendar';
import { reportScopeCopy } from '@/lib/reports/report-scope';
import {
  isCombinedScope,
  measuresCopy,
  teamDefinitions,
  teamFigures,
  teamRowName,
  type TeamFigure,
} from '@/lib/reports/salon-measures';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SalonMeasures, SalonMeasuresReport } from '@/types/reports';

/** What the section needs of the measures query (useReportMeasures). */
export interface TeamMeasuresQuery {
  data: SalonMeasuresReport | undefined;
  isLoading: boolean;
  isError: boolean;
  isRefetching?: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** One figure: its label, the value, and the change label under it in green, red or grey. */
function Figure({ figure }: { figure: TeamFigure }) {
  const { colors } = useTheme();
  const tone =
    figure.change?.tone === 'good' ? colors.success : figure.change?.tone === 'bad' ? colors.danger : colors.textMuted;
  return (
    <View style={styles.figure}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {figure.label}
      </Text>
      <Text variant="bodyMedium" style={styles.num}>
        {figure.value}
      </Text>
      {figure.change ? (
        <Text variant="caption" color={tone} style={styles.num} accessibilityLabel={`${figure.label} change ${figure.change.label}`}>
          {figure.change.label}
        </Text>
      ) : null}
    </View>
  );
}

/** A calendar's card (or the Total's): its name and the seven figures, two to a line. */
function TeamRow({
  title,
  current,
  earlier,
  total = false,
}: {
  title: string;
  current: SalonMeasures;
  earlier: SalonMeasures | null;
  total?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={total ? 'team-total' : 'team-row'}
      style={[
        styles.row,
        { borderColor: total ? colors.brand : colors.border, backgroundColor: total ? colors.surface : undefined },
      ]}>
      <Text variant="bodyMedium" style={total ? styles.bold : undefined}>
        {title}
      </Text>
      <View style={styles.grid}>
        {teamFigures(current, earlier).map((f) => (
          <Figure key={f.key} figure={f} />
        ))}
      </View>
    </View>
  );
}

/** The Team card, for an answer in hand. */
export function TeamCard({ data }: { data: SalonMeasuresReport }) {
  const combined = isCombinedScope(data.scope);
  const earlierTotals = data.comparison ? data.earlier : null;
  const rows = data.by_calendar ?? [];
  return (
    <Card>
      <CardHeader title={measuresCopy('team.title')} basis={reportScopeCopy('basis.date')} />
      <Text variant="bodySmall" tone="secondary" style={styles.gap}>
        {measuresCopy('team.intro')}
      </Text>
      <ComparisonCaption comparison={data.comparison} style={styles.gap} />
      {rows.length === 0 ? (
        <Text variant="bodySmall" tone="muted" style={styles.gap}>
          {measuresCopy('team.empty')}
        </Text>
      ) : (
        <>
          <View style={styles.rows}>
            {rows.map((row) => (
              <TeamRow
                key={`${row.venue_id}:${row.calendar_id}`}
                title={teamRowName(row, combined)}
                current={row.current}
                earlier={data.comparison ? row.earlier : null}
              />
            ))}
            <TeamRow title={measuresCopy('team.total')} current={data.totals} earlier={earlierTotals} total />
          </View>
          <Text variant="caption" tone="muted" style={styles.gap}>
            {measuresCopy('team.addUp')}
          </Text>
          <MeasureDefinitions items={teamDefinitions()} footnote />
        </>
      )}
    </Card>
  );
}

/**
 * The tab: the range line and what the figures are for (from the answer, as on the Overview), then
 * the Team card; a skeleton while it loads, and release 1's refusal or error otherwise.
 */
export function TeamSection({ query, scoped }: { query: TeamMeasuresQuery; scoped: boolean }) {
  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError || !query.data) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <MeasuresLoadProblem error={query.error} scoped={scoped} onRetry={() => void query.refetch()} />
      </ScrollView>
    );
  }
  const data = query.data;
  const togetherNames = data.by_business?.map((b) => b.venue_name);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={Boolean(query.isRefetching)} onRefresh={() => void query.refetch()} />}>
      <Text variant="caption" tone="muted" style={styles.rangeLabel}>
        {formatReportRangeLabel(data.from, data.to)}
      </Text>
      <CalendarScopeNote
        echoed={data.calendar}
        scope={data.scope}
        togetherNames={togetherNames}
        detail={reportCalendarCopy('cal.detail.overview')}
      />
      <TeamCard data={data} />
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.base,
  },
  rangeLabel: {
    textAlign: 'center',
  },
  gap: {
    marginTop: spacing.sm,
  },
  rows: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  figure: {
    width: '50%',
    paddingRight: spacing.sm,
    gap: 1,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '700',
  },
  spacer: {
    height: spacing['2xl'],
  },
});
