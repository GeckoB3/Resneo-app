import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RateSheet, type RateScope, type RateSheetTarget } from '@/components/pos/settings-more/commission/RateSheet';
import { MessageBox, OptionList, SettingsCard, longDay } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, isStaleSettings } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { lowerFirst } from '@/lib/commission/splits-format';
import { bpsToPercentText, COMMISSION_TYPES, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import { usePatchCommissionSettings, usePostCommissionRate } from '@/lib/queries/useCommissionSplits';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CommissionBasis,
  CommissionRate,
  CommissionSettingsPatch,
  CommissionSettingsResponse,
  CommissionSource,
  CommissionSourceSetting,
} from '@/types/commission-splits';

/**
 * Commission splits: your standard rates (for everyone and by category) and how team figures are
 * worked out (what counts for services, and the VAT basis), as the web's `TeamRatesCards.tsx`. Rates
 * are never edited: "Change rate" adds a new rate from its date, "Stop this rate" ends a category's
 * own rate from today, and "Earlier rates" shows the history. A person's own rates live on their
 * calendar's card (the share sheet). A stale settings save (412) shows the server's sentence beside
 * the fresh values, which the hook has already put in place.
 */

export interface RateGroup {
  scope: RateScope;
  rows: CommissionRate[];
}

export const scopeKey = (s: RateScope) => [s.item_type, s.category_id ?? '', s.calendar_id ?? '', s.staff_id ?? ''].join('|');

/** Every scope's rows, oldest first. */
export function groupRates(rates: readonly CommissionRate[]): RateGroup[] {
  const map = new Map<string, RateGroup>();
  for (const r of rates) {
    const scope = { item_type: r.item_type, category_id: r.category_id, calendar_id: r.calendar_id, staff_id: r.staff_id };
    const k = scopeKey(scope);
    const g = map.get(k) ?? { scope, rows: [] };
    g.rows.push(r);
    map.set(k, g);
  }
  return [...map.values()];
}

/** The rate in force today for a scope's rows (else its first future one). */
export function currentOf(rows: CommissionRate[], today: string): CommissionRate {
  return [...rows].reverse().find((r) => r.effective_from <= today) ?? rows[rows.length - 1]!;
}

/** "40%, from 1 October 2026", or "Stop this rate, from ..." for a stop. */
export function rateText(r: Pick<CommissionRate, 'rate_bps' | 'effective_from'>): string {
  return `${r.rate_bps === null ? commT('set.comm.stop') : `${bpsToPercentText(r.rate_bps)}%`}, ${lowerFirst(
    commT('set.comm.from', { date: longDay(r.effective_from) }),
  )}`;
}

const SOURCE_WORDS: Record<CommissionSource, string> = {
  checkout: splitsT('team.source.checkout'),
  bookings: splitsT('team.source.bookings'),
};

/** Standard rates: for everyone (services, products, gift vouchers) and by category. */
export function StandardRatesCard({ settings }: { settings: CommissionSettingsResponse }) {
  const toast = useToast();
  const post = usePostCommissionRate();
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RateSheetTarget | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const groups = useMemo(() => groupRates(settings.rates), [settings.rates]);
  const venueGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && !g.scope.category_id);
  const categoryGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && g.scope.category_id);
  const categoryName = (s: RateScope) =>
    settings.categories.find((c) => c.id === s.category_id)?.name ??
    groups.find((g) => scopeKey(g.scope) === scopeKey(s))?.rows.at(-1)?.category_name ??
    commT('set.comm.fallback.category');

  const stop = async (scope: RateScope) => {
    if (stopping) return;
    setError(null);
    setStopping(scopeKey(scope));
    try {
      await post.mutateAsync({ ...scope, rate_percent: null, effective_from: settings.today });
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setStopping(null);
    }
  };

  const rateRow = (g: RateGroup, label: string, extra?: string) => {
    const current = currentOf(g.rows, settings.today);
    const k = scopeKey(g.scope);
    return (
      <RateRow
        key={k}
        label={label}
        line={`${rateText(current)}${extra ? ` · ${extra}` : ''}`}
        onChange={() => setSheet({ scope: g.scope, fixed: true })}
        onStop={g.scope.category_id && current.rate_bps !== null ? () => void stop(g.scope) : undefined}
        stopping={stopping === k}
        history={
          g.rows.length > 1
            ? {
                open: historyOf === k,
                toggle: () => setHistoryOf(historyOf === k ? null : k),
                lines: [...g.rows].reverse().map((r) => ({ id: r.id, text: rateText(r) })),
              }
            : undefined
        }
      />
    );
  };

  return (
    <SettingsCard title={splitsT('cal.standard.title')} description={splitsT('cal.standard.help')}>
      {error ? (
        <MessageBox tone="danger" role="alert">
          {error}
        </MessageBox>
      ) : null}
      <View style={styles.group}>
        <Text variant="label">{commT('set.comm.defaults')}</Text>
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
              onChange={() => setSheet({ scope: { item_type: t, category_id: null, calendar_id: null, staff_id: null }, fixed: true })}
            />
          );
        })}
      </View>

      <View style={styles.group}>
        <Text variant="label">{commT('set.comm.byCategory')}</Text>
        {categoryGroups.map((g) => rateRow(g, `${categoryName(g.scope)} (${typeWords(g.scope.item_type)})`))}
        <View style={styles.start}>
          <Button
            label={commT('set.comm.category.add')}
            variant="secondary"
            size="sm"
            disabled={!settings.categories.length}
            onPress={() => setSheet({ scope: { item_type: 'service', calendar_id: null, staff_id: null }, fixed: false })}
          />
        </View>
      </View>

      <Text variant="caption" tone="muted">
        {splitsT('cal.standard.precedence')}
      </Text>

      {sheet ? (
        <RateSheet
          loaded={settings}
          target={sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast.success(commT('set.comm.rate.saved'));
          }}
        />
      ) : null}
    </SettingsCard>
  );
}

/** How figures are worked out: what counts for services, and the VAT basis, each saved at once. */
export function CountingCard({ settings }: { settings: CommissionSettingsResponse }) {
  const toast = useToast();
  const patch = usePatchCommissionSettings();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const saveSettings = async (change: Omit<CommissionSettingsPatch, 'version'>, saved: (next: CommissionSettingsResponse) => string) => {
    if (settings.settings_version === null || patch.isPending) return;
    setError(null);
    setStale(false);
    try {
      const next = await patch.mutateAsync({ version: settings.settings_version, ...change });
      toast.success(saved(next));
    } catch (e) {
      // A stale save has already put the fresh settings in place (the hook does it): the server's
      // sentence sits beside them.
      setStale(isStaleSettings(e));
      setError(commissionErrorMessage(e));
    }
  };

  const saveSource = (setting: CommissionSourceSetting) => {
    if (setting === settings.source.setting) return;
    void saveSettings({ commission_source: setting }, (next) =>
      splitsT('team.source.saved', { source: lowerFirst(SOURCE_WORDS[next.source.value]) }),
    );
  };

  const saveBasis = (basis: CommissionBasis) => {
    if (basis === settings.basis.value) return;
    void saveSettings({ commission_basis: basis }, () => splitsT('team.label.saved'));
  };

  // The choices need Checkout set up (and its settings row to save on).
  const sourceChoosable = settings.source.checkout_available && settings.settings_version !== null;
  const basisEditable = settings.basis.editable && settings.settings_version !== null;
  const busy = patch.isPending;

  return (
    <SettingsCard title={splitsT('cal.counting.title')} description={splitsT('cal.counting.help')}>
      {error ? (
        <MessageBox tone={stale ? 'warning' : 'danger'} role="alert">
          {error}
        </MessageBox>
      ) : null}
      {sourceChoosable ? (
        <OptionList<CommissionSourceSetting>
          label={splitsT('team.source.title')}
          value={settings.source.setting}
          options={[
            { value: 'auto', label: splitsT('team.source.auto'), help: splitsT('team.source.auto.help') },
            { value: 'checkout', label: splitsT('team.source.checkout'), help: splitsT('team.source.checkout.help') },
            { value: 'bookings', label: splitsT('team.source.bookings'), help: splitsT('team.source.bookings.help') },
          ]}
          onChange={saveSource}
          disabled={busy}
        />
      ) : (
        <View style={styles.group}>
          <Text variant="label">{splitsT('team.source.title')}</Text>
          <MessageBox tone="info" role="note">
            {splitsT('team.source.noCheckout')}
          </MessageBox>
        </View>
      )}
      {basisEditable ? (
        <View style={styles.group}>
          <OptionList<CommissionBasis>
            label={commT('set.comm.basis')}
            value={settings.basis.value}
            options={[
              { value: 'net_ex_vat', label: commT('set.comm.basis.excl') },
              { value: 'net_inc_vat', label: commT('set.comm.basis.incl') },
            ]}
            onChange={saveBasis}
            disabled={busy}
          />
          <Text variant="caption" tone="muted">
            {commT('set.comm.basis.help')}
          </Text>
        </View>
      ) : (
        <View style={styles.group}>
          <Text variant="label">{commT('set.comm.basis')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {splitsT('team.basis.none')}
          </Text>
        </View>
      )}
    </SettingsCard>
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
        <Button
          label={commT('set.comm.change')}
          size="sm"
          variant="secondary"
          accessibilityLabel={`${commT('set.comm.change')}: ${label}`}
          onPress={onChange}
        />
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
  start: { alignItems: 'flex-start' },
  row: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  history: { gap: 2, marginTop: spacing.xs },
});
