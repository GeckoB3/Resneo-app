import { StyleSheet, View } from 'react-native';

import { KpiTiles, PosReportCard, ReportTable, type Column } from '@/components/reports/pos/PosReportUi';
import { Text } from '@/components/ui/Text';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { marginPercentLabel, sellThroughPercent, stockRowName } from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';
import type { SalesProductFigures, SalesProductsReport } from '@/types/pos-reports';

/**
 * The Sales tab's product cards (web `SalesProductSections.tsx`, UX spec §11.2 `rep.s.byProduct`,
 * `rep.s.byBrand`, `rep.s.margin`): margin and cost of products from each sale's cost snapshot,
 * sales by product, brand and category with margin, and the stock now (value, not sold in 90 days,
 * sell-through). Shown once the venue has sold a product or counts stock.
 */
export function SalesProductCards({
  products,
  money,
  csv,
}: {
  products: SalesProductsReport;
  money: (pence: number) => string;
  csv: (card: string, label: ReportsCopyId) => (() => void) | undefined;
}) {
  const t = products.totals;
  const s = products.stock;
  function figureColumns<Row extends SalesProductFigures>(): Column<Row>[] {
    return [
      { label: reportsCopy('rep.quantity'), value: (r) => r.quantity, numeric: true, width: 84 },
      { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
      { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
      { label: reportsCopy('sl.margin.cog'), value: (r) => money(r.cost_of_goods_pence), numeric: true, width: 116 },
      { label: reportsCopy('sl.margin.margin'), value: (r) => money(r.margin_pence), numeric: true },
      { label: reportsCopy('sl.margin.pct'), value: (r) => marginPercentLabel(r.margin_bps), numeric: true, width: 96 },
    ];
  }

  return (
    <>
      <PosReportCard title={reportsCopy('sl.margin')} onExport={csv('margin', 'csv.sales.margin')}>
        <Text variant="bodySmall" tone="secondary">
          {reportsCopy('sl.margin.help')}
        </Text>
        <KpiTiles
          items={[
            { label: reportsCopy('sl.margin.revenue'), value: money(t.revenue_ex_vat_pence) },
            { label: reportsCopy('sl.margin.cog'), value: money(t.cost_of_goods_pence) },
            { label: reportsCopy('sl.margin.margin'), value: money(t.margin_pence) },
            { label: reportsCopy('sl.margin.pct'), value: marginPercentLabel(t.margin_bps) },
          ]}
        />
        {t.lines_without_cost > 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {t.lines_without_cost === 1
              ? reportsCopy('sl.margin.noCost.one')
              : reportsCopy('sl.margin.noCost.many', { count: t.lines_without_cost })}
          </Text>
        ) : null}
        {t.units_restocked > 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {t.units_restocked === 1
              ? reportsCopy('sl.margin.restocked.one')
              : reportsCopy('sl.margin.restocked.many', { count: t.units_restocked })}
          </Text>
        ) : null}
      </PosReportCard>

      <PosReportCard title={reportsCopy('sl.byProduct')} onExport={csv('by_product', 'csv.sales.byProduct')}>
        <ReportTable
          caption={reportsCopy('csv.sales.byProduct')}
          rows={products.by_product}
          rowKey={(r) => r.key}
          columns={[
            { label: reportsCopy('rep.product'), value: (r) => r.name, width: 170 },
            { label: reportsCopy('sl.brand'), value: (r) => r.brand_name ?? '', width: 120 },
            ...figureColumns<SalesProductsReport['by_product'][number]>(),
          ]}
        />
      </PosReportCard>

      <PosReportCard title={reportsCopy('sl.byBrand')} onExport={csv('by_brand', 'csv.sales.byBrand')}>
        <ReportTable
          caption={reportsCopy('csv.sales.byBrand')}
          rows={products.by_brand}
          rowKey={(r, i) => r.brand_id ?? `none-${i}`}
          columns={[
            { label: reportsCopy('sl.brand'), value: (r) => r.name ?? reportsCopy('sl.noBrand') },
            ...figureColumns<SalesProductsReport['by_brand'][number]>(),
          ]}
        />
      </PosReportCard>

      <PosReportCard title={reportsCopy('sl.productCategories')} onExport={csv('product_categories', 'csv.sales.productCategories')}>
        <ReportTable
          caption={reportsCopy('sl.productCategories')}
          rows={products.by_category}
          rowKey={(r, i) => r.category_id ?? `none-${i}`}
          columns={[
            { label: reportsCopy('rep.category'), value: (r) => r.name ?? reportsCopy('rep.noCategory') },
            ...figureColumns<SalesProductsReport['by_category'][number]>(),
          ]}
        />
      </PosReportCard>

      {s.tracked > 0 ? (
        <PosReportCard title={reportsCopy('sl.stock')} onExport={csv('product_stock', 'csv.sales.stock')}>
          <KpiTiles
            items={[
              { label: reportsCopy('sl.stock.cost'), value: money(s.value_cost_pence) },
              { label: reportsCopy('sl.stock.retail'), value: money(s.value_retail_pence) },
              { label: reportsCopy('sl.stock.units'), value: String(s.units) },
              { label: reportsCopy('sl.stock.dead'), value: String(s.dead_count) },
            ]}
          />
          <View style={styles.block}>
            <Text variant="label">{reportsCopy('sl.stock.dead')}</Text>
            <ReportTable
              caption={reportsCopy('sl.stock.dead')}
              rows={s.dead}
              rowKey={(r) => r.variant_id}
              columns={[
                { label: reportsCopy('rep.product'), value: (r) => stockRowName(r), width: 190 },
                { label: reportsCopy('sl.stock.inStock'), value: (r) => r.on_hand, numeric: true, width: 84 },
                { label: reportsCopy('sl.stock.valueCost'), value: (r) => money(r.value_cost_pence), numeric: true, width: 116 },
              ]}
            />
          </View>
          <View style={styles.block}>
            <Text variant="label">{reportsCopy('sl.stock.sellThrough')}</Text>
            <ReportTable
              caption={reportsCopy('sl.stock.sellThrough')}
              rows={s.sell_through}
              rowKey={(r) => r.variant_id}
              columns={[
                { label: reportsCopy('rep.product'), value: (r) => stockRowName(r), width: 190 },
                { label: reportsCopy('sl.stock.sold'), value: (r) => r.sold, numeric: true, width: 72 },
                { label: reportsCopy('sl.stock.received'), value: (r) => r.received, numeric: true, width: 90 },
                {
                  label: reportsCopy('sl.stock.sellThroughCol'),
                  value: (r) => {
                    const pct = sellThroughPercent(r.sold, r.received);
                    return pct == null ? reportsCopy('sl.stock.nothingReceived') : `${pct.toFixed(1)}%`;
                  },
                  numeric: true,
                  width: 130,
                },
              ]}
            />
          </View>
          <Text variant="bodySmall" tone="secondary">
            {reportsCopy('sl.stock.note')}
          </Text>
        </PosReportCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
});
