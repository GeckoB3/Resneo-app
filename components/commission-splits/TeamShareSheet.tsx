import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SheetStep } from '@/components/commission-splits/FlowSheet';
import { SummaryBox } from '@/components/commission-splits/SplitExample';
import { currentOf, groupRates, rateText } from '@/components/commission-splits/TeamRatesCards';
import { ChoiceChips } from '@/components/pos/parts';
import { FieldBlock, MessageBox, OptionList } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage, commissionFieldErrors, fieldMessage, type CommissionFieldError } from '@/lib/commission/api';
import { personShare, shareWhat, standardRate, teamSummary } from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import { PERSON_LABELS, checkPercent, labelWords, splitMoney } from '@/lib/commission/splits-format';
import { personKeyOf, shareOf } from '@/lib/commission/team-share';
import { bpsToPercentText, commT, typeWords } from '@/lib/pos/settings-more/commission-copy';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { usePostCommissionRate, useTeamShare } from '@/lib/queries/useCommissionSplits';
import { spacing } from '@/theme/index';
import type {
  CommissionItemType,
  CommissionPersonLabel,
  CommissionSettingsPerson,
  CommissionSettingsResponse,
  TeamShareBody,
} from '@/types/commission-splits';

/**
 * One person's share (web `TeamShareDialog`): what you pay the person who works a calendar, or a
 * login without one. Your standard rates, or their own rates for services and products, what the
 * report calls it, and the date it starts, saved in one step (POST /api/venue/commission/share). A
 * sentence and a worked example say exactly what will count before anything saves. Rates for one
 * category and the earlier rates sit underneath. Shown inside `FlowSheet`.
 */

type Mode = 'standard' | 'own';

const EXAMPLE_PENCE = 10_000;
/** The fields a 400 can name beside an input here; anything else shows under the form. */
const KNOWN_FIELDS = ['service_rate_percent', 'product_rate_percent', 'effective_from'];

function percentOf(text: string): number | null {
  const check = checkPercent(text);
  return check.ok ? check.value : null;
}

export function TeamShareSheet({
  settings,
  person,
  fresh,
  onSaved,
  onClose,
  onBack,
}: {
  settings: CommissionSettingsResponse;
  person: CommissionSettingsPerson;
  /** Opened from "Set up a split" or "Set a share": start on their own rates, with empty fields. */
  fresh?: boolean;
  /** Saved: the sentence the screen shows at the top. The settings are already in the cache. */
  onSaved: (message: string) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const share = useTeamShare();
  const today = settings.today;
  const view = useMemo(() => personShare(settings.rates, person, today), [settings.rates, person, today]);
  const login = person.calendar_id === null;
  const showProducts = settings.source.checkout_available || view.product.own || view.product.bps > 0;
  const standard = { service: standardRate(settings.rates, 'service', today), product: standardRate(settings.rates, 'product', today) };

  const [mode, setMode] = useState<Mode>(fresh || view.service.own || view.product.own ? 'own' : 'standard');
  // A first share starts empty, so nothing is saved by accident at 0%.
  const startText = (bps: number) => (fresh && bps === 0 ? '' : bpsToPercentText(bps));
  const [services, setServices] = useState(() => startText(view.service.bps));
  const [products, setProducts] = useState(() => startText(view.product.bps));
  const [label, setLabel] = useState<CommissionPersonLabel>(person.label);
  const [start, setStart] = useState(today);
  const [checks, setChecks] = useState<{ services: string | null; products: string | null }>({ services: null, products: null });
  const [fields, setFields] = useState<CommissionFieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const servicesPct = mode === 'own' ? percentOf(services) : null;
  const productsPct = mode === 'own' && showProducts ? percentOf(products) : null;
  const serviceBps = mode === 'own' ? (servicesPct === null ? null : Math.round(servicesPct * 100)) : standard.service;
  const productBps =
    mode === 'own' ? (showProducts ? (productsPct === null ? null : Math.round(productsPct * 100)) : view.product.bps) : standard.product;
  const valid = serviceBps !== null && productBps !== null;

  const summary = valid
    ? teamSummary({ name: person.name, login, date: formatLongDay(start), serviceBps, productBps: showProducts ? productBps : null, label })
    : null;
  const example =
    valid && serviceBps > 0
      ? splitsT('sum.team.example', {
          base: splitMoney(EXAMPLE_PENCE, settings.currency),
          name: person.name,
          amount: splitMoney(shareOf(EXAMPLE_PENCE, serviceBps), settings.currency),
        })
      : null;

  const save = async () => {
    if (share.isPending) return;
    if (mode === 'own') {
      const s = checkPercent(services);
      const p = showProducts ? checkPercent(products) : null;
      if (!s.ok || (p && !p.ok)) {
        setChecks({ services: s.ok ? null : s.message, products: p && !p.ok ? p.message : null });
        setError(null);
        return;
      }
    }
    setChecks({ services: null, products: null });
    setError(null);
    setFields([]);
    const body: TeamShareBody = {
      person_key: personKeyOf(person),
      label,
      effective_from: start,
      service_rate_percent: mode === 'own' ? servicesPct : null,
      ...(showProducts ? { product_rate_percent: mode === 'own' ? productsPct : null } : {}),
    };
    try {
      await share.mutateAsync(body);
      onSaved(summary ? `${splitsT('share.saved')} ${summary}` : splitsT('share.saved'));
    } catch (e) {
      setError(commissionErrorMessage(e));
      setFields(commissionFieldErrors(e));
    }
  };

  const personRows = settings.rates
    .filter((r) => (person.calendar_id ? r.calendar_id === person.calendar_id : r.staff_id !== null && r.staff_id === person.staff_id))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
  // A 400's sentence is its first field's message, which already sits beside that field.
  const general = error && !fields.some((f) => KNOWN_FIELDS.includes(f.path) && f.message === error) ? error : null;

  return (
    <SheetStep
      title={splitsT('share.title', { name: person.name })}
      subtitle={splitsT(login ? 'share.help.login' : 'share.help', { name: person.name })}
      footer={
        <>
          {/* The refusal sits by the buttons, so it is seen however far the sheet is scrolled. */}
          {general ? (
            <MessageBox tone="danger" role="alert">
              {general}
            </MessageBox>
          ) : null}
          <Button label={splitsT('share.save')} onPress={() => void save()} loading={share.isPending} fullWidth />
          <View style={styles.row}>
            {onBack ? (
              <Button label={splitsT('setup.back')} variant="ghost" onPress={onBack} disabled={share.isPending} style={styles.flex} />
            ) : null}
            <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} disabled={share.isPending} style={styles.flex} />
          </View>
        </>
      }>
      <OptionList<Mode>
        label={splitsT('share.mode')}
        value={mode}
        options={[
          {
            value: 'standard',
            label: splitsT('share.mode.standard'),
            help: shareWhat(standard.service, showProducts ? standard.product : null) ?? splitsT('share.mode.standard.none'),
          },
          { value: 'own', label: splitsT('share.mode.own') },
        ]}
        onChange={setMode}
      />

      {mode === 'own' ? (
        <>
          <FieldBlock label={splitsT('share.services')} error={checks.services ?? fieldMessage(fields, 'service_rate_percent')}>
            <Input
              value={services}
              onChangeText={(next) => {
                setServices(next);
                setChecks((c) => ({ ...c, services: null }));
              }}
              keyboardType="decimal-pad"
              accessibilityLabel={splitsT('share.services')}
            />
          </FieldBlock>
          {showProducts ? (
            <FieldBlock
              label={splitsT('share.products')}
              help={splitsT('share.products.help')}
              error={checks.products ?? fieldMessage(fields, 'product_rate_percent')}>
              <Input
                value={products}
                onChangeText={(next) => {
                  setProducts(next);
                  setChecks((c) => ({ ...c, products: null }));
                }}
                keyboardType="decimal-pad"
                accessibilityLabel={splitsT('share.products')}
              />
            </FieldBlock>
          ) : null}
        </>
      ) : null}

      <FieldBlock label={splitsT('share.label')}>
        <ChoiceChips<CommissionPersonLabel>
          options={PERSON_LABELS.map((l) => ({ value: l, label: labelWords(l) }))}
          value={label}
          onChange={setLabel}
        />
      </FieldBlock>

      <FieldBlock label={splitsT('share.start')} error={fieldMessage(fields, 'effective_from')}>
        <DatePickerField
          value={start}
          onChange={(d) => {
            if (d) setStart(d);
          }}
          accessibilityLabel={splitsT('share.start')}
        />
      </FieldBlock>
      {start < today ? (
        <MessageBox tone="warning" role="note">
          {splitsT('share.backdated', { date: formatLongDay(start) })}
        </MessageBox>
      ) : null}

      {summary ? (
        <SummaryBox summary={summary}>
          {example ? (
            <Text variant="caption" tone="secondary">
              {example}
            </Text>
          ) : null}
        </SummaryBox>
      ) : null}

      <CategoryRates settings={settings} person={person} start={start} />

      {personRows.length ? (
        <View style={styles.history}>
          <Button
            label={splitsT('share.history')}
            variant="ghost"
            size="sm"
            onPress={() => setHistoryOpen((o) => !o)}
            accessibilityState={{ expanded: historyOpen }}
          />
          {historyOpen
            ? personRows.map((r) => (
                <Text key={r.id} variant="caption" tone="secondary">
                  {`${typeWords(r.item_type)}${r.category_name ? `, ${r.category_name}` : ''}: ${rateText(r)}`}
                </Text>
              ))
            : null}
        </View>
      ) : null}
    </SheetStep>
  );
}

/** A person's rates for one category: what differs today, with Stop, and an inline Add. */
function CategoryRates({
  settings,
  person,
  start,
}: {
  settings: CommissionSettingsResponse;
  person: CommissionSettingsPerson;
  start: string;
}) {
  const post = usePostCommissionRate();
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!settings.categories.length) return null;

  // Their own category rates (yours live under Standard rates): the one in force, else the next.
  const rows = groupRates(settings.rates)
    .filter(
      (g) =>
        g.scope.category_id &&
        (person.calendar_id ? g.scope.calendar_id === person.calendar_id : g.scope.staff_id !== null && g.scope.staff_id === person.staff_id),
    )
    .map((g) => ({ scope: g.scope, current: currentOf(g.rows, settings.today) }))
    .filter((c) => c.current.rate_bps !== null)
    .sort((a, b) => (a.current.category_name ?? '').localeCompare(b.current.category_name ?? '', 'en-GB'));

  const send = async (key: string, body: { item_type: CommissionItemType; category_id: string; rate_percent: number | null }) => {
    setBusy(key);
    setError(null);
    try {
      await post.mutateAsync({ calendar_id: person.calendar_id, staff_id: person.staff_id, effective_from: start, ...body });
      return true;
    } catch (e) {
      setError(commissionErrorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const pct = checkPercent(rate);
    if (!categoryKey || !pct.ok) {
      setError(pct.ok ? splitsT('ui.percentInvalid') : pct.message);
      return;
    }
    const [itemType, categoryId] = categoryKey.split('|') as [CommissionItemType, string];
    if (await send('add', { item_type: itemType, category_id: categoryId, rate_percent: pct.value })) {
      setCategoryKey(null);
      setRate('');
    }
  };

  return (
    <View style={styles.categories}>
      <View style={styles.start}>
        <Button
          label={`${splitsT('share.categories')}${rows.length ? ` (${rows.length})` : ''}`}
          variant="ghost"
          size="sm"
          onPress={() => setOpen((o) => !o)}
          accessibilityState={{ expanded: open }}
        />
      </View>
      {open ? (
        <>
          <Text variant="caption" tone="muted">
            {splitsT('share.categories.help')}
          </Text>
          {rows.map(({ scope, current }) => (
            <View key={`${scope.item_type}|${scope.category_id}`} style={styles.categoryRow}>
              <Text variant="bodySmall" style={styles.flex}>
                {`${current.category_name ?? commT('set.comm.fallback.category')} (${typeWords(scope.item_type)}): ${rateText(current)}`}
              </Text>
              <Button
                label={commT('set.comm.stop')}
                variant="ghost"
                size="sm"
                loading={busy === scope.category_id}
                disabled={busy !== null}
                onPress={() => void send(scope.category_id!, { item_type: scope.item_type, category_id: scope.category_id!, rate_percent: null })}
              />
            </View>
          ))}
          <FieldBlock label={commT('set.comm.fallback.category')} help={categoryKey ? null : commT('set.comm.sheet.category.choose')}>
            <OptionList
              value={categoryKey}
              options={settings.categories.map((c) => ({ value: `${c.item_type}|${c.id}`, label: `${c.name} (${typeWords(c.item_type)})` }))}
              onChange={setCategoryKey}
            />
          </FieldBlock>
          <FieldBlock label={commT('set.comm.sheet.rate')}>
            <Input value={rate} onChangeText={setRate} keyboardType="decimal-pad" accessibilityLabel={commT('set.comm.sheet.rate')} />
          </FieldBlock>
          <View style={styles.start}>
            <Button
              label={splitsT('share.categories.add')}
              variant="secondary"
              size="sm"
              loading={busy === 'add'}
              disabled={busy !== null || !categoryKey || !rate.trim()}
              onPress={() => void add()}
            />
          </View>
          {error ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  start: { alignItems: 'flex-start' },
  history: { gap: spacing.xs, alignItems: 'flex-start' },
  categories: { gap: spacing.sm },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
