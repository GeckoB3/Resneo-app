import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RateSheet, type RateScope, type RateSheetTarget } from '@/components/pos/settings-more/commission/RateSheet';
import {
  MessageBox,
  OptionList,
  SettingsCard,
  SettingsScreen,
  SettingsScroll,
  longDay,
} from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { isFeatureOff, isStaleWrite, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { bpsToPercentText, COMMISSION_TYPES, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { CommissionRate, CommissionRatesResponse } from '@/lib/pos/settings-more/types';
import { usePosGate } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Settings, Commission (web Settings, Checkout tab, `CommissionCard`; UX spec §22.1, D48): admins
 * only, whenever Checkout is on. The basis (prices with or without VAT) saves at once on the shared
 * POS settings version. Rates are never edited: "Change rate" adds a new rate from its date, "Stop
 * this rate" ends a person's or a category's own rate from today, and "Earlier rates" shows the
 * history, newest first. A server with no rates list for this (or Commission switched off) shows
 * an empty state where the web leaves the card out.
 */

interface Group {
  scope: RateScope;
  rows: CommissionRate[];
}

const scopeKey = (s: RateScope) => [s.item_type, s.category_id ?? '', s.calendar_id ?? '', s.staff_id ?? ''].join('|');
const rateText = (bps: number | null) => (bps === null ? commT('set.comm.stop') : `${bpsToPercentText(bps)}%`);

export default function CommissionSettingsScreen() {
  return (
    <SettingsScreen title={commT('set.comm.title')} gate={(data) => (data.can.is_admin ? 'ok' : 'admin_only')}>
      {() => <CommissionBody />}
    </SettingsScreen>
  );
}

function CommissionBody() {
  const { accessToken } = usePosGate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const send = useSettingsSend();
  const query = useSettingsQuery<CommissionRatesResponse>(settingsMoreKeys.commission, settingsMorePaths.commissionRates);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [basisSaving, setBasisSaving] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RateSheetTarget | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);

  const loaded = query.data && Array.isArray(query.data.rates) ? query.data : null;
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of loaded?.rates ?? []) {
      const scope = { item_type: r.item_type, category_id: r.category_id, calendar_id: r.calendar_id, staff_id: r.staff_id };
      const k = scopeKey(scope);
      const g = map.get(k) ?? { scope, rows: [] };
      g.rows.push(r);
      map.set(k, g);
    }
    return [...map.values()];
  }, [loaded]);

  if ((query.isError && isFeatureOff(query.error)) || (query.data && !loaded)) {
    // Nothing usable came back (an older server, or switched off): the web leaves the card out.
    return <EmptyState title={commT('set.comm.unavailable.title')} message={commT('set.comm.unavailable.body')} />;
  }
  if (query.isError) {
    return <ErrorState message={settingsErrorMessage(query.error, commT('set.comm.loadError'))} onRetry={() => void query.refetch()} />;
  }
  if (!loaded) return <DetailSkeleton />;

  const key = settingsMoreKeys.commission(accessToken);
  const keep = (next: CommissionRatesResponse) => queryClient.setQueryData(key, next);

  const personName = (s: RateScope) =>
    loaded.people.find((p) => (s.calendar_id ? p.calendar_id === s.calendar_id : p.staff_id === s.staff_id))?.name ??
    groups.find((g) => scopeKey(g.scope) === scopeKey(s))?.rows.at(-1)?.person_name ??
    commT('set.comm.fallback.person');
  const categoryName = (s: RateScope) =>
    loaded.categories.find((c) => c.id === s.category_id)?.name ??
    groups.find((g) => scopeKey(g.scope) === scopeKey(s))?.rows.at(-1)?.category_name ??
    commT('set.comm.fallback.category');

  const saveBasis = async (basis: CommissionRatesResponse['commission_basis']) => {
    if (basis === loaded.commission_basis || basisSaving) return;
    setError(null);
    setStale(false);
    setBasisSaving(true);
    try {
      const next = await send<CommissionRatesResponse>(settingsMorePaths.commissionRates, 'PATCH', {
        version: loaded.settings_version,
        commission_basis: basis,
      });
      keep(next);
      toast.success(commT('set.comm.basis.saved'));
    } catch (e) {
      if (isStaleWrite(e)) {
        await query.refetch();
        setStale(true);
        setError(SM_COPY['err.POS_SETTINGS_STALE']);
      } else {
        setError(settingsErrorMessage(e));
      }
    } finally {
      setBasisSaving(false);
      // The basis lives on the POS settings row, so its version moved (or someone else's did).
      void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
    }
  };

  const stop = async (scope: RateScope) => {
    const k = scopeKey(scope);
    setError(null);
    setStale(false);
    setStopping(k);
    try {
      const next = await send<CommissionRatesResponse>(settingsMorePaths.commissionRates, 'POST', {
        ...scope,
        rate_percent: null,
        effective_from: loaded.today,
      });
      keep(next);
    } catch (e) {
      setError(settingsErrorMessage(e));
    } finally {
      setStopping(null);
    }
  };

  const venueGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && !g.scope.category_id);
  const categoryGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && g.scope.category_id);
  const personGroups = groups.filter((g) => g.scope.calendar_id || g.scope.staff_id);

  const rateRow = (g: Group, label: string, extra?: string) => {
    const current = [...g.rows].reverse().find((r) => r.effective_from <= loaded.today) ?? g.rows[g.rows.length - 1]!;
    const k = scopeKey(g.scope);
    const ownRate = Boolean(g.scope.category_id || g.scope.calendar_id || g.scope.staff_id);
    return (
      <RateRow
        key={k}
        label={label}
        line={`${rateText(current.rate_bps)}, ${commT('set.comm.from', { date: longDay(current.effective_from) })}${extra ? ` · ${extra}` : ''}`}
        onChange={() => setSheet({ scope: g.scope, fixed: true, withPerson: false })}
        onStop={ownRate && current.rate_bps !== null ? () => void stop(g.scope) : undefined}
        stopping={stopping === k}
        history={
          g.rows.length > 1
            ? {
                open: historyOf === k,
                toggle: () => setHistoryOf(historyOf === k ? null : k),
                lines: [...g.rows]
                  .reverse()
                  .map((r) => ({ id: r.id, text: `${rateText(r.rate_bps)}, ${commT('set.comm.from', { date: longDay(r.effective_from) })}` })),
              }
            : undefined
        }
      />
    );
  };

  return (
    <>
      <SettingsScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
        <SettingsCard title={commT('set.comm.title')} description={commT('set.comm.help')}>
          {error ? (
            <MessageBox tone={stale ? 'warning' : 'danger'} role="alert">
              {error}
            </MessageBox>
          ) : null}
          <View style={styles.group}>
            <OptionList
              label={commT('set.comm.basis')}
              value={loaded.commission_basis}
              options={[
                { value: 'net_ex_vat', label: commT('set.comm.basis.excl') },
                { value: 'net_inc_vat', label: commT('set.comm.basis.incl') },
              ]}
              onChange={(v) => void saveBasis(v)}
              disabled={basisSaving}
            />
            <Text variant="caption" tone="muted">
              {commT('set.comm.basis.help')}
            </Text>
          </View>
          {groups.length === 0 ? (
            <Text variant="bodySmall" tone="secondary">
              {commT('set.comm.empty')}
            </Text>
          ) : null}
        </SettingsCard>

        <SettingsCard title={commT('set.comm.defaults')}>
          {COMMISSION_TYPES.map((t) => {
            const g = venueGroups.find((x) => x.scope.item_type === t);
            const help = t === 'voucher' ? commT('set.comm.voucher.help') : undefined;
            if (g) return rateRow(g, typeWords(t), help);
            return (
              <RateRow
                key={t}
                label={typeWords(t)}
                line={`0%${help ? ` · ${help}` : ''}`}
                placeholder
                onChange={() =>
                  setSheet({ scope: { item_type: t, category_id: null, calendar_id: null, staff_id: null }, fixed: true, withPerson: false })
                }
              />
            );
          })}
        </SettingsCard>

        <SettingsCard title={commT('set.comm.byCategory')}>
          {categoryGroups.map((g) => rateRow(g, `${categoryName(g.scope)} (${typeWords(g.scope.item_type)})`))}
          <Button
            label={commT('set.comm.category.add')}
            variant="secondary"
            size="sm"
            disabled={!loaded.categories.length}
            onPress={() => setSheet({ scope: { item_type: 'service' }, fixed: false, withPerson: false })}
          />
        </SettingsCard>

        <SettingsCard title={commT('set.comm.byPerson')}>
          {personGroups.map((g) =>
            rateRow(g, `${personName(g.scope)}: ${typeWords(g.scope.item_type)}${g.scope.category_id ? `, ${categoryName(g.scope)}` : ''}`),
          )}
          <Button
            label={commT('set.comm.person.add')}
            variant="secondary"
            size="sm"
            onPress={() => setSheet({ scope: { item_type: 'service', calendar_id: null, staff_id: null }, fixed: false, withPerson: true })}
          />
        </SettingsCard>

        <Text variant="caption" tone="muted" style={styles.note}>
          {commT('set.comm.precedence')}
        </Text>
      </SettingsScroll>

      {sheet ? (
        <RateSheet
          loaded={loaded}
          target={sheet}
          onClose={() => setSheet(null)}
          onSaved={(next) => {
            keep(next);
            setSheet(null);
            toast.success(commT('set.comm.rate.saved'));
          }}
        />
      ) : null}
    </>
  );
}

/** One rate: its label, the current rate and date, and its actions (web `rateRow`). */
function RateRow({
  label,
  line,
  placeholder,
  onChange,
  onStop,
  stopping,
  history,
}: {
  label: string;
  line: string;
  placeholder?: boolean;
  onChange: () => void;
  onStop?: () => void;
  stopping?: boolean;
  history?: { open: boolean; toggle: () => void; lines: { id: string; text: string }[] };
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.border, borderStyle: placeholder ? 'dashed' : 'solid' }]}>
      <Text variant="bodyMedium">{label}</Text>
      <Text variant="caption" tone="muted">
        {line}
      </Text>
      <View style={styles.actions}>
        <Button label={commT('set.comm.change')} size="sm" variant="secondary" onPress={onChange} />
        {onStop ? <Button label={commT('set.comm.stop')} size="sm" variant="ghost" onPress={onStop} loading={stopping} /> : null}
        {history ? (
          <Button
            label={commT('set.comm.history')}
            size="sm"
            variant="ghost"
            onPress={history.toggle}
            accessibilityState={{ expanded: history.open }}
          />
        ) : null}
      </View>
      {history?.open ? (
        <View style={styles.history}>
          {history.lines.map((l) => (
            <Text key={l.id} variant="caption" tone="secondary">
              {l.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  row: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  history: { gap: 2, marginTop: spacing.xs },
  note: { paddingHorizontal: spacing.xs },
});
