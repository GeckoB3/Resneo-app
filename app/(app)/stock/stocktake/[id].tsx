import NetInfo from '@react-native-community/netinfo';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Switch, View } from 'react-native';

import { AmountRow, ErrorLine, money, Notice, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, retailPaths } from '@/lib/pos/api';
import { looksLikeBarcode } from '@/lib/pos/product-math';
import {
  countWithPending,
  isOfflineError,
  lineForCode,
  lineMatches,
  loadStocktakeDraft,
  saveStocktakeDraft,
  type PendingCount,
} from '@/lib/retail/stocktake-draft';
import { joinNames, productLabel, reviewSummary, shortWhen, signed, stocktakeStatusId, timeOfDay } from '@/lib/retail/stock-words';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { isOutOfScope, postStocktakeCount, useStocktake, useStocktakeAction } from '@/lib/queries/useRetail';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { RetailProductSearch, StocktakeDetail, StocktakeLine } from '@/types/retail';

/**
 * One stocktake in the app (POS app step 4, POS plan P7-13; UX spec §6.11, §13.6), from start to
 * commit: Count, Review and Record.
 *
 * Count: a scan-or-search field (a keyboard-mode scanner types the barcode and presses Enter; a
 * barcode or SKU adds one), rows with the count, +1 and "Type the count" ("set to n"), who counted
 * last, and no expected figure. Several people count at once: every count is its own event with
 * its own request id, and the stocktake is read every 10 seconds. Counts are kept on this phone
 * first (`lib/retail/stocktake-draft.ts`), so with poor signal counting carries on
 * (`app.stocktake.offline`) and the counts are sent when the phone is back online, each recorded
 * once. An option outside a partial count offers `take.scan.countAnyway`.
 *
 * Review: expected, counted, sold during the count, the change and its value at cost, with filters,
 * the difference at cost, "count anything not counted as zero" for a full count, back to counting,
 * and "Update stock" (`commit_stocktake`). Record: a committed or cancelled stocktake, read only.
 */

type Message =
  | { kind: 'added' | 'info' | 'unknown'; text: string }
  | { kind: 'outOfScope'; text: string; retry: () => void }
  | { kind: 'error'; text: string };

type Patch = { counted: number | null; counted_at: string | null };

function later(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

export default function StocktakeScreen() {
  const t = usePosT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stocktakeId = typeof id === 'string' ? id : '';
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const [status, setStatus] = useState<string | null>(null);
  // Read every 10 seconds while it is open (counting or review), and not once it is a record.
  const detail = useStocktake(stocktakeId, { poll: status === null || status === 'counting' || status === 'review' });
  const loadedStatus = detail.data?.stocktake.status ?? null;
  if (loadedStatus !== null && loadedStatus !== status) setStatus(loadedStatus);
  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header(t('stock.tab.stocktakes'))}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (detail.isLoading || boot.isLoading) {
    return (
      <Screen padded={false}>
        {header(t('stock.tab.stocktakes'))}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen>
        {header(t('stock.tab.stocktakes'))}
        <ErrorState message={posErrorMessage(detail.error, t('take.error'))} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }
  return (
    <>
      {header(detail.data.stocktake.name)}
      <StocktakeBody
        data={detail.data}
        stocktakeId={stocktakeId}
        timeZone={boot.data?.venue?.timezone ?? 'Europe/London'}
        reload={() => void detail.refetch()}
      />
    </>
  );
}

function StocktakeBody({
  data,
  stocktakeId,
  timeZone,
  reload,
}: {
  data: StocktakeDetail;
  stocktakeId: string;
  timeZone: string;
  reload: () => void;
}) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const action = useStocktakeAction(stocktakeId);
  const take = data.stocktake;
  const canCount = data.can_count;
  const canCommit = data.can_commit;
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [pending, setPending] = useState<PendingCount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [scan, setScan] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [setting, setSetting] = useState<StocktakeLine | null>(null);
  const [view, setView] = useState<'all' | 'diff' | 'uncounted'>('all');
  const [zeroUncounted, setZeroUncounted] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'commit' | null>(null);
  const pendingRef = useRef<PendingCount[]>([]);
  const sending = useRef(false);

  // The counts this phone kept for this stocktake (poor signal, or the app closed mid-count).
  useEffect(() => {
    let alive = true;
    void loadStocktakeDraft(stocktakeId).then((kept) => {
      if (!alive) return;
      pendingRef.current = [...kept, ...pendingRef.current];
      setPending(pendingRef.current);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [stocktakeId]);

  const keep = useCallback(
    (next: PendingCount[]) => {
      pendingRef.current = next;
      setPending(next);
      void saveStocktakeDraft(stocktakeId, next);
    },
    [stocktakeId],
  );

  /** Sends the waiting counts in order; stops at the first that cannot reach the server. */
  const flush = useCallback(async () => {
    if (sending.current || !accessToken) return;
    sending.current = true;
    try {
      while (pendingRef.current.length > 0) {
        const p = pendingRef.current[0]!;
        try {
          const res = await postStocktakeCount(accessToken, stocktakeId, {
            clientRequestId: p.client_request_id,
            variantId: p.variant_id,
            kind: p.kind,
            quantity: p.quantity,
            countAnyway: p.count_anyway,
          });
          setOffline(false);
          setPatches((cur) => ({ ...cur, [res.variant_id]: { counted: res.counted, counted_at: res.counted_at } }));
          keep(pendingRef.current.filter((x) => x.client_request_id !== p.client_request_id));
        } catch (e) {
          if (isOfflineError(e)) {
            setOffline(true);
            return;
          }
          keep(pendingRef.current.filter((x) => x.client_request_id !== p.client_request_id));
          if (isOutOfScope(e)) {
            hapticWarning();
            setMessage({
              kind: 'outOfScope',
              text: t('take.scan.outOfScope', { product: p.label }),
              retry: () => {
                setMessage(null);
                keep([...pendingRef.current, { ...p, count_anyway: true, at: Date.now() }]);
                void flush();
              },
            });
          } else {
            setMessage({ kind: 'error', text: posErrorMessage(e, t('common.networkError')) });
          }
        }
      }
      // Who counted last, and the counters, catch up.
      reload();
    } finally {
      sending.current = false;
    }
  }, [accessToken, keep, reload, stocktakeId, t]);

  // Send what was kept once it is loaded, whenever the phone is back online, and with each read.
  useEffect(() => {
    if (loaded && pendingRef.current.length) void flush();
  }, [loaded, flush, data]);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && pendingRef.current.length) void flush();
    });
    return unsubscribe;
  }, [flush]);

  function count(line: { variant_id: string; label: string }, kind: 'add' | 'set', quantity: number, announce = false) {
    const p: PendingCount = {
      client_request_id: newPaymentAttemptId(),
      variant_id: line.variant_id,
      kind,
      quantity,
      label: line.label,
      at: Date.now(),
    };
    keep([...pendingRef.current, p]);
    if (announce) {
      hapticSuccess();
      setMessage({ kind: 'added', text: t('take.scan.added', { product: line.label }) });
    } else {
      setMessage(null);
    }
    void flush();
  }

  const lines = useMemo<StocktakeLine[]>(
    () =>
      data.lines.map((l) => {
        const p = patches[l.variant_id];
        const base = p && later(p.counted_at, l.counted_at) ? { ...l, counted: p.counted, counted_at: p.counted_at, last_counted_by_name: null } : l;
        const counted = countWithPending(base.counted, pending, l.variant_id);
        return counted === base.counted ? base : { ...base, counted };
      }),
    [data.lines, patches, pending],
  );

  async function handleScan() {
    const code = scan.trim();
    if (!code) return;
    const match = lineForCode(lines, code);
    if (match) {
      setScan('');
      count({ variant_id: match.variant_id, label: productLabel(match.product_name, match.option_name) }, 'add', 1, true);
      return;
    }
    if (looksLikeBarcode(code) && accessToken) {
      // An option outside this stocktake's lines: look it up, and the server says if it is out of scope.
      setMessage({ kind: 'info', text: t('take.scan.lookup') });
      try {
        const res = await posFetch<RetailProductSearch>(retailPaths.products({ q: code, limit: 10 }), { accessToken });
        const lc = code.toLowerCase();
        for (const p of res.items ?? []) {
          const v = p.variants.find((x) => x.barcodes.includes(code) || (x.sku !== null && x.sku.trim().toLowerCase() === lc));
          if (v) {
            setScan('');
            count({ variant_id: v.id, label: productLabel(p.name, v.option_name) }, 'add', 1, true);
            return;
          }
        }
      } catch (e) {
        if (!(e instanceof ApiError) || isOfflineError(e)) {
          setMessage({ kind: 'error', text: posErrorMessage(e, t('common.networkError')) });
          return;
        }
      }
    }
    if (!lines.some((l) => lineMatches(l, code))) {
      hapticWarning();
      setScan('');
      setMessage({ kind: 'unknown', text: t('take.scan.unknown', { barcode: code }) });
      return;
    }
    // A name search that matches rows: the filter stays.
    setMessage(null);
  }

  async function run(input: Parameters<typeof action.mutateAsync>[0], success?: string) {
    setActionError(null);
    try {
      await action.mutateAsync(input);
      if (success) toast.success(success);
    } catch (e) {
      setActionError(posErrorMessage(e, t('common.networkError')));
    }
  }

  const isFull = take.scope?.type !== 'partial';
  const summary = reviewSummary(lines, { full: isFull, zeroUncounted });
  const statusBadge = (
    <Badge
      label={t(stocktakeStatusId(take.status))}
      tone={take.status === 'committed' ? 'success' : take.status === 'review' ? 'warning' : take.status === 'counting' ? 'accent' : 'neutral'}
    />
  );
  const headerBlock = (
    <View style={posStyles.stack}>
      <View style={posStyles.row}>
        <Text variant="caption" tone="muted" style={styles.flex}>
          {[t('mov.ref.stocktake', { number: take.number }), isFull ? t('take.scope.full') : t('take.scope.partial')].join(' · ')}
        </Text>
        {statusBadge}
      </View>
      {take.status === 'counting' || take.status === 'review' ? (
        <Text variant="bodyMedium">{t('take.progress', { counted: summary.counted, total: lines.length })}</Text>
      ) : null}
      {data.counters.length ? (
        <Text variant="caption" tone="muted">
          {t('take.counters', { names: joinNames(data.counters) })}
        </Text>
      ) : null}
      {offline ? <Notice tone="warning">{t('app.stocktake.offline')}</Notice> : null}
      {pending.length ? (
        <Notice tone="info" action={{ label: t('app.stocktake.sendNow'), onPress: () => void flush() }}>
          {t('app.stocktake.pending', { count: pending.length })}
        </Notice>
      ) : null}
      <ErrorLine message={actionError} />
    </View>
  );

  // ---- Count ---------------------------------------------------------------------------------
  if (take.status === 'counting') {
    const shown = lines.filter((l) => lineMatches(l, scan));
    const waiting = new Set(pending.map((p) => p.variant_id));
    return (
      <Screen scroll={false} padded={false} keyboardAvoiding>
        <FlatList
          data={shown}
          keyExtractor={(l) => l.variant_id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={posStyles.stack}>
              {headerBlock}
              {canCount ? (
                <SearchBar
                  value={scan}
                  onChangeText={setScan}
                  placeholder={t('take.scan')}
                  onClear={() => setScan('')}
                  onSubmitEditing={() => void handleScan()}
                  submitBehavior="submit"
                  accessibilityLabel={t('take.scan')}
                />
              ) : null}
              {message ? <ScanMessage message={message} /> : null}
            </View>
          }
          ListEmptyComponent={<Text tone="muted">{t('take.none.filtered')}</Text>}
          renderItem={({ item: l }) => {
            const label = productLabel(l.product_name, l.option_name);
            return (
              <Card>
                <View style={posStyles.stack}>
                  <Text variant="label">{label}</Text>
                  <Text variant="bodySmall">
                    {l.counted === null ? t('take.notCounted') : t('take.counted', { count: l.counted })}
                    {l.sku ? `, ${l.sku}` : ''}
                  </Text>
                  {waiting.has(l.variant_id) ? <Badge label={t('app.stocktake.waiting')} tone="warning" /> : null}
                  {l.last_counted_by_name && l.counted_at ? (
                    <Text variant="caption" tone="muted">
                      {t('take.lastBy', { staffName: l.last_counted_by_name, time: timeOfDay(l.counted_at, timeZone) })}
                    </Text>
                  ) : null}
                  {canCount ? (
                    <View style={styles.actions}>
                      <Button
                        label={t('take.plusOne')}
                        size="sm"
                        variant="secondary"
                        accessibilityLabel={`${t('take.plusOne')} ${label}`}
                        onPress={() => count({ variant_id: l.variant_id, label }, 'add', 1)}
                      />
                      <Button label={t('take.setCount')} size="sm" variant="ghost" onPress={() => setSetting(l)} />
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          }}
          ListFooterComponent={
            canCount ? (
              <View style={posStyles.buttons}>
                <Button
                  label={t('take.review')}
                  loading={action.isPending && action.variables?.action === 'status'}
                  disabled={action.isPending || pending.length > 0}
                  onPress={() => void run({ action: 'status', version: take.version, status: 'review' })}
                  fullWidth
                />
                <Button label={t('take.cancel')} variant="ghost" disabled={action.isPending} onPress={() => setConfirm('cancel')} fullWidth />
              </View>
            ) : null
          }
        />
        <SetCountSheet
          key={setting?.variant_id ?? 'none'}
          line={setting}
          onClose={() => setSetting(null)}
          onSet={(n) => {
            if (!setting) return;
            count({ variant_id: setting.variant_id, label: productLabel(setting.product_name, setting.option_name) }, 'set', n);
            setSetting(null);
          }}
        />
        <ConfirmSheet
          visible={confirm === 'cancel'}
          title={t('take.cancel.title')}
          message={t('take.cancel.body')}
          confirmLabel={t('take.cancel')}
          cancelLabel={t('common.cancel')}
          loading={action.isPending}
          onConfirm={() => {
            setConfirm(null);
            void run({ action: 'cancel', version: take.version });
          }}
          onClose={() => setConfirm(null)}
        />
      </Screen>
    );
  }

  // ---- Review and Record -------------------------------------------------------------------
  const committed = take.status === 'committed';
  const cancelled = take.status === 'cancelled';
  const rows = lines.filter((l) =>
    view === 'diff' ? l.change !== null && l.change !== 0 : view === 'uncounted' ? l.counted === null : true,
  );
  const total = committed ? (take.variance_value_pence ?? 0) : summary.variancePence;

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(l) => l.variant_id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={posStyles.stack}>
            {headerBlock}
            {cancelled ? <Notice>{t('take.record.cancelled')}</Notice> : null}
            {committed && take.committed_at ? (
              <Notice tone="success">
                {t('take.record.committed', { name: take.committed_by_name ?? 'your team', date: shortWhen(take.committed_at, timeZone) })}
              </Notice>
            ) : null}
            {!cancelled ? <Text variant="label">{t('take.variance', { amount: money(Math.round(total)) })}</Text> : null}
            <Segmented
              options={[
                { value: 'all', label: t('stock.filter.all') },
                { value: 'diff', label: t('take.filter.differences') },
                { value: 'uncounted', label: t('take.filter.uncounted') },
              ]}
              value={view}
              onChange={setView}
              wrapLabels
            />
          </View>
        }
        ListEmptyComponent={<Text tone="muted">{t('take.none.filtered')}</Text>}
        renderItem={({ item: l }) => (
          <Card>
            <View style={styles.reviewRow}>
              <View style={posStyles.row}>
                <Text variant="label" style={styles.flex}>
                  {productLabel(l.product_name, l.option_name)}
                </Text>
                {l.flagged_for_review ? <Badge label={t('stock.col.reserved')} tone="warning" /> : null}
              </View>
              <AmountRow label={t('take.col.expected')} amount={String(l.expected_at_start)} muted />
              <AmountRow label={t('take.col.counted')} amount={l.counted === null ? t('take.notCounted') : String(l.counted)} muted />
              {!cancelled && l.counted !== null ? (
                <>
                  <AmountRow label={t('take.col.sold')} amount={String(-l.moved_since)} muted />
                  {l.change !== null ? <AmountRow label={t('take.col.change')} amount={signed(l.change)} strong /> : null}
                  {l.value_pence !== null ? <AmountRow label={t('take.col.value')} amount={money(Math.round(l.value_pence))} muted /> : null}
                </>
              ) : null}
            </View>
          </Card>
        )}
        ListFooterComponent={
          take.status === 'review' ? (
            <View style={posStyles.stack}>
              {isFull && summary.uncounted.length > 0 ? (
                <Card>
                  <View style={posStyles.stack}>
                    <View style={posStyles.row}>
                      <View style={styles.flex}>
                        <Text variant="bodyMedium">{t('take.zeroUncounted')}</Text>
                        <Text variant="caption" tone="muted">
                          {t('take.zeroUncounted.help', { count: summary.uncounted.length })}
                        </Text>
                      </View>
                      <Switch value={zeroUncounted} onValueChange={setZeroUncounted} accessibilityLabel={t('take.zeroUncounted')} />
                    </View>
                    {zeroUncounted && data.uncounted_held > 0 ? (
                      <Notice tone="warning">{t('take.zeroUncounted.held', { count: data.uncounted_held })}</Notice>
                    ) : null}
                  </View>
                </Card>
              ) : null}
              {canCommit ? (
                <Button label={t('take.commit')} disabled={action.isPending || pending.length > 0} onPress={() => setConfirm('commit')} fullWidth />
              ) : null}
              {canCount ? (
                <Button
                  label={t('take.backToCount')}
                  variant="secondary"
                  loading={action.isPending && action.variables?.action === 'status'}
                  disabled={action.isPending}
                  onPress={() => void run({ action: 'status', version: take.version, status: 'counting' })}
                  fullWidth
                />
              ) : null}
            </View>
          ) : null
        }
      />
      <ConfirmSheet
        visible={confirm === 'commit'}
        title={t('take.commit.title')}
        message={t('take.commit.body', { count: summary.commitCount, amount: money(Math.round(summary.variancePence)) })}
        confirmLabel={t('take.commit')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        loading={action.isPending}
        onConfirm={() => {
          setConfirm(null);
          void run({ action: 'commit', version: take.version, zeroUncounted: isFull && zeroUncounted }, t('take.done'));
        }}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}

function ScanMessage({ message }: { message: Message }) {
  const t = usePosT();
  if (message.kind === 'error') return <ErrorLine message={message.text} />;
  return (
    <Notice
      tone={message.kind === 'added' ? 'success' : message.kind === 'info' ? 'info' : 'warning'}
      action={message.kind === 'outOfScope' ? { label: t('take.scan.countAnyway'), onPress: message.retry } : undefined}>
      {message.text}
    </Notice>
  );
}

/** "Type the count" (`take.setCount`): one "set to n" event for the row. */
function SetCountSheet({ line, onClose, onSet }: { line: StocktakeLine | null; onClose: () => void; onSet: (n: number) => void }) {
  const t = usePosT();
  const [value, setValue] = useState('');
  const valid = /^\d+$/.test(value.trim()) && Number(value.trim()) <= 1_000_000;
  return (
    <PosSheet
      visible={line !== null}
      onClose={onClose}
      title={t('take.setCount')}
      subtitle={line ? productLabel(line.product_name, line.option_name) : null}>
      <View style={posStyles.stack}>
        <Input
          label={t('take.setCount')}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          autoFocus
          onSubmitEditing={() => {
            if (valid) onSet(Number(value.trim()));
          }}
        />
        <Button label={t('take.setCount.save')} disabled={!valid} onPress={() => onSet(Number(value.trim()))} fullWidth />
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reviewRow: { gap: spacing.xs },
});
