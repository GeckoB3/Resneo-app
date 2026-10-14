import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PosRangeLine, PosReportCard, ReportInfoLine, ReportLoadError, ReportTable, reportStyles, useReportDownload } from '@/components/reports/pos/PosReportUi';
import {
  CalendarRefusal,
  CalendarScopeNote,
  useCalendarRefusal,
  useReportCalendar,
} from '@/components/reports/ReportCalendarFilter';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, commissionPaths, commissionRangeQuery } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { calendarAt, directionLine, labelWords, reportRatesText, splitMoney } from '@/lib/commission/splits-format';
import { reportsCopy } from '@/lib/pos/reports-copy';
import {
  useSplitLines,
  useSplitsReport,
  useTeamCommissionLines,
  useTeamCommissionReport,
} from '@/lib/queries/useCommissionSplits';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { reportCalendarCopy } from '@/lib/reports/report-calendar';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SplitLine, SplitReportResponse, SplitReportRow, TeamCommissionLine, TeamCommissionReport, TeamCommissionRow } from '@/types/commission-splits';
import type { PosRangeChoice } from '@/types/pos-reports';

/**
 * Reports, Commission splits (web Reports tab, reports/Commission splits across linked venues.md,
 * 2026-10-14; admins, whether or not Checkout is on). One range control for both halves:
 *
 * - Your team (`GET /api/venue/commission/report`): one row per person (services, products and
 *   vouchers base and commission, the total, tips beside it for reference), each person's label, a
 *   person's lines on a tap (a sale opens its sale; a completed booking shows its date, time,
 *   client and service), "Changed since you exported it", the CSVs, the note when services count
 *   from completed bookings, and the VAT note. With a calendar chosen on the Reports screen it asks
 *   for that calendar (`calendar_id`).
 * - Businesses you work with (`GET /api/venue/commission/splits/report`): You owe and Owed to you,
 *   by business, a row per split (who pays, what was counted, the rate, what is owed and kept), a
 *   split's lines on a tap, its statements, the CSVs and the VAT notes. Always the whole venue.
 *
 * A team member's own figures are on Checkout's "My sales" (`useMyCommission`), as on the web.
 */
export function CommissionSection({ today }: { today: string }) {
  const [choice, setChoice] = useState<PosRangeChoice>({ kind: 'preset', preset: 'this-month' });
  const [person, setPerson] = useState<TeamCommissionRow | null>(null);
  const [splitRow, setSplitRow] = useState<SplitReportRow | null>(null);
  const { calendar } = useReportCalendar();
  const calendarId = calendar?.id ?? null;
  // Another calendar is another set of people: close the drill-down, as a new range does.
  const [personCalendarId, setPersonCalendarId] = useState(calendarId);
  if (personCalendarId !== calendarId) {
    setPersonCalendarId(calendarId);
    setPerson(null);
  }
  const team = useTeamCommissionReport(choice, { calendarId });
  const businesses = useSplitsReport(choice);
  const shown = team.data ?? businesses.data;

  return (
    <View style={reportStyles.stack}>
      <PosRangeLine
        report={splitsT('rep.tab')}
        choice={choice}
        onChoice={(c) => {
          setPerson(null);
          setSplitRow(null);
          setChoice(c);
        }}
        today={today}
        loading={team.isFetching || businesses.isFetching}
        currentRange={shown ? { from: shown.from, to: shown.to } : null}
      />
      <TeamReport choice={choice} query={team} calendarName={calendar?.name ?? null} person={person} onPerson={setPerson} />
      <BusinessReport choice={choice} query={businesses} split={splitRow} onSplit={setSplitRow} />
    </View>
  );
}

interface ReportQuery<T> {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

function SectionTitle({ text }: { text: string }) {
  return (
    <Text variant="subheading" accessibilityRole="header" style={styles.sectionTitle}>
      {text}
    </Text>
  );
}

function Note({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="text" style={[styles.note, { borderColor: colors.info, backgroundColor: colors.infoSurface }]}>
      <Text variant="bodySmall">{children}</Text>
      {action ? (
        <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={8}>
          <Text variant="label" tone="brand">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Your team ────────────────────────────────────────────────────────────────

function TeamReport({
  choice,
  query: q,
  calendarName,
  person,
  onPerson,
}: {
  choice: PosRangeChoice;
  query: ReportQuery<TeamCommissionReport>;
  calendarName: string | null;
  person: TeamCommissionRow | null;
  onPerson: (row: TeamCommissionRow) => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { calendar } = useReportCalendar();
  const calendarId = calendar?.id ?? null;
  const data = q.data;
  const refusal = useCalendarRefusal(q.error);
  const drill = useTeamCommissionLines(choice, person?.person_key ?? null, calendarId);
  const money = (pence: number) => splitMoney(pence, data?.currency);
  const download = useReportDownload();
  const query = commissionRangeQuery(choice, calendarId);
  const changedPersons = new Set(data?.changed?.persons ?? []);
  const changedLines = new Set(data?.changed?.lines ?? []);
  const saleNo = (n: number | null) => `${data?.receipt_prefix ?? ''}${n ?? ''}`;
  const exportCsv = (kind: 'summary' | 'lines') =>
    void download(`${commissionPaths.report(query)}&format=csv&kind=${kind}`, splitsT('rep.team.title')).then(() => void q.refetch());

  // A completed booking shows its date and time, its client and its service (the Item column); a
  // sale or refund links to its sale.
  const lineDate = (l: TeamCommissionLine) =>
    `${formatLongDay(l.business_date)}${l.row_kind === 'booking' && l.booking_time ? `, ${l.booking_time.slice(0, 5)}` : ''}`;
  const lineSource = (l: TeamCommissionLine) => {
    if (l.row_kind === 'booking') {
      return (
        <Text variant="bodySmall">{[splitsT('rep.biz.line.booking'), l.client_name].filter(Boolean).join(', ')}</Text>
      );
    }
    return (
      <View>
        {l.sale_id ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/checkout/${encodeURIComponent(l.sale_id!)}` as Href)} hitSlop={8}>
            <Text variant="bodySmall" tone="brand" style={styles.link}>
              {l.row_kind === 'refund'
                ? reportsCopy('rep.c.refundRow', { saleNo: saleNo(l.sale_number) })
                : reportsCopy('rep.c.line.sale', { saleNo: saleNo(l.sale_number) })}
            </Text>
          </Pressable>
        ) : null}
        {l.line_id && changedLines.has(l.line_id) ? (
          <Text variant="caption" style={{ color: colors.warning }}>
            {reportsCopy('rep.c.changed.line')}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={reportStyles.stack}>
      <SectionTitle text={splitsT('rep.team.title')} />
      {data ? (
        <ReportInfoLine
          text={data.source === 'bookings' ? splitsT('rep.team.bookings') : `${reportsCopy('rep.c.help')} ${reportsCopy('rep.c.onlyTill')}`}
        />
      ) : null}

      {q.isError ? (
        refusal ? (
          <CalendarRefusal message={refusal} />
        ) : (
          <ReportLoadError message={commissionErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} />
        )
      ) : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          <CalendarScopeNote echoed={data.calendar} detail={reportCalendarCopy('cal.detail.commission')} till />
          {!data.has_rates ? (
            <Note action={{ label: splitsT('page.title'), onPress: () => router.push('/commission-splits' as Href) }}>
              {reportsCopy('rep.c.noRates')}
            </Note>
          ) : null}
          {data.vat_note ? <Note>{splitsT('team.basis.none')}</Note> : null}

          <PosReportCard title={reportsCopy('rep.c.table')} onExport={data.can_export ? () => exportCsv('summary') : undefined}>
            <ReportTable
              caption={reportsCopy('rep.c.table')}
              rows={data.rows}
              rowKey={(r) => r.person_key}
              columns={[
                {
                  label: reportsCopy('rep.c.col.person'),
                  width: 180,
                  value: (r) => (
                    <View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={reportsCopy('rep.c.lines', { staffName: r.person_name })}
                        onPress={() => onPerson(r)}
                        hitSlop={8}>
                        <Text variant="bodyMedium" tone="brand" style={styles.link}>
                          {r.person_name}
                        </Text>
                      </Pressable>
                      <Text variant="caption" tone="muted">
                        {labelWords(r.label)}
                      </Text>
                      {changedPersons.has(r.person_key) && data.changed ? (
                        <Text variant="caption" style={{ color: colors.warning }}>
                          {reportsCopy('rep.c.changed', { date: formatLongDay(data.changed.exported_at) })}
                        </Text>
                      ) : null}
                    </View>
                  ),
                },
                { label: reportsCopy('rep.c.col.servicesBase'), value: (r) => money(r.service_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.servicesComm'), value: (r) => money(r.service_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.productsBase'), value: (r) => money(r.product_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.productsComm'), value: (r) => money(r.product_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.vouchersBase'), value: (r) => money(r.voucher_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.vouchersComm'), value: (r) => money(r.voucher_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.total'), value: (r) => money(r.total_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.tips'), value: (r) => money(r.tips_pence), numeric: true, width: 120 },
              ]}
              footer={[
                reportsCopy('rep.total'),
                money(data.totals.service_base_pence),
                money(data.totals.service_commission_pence),
                money(data.totals.product_base_pence),
                money(data.totals.product_commission_pence),
                money(data.totals.voucher_base_pence),
                money(data.totals.voucher_commission_pence),
                money(data.totals.total_commission_pence),
                money(data.totals.tips_pence),
              ]}
            />
            <Text variant="caption" tone="muted">
              {reportsCopy('rep.c.tipsNote')}
            </Text>
            {data.can_export ? (
              <Pressable accessibilityRole="button" onPress={() => exportCsv('lines')} hitSlop={8}>
                <Text variant="label" tone="brand">
                  {/* One calendar's lines are that person's (web 90ff4d17). */}
                  {reportsCopy('rep.c.exportLines', {
                    lines: reportsCopy('rep.c.lines', { staffName: calendarName ?? reportsCopy('rep.c.everyone') }),
                  })}
                </Text>
              </Pressable>
            ) : null}
          </PosReportCard>

          {person ? (
            <PosReportCard title={reportsCopy('rep.c.lines', { staffName: person.person_name })}>
              {drill.data?.lines ? (
                <ReportTable
                  caption={reportsCopy('rep.c.lines', { staffName: person.person_name })}
                  rows={drill.data.lines}
                  rowKey={(l, i) => `${l.row_kind}:${l.refund_id ?? l.sale_id ?? l.booking_id}:${l.line_id}:${i}`}
                  columns={[
                    { label: reportsCopy('rep.date'), value: lineDate, width: 170 },
                    { label: splitsT('ui.saleOrBooking'), value: lineSource, width: 170 },
                    { label: reportsCopy('rep.c.item'), value: (l) => l.item_name, width: 170 },
                    { label: reportsCopy('rep.c.share'), value: (l) => `${l.share_bps / 100}%`, numeric: true, width: 80 },
                    { label: reportsCopy('rep.c.base'), value: (l) => money(l.base_pence), numeric: true },
                    { label: reportsCopy('rep.c.rate'), value: (l) => `${l.rate_bps / 100}%`, numeric: true, width: 80 },
                    { label: reportsCopy('rep.c.commission'), value: (l) => money(l.commission_pence), numeric: true, width: 112 },
                  ]}
                />
              ) : drill.isError ? (
                <ReportLoadError message={commissionErrorMessage(drill.error, reportsCopy('rep.error'))} onRetry={() => void drill.refetch()} />
              ) : (
                <DetailSkeleton />
              )}
            </PosReportCard>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Businesses you work with ─────────────────────────────────────────────────

function splitLineLabel(l: SplitLine): string {
  if (l.kind === 'booking') return splitsT('rep.biz.line.booking');
  const saleNo = l.sale_number ?? '';
  return l.kind === 'refund' ? splitsT('rep.biz.line.refund', { saleNo }) : splitsT('rep.biz.line.sale', { saleNo });
}

function BusinessReport({
  choice,
  query: q,
  split,
  onSplit,
}: {
  choice: PosRangeChoice;
  query: ReportQuery<SplitReportResponse>;
  split: SplitReportRow | null;
  onSplit: (row: SplitReportRow) => void;
}) {
  const router = useRouter();
  const data = q.data;
  const drill = useSplitLines(choice, split?.split_id ?? null);
  const money = (pence: number) => splitMoney(pence, data?.currency);
  const download = useReportDownload();
  const query = commissionRangeQuery(choice);
  const linesTitle = (row: SplitReportRow) => splitsT('rep.biz.lines', { calendar: row.calendar.name, business: row.payer.name });
  const openSplit = (splitId: string) => router.push(`/commission-splits/${encodeURIComponent(splitId)}` as Href);
  const vatBusinesses = data ? [...new Set(data.rows.filter((r) => r.vat_note).map((r) => r.payer.name))] : [];
  const withProducts = data?.rows.some((r) => r.products_pence !== 0 || r.rates.some((x) => x.products_rate_bps !== null)) ?? false;

  return (
    <View style={reportStyles.stack}>
      <SectionTitle text={splitsT('rep.biz.title')} />
      <ReportInfoLine
        text={splitsT('rep.biz.help')}
        exportTitle={splitsT('rep.biz.title')}
        onExport={
          data?.can_export
            ? () =>
                void download(`${commissionPaths.splitsReport(query)}&format=csv&kind=summary`, splitsT('rep.biz.title')).then(
                  () => void q.refetch(),
                )
            : undefined
        }
      />

      {q.isError ? (
        <ReportLoadError message={commissionErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} />
      ) : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          <View style={styles.tiles}>
            <StatTile label={splitsT('rep.biz.youOwe')} value={money(data.totals.you_owe_pence)} style={styles.tile} />
            <StatTile label={splitsT('rep.biz.owedToYou')} value={money(data.totals.owed_to_you_pence)} style={styles.tile} />
          </View>

          {data.by_business.length > 1 ? (
            <ReportTable
              caption={splitsT('form.business')}
              rows={data.by_business}
              rowKey={(b) => b.venue_id}
              columns={[
                { label: splitsT('form.business'), value: (b) => b.name },
                { label: splitsT('rep.biz.youOwe'), value: (b) => money(b.you_owe_pence), numeric: true },
                { label: splitsT('rep.biz.owedToYou'), value: (b) => money(b.owed_to_you_pence), numeric: true },
              ]}
            />
          ) : null}

          {data.rows.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              {splitsT('rep.biz.none')}
            </Text>
          ) : (
            <ReportTable
              caption={splitsT('rep.biz.title')}
              rows={data.rows}
              rowKey={(r) => r.split_id}
              columns={[
                {
                  label: splitsT('rep.biz.col.split'),
                  width: 200,
                  value: (r) => (
                    <View style={styles.splitCell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={linesTitle(r)}
                        onPress={() => onSplit(r)}
                        hitSlop={8}>
                        <Text variant="bodyMedium" tone="brand" style={styles.link}>
                          {calendarAt(r)}
                        </Text>
                      </Pressable>
                      <Text variant="caption" tone="muted">
                        {labelWords(r.label)}
                      </Text>
                      <Pressable accessibilityRole="link" onPress={() => openSplit(r.split_id)} hitSlop={8}>
                        <Text variant="caption" tone="brand" style={styles.link}>
                          {splitsT('biz.statements')}
                        </Text>
                      </Pressable>
                    </View>
                  ),
                },
                { label: splitsT('rep.biz.col.direction'), value: (r) => directionLine(r), width: 160 },
                { label: splitsT('rep.biz.col.services'), value: (r) => money(r.services_pence), numeric: true },
                ...(withProducts
                  ? [{ label: splitsT('rep.biz.col.products'), value: (r: SplitReportRow) => money(r.products_pence), numeric: true }]
                  : []),
                { label: splitsT('rep.biz.col.rate'), value: (r) => reportRatesText(r.rates), width: 200 },
                { label: splitsT('rep.biz.col.owed'), value: (r) => money(r.owed_pence), numeric: true },
                { label: splitsT('rep.biz.col.kept'), value: (r) => money(r.kept_pence), numeric: true },
              ]}
            />
          )}

          {vatBusinesses.map((business) => (
            <Text key={business} variant="caption" tone="muted">
              {splitsT('rep.biz.vatNote', { business })}
            </Text>
          ))}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/commission-splits?section=businesses' as Href)}
            hitSlop={8}
            style={styles.manage}>
            <Text variant="label" tone="brand">
              {splitsT('rep.biz.settings')}
            </Text>
          </Pressable>

          {split ? (
            <PosReportCard title={linesTitle(split)}>
              {drill.data?.lines ? (
                <ReportTable
                  caption={linesTitle(split)}
                  rows={drill.data.lines}
                  rowKey={(l, i) => `${l.kind}:${l.date}:${l.sale_number ?? ''}:${i}`}
                  columns={[
                    {
                      label: reportsCopy('rep.date'),
                      width: 170,
                      value: (l) => (
                        <View>
                          <Text variant="bodyMedium">{`${formatLongDay(l.date)}${l.time ? `, ${l.time.slice(0, 5)}` : ''}`}</Text>
                          <Text variant="bodySmall" tone="secondary">
                            {splitLineLabel(l)}
                          </Text>
                        </View>
                      ),
                    },
                    { label: reportsCopy('rep.c.item'), value: (l) => l.item_name, width: 170 },
                    { label: reportsCopy('rep.c.base'), value: (l) => money(l.base_pence), numeric: true },
                    { label: reportsCopy('rep.c.rate'), value: (l) => `${l.rate_bps / 100}%`, numeric: true, width: 80 },
                    { label: splitsT('rep.biz.col.owed'), value: (l) => money(l.owed_pence), numeric: true },
                  ]}
                />
              ) : drill.isError ? (
                <ReportLoadError message={commissionErrorMessage(drill.error, reportsCopy('rep.error'))} onRetry={() => void drill.refetch()} />
              ) : (
                <DetailSkeleton />
              )}
              {data.can_export ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    void download(`${commissionPaths.splitLines(query, split.split_id)}&format=csv&kind=lines`, linesTitle(split))
                  }
                  hitSlop={8}>
                  <Text variant="label" tone="brand">
                    {reportsCopy('rep.c.exportLines', { lines: linesTitle(split) })}
                  </Text>
                </Pressable>
              ) : null}
            </PosReportCard>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  busy: { opacity: 0.7 },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  link: { textDecorationLine: 'underline' },
  sectionTitle: { marginTop: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1 },
  splitCell: { gap: 2 },
  manage: { alignSelf: 'flex-start' },
});
