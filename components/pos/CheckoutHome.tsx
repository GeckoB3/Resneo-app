import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { format, parseISO } from 'date-fns';
import { type Href, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { saleStatusCopyId } from '@/lib/pos/sale-math';
import { longBusinessDateLabel } from '@/lib/pos/till-math';
import { knownVenueAlerts, venueAlertLink, venueAlertSentence } from '@/lib/pos/venue-alerts';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSaleListRow, PosVenueAlert } from '@/types/pos';

/**
 * The parts of Checkout home that fit the person (Part 2 mock-up 5, approved 2026-10-11): today's
 * figures for an owner (admins, and team members with `view_reports`), "Needs your attention" for
 * admins, the section titles with their counts, an open or completed sale as a row, and the row
 * that opens every sale. The screen decides who sees what; these only draw it.
 */

type Icon = SymbolViewProps['name'];
const CHEVRON_RIGHT: Icon = { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' };

function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

/** A section's title with its count ("Ready to pay 2"). */
export function SectionTitle({ title, count }: { title: string; count?: number }) {
  const shown = typeof count === 'number' && count > 0;
  return (
    <View style={styles.sectionTitle} accessible accessibilityRole="header" accessibilityLabel={shown ? `${title}, ${count}` : title}>
      <Text variant="subheading" style={styles.bold}>
        {title}
      </Text>
      {shown ? <Badge label={String(count)} tone="brand" /> : null}
    </View>
  );
}

/** A quiet link with a chevron ("See Reports"). */
function LinkText({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.linkRow}>
      <Text variant="label" color={colors.brand} style={styles.linkText}>
        {label}
      </Text>
      <SymbolView name={CHEVRON_RIGHT} size={14} tintColor={colors.brand} />
    </View>
  );
}

function Figure({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <View style={wide ? styles.figureWide : styles.figure} accessible accessibilityLabel={value ? `${label}, ${value}` : label}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      {value ? (
        <Text style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {value}
        </Text>
      ) : (
        <Skeleton width={wide ? 88 : 48} height={22} style={styles.figureSkeleton} />
      )}
    </View>
  );
}

/**
 * The business's day: net takings (the headline), the number of sales and the tips, from the same
 * Takings and Sales reports as Reports, with a link there.
 */
export function TodayFiguresCard({
  dateYmd,
  netPence,
  salesCount,
  tipsPence,
  error,
  onRetry,
}: {
  dateYmd: string;
  netPence: number | null;
  salesCount: number | null;
  tipsPence: number | null;
  error: boolean;
  onRetry: () => void;
}) {
  const t = usePosT();
  const router = useRouter();
  return (
    <Card>
      <View style={styles.cardStack}>
        <Text variant="overline" tone="muted">
          {t('app.home.today', { date: longBusinessDateLabel(dateYmd) })}
        </Text>
        {error ? (
          <Notice tone="warning" action={{ label: t('common.tryAgain'), onPress: onRetry }}>
            {t('app.home.figuresError')}
          </Notice>
        ) : (
          <View style={styles.figures}>
            <Figure label={t('app.home.net')} value={netPence == null ? null : money(netPence)} wide />
            <Figure label={t('app.home.sales')} value={salesCount == null ? null : String(salesCount)} />
            <Figure label={t('app.home.tips')} value={tipsPence == null ? null : money(tipsPence)} />
          </View>
        )}
        <Pressable
          onPress={() => router.push('/reports?tab=takings' as Href)}
          accessibilityRole="link"
          accessibilityLabel={t('app.home.seeReports')}
          hitSlop={{ top: 12, bottom: 12 }}
          style={({ pressed }) => [styles.alignStart, { opacity: pressed ? 0.6 : 1 }]}>
          <LinkText label={t('app.home.seeReports')} />
        </Pressable>
      </View>
    </Card>
  );
}

const ALERT_ICONS: Record<PosVenueAlert['kind'], Icon> = {
  refund_failed: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  dispute: { ios: 'exclamationmark.shield', android: 'gpp_maybe', web: 'gpp_maybe' },
  stock_conflict: { ios: 'shippingbox', android: 'package_2', web: 'package_2' },
};

function AlertIcon({ kind }: { kind: PosVenueAlert['kind'] }) {
  const { colors, isDark } = useTheme();
  // Rose for money that didn't go back, amber for a dispute's deadline, navy for an order (the web's tints).
  const tint =
    kind === 'refund_failed'
      ? isDark
        ? { bg: colors.dangerSurface, fg: colors.danger }
        : { bg: '#FFF1F2', fg: '#BE123C' }
      : kind === 'dispute'
        ? isDark
          ? { bg: colors.warningSurface, fg: colors.warning }
          : { bg: '#FEF3C7', fg: '#92400E' }
        : { bg: colors.brandSubtle, fg: colors.brand };
  return (
    <View style={[styles.alertIcon, { backgroundColor: tint.bg }]}>
      <SymbolView name={ALERT_ICONS[kind]} size={19} tintColor={tint.fg} />
    </View>
  );
}

/**
 * "Needs your attention" (UX spec §2.2), admins only: a card refund that failed, a dispute still
 * wanting a response, an online order paid after its items were released. Each row opens its sale
 * or order. Nothing to show, or nothing loaded, and the card is not there at all.
 */
export function AttentionCard({ alerts }: { alerts: PosVenueAlert[] | null | undefined }) {
  const t = usePosT();
  const router = useRouter();
  const { colors } = useTheme();
  const rows = knownVenueAlerts(alerts);
  if (rows.length === 0) return null;
  return (
    <Card>
      <Text variant="subheading" style={styles.bold} accessibilityRole="header">
        {t('home.alerts.title')}
      </Text>
      {rows.map((alert) => {
        const sentence = venueAlertSentence(alert, t, money);
        const link = venueAlertLink(alert, t);
        const open = link
          ? () => {
              if (link.kind === 'app') {
                router.push(link.href as Href);
                return;
              }
              const url = `${getWebUrl() || 'https://reserve-ni.vercel.app'}${link.path}`;
              void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
            }
          : undefined;
        const body = (
          <>
            <AlertIcon kind={alert.kind} />
            <View style={styles.alertText}>
              <Text variant="bodySmall">{sentence}</Text>
              {link ? <LinkText label={link.label} /> : null}
            </View>
          </>
        );
        return open && link ? (
          <Pressable
            key={alert.id}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={sentence}
            accessibilityHint={link.label}
            style={({ pressed }) => [styles.alertRow, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            {body}
          </Pressable>
        ) : (
          <View key={alert.id} style={[styles.alertRow, { borderTopColor: colors.border }]}>
            {body}
          </View>
        );
      })}
    </Card>
  );
}

/** An open or finished sale as a row (Checkout home's open sales, All sales). */
export function SaleRowCard({ row, onPress }: { row: PosSaleListRow; onPress: () => void }) {
  const t = usePosT();
  const status = t(saleStatusCopyId({ status: row.status, parked: row.parked ? { at: row.parked.at, by_staff_id: null, note: row.parked.note, device: row.parked.device } : null }));
  const owing = row.status === 'open' || row.status === 'part_paid';
  return (
    <Card onPress={onPress} accessibilityRole="button" accessibilityLabel={t('sale.title', { saleNo: row.number_label })}>
      <View style={posStyles.stack}>
        <View style={styles.rowTop}>
          <View style={styles.flex}>
            <Text variant="label">
              {t('sale.title', { saleNo: row.number_label })} · {row.client_name ?? t('sales.walkIn')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {row.summary || t('sales.items', { count: row.line_count })}
            </Text>
          </View>
          <Text variant="label">{money(owing ? row.balance_due_pence : row.total_pence)}</Text>
        </View>
        <View style={styles.chips}>
          <Badge label={status} tone={row.status === 'completed' ? 'success' : row.status === 'part_paid' ? 'warning' : undefined} />
          {row.card_waiting ? <Badge label={t('sales.pill.cardPending')} tone="accent" /> : null}
          {row.refund_status === 'partial' ? <Badge label={t('sale.refund.partial')} /> : null}
          {row.refund_status === 'full' ? <Badge label={t('sale.refund.full')} /> : null}
        </View>
        {row.parked ? (
          <Text variant="caption" tone="muted">
            {t('sales.parkedBy', {
              staffName: row.operator_name ?? row.created_by_name ?? 'your team',
              device: row.parked.device ?? 'a device',
              time: timeOf(row.parked.at),
            })}
            {row.parked.note ? `. ${row.parked.note}` : ''}
          </Text>
        ) : row.created_by_name ? (
          <Text variant="caption" tone="muted">
            {t('sales.startedBy', { staffName: row.created_by_name, time: timeOf(row.created_at) })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** A calm card for an empty list, saying how it fills ("Nobody waiting to pay"). */
export function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <View style={styles.emptyStack}>
        <Text variant="bodyMedium" style={styles.bold}>
          {title}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {body}
        </Text>
      </View>
    </Card>
  );
}

/** A row that opens another screen ("All sales"). */
export function RowLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.rowLink,
        { borderColor: colors.border, backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text variant="label" color={colors.brand} style={styles.flex}>
        {label}
      </Text>
      <SymbolView name={CHEVRON_RIGHT} size={16} tintColor={colors.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  alignStart: { alignSelf: 'flex-start' },
  cardStack: { gap: spacing.sm },
  emptyStack: { gap: spacing.xs },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xs },
  linkText: { fontSize: 14.5, lineHeight: 20 },
  figures: { flexDirection: 'row', gap: spacing.sm },
  figureWide: { flex: 1.3, gap: spacing.xxs },
  figure: { flex: 1, gap: spacing.xxs },
  figureValue: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  figureSkeleton: { marginTop: 3 },
  alertIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  alertText: { flex: 1, gap: spacing.xxs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
});
