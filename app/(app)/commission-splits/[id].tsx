import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { SplitExample } from '@/components/commission-splits/SplitExample';
import { EndSplitSheet, MarkPaidSheet, TermsSheet } from '@/components/commission-splits/SplitSheets';
import { MessageBox, SettingsCard } from '@/components/pos/settings-more/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, isReadOnlySplit, isSplitNotFound } from '@/lib/commission/api';
import { splitTermsSentence, termsDetail } from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import {
  basisWords,
  calendarAt,
  directionLine,
  endedLines,
  historyLine,
  lowerFirst,
  periodText,
  periodWords,
  splitBadges,
  splitMoney,
  statementStatus,
  termsSummaryFrom,
} from '@/lib/commission/splits-format';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { queryKeys } from '@/lib/queries/keys';
import {
  useCommissionGate,
  useRespondSplit,
  useSplitStatements,
  useSplitsList,
  useUndoSettlement,
  useWithdrawTerms,
} from '@/lib/queries/useCommissionSplits';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SplitPeriodView, SplitStatementsResponse, SplitTermsView, SplitView } from '@/types/commission-splits';

type OpenSheet = { kind: 'terms' } | { kind: 'end' } | { kind: 'paid'; period: SplitPeriodView } | null;

/**
 * One split with another business (web Manage dialog and statements): the calendar at its business,
 * led by what it shares in one sentence ("Sam Cuts pays you 40% of services, as rent.") and how it is
 * worked out and settled, its status, a version waiting for an answer (Accept or Decline when the other
 * business proposed it, with the worked example; Withdraw when you did), "Propose new terms" and
 * "End this split" where the server allows them (`can`), "Earlier terms", and the statements: each
 * period newest first with its status and what is owed, "Mark as paid" with an optional note, who
 * marked it and when, a note when the figures changed since, and Undo. Both businesses' admins see
 * the same record; ResNeo moves no money.
 */
export default function SplitDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const splitId = typeof params.id === 'string' && params.id ? params.id : null;
  const { isAdmin, staffLoading } = useCommissionGate();
  const venue = useVenue();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const statements = useSplitStatements(splitId);
  const list = useSplitsList();
  const respond = useRespondSplit();
  const withdraw = useWithdrawTerms();
  const undo = useUndoSettlement();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [undoing, setUndoing] = useState<SplitPeriodView | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [acting, setActing] = useState<'accept' | 'decline' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const header = <Stack.Screen options={{ headerShown: true, title: splitsT('page.title') }} />;

  if (staffLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title={splitsT('app.adminOnly.title')} message={splitsT('app.adminOnly.body')} />
      </Screen>
    );
  }

  const split: SplitView | null = statements.data?.split ?? list.data?.splits.find((s) => s.id === splitId) ?? null;
  if (!splitId || (statements.isError && isSplitNotFound(statements.error))) {
    return (
      <Screen>
        {header}
        <EmptyState
          title={splitsT('page.title')}
          message={statements.isError ? commissionErrorMessage(statements.error, splitsT('err.notFound')) : splitsT('err.notFound')}
          actionLabel={splitsT('rep.biz.settings')}
          onAction={() => router.replace('/commission-splits?section=businesses' as Href)}
        />
      </Screen>
    );
  }
  if (!split) {
    return statements.isError ? (
      <Screen>
        {header}
        <ErrorState
          message={commissionErrorMessage(statements.error, splitsT('ui.loadError'))}
          onRetry={() => void statements.refetch()}
        />
      </Screen>
    ) : (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  const today = list.data?.today ?? calendarDateInTimeZone(new Date(), venue.data?.timezone ?? 'Europe/London');
  const currency = statements.data?.currency || list.data?.currency || venue.data?.currency;
  const readOnly = isReadOnlySplit(split);
  const partner = split.partner.name;
  const pending = split.pending;
  const earlier = split.history.filter((t) => t.id !== split.terms?.id && t.id !== pending?.id);
  // The head (web SplitCard): the agreed terms, else what is waiting for an answer. A declined or
  // withdrawn split never had agreed terms, so it says what was proposed.
  const agreed = split.terms ?? (split.status === 'proposed' ? null : (split.history.find((t) => t.status === 'accepted') ?? null));
  const summaryTerms = agreed ?? (pending ? null : (split.history[0] ?? null));
  const headTerms = summaryTerms ?? pending;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissionSplits.all() });
    } finally {
      setRefreshing(false);
    }
  };

  const answer = async (action: 'accept' | 'decline') => {
    if (!pending || acting) return;
    setActing(action);
    setError(null);
    try {
      await respond.mutateAsync({ splitId: split.id, body: { terms_id: pending.id, action } });
      toast.success(
        action === 'accept'
          ? splitsT('respond.accepted', { date: formatLongDay(pending.effective_from) })
          : splitsT('respond.declined', { partner }),
      );
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setActing(null);
    }
  };

  const withdrawPending = async () => {
    if (!pending || acting) return;
    setActing('withdraw');
    setError(null);
    try {
      await withdraw.mutateAsync({ splitId: split.id, body: { terms_id: pending.id } });
      toast.success(splitsT('withdraw.done'));
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setActing(null);
    }
  };

  const confirmUndo = async () => {
    const settlement = undoing?.settlement;
    if (!settlement || undo.isPending) return;
    setError(null);
    try {
      await undo.mutateAsync({ splitId: split.id, settlementId: settlement.id });
      toast.success(splitsT('stmt.undone'));
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setUndoing(null);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <SettingsCard title={calendarAt(split)}>
          <Text variant="bodyMedium">{headTerms ? splitTermsSentence(split, headTerms) : directionLine(split)}</Text>
          {headTerms ? (
            <Text variant="caption" tone="muted">
              {termsDetail(split, headTerms, formatLongDay)}
            </Text>
          ) : null}
          <View style={styles.badges}>
            {splitBadges(split, today).map((b) => (
              <Badge key={b.text} label={b.text} tone={b.tone} />
            ))}
          </View>
          {endedLines(split, today).map((line) => (
            <Text key={line} variant="bodySmall" tone="secondary">
              {line}
            </Text>
          ))}
        </SettingsCard>

        {error ? (
          <MessageBox tone="danger" role="alert">
            {error}
          </MessageBox>
        ) : null}

        {pending ? (
          <SettingsCard
            title={
              // The other business proposed it: the question to answer. You did: what you sent (the
              // status already says whose answer it waits for).
              split.can.respond || !pending.proposed_by_you
                ? split.status === 'proposed'
                  ? splitsT('respond.title', { partner })
                  : splitsT('respond.change.title', { partner, date: formatLongDay(pending.effective_from) })
                : split.status === 'proposed'
                  ? splitsT('biz.pending.yours')
                  : splitsT('biz.pending.yoursChange', { date: formatLongDay(pending.effective_from) })
            }>
            {/* Already the head's sentence when nothing is agreed yet. */}
            {headTerms === pending ? null : <TermsLines terms={pending} />}
            {split.can.respond ? (
              <>
                <SplitExample
                  params={{
                    calendar_id: split.calendar.id,
                    other_venue_id: split.partner.venue_id,
                    services_rate_percent: pending.services_rate_bps / 100,
                    products_rate_percent: pending.products_rate_bps === null ? null : pending.products_rate_bps / 100,
                    vat_basis: pending.vat_basis,
                  }}
                  business={split.payer.name}
                  currency={currency}
                />
                <View style={styles.actions}>
                  <Button
                    label={splitsT('respond.accept')}
                    onPress={() => void answer('accept')}
                    loading={acting === 'accept'}
                    disabled={acting !== null}
                    style={styles.flex}
                  />
                  <Button
                    label={splitsT('respond.decline')}
                    variant="secondary"
                    onPress={() => void answer('decline')}
                    loading={acting === 'decline'}
                    disabled={acting !== null}
                    style={styles.flex}
                  />
                </View>
              </>
            ) : split.can.withdraw ? (
              <Button
                label={splitsT('withdraw')}
                variant="secondary"
                onPress={() => void withdrawPending()}
                loading={acting === 'withdraw'}
                disabled={acting !== null}
              />
            ) : null}
          </SettingsCard>
        ) : null}

        {split.can.propose_change || split.can.end ? (
          <View style={styles.actions}>
            {split.can.propose_change ? (
              <Button label={splitsT('change.title')} variant="secondary" onPress={() => setSheet({ kind: 'terms' })} style={styles.flex} />
            ) : null}
            {split.can.end ? (
              <Button label={splitsT('end')} variant="ghost" onPress={() => setSheet({ kind: 'end' })} style={styles.flex} />
            ) : null}
          </View>
        ) : null}

        {earlier.length > 0 ? (
          <View style={styles.history}>
            <Button
              label={splitsT('biz.history')}
              variant="ghost"
              size="sm"
              onPress={() => setHistoryOpen((o) => !o)}
              accessibilityState={{ expanded: historyOpen }}
            />
            {historyOpen
              ? earlier.map((t) => (
                  <Text key={t.id} variant="caption" tone="secondary">
                    {historyLine(t)}
                  </Text>
                ))
              : null}
          </View>
        ) : null}

        <StatementsCard
          split={split}
          data={statements.data ?? null}
          loading={statements.isLoading}
          loadError={statements.isError ? commissionErrorMessage(statements.error, splitsT('ui.loadError')) : null}
          onRetry={() => void statements.refetch()}
          currency={currency}
          // A split the link or collective no longer allows is read only (`err.readOnly`).
          onMarkPaid={readOnly ? null : (period) => setSheet({ kind: 'paid', period })}
          onUndo={readOnly ? null : setUndoing}
        />
      </ScrollView>

      {sheet?.kind === 'terms' ? <TermsSheet split={split} today={today} currency={currency} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'end' ? <EndSplitSheet split={split} today={today} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'paid' ? (
        <MarkPaidSheet split={split} period={sheet.period} currency={currency} onClose={() => setSheet(null)} />
      ) : null}
      <ConfirmSheet
        visible={undoing !== null}
        title={undoing ? splitsT('stmt.undo.confirm', { period: periodText(undoing) }) : ''}
        confirmLabel={splitsT('stmt.undo')}
        cancelLabel={splitsT('ui.close')}
        loading={undo.isPending}
        onConfirm={() => void confirmUndo()}
        onClose={() => setUndoing(null)}
      />
    </Screen>
  );
}

/** A version's terms: the shares from their start date, and the VAT basis. */
function TermsLines({ terms }: { terms: SplitTermsView }) {
  return (
    <View style={styles.terms}>
      <Text variant="bodyMedium">{termsSummaryFrom(terms)}</Text>
      <Text variant="caption" tone="muted">
        {`${splitsT('form.vat')}: ${lowerFirst(basisWords(terms.vat_basis))}`}
      </Text>
    </View>
  );
}

/** Statements (web `stmt.*`): one per settle-up period, newest first, with the totals. */
function StatementsCard({
  split,
  data,
  loading,
  loadError,
  onRetry,
  currency,
  onMarkPaid,
  onUndo,
}: {
  split: SplitView;
  data: SplitStatementsResponse | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  currency?: string | null;
  /** Null for a read-only split: no "Mark as paid" and no Undo. */
  onMarkPaid: ((period: SplitPeriodView) => void) | null;
  onUndo: ((period: SplitPeriodView) => void) | null;
}) {
  const { colors } = useTheme();
  const money = (pence: number) => splitMoney(pence, currency);
  const withProducts = split.history.some((t) => t.products_rate_bps !== null);
  const periods = data ? [...data.periods].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0)) : [];
  return (
    <SettingsCard
      title={splitsT('stmt.title')}
      description={splitsT('stmt.help', { period: lowerFirst(periodWords(split.settlement_period, true)) })}>
      {loadError ? (
        <ErrorState message={loadError} onRetry={onRetry} />
      ) : !data ? (
        loading ? <DetailSkeleton /> : null
      ) : (
        <>
          <View style={styles.totals}>
            <Text variant="bodyMedium">{splitsT('stmt.outstanding', { amount: money(data.outstanding_pence) })}</Text>
            <Text variant="bodySmall" tone="secondary">
              {splitsT('stmt.paidTotal', { amount: money(data.paid_pence) })}
            </Text>
          </View>
          {data.vat_note ? (
            <Text variant="caption" tone="muted">
              {splitsT('rep.biz.vatNote', { business: split.payer.name })}
            </Text>
          ) : null}
          {!onMarkPaid && !onUndo ? (
            <MessageBox tone="info" role="note">
              {splitsT('err.readOnly')}
            </MessageBox>
          ) : null}
          {periods.length === 0 ? (
            <Text variant="bodySmall" tone="secondary">
              {splitsT('stmt.empty')}
            </Text>
          ) : (
            periods.map((p) => {
              const status = statementStatus(p);
              return (
                <View key={p.start} style={[styles.period, { borderColor: colors.border }]}>
                  <View style={styles.periodHead}>
                    <Text variant="bodyMedium" style={styles.flex}>
                      {periodText(p)}
                    </Text>
                    <Badge label={status.text} tone={status.tone} />
                  </View>
                  <Text variant="caption" tone="secondary">
                    {`${splitsT('rep.biz.col.services')}: ${money(p.services_pence)}`}
                  </Text>
                  {withProducts || p.products_pence !== 0 ? (
                    <Text variant="caption" tone="secondary">
                      {`${splitsT('rep.biz.col.products')}: ${money(p.products_pence)}`}
                    </Text>
                  ) : null}
                  <Text variant="bodySmall">{`${splitsT('rep.biz.col.owed')}: ${money(p.owed_pence)}`}</Text>
                  {p.settlement ? (
                    <>
                      <Text variant="caption" tone="muted">
                        {splitsT('stmt.marked', { name: p.settlement.marked_by_name, date: formatLongDay(p.settlement.marked_at) })}
                      </Text>
                      {p.settlement.note ? (
                        <Text variant="caption" tone="muted">
                          {splitsT('stmt.markedNote', { note: p.settlement.note })}
                        </Text>
                      ) : null}
                      {p.settlement.changed ? (
                        <MessageBox tone="warning" role="note">
                          {splitsT('stmt.changed', { was: money(p.settlement.amount_pence), now: money(p.owed_pence) })}
                        </MessageBox>
                      ) : null}
                    </>
                  ) : null}
                  {onMarkPaid && p.status === 'outstanding' && !p.settlement ? (
                    <Button label={splitsT('stmt.markPaid')} size="sm" variant="secondary" onPress={() => onMarkPaid(p)} />
                  ) : null}
                  {onUndo && p.settlement ? <Button label={splitsT('stmt.undo')} size="sm" variant="ghost" onPress={() => onUndo(p)} /> : null}
                </View>
              );
            })
          )}
        </>
      )}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing['3xl'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  history: { gap: spacing.xs, alignItems: 'flex-start' },
  terms: { gap: spacing.xxs },
  totals: { gap: spacing.xxs },
  period: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  periodHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
