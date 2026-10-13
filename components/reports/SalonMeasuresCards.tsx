/**
 * Reports release 2 (2026-10-13; web repo `reports/release-2-screen-spec.md`): the Overview's "Key
 * measures" and "Busiest times" cards, the Clients tab's rebooking and first-visit retention with
 * the clients who have not come back, and the line that points from "Team, services & channels" to
 * the Team tab. Every figure comes from GET /api/venue/reports/measures (useReportMeasures), for
 * the same Showing choice, range and Compare with as the Overview.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChangePill, ComparisonCaption } from '@/components/reports/ComparisonParts';
import { CalendarRefusal } from '@/components/reports/ReportCalendarFilter';
import { CardHeader } from '@/components/reports/ReportCardParts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { reportScopeCopy, scopeRefusalMessage } from '@/lib/reports/report-scope';
import {
  busiestGrid,
  busiestOpacity,
  clientMeasureDefinitions,
  clientMeasureTiles,
  formatMeasureDate,
  isCombinedScope,
  keyMeasureDefinitions,
  keyMeasureTiles,
  measuresCopy,
  notReturnedPlace,
  type MeasureDefinition,
  type MeasureTile,
} from '@/lib/reports/salon-measures';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SalonBusiestCell, SalonMeasuresReport } from '@/types/reports';

/** A row of measure tiles, two to a line, each with its change pill. */
export function MeasureTiles({ tiles }: { tiles: MeasureTile[] }) {
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => (
        <View key={tile.key} style={styles.tile} testID={`measure-tile-${tile.key}`}>
          <StatTile
            label={tile.label}
            value={tile.value}
            caption={tile.lines}
            captionLines={2}
            badge={tile.change ? <ChangePill change={tile.change} /> : undefined}
            style={styles.tileFill}
          />
        </View>
      ))}
    </View>
  );
}

/** The small list under the tiles: each label in bold, then its sentence; the visit footnote last. */
export function MeasureDefinitions({ items, footnote = false }: { items: MeasureDefinition[]; footnote?: boolean }) {
  return (
    <View style={styles.definitions}>
      {items.map((d) => (
        <Text key={d.label} variant="caption" tone="secondary">
          <Text variant="caption" tone="secondary" style={styles.bold}>
            {d.label}
          </Text>
          {`: ${d.text}`}
        </Text>
      ))}
      {footnote ? (
        <Text variant="caption" tone="muted">
          {measuresCopy('def.visit')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Why the measures did not load: the server's sentence with the way back when the Showing choice
 * was refused (as release 1), and otherwise the server's words with a retry.
 */
export function MeasuresLoadProblem({
  error,
  scoped,
  onRetry,
}: {
  error: unknown;
  scoped: boolean;
  onRetry: () => void;
}) {
  const refusal = scopeRefusalMessage(error, scoped);
  if (refusal) return <CalendarRefusal message={refusal} />;
  return (
    <ErrorState
      message={error instanceof ApiError ? error.message : 'Could not load reports.'}
      onRetry={onRetry}
    />
  );
}

/** Overview: Key measures. */
export function KeyMeasuresCard({ data }: { data: SalonMeasuresReport }) {
  const tiles = keyMeasureTiles(data.totals, data.comparison ? data.earlier : null, data.checkout?.current ?? null);
  return (
    <Card>
      <CardHeader title={measuresCopy('key.title')} basis={reportScopeCopy('basis.date')} />
      <MeasureTiles tiles={tiles} />
      <MeasureDefinitions items={keyMeasureDefinitions()} footnote />
      <ComparisonCaption comparison={data.comparison} style={styles.caption} />
    </Card>
  );
}

const CELL_WIDTH = 40;
const CELL_HEIGHT = 30;
const DAY_COLUMN = 36;

/** Overview: Busiest times. Nothing when no cell has working minutes. */
export function BusiestTimesCard({ cells }: { cells: readonly SalonBusiestCell[] | null | undefined }) {
  const { colors } = useTheme();
  const grid = busiestGrid(cells);
  if (!grid) return null;
  return (
    <Card>
      <CardHeader title={measuresCopy('busiest.title')} basis={reportScopeCopy('basis.date')} />
      <Text variant="bodySmall" tone="secondary" style={styles.caption}>
        {measuresCopy('busiest.intro')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gridScroll}>
        <View testID="busiest-grid">
          <View style={styles.gridRow}>
            <View style={{ width: DAY_COLUMN }} />
            {grid.hours.map((hour) => (
              <Text key={hour} variant="caption" tone="muted" style={styles.hourLabel}>
                {String(hour)}
              </Text>
            ))}
          </View>
          {grid.rows.map((row) => (
            <View key={row.weekday} style={styles.gridRow}>
              <Text variant="caption" tone="muted" style={{ width: DAY_COLUMN }}>
                {row.label}
              </Text>
              {row.cells.map((cell) =>
                cell.pct == null ? (
                  <View
                    key={cell.hour}
                    testID="busiest-blank"
                    accessibilityLabel={measuresCopy('busiest.blank', { day: row.label, hour: cell.hour })}
                    style={styles.cell}
                  />
                ) : (
                  <View
                    key={cell.hour}
                    accessibilityLabel={measuresCopy('busiest.cell', { day: row.label, hour: cell.hour, pct: cell.pct })}
                    style={[styles.cell, { borderColor: colors.border }]}>
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: colors.accent, opacity: busiestOpacity(cell.pct), borderRadius: radius.sm },
                      ]}
                    />
                    <Text
                      variant="caption"
                      color={cell.pct >= 50 ? colors.onAccent : colors.text}
                      style={styles.cellText}>
                      {`${cell.pct}%`}
                    </Text>
                  </View>
                ),
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

/** "See each person's figures on the Team tab.", with "Team tab" a link to the tab. */
export function TeamTabLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Text variant="bodySmall" tone="secondary" style={styles.caption}>
      {measuresCopy('teamLink.lead')}
      <Text
        variant="bodySmall"
        color={colors.brand}
        accessibilityRole="link"
        onPress={onPress}
        style={styles.link}>
        {measuresCopy('teamLink.link')}
      </Text>
      {measuresCopy('teamLink.tail')}
    </Text>
  );
}

/**
 * Clients tab: the second tile row (Rebooking rate, First-visit retention), their definitions, and,
 * when some first-time clients have not come back, the list behind a disclosure button.
 */
export function ClientMeasures({ data }: { data: SalonMeasuresReport }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const combined = isCombinedScope(data.scope);
  const total = data.not_returned_total ?? 0;
  const listed = data.not_returned ?? [];
  return (
    <View>
      <MeasureTiles tiles={clientMeasureTiles(data.totals, data.comparison ? data.earlier : null)} />
      <MeasureDefinitions items={clientMeasureDefinitions()} />
      {total > 0 ? (
        <View style={styles.disclosure}>
          <Button
            label={open ? measuresCopy('clients.hide') : measuresCopy('clients.show', { n: total })}
            variant="secondary"
            size="sm"
            onPress={() => setOpen((v) => !v)}
            accessibilityState={{ expanded: open }}
            style={styles.disclosureButton}
          />
          {open ? (
            <View testID="not-returned-list" style={[styles.list, { borderColor: colors.border }]}>
              {listed.map((c, i) => {
                const place = notReturnedPlace(c, combined);
                return (
                  <View
                    key={`${c.guest_id}:${i}`}
                    style={[
                      styles.listRow,
                      { borderBottomColor: colors.border, borderBottomWidth: i === listed.length - 1 ? 0 : StyleSheet.hairlineWidth },
                    ]}>
                    <Text variant="bodyMedium">{c.name}</Text>
                    <Text variant="caption" tone="secondary">
                      {measuresCopy('clients.firstVisit', { date: formatMeasureDate(c.first_visit_date) })}
                    </Text>
                    {place ? (
                      <Text variant="caption" tone="muted">
                        {place}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {total > listed.length ? (
                <Text variant="caption" tone="muted" style={styles.more}>
                  {measuresCopy('clients.more', { listed: listed.length, total })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  tileFill: {
    flex: 1,
  },
  definitions: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  bold: {
    fontWeight: '700',
  },
  caption: {
    marginTop: spacing.sm,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  gridScroll: {
    marginTop: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  hourLabel: {
    width: CELL_WIDTH,
    marginRight: 2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  cell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    marginRight: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  disclosure: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  disclosureButton: {
    alignSelf: 'flex-start',
  },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  listRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  more: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
