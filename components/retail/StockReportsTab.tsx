import { type Href, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, posStyles } from '@/components/pos/parts';
import { DateFilter, ShareFileButton } from '@/components/retail/setup-parts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { poStatusId, poStatusTone } from '@/lib/retail/purchasing';
import { minusDays, shortYmd, todayInZone, ymdToDate } from '@/lib/retail/report-dates';
import { movementReasonId, productLabel, shortWhen, signed } from '@/lib/retail/stock-words';
import { stockSetupPaths } from '@/lib/retail/stock-setup-paths';
import { useStockT, type StockCopyId } from '@/lib/retail/stock-setup-copy';
import { usePurchasingReport, useStockReport } from '@/lib/queries/useStockSetup';
import { spacing } from '@/theme/index';

/**
 * Stock reports (UX spec §6.16; plan §4.18), the Reports tab for `view_reports`, as the web's
 * `StockReportsTab.tsx` and `PurchasingReportCards.tsx`: stock on hand and its value (with
 * `srep.asAt` for a past date), stock changes by reason, not sold in 90 days, sell-through and
 * stocktake differences for a period, open purchase orders and received value by supplier. Each
 * card with a CSV has `srep.export` (needs `export`), shared through the share sheet.
 */
export function StockReportsTab({ canExport, timeZone }: { canExport: boolean; timeZone: string }) {
  const t = useStockT();
  const router = useRouter();
  const today = todayInZone(timeZone);
  const [from, setFrom] = useState(() => minusDays(today, 29));
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState<string | null>(null);
  const report = useStockReport(from, to, asOf);
  const purchasing = usePurchasingReport(from, to);
  const data = report.data;
  const p = purchasing.data;
  const col = (id: StockCopyId) => t(id);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={report.isRefetching || purchasing.isRefetching}
          onRefresh={() => {
            void report.refetch();
            void purchasing.refetch();
          }}
        />
      }>
      <Card>
        <View style={styles.dates} accessibilityLabel={t('srep.period')}>
          <DateFilter label={t('srep.from')} value={from} onChange={(v) => v && setFrom(v)} maximumDate={ymdToDate(to)} required />
          <DateFilter
            label={t('srep.to')}
            value={to}
            onChange={(v) => v && setTo(v)}
            minimumDate={ymdToDate(from)}
            maximumDate={ymdToDate(today)}
            required
          />
        </View>
      </Card>

      {report.isError && !data ? (
        <ErrorState message={posErrorMessage(report.error, t('srep.error'))} onRetry={() => void report.refetch()} />
      ) : !data ? (
        <ListSkeleton />
      ) : (
        <>
          <ReportCard
            title={t('srep.onHand')}
            right={<DateFilter label={t('srep.asAt')} value={asOf} onChange={setAsOf} maximumDate={ymdToDate(today)} />}>
            {data.as_of_stock ? (
              <View style={styles.tiles}>
                <StatTile
                  label={t('stock.tile.valueCost')}
                  value={money(Math.round(data.as_of_stock.value_cost_pence))}
                  caption={shortYmd(data.as_of_stock.date)}
                  style={styles.tile}
                />
                <StatTile label={t('srep.units')} value={String(data.as_of_stock.units)} style={styles.tile} />
              </View>
            ) : data.tiles && data.tiles.tracked > 0 ? (
              <View style={styles.tiles}>
                <StatTile label={t('stock.tile.valueCost')} value={money(Math.round(data.tiles.value_cost_pence ?? 0))} style={styles.tile} />
                <StatTile label={t('stock.tile.valueRetail')} value={money(Math.round(data.tiles.value_retail_pence ?? 0))} style={styles.tile} />
                <StatTile label={t('srep.units')} value={String(data.tiles.units)} style={styles.tile} />
              </View>
            ) : (
              <Empty />
            )}
          </ReportCard>

          <ReportCard
            title={t('srep.movements')}
            exportPath={canExport ? stockSetupPaths.stockReportCsv(from, to, 'movements') : null}
            filename="stock-changes.csv">
            <Rows
              rows={(data.movements ?? []).map((m) => ({
                title: t(movementReasonId(m.reason)),
                cells: [`${col('srep.col.units')}: ${signed(Number(m.units))}`, `${col('srep.col.value')}: ${money(Math.round(Number(m.value_pence)))}`],
              }))}
            />
          </ReportCard>

          <ReportCard
            title={t('srep.dead')}
            exportPath={canExport ? stockSetupPaths.stockReportCsv(from, to, 'dead') : null}
            filename="not-sold-in-90-days.csv">
            <Rows
              rows={(data.dead?.items ?? []).map((d) => ({
                title: productLabel(d.product_name, d.option_name),
                cells: [
                  `${col('srep.col.inStock')}: ${d.on_hand}`,
                  `${col('srep.col.value')}: ${money(Math.round(Number(d.value_cost_pence)))}`,
                  `${col('srep.col.lastSold')}: ${d.last_sold_at ? shortWhen(d.last_sold_at, timeZone) : t('srep.never')}`,
                ],
              }))}
            />
          </ReportCard>

          <ReportCard
            title={t('srep.sellThrough')}
            exportPath={canExport ? stockSetupPaths.stockReportCsv(from, to, 'sell_through') : null}
            filename="sell-through.csv">
            <Rows
              rows={(data.sell_through?.items ?? []).map((s) => ({
                title: productLabel(s.product_name, s.option_name),
                cells: [`${col('srep.col.sold')}: ${s.sold}`, `${col('srep.col.received')}: ${s.received}`],
              }))}
            />
          </ReportCard>

          <ReportCard
            title={t('srep.variances')}
            exportPath={canExport ? stockSetupPaths.stockReportCsv(from, to, 'variances') : null}
            filename="stocktake-differences.csv">
            <Rows
              rows={(data.variances ?? []).map((v) => ({
                title: `${t('mov.ref.stocktake', { number: v.number })}: ${v.name}`,
                onPress: () => router.push(`/stock/stocktake/${v.id}` as Href),
                cells: [
                  `${col('srep.col.finished')}: ${shortWhen(v.committed_at, timeZone)}`,
                  `${col('srep.col.changed')}: ${v.changed}`,
                  `${col('take.col.difference')}: ${money(Math.round(v.variance_value_pence ?? 0))}`,
                ],
              }))}
            />
          </ReportCard>
        </>
      )}

      {purchasing.isError && !p ? (
        <ErrorState message={posErrorMessage(purchasing.error, t('srep.error'))} onRetry={() => void purchasing.refetch()} />
      ) : !p ? (
        <ListSkeleton />
      ) : (
        <>
          <ReportCard
            title={t('srep.poOpen')}
            exportPath={canExport ? stockSetupPaths.purchasingReportCsv(from, to, 'open') : null}
            filename="open-purchase-orders.csv">
            {(p.open?.items ?? []).length === 0 ? (
              <Empty />
            ) : (
              (p.open?.items ?? []).map((o) => (
                <Pressable key={o.id} onPress={() => router.push(`/stock/purchase-order/${o.id}` as Href)} accessibilityRole="button">
                  <View style={styles.row}>
                    <View style={posStyles.row}>
                      <Text variant="bodyMedium" tone="brand" style={styles.flex}>
                        {`${t('srep.col.order')} ${o.number} · ${o.supplier_name}`}
                      </Text>
                      <Badge label={t(poStatusId(o.status))} tone={poStatusTone(o.status)} />
                    </View>
                    <Text variant="caption" tone="muted">
                      {[
                        o.expected_on
                          ? `${t('srep.col.expected')}: ${shortYmd(o.expected_on)}${o.overdue ? ` (${t('srep.overdue')})` : ''}`
                          : null,
                        `${t('srep.col.toCome')}: ${o.outstanding_units}`,
                        `${t('srep.col.toComeValue')}: ${money(Math.round(Number(o.outstanding_value_pence)))}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ReportCard>
          <ReportCard
            title={t('srep.received')}
            exportPath={canExport ? stockSetupPaths.purchasingReportCsv(from, to, 'received') : null}
            filename="received-by-supplier.csv">
            <Rows
              rows={(p.received?.items ?? []).map((r) => ({
                title: r.supplier_name,
                cells: [
                  `${t('srep.col.orders')}: ${r.orders}`,
                  `${t('srep.col.deliveries')}: ${r.deliveries}`,
                  `${t('srep.col.units')}: ${r.units}`,
                  `${t('srep.col.value')}: ${money(Math.round(Number(r.value_pence)))}`,
                ],
              }))}
            />
          </ReportCard>
        </>
      )}
    </ScrollView>
  );
}

function ReportCard({
  title,
  right,
  exportPath,
  filename,
  children,
}: {
  title: string;
  right?: ReactNode;
  exportPath?: string | null;
  filename?: string;
  children: ReactNode;
}) {
  const t = useStockT();
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="subheading">{title}</Text>
        {right}
        {exportPath && filename ? <ShareFileButton label={t('srep.export')} path={exportPath} filename={filename} variant="ghost" /> : null}
        {children}
      </View>
    </Card>
  );
}

function Empty() {
  const t = useStockT();
  return (
    <Text variant="bodySmall" tone="muted">
      {t('srep.empty')}
    </Text>
  );
}

function Rows({ rows }: { rows: { title: string; cells: string[]; onPress?: () => void }[] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <View style={styles.rows}>
      {rows.map((r, i) => {
        const body = (
          <View style={styles.row}>
            <Text variant="bodyMedium" tone={r.onPress ? 'brand' : 'default'}>
              {r.title}
            </Text>
            <Text variant="caption" tone="muted">
              {r.cells.join(' · ')}
            </Text>
          </View>
        );
        return r.onPress ? (
          <Pressable key={`${r.title}-${i}`} onPress={r.onPress} accessibilityRole="button">
            {body}
          </Pressable>
        ) : (
          <View key={`${r.title}-${i}`}>{body}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%' },
  rows: { gap: spacing.sm },
  row: { gap: spacing.xxs },
});
