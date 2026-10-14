import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RateSheet, personKeyOf, type RateScope, type RateSheetTarget } from '@/components/pos/settings-more/commission/RateSheet';
import { MessageBox, OptionList, SettingsCard, longDay } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, isStaleSettings } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { PERSON_LABELS, labelWords, lowerFirst } from '@/lib/commission/splits-format';
import { bpsToPercentText, COMMISSION_TYPES, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import {
  useCommissionSettings,
  usePatchCommissionSettings,
  usePostCommissionRate,
  usePutPersonLabel,
} from '@/lib/queries/useCommissionSplits';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CommissionPersonLabel,
  CommissionRate,
  CommissionSettingsPatch,
  CommissionSettingsResponse,
  CommissionSource,
  CommissionSourceSetting,
} from '@/types/commission-splits';

/**
 * Commission splits, "Your team" (web settings page, Commission splits tab): everything the old
 * Checkout settings Commission screen did, now with or without Checkout, against
 * `/api/venue/commission/settings` and `/api/venue/commission/rates`.
 *
 * - What counts for services: Automatic, sales checked out at the till, or completed bookings, saved
 *   at once on the settings version. Without Checkout set up, services always count from completed
 *   bookings, and the screen says so instead of offering a choice.
 * - VAT basis, saved at once, where the venue has a VAT set-up to work prices back from; otherwise
 *   figures use prices as booked, and the screen says so.
 * - Rates are never edited: "Change rate" adds a new rate from its date, "Stop this rate" ends a
 *   person's or a category's own rate from today, and "Earlier rates" shows the history.
 * - People: how the report describes each person ("Shown as": Commission or Their share).
 *
 * A stale save (412) reads the settings again and shows the server's sentence word for word.
 */

interface Group {
  scope: RateScope;
  rows: CommissionRate[];
}

const scopeKey = (s: RateScope) => [s.item_type, s.category_id ?? '', s.calendar_id ?? '', s.staff_id ?? ''].join('|');
const rateText = (bps: number | null) => (bps === null ? commT('set.comm.stop') : `${bpsToPercentText(bps)}%`);

const SOURCE_WORDS: Record<CommissionSource, string> = {
  checkout: splitsT('team.source.checkout'),
  bookings: splitsT('team.source.bookings'),
};

export function TeamCommissionPanel() {
  const toast = useToast();
  const query = useCommissionSettings();
  const patch = usePatchCommissionSettings();
  const post = usePostCommissionRate();
  const putLabel = usePutPersonLabel();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);
  const [labelling, setLabelling] = useState<string | null>(null);
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

  if (query.isError) {
    return <ErrorState message={commissionErrorMessage(query.error, splitsT('ui.loadError'))} onRetry={() => void query.refetch()} />;
  }
  if (!loaded) return <DetailSkeleton />;

  const personName = (s: RateScope) =>
    loaded.people.find((p) => (s.calendar_id ? p.calendar_id === s.calendar_id : p.staff_id === s.staff_id))?.name ??
    groups.find((g) => scopeKey(g.scope) === scopeKey(s))?.rows.at(-1)?.person_name ??
    commT('set.comm.fallback.person');
  const categoryName = (s: RateScope) =>
    loaded.categories.find((c) => c.id === s.category_id)?.name ??
    groups.find((g) => scopeKey(g.scope) === scopeKey(s))?.rows.at(-1)?.category_name ??
    commT('set.comm.fallback.category');

  const saveSettings = async (change: Omit<CommissionSettingsPatch, 'version'>, saved: (next: CommissionSettingsResponse) => string) => {
    if (loaded.settings_version === null || patch.isPending) return;
    setError(null);
    setStale(false);
    try {
      const next = await patch.mutateAsync({ version: loaded.settings_version, ...change });
      toast.success(saved(next));
    } catch (e) {
      // A stale save has already read the settings again (the hook does it): the server's sentence
      // sits beside the fresh values.
      setStale(isStaleSettings(e));
      setError(commissionErrorMessage(e));
    }
  };

  const saveSource = (setting: CommissionSourceSetting) => {
    if (setting === loaded.source.setting) return;
    void saveSettings({ commission_source: setting }, (next) =>
      splitsT('team.source.saved', { source: lowerFirst(SOURCE_WORDS[next.source.value]) }),
    );
  };

  const saveBasis = (basis: CommissionSettingsResponse['basis']['value']) => {
    if (basis === loaded.basis.value) return;
    void saveSettings({ commission_basis: basis }, () => commT('set.comm.basis.saved'));
  };

  const saveLabel = async (personKey: string, label: CommissionPersonLabel) => {
    setError(null);
    setStale(false);
    setLabelling(personKey);
    try {
      await putLabel.mutateAsync({ person_key: personKey, label });
      toast.success(splitsT('team.label.saved'));
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setLabelling(null);
    }
  };

  const stop = async (scope: RateScope) => {
    const k = scopeKey(scope);
    setError(null);
    setStale(false);
    setStopping(k);
    try {
      await post.mutateAsync({ ...scope, rate_percent: null, effective_from: loaded.today });
    } catch (e) {
      setError(commissionErrorMessage(e));
    } finally {
      setStopping(null);
    }
  };

  const venueGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && !g.scope.category_id);
  const categoryGroups = groups.filter((g) => !g.scope.calendar_id && !g.scope.staff_id && g.scope.category_id);
  const personGroups = groups.filter((g) => g.scope.calendar_id || g.scope.staff_id);
  const settingsBusy = patch.isPending;

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
    <View style={styles.stack}>
      <SettingsCard title={splitsT('team.title')} description={splitsT('team.intro')}>
        {error ? (
          <MessageBox tone={stale ? 'warning' : 'danger'} role="alert">
            {error}
          </MessageBox>
        ) : null}
        {loaded.source.checkout_available ? (
          <OptionList<CommissionSourceSetting>
            label={splitsT('team.source.title')}
            value={loaded.source.setting}
            options={[
              { value: 'auto', label: splitsT('team.source.auto'), help: splitsT('team.source.auto.help') },
              { value: 'checkout', label: splitsT('team.source.checkout'), help: splitsT('team.source.checkout.help') },
              { value: 'bookings', label: splitsT('team.source.bookings'), help: splitsT('team.source.bookings.help') },
            ]}
            onChange={saveSource}
            disabled={settingsBusy}
          />
        ) : (
          <View style={styles.group}>
            <Text variant="label">{splitsT('team.source.title')}</Text>
            <MessageBox tone="info" role="note">
              {splitsT('team.source.noCheckout')}
            </MessageBox>
          </View>
        )}
        {loaded.basis.editable ? (
          <View style={styles.group}>
            <OptionList
              label={commT('set.comm.basis')}
              value={loaded.basis.value}
              options={[
                { value: 'net_ex_vat', label: commT('set.comm.basis.excl') },
                { value: 'net_inc_vat', label: commT('set.comm.basis.incl') },
              ]}
              onChange={saveBasis}
              disabled={settingsBusy}
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

      {loaded.people.length > 0 ? (
        <SettingsCard title={splitsT('team.people.title')} description={splitsT('team.label.help')}>
          {loaded.people.map((p) => {
            const key = personKeyOf(p);
            return (
              <PersonRow
                key={key}
                name={p.name}
                value={p.label}
                busy={labelling === key}
                onChange={(label) => {
                  if (label !== p.label && labelling === null) void saveLabel(key, label);
                }}
              />
            );
          })}
        </SettingsCard>
      ) : null}

      {sheet ? (
        <RateSheet
          loaded={loaded}
          target={sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast.success(commT('set.comm.rate.saved'));
          }}
        />
      ) : null}
    </View>
  );
}

/** One person and how the report describes them ("Shown as"). */
function PersonRow({
  name,
  value,
  busy,
  onChange,
}: {
  name: string;
  value: CommissionPersonLabel;
  busy: boolean;
  onChange: (label: CommissionPersonLabel) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]} accessibilityState={{ busy }}>
      <Text variant="bodyMedium">{name}</Text>
      <Text variant="caption" tone="muted">
        {splitsT('team.label.title')}
      </Text>
      <Segmented<CommissionPersonLabel>
        options={PERSON_LABELS.map((l) => ({ value: l, label: labelWords(l) }))}
        value={value}
        onChange={onChange}
      />
    </View>
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
  stack: { gap: spacing.base },
  group: { gap: spacing.xs },
  row: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  history: { gap: 2, marginTop: spacing.xs },
  note: { paddingHorizontal: spacing.xs },
});
