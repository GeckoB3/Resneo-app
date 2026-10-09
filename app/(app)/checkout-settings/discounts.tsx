import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PosSheet } from '@/components/pos/parts';
import {
  Banner,
  CheckoutSettingsShell,
  FormSection,
  MoneyField,
  PercentField,
  RadioList,
  ReasonChips,
  SwitchRow,
  TextField,
  useCheckoutSettingsCtx,
  useSettingsSection,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY, type SettingsT } from '@/lib/pos/settings-copy';
import { fieldErrorFor, formatMoney, textToInt } from '@/lib/pos/settings-form';
import { draftFromPreset, presetBody, type PresetDraft } from '@/lib/pos/settings-presets';
import { settingsPaths, useSettingsDiscountPresets, useSettingsWrite } from '@/lib/queries/useCheckoutSettings';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosFieldError, PosSettingsDiscountPreset } from '@/types/pos-settings';

/**
 * Discounts and reasons (web `DiscountsCard.tsx`, UX spec §9.5): the team discount limit, the
 * reason rule and lists (discount, refund and void reasons) save through the versioned settings
 * PATCH; preset discounts are their own list, added, edited (with the preset's version) and
 * archived, never deleted.
 */

const KEYS = [
  'staff_max_discount_percent',
  'discount_reason_required',
  'discount_reasons',
  'discount_free_text_allowed',
  'refund_reasons',
  'void_reasons',
] as const;

export default function DiscountsSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.disc.title']}>
      <DiscountsSection />
      <PresetsSection />
    </CheckoutSettingsShell>
  );
}

function DiscountsSection() {
  const { t, canEdit } = useCheckoutSettingsCtx();
  const f = useSettingsSection(KEYS, t('set.disc.saved'));
  const guard = useUnsavedGuard(f.dirty);
  const v = f.value;
  const disabled = !canEdit;
  return (
    <>
      <FormSection
        title={t('set.disc.title')}
        dirty={f.dirty}
        saving={f.saving}
        error={f.error}
        stale={f.stale}
        canEdit={canEdit}
        onSave={() => void f.submit()}
        onDiscard={f.discard}>
        <PercentField
          label={t('set.disc.limit')}
          help={t('set.disc.limit.help')}
          value={v.staff_max_discount_percent}
          disabled={disabled}
          error={f.fieldError('staff_max_discount_percent')}
          onChange={(text) => f.set('staff_max_discount_percent', textToInt(text))}
        />
        <SwitchRow
          label={t('set.disc.reasonRequired')}
          value={v.discount_reason_required}
          disabled={disabled}
          onChange={(x) => f.set('discount_reason_required', x)}
        />
        <ReasonChips
          label={t('set.disc.reasons')}
          addLabel={t('set.disc.reasons.add')}
          values={v.discount_reasons}
          disabled={disabled}
          error={f.fieldError('discount_reasons')}
          onChange={(x) => f.set('discount_reasons', x)}
        />
        <SwitchRow
          label={t('set.disc.freeText')}
          value={v.discount_free_text_allowed}
          disabled={disabled}
          onChange={(x) => f.set('discount_free_text_allowed', x)}
        />
        <ReasonChips
          label={t('set.reasons.refund')}
          addLabel={t('set.reasons.add')}
          values={v.refund_reasons}
          disabled={disabled}
          error={f.fieldError('refund_reasons')}
          onChange={(x) => f.set('refund_reasons', x)}
        />
        <ReasonChips
          label={t('set.reasons.void')}
          addLabel={t('set.reasons.add')}
          values={v.void_reasons}
          disabled={disabled}
          error={f.fieldError('void_reasons')}
          onChange={(x) => f.set('void_reasons', x)}
        />
      </FormSection>
      {guard}
    </>
  );
}

function describe(p: PosSettingsDiscountPreset, currency: string, t: SettingsT): string {
  const value =
    p.kind === 'percent'
      ? t('set.disc.preset.percentDesc', { value: String((p.percent_bps ?? 0) / 100) })
      : t('set.disc.preset.amountDesc', { value: formatMoney(p.amount_pence ?? 0, currency) });
  const scope =
    p.applies_to === 'all'
      ? t('set.disc.appliesTo.all')
      : p.applies_to === 'services'
        ? t('set.disc.appliesTo.services')
        : t('set.disc.appliesTo.products');
  return `${value}, ${scope.toLowerCase()}`;
}

function PresetsSection() {
  const { t, canEdit, currency } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const toast = useToast();
  const list = useSettingsDiscountPresets();
  const write = useSettingsWrite();
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PosSettingsDiscountPreset | 'new' | null>(null);
  const [draft, setDraft] = useState<PresetDraft>(() => draftFromPreset(null));
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [fields, setFields] = useState<PosFieldError[]>([]);
  const [archiving, setArchiving] = useState<PosSettingsDiscountPreset | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const presets = list.data ?? null;
  const loadError = list.isError ? t('common.networkError') : null;

  const open = (p: PosSettingsDiscountPreset | 'new') => {
    setEditing(p);
    setDraft(draftFromPreset(p === 'new' ? null : p));
    setSheetError(null);
    setFields([]);
  };
  const fieldError = (path: string) => fieldErrorFor(fields, path);

  const submit = async () => {
    if (!editing) return;
    const body = presetBody(draft);
    setSaving(true);
    setSheetError(null);
    const r =
      editing === 'new'
        ? await write(settingsPaths.discountPresets, 'POST', body)
        : await write(settingsPaths.discountPreset(editing.id), 'PATCH', { ...body, version: editing.version });
    setSaving(false);
    if (r.ok) {
      setEditing(null);
      toast.success(t('set.disc.preset.saved'));
      await list.refetch();
      return;
    }
    if (r.stale) {
      const fresh = await list.refetch();
      // Keep the sheet on the fresh preset so the next save carries its version.
      if (editing !== 'new') {
        const next = fresh.data?.find((x) => x.id === editing.id);
        if (next) setEditing(next);
      }
      setSheetError(r.message);
      return;
    }
    setSheetError(r.message);
    setFields(r.fields);
  };

  const archive = async () => {
    const p = archiving;
    if (!p) return;
    setArchiveBusy(true);
    const r = await write(settingsPaths.withVersion(settingsPaths.discountPreset(p.id), p.version), 'DELETE');
    setArchiveBusy(false);
    setArchiving(null);
    if (!r.ok) setListError(r.message);
    else {
      setListError(null);
      toast.success(t('set.disc.preset.archived'));
    }
    await list.refetch();
  };

  return (
    <>
      <FormSection title={t('set.disc.presets')} error={listError ?? loadError}>
        {list.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            {t('common.loading')}
          </Text>
        ) : null}
        {presets && presets.length > 0 ? (
          <View>
            {presets.map((p, i) => (
              <View key={p.id} style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <View style={styles.rowText}>
                  <View style={styles.inline}>
                    <Text variant="bodyMedium">{p.name}</Text>
                    {!p.is_active ? <Badge label={t('set.disc.preset.hidden')} /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {describe(p, currency, t)}
                  </Text>
                </View>
                {canEdit ? (
                  <View style={styles.inline}>
                    <Button label={t('set.disc.preset.edit')} variant="secondary" size="sm" onPress={() => open(p)} />
                    <Button label={t('set.disc.preset.archive')} variant="ghost" size="sm" onPress={() => setArchiving(p)} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {presets && presets.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            {t('set.disc.presets.empty')}
          </Text>
        ) : null}
        {canEdit ? <Button label={t('set.disc.preset.add')} variant="secondary" onPress={() => open('new')} /> : null}
      </FormSection>

      <PosSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('set.disc.preset.add') : (editing?.name ?? '')}
        footer={
          <>
            <Button label={t('common.save')} onPress={() => void submit()} loading={saving} />
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditing(null)} disabled={saving} />
          </>
        }>
        {sheetError ? <Banner tone="danger">{sheetError}</Banner> : null}
        <TextField
          label={t('set.disc.preset.name')}
          value={draft.name}
          maxLength={60}
          error={fieldError('name')}
          onChange={(x) => setDraft({ ...draft, name: x })}
        />
        <RadioList<PresetDraft['kind']>
          label={t('set.disc.preset.value')}
          value={draft.kind}
          onChange={(x) => setDraft({ ...draft, kind: x })}
          options={[
            { value: 'percent', label: t('set.disc.preset.kind.percent') },
            { value: 'amount', label: t('set.disc.preset.kind.amount') },
          ]}
        />
        {draft.kind === 'percent' ? (
          <PercentField
            label={t('set.disc.preset.percentOff')}
            text={draft.percentText}
            decimal
            error={fieldError('percent_bps') ?? fieldError('amount_pence')}
            onChange={(text) => setDraft({ ...draft, percentText: text })}
          />
        ) : (
          <MoneyField
            label={t('set.disc.preset.amountOff')}
            currency={currency}
            value={draft.amount_pence}
            error={fieldError('percent_bps') ?? fieldError('amount_pence')}
            onChange={(p) => setDraft({ ...draft, amount_pence: p })}
          />
        )}
        <RadioList<PresetDraft['applies_to']>
          label={t('set.disc.preset.appliesTo')}
          value={draft.applies_to}
          onChange={(x) => setDraft({ ...draft, applies_to: x })}
          options={[
            { value: 'all', label: t('set.disc.appliesTo.all') },
            { value: 'services', label: t('set.disc.appliesTo.services') },
            { value: 'products', label: t('set.disc.appliesTo.products') },
          ]}
        />
        <MoneyField
          label={t('set.disc.preset.max')}
          currency={currency}
          value={draft.max_amount_pence}
          error={fieldError('max_amount_pence')}
          onChange={(p) => setDraft({ ...draft, max_amount_pence: p })}
        />
        <SwitchRow label={t('set.disc.preset.reasonRequired')} value={draft.reason_required} onChange={(x) => setDraft({ ...draft, reason_required: x })} />
        <SwitchRow label={t('set.disc.preset.active')} value={draft.is_active} onChange={(x) => setDraft({ ...draft, is_active: x })} />
      </PosSheet>

      <ConfirmSheet
        visible={archiving !== null}
        title={`${t('set.disc.preset.archive')}?`}
        message={archiving ? t('set.disc.preset.archive.body', { name: archiving.name }) : undefined}
        confirmLabel={t('set.disc.preset.archive')}
        cancelLabel={t('common.cancel')}
        loading={archiveBusy}
        onConfirm={() => void archive()}
        onClose={() => setArchiving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.sm },
  rowText: { gap: spacing.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
});
