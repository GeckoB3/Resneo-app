import { type Href, Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { PaidOutcome } from '@/components/pos/PaySheet';
import { AmountRow, ErrorLine, money, Notice, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { DiscountSheet, LineEditorSheet, ServingSheet } from '@/components/pos/SaleSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { posPaths } from '@/lib/pos/api';
import type { PosT } from '@/lib/pos/copy';
import { canPos } from '@/lib/pos/pos-enabled';
import { saleCarriesVat, totalsRows } from '@/lib/pos/sale-math';
import { SaleStaleError } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap, PosSale, PosSaleLine } from '@/types/pos';

import { practiceT } from './copy';
import {
  finishPracticeBody,
  practiceMethodOf,
  PRACTICE_DONE_HREF,
  simulatedSentence,
  type PracticeCoachStep,
  type PracticeMethod,
} from './model';
import { PracticeAddSheet } from './PracticeAddSheet';
import { PracticeCoachMark } from './PracticeCoach';
import { PracticePaySheet } from './PracticePaySheet';
import { PracticeReceipt } from './PracticeReceipt';

/**
 * The sale screen on a practice sale (POS test round 2026-10-11, Part 4, W11, OB4; design B12 and
 * B13, section 6.8). The sale screen opens this when the server marks the sale `practice: true`;
 * every other sale keeps the ordinary screen, untouched.
 *
 * What it teaches, on a real sale the database refuses to take any money on: the bill, adding a
 * product or the practice item, a discount within the team's limit, who gets the credit, the ways
 * to pay (each shown, never run), and the receipt. The banner and the five coach marks say what is
 * what; "Finish practice" voids the sale with the reason "Practice" and goes back to set-up.
 *
 * Left out on purpose: the client (a practice sale has nobody attached, so no record, stamp or
 * message), services (a walk-in would land in the diary), vouchers and fees, park, combine,
 * receipts by email or text, refunds and new sales. None of their controls is drawn here, so none
 * can be reached by mistake.
 */

type SheetKind = 'add' | 'discount' | 'serving' | 'pay';

/**
 * What the practice payment showed: a method (or none, when nothing was left to pay), any change,
 * and the name of the venue's own payment type for "Other ways".
 */
type Outcome = { method: PracticeMethod | null; changePence: number; typeName?: string };

function methodTitle(outcome: Outcome & { method: PracticeMethod }, t: PosT): string {
  switch (outcome.method) {
    case 'phone':
      return t('app.pay.card');
    case 'reader':
      return t('pay.method.cardReader');
    case 'cash':
      return t('pay.method.cash');
    case 'link':
      return t('pay.method.link');
    case 'other':
      return outcome.typeName ?? t('app.pay.otherWays');
  }
}

export function PracticeSale({
  sale,
  bootstrap,
  send,
  refreshing,
  onRefresh,
}: {
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [line, setLine] = useState<PosSaleLine | null>(null);
  const [coach, setCoach] = useState<PracticeCoachStep | null>('basket');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolledTo = useRef<PracticeCoachStep | null>('basket');

  const can = (c: Parameters<typeof canPos>[1]) => canPos(bootstrap, c);
  const open = sale.status === 'open';
  const cleared = sale.status === 'voided';
  const linesEditable = open && outcome === null;
  const vat = saleCarriesVat(sale.lines);
  const rows = useMemo(() => totalsRows(sale, { vatRegistered: vat }), [sale, vat]);
  const balance = Math.max(0, sale.balance_due_pence);
  const limit = bootstrap.settings.staff_max_discount_percent;
  const tip = open && outcome === null ? coach : null;
  const closeSheet = () => setSheet(null);

  /** Brings a tip into view the first time it shows. */
  function shown(at: PracticeCoachStep, y: number) {
    if (scrolledTo.current === at) return;
    scrolledTo.current = at;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing['3xl']), animated: true });
  }

  function coachMark(at: PracticeCoachStep) {
    return (
      <PracticeCoachMark
        at={at}
        current={tip}
        limitPercent={limit}
        onNext={setCoach}
        onSkip={() => setCoach(null)}
        onShown={(y) => shown(at, y)}
      />
    );
  }

  async function act(label: string, input: Parameters<Send>[0]) {
    setBusy(label);
    setError(null);
    try {
      await send(input);
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  /** Back to set-up, once the practice is cleared away. */
  function backToSetup() {
    router.replace(PRACTICE_DONE_HREF as Href);
  }

  /** Voids the practice with the reason "Practice", on the fresh sale's version if it moved on. */
  async function clearAway() {
    if (sale.status !== 'open' && sale.status !== 'part_paid') return;
    try {
      await send({ action: 'void', body: finishPracticeBody(sale) });
    } catch (e) {
      if (!(e instanceof SaleStaleError)) throw e;
      if (e.sale.status === 'open' || e.sale.status === 'part_paid') await send({ action: 'void', body: finishPracticeBody(e.sale) });
    }
  }

  /** "Finish practice": clear it away, then back to set-up (the web's `finish`). */
  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await clearAway();
    } catch (e) {
      // Already cleared away (the daily job voids a practice left open): nothing more to do.
      if (apiErrorCode(e) !== 'POS_SALE_NOT_OPEN') {
        setError(writeError(e, t));
        setFinishing(false);
        return;
      }
    }
    toast.success(practiceT('setup.practice.finished'));
    router.replace(PRACTICE_DONE_HREF as Href);
    setFinishing(false);
  }

  function paid(o: PaidOutcome, extra?: { typeName: string }) {
    setOutcome({ method: practiceMethodOf(o.method), changePence: o.changePence, typeName: extra?.typeName });
    setCoach(null);
  }

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: true, title: practiceT('setup.practice.saleTitle') }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Once a payment has been shown, "Finish practice" leads the outcome below instead (B13). */}
        <Notice
          action={
            open && outcome === null
              ? { label: practiceT('setup.practice.finish'), loading: finishing, onPress: () => void finish() }
              : undefined
          }>
          {practiceT('setup.practice.banner')}
        </Notice>

        {cleared ? (
          <Notice tone="success" action={{ label: practiceT('setup.practice.back'), onPress: backToSetup }}>
            {practiceT('setup.practice.finished')}
          </Notice>
        ) : null}

        <ErrorLine message={error} />

        {/* Nobody is attached to a practice sale; who is serving can change, as on a real sale. */}
        <View style={styles.people}>
          <View
            accessible
            accessibilityLabel={`${t('app.sale.client')}: ${t('sales.walkIn')}`}
            accessibilityHint={practiceT('app.setup.practice.client')}
            style={[styles.personChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="caption" tone="muted">
              {t('app.sale.client')}
            </Text>
            <Text variant="label">{t('sales.walkIn')}</Text>
          </View>
          <Pressable
            disabled={!linesEditable}
            onPress={() => setSheet('serving')}
            accessibilityRole="button"
            style={[styles.personChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="caption" tone="muted">
              {t('app.sale.serving')}
            </Text>
            <Text variant="label">{sale.operator.name ?? 'Not set'}</Text>
          </Pressable>
        </View>

        {coachMark('basket')}

        {/* The bill. */}
        <Card>
          <View style={posStyles.stack}>
            {sale.lines.length === 0 ? (
              <Text tone="muted">{practiceT('setup.practice.empty')}</Text>
            ) : (
              sale.lines.map((l) => (
                <PracticeLineRow
                  key={l.id}
                  line={l}
                  onPress={linesEditable || can('edit_credit') ? () => setLine(l) : undefined}
                />
              ))
            )}
            {sale.discounts.map((d) => (
              <View key={d.id} style={posStyles.row}>
                <Text variant="bodySmall" style={styles.flex}>
                  {d.reason ? `${t('totals.discounts')}: ${d.reason}` : t('totals.discounts')}
                </Text>
                <Text variant="bodySmall">-{money(d.applied_pence)}</Text>
                {linesEditable && can('apply_discount') ? (
                  <Button
                    label={t('disc.remove')}
                    size="sm"
                    variant="ghost"
                    loading={busy === `disc-${d.id}`}
                    onPress={() =>
                      void act(`disc-${d.id}`, {
                        action: 'discount',
                        method: 'DELETE',
                        path: posPaths.discount(sale.id, d.id, sale.version),
                      })
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        {coachMark('credit')}

        {linesEditable ? (
          <>
            <Button label={t('add.open')} variant="secondary" onPress={() => setSheet('add')} fullWidth />
            {coachMark('add')}
            {can('apply_discount') ? (
              <Button
                label={t('sale.discount')}
                variant="ghost"
                disabled={sale.lines.length === 0}
                onPress={() => setSheet('discount')}
                fullWidth
              />
            ) : null}
            {coachMark('discount')}
          </>
        ) : null}

        {/* Totals. */}
        <Card>
          <View style={styles.totals}>
            {rows.map((r) => (
              <AmountRow
                key={r.id}
                label={r.id === 'totals.vatIncluded' ? t('totals.vatIncluded', { amount: money(r.amountPence) }) : t(r.id)}
                amount={r.id === 'totals.vatIncluded' ? '' : r.amountPence < 0 ? `-${money(-r.amountPence)}` : money(r.amountPence)}
                strong={r.tone === 'strong' || r.tone === 'balance'}
                muted={r.tone === 'muted' || r.tone === 'note'}
              />
            ))}
          </View>
        </Card>

        {outcome ? (
          // Design B13: what the method would have done, "Paid", then the receipt the client gets.
          <View style={posStyles.stack}>
            {outcome.method ? (
              <View style={[styles.outcome, { borderColor: colors.accent, backgroundColor: colors.accentSubtle }]}>
                <Text variant="label" accessibilityRole="header">
                  {methodTitle({ ...outcome, method: outcome.method }, t)}
                </Text>
                <Text variant="bodySmall">{simulatedSentence(outcome.method, t('other.help'))}</Text>
              </View>
            ) : null}
            {outcome.method === 'cash' && outcome.changePence > 0 ? (
              <Text variant="heading">{t('done.change', { amount: money(outcome.changePence) })}</Text>
            ) : null}
            <Notice tone="success">{practiceT('setup.practice.sim.done')}</Notice>
            <Button label={practiceT('setup.practice.finish')} loading={finishing} onPress={() => void finish()} fullWidth />
            {open ? <Button label={t('pay.otherWay')} variant="ghost" onPress={() => setOutcome(null)} fullWidth /> : null}
            <PracticeReceipt sale={sale} />
          </View>
        ) : open ? (
          <View style={posStyles.buttons}>
            {coachMark('pay')}
            {balance > 0 && sale.lines.length > 0 ? (
              <Button label={t('sale.pay.amount', { amount: money(balance) })} onPress={() => setSheet('pay')} fullWidth />
            ) : sale.lines.length > 0 ? (
              // Nothing left to pay (a discount took it all): a real sale is completed now.
              <>
                <Text variant="caption" tone="muted">
                  {t('pay.finish.help')}
                </Text>
                <Button label={t('pay.finish')} onPress={() => setOutcome({ method: null, changePence: 0 })} fullWidth />
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <PracticeAddSheet visible={sheet === 'add'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} send={send} />
      <DiscountSheet visible={sheet === 'discount'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} send={send} lineId={null} />
      <ServingSheet visible={sheet === 'serving'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} send={send} />
      <PracticePaySheet visible={sheet === 'pay'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} onPaid={paid} />
      <LineEditorSheet line={line} onClose={() => setLine(null)} sale={sale} bootstrap={bootstrap} send={send} editable={linesEditable} />
    </Screen>
  );
}

/** A line of the practice bill: what it is, who gets the credit (design B12's chip), and its total. */
function PracticeLineRow({ line, onPress }: { line: PosSaleLine; onPress?: () => void }) {
  const t = usePosT();
  const who = line.performer?.name ?? line.seller?.name ?? null;
  const changed = line.unit_price_pence !== line.list_unit_price_pence && line.list_unit_price_pence > 0;
  const content = (
    <View style={styles.line}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">
          {line.quantity > 1 ? `${t('line.qtyPrefix', { count: line.quantity })} ` : ''}
          {line.name}
        </Text>
        {line.option_name ? (
          <Text variant="caption" tone="muted">
            {line.option_name}
          </Text>
        ) : null}
        <View style={styles.badges}>
          {who ? <Badge label={who} tone="brand" /> : null}
          {line.line_type === 'custom' ? <Badge label={t('line.chip.custom')} /> : null}
          {changed ? <Badge label={t('line.chip.priceChanged', { listPrice: money(line.list_unit_price_pence) })} tone="warning" /> : null}
          {line.line_discount_pence > 0 ? <Badge label={t('line.chip.discount', { amount: money(line.line_discount_pence) })} /> : null}
        </View>
      </View>
      <Text variant="bodyMedium">{money(line.total_pence)}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={line.name} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  people: { flexDirection: 'row', gap: spacing.sm },
  personChip: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  totals: { gap: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  outcome: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  flex: { flex: 1 },
});
