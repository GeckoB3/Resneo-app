import { CashCountToggle } from '@/components/pos/settings/FeatureToggles';
import {
  CheckoutSettingsShell,
  FormSection,
  MoneyField,
  RadioList,
  SwitchRow,
  useCheckoutSettingsCtx,
  useSettingsSection,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { useSettingsTills } from '@/lib/queries/useCheckoutSettings';

/**
 * Cash (web `CashSettingsCard.tsx`, UX spec §9.9): the Count cash switch at the top (it saves on its
 * own); with more than one till in use, the till for cash from older app versions; while counting
 * is on, blind counts, the reason threshold and the usual float; and always the largest single
 * payment, which guards every way of paying. These save together with Save, sending only their own
 * keys at the loaded version.
 */

const KEYS = [
  'blind_close',
  'variance_reason_threshold_pence',
  'default_float_pence',
  'legacy_cash_till_id',
  'max_payment_pence',
] as const;

/** The empty choice in the legacy till list (the web's empty option). */
const NONE = '__none__';

export default function CashSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.cash.title']}>
      <CashSection />
    </CheckoutSettingsShell>
  );
}

function CashSection() {
  const { data, t, currency, canEdit } = useCheckoutSettingsCtx();
  const f = useSettingsSection(KEYS, t('set.cash.saved'));
  const guard = useUnsavedGuard(f.dirty);
  const tillsQuery = useSettingsTills();
  const tills = (tillsQuery.data ?? []).filter((x) => x.is_active !== false);
  const on = data.settings.cash_management_enabled === true;
  const disabled = !canEdit;

  return (
    <>
      <FormSection
        title={t('set.cash.title')}
        dirty={f.dirty}
        saving={f.saving}
        error={f.error}
        stale={f.stale}
        canEdit={canEdit}
        onSave={() => void f.submit()}
        onDiscard={f.discard}>
        <CashCountToggle showHelp={false} />
        {tills.length > 1 ? (
          <>
            <RadioList<string>
              label={t('set.cash.legacyTill')}
              help={t('set.cash.legacyTill.help')}
              value={f.value.legacy_cash_till_id ?? NONE}
              disabled={disabled}
              error={f.fieldError('legacy_cash_till_id')}
              onChange={(x) => f.set('legacy_cash_till_id', x === NONE ? null : x)}
              options={[{ value: NONE, label: t('set.cash.legacyTill.none') }, ...tills.map((x) => ({ value: x.id, label: x.name }))]}
            />
            {!on && !f.value.legacy_cash_till_id ? (
              <Text variant="caption" tone="muted">
                {t('set.cash.legacyTill.ask')}
              </Text>
            ) : null}
          </>
        ) : null}
        {on ? (
          <>
            <SwitchRow
              label={t('set.cash.blind')}
              help={t('set.cash.blind.help')}
              value={f.value.blind_close !== false}
              disabled={disabled}
              onChange={(v) => f.set('blind_close', v)}
            />
            <MoneyField
              label={t('set.cash.threshold')}
              currency={currency}
              value={f.value.variance_reason_threshold_pence ?? 500}
              disabled={disabled}
              error={f.fieldError('variance_reason_threshold_pence')}
              onChange={(p) => f.set('variance_reason_threshold_pence', p as number)}
            />
            <MoneyField
              label={t('set.cash.float')}
              currency={currency}
              value={f.value.default_float_pence ?? 0}
              disabled={disabled}
              error={f.fieldError('default_float_pence')}
              onChange={(p) => f.set('default_float_pence', p as number)}
            />
          </>
        ) : null}
        <MoneyField
          label={t('set.cash.max')}
          help={t('set.cash.max.help')}
          currency={currency}
          value={f.value.max_payment_pence}
          disabled={disabled}
          error={f.fieldError('max_payment_pence')}
          onChange={(p) => f.set('max_payment_pence', p as number)}
        />
      </FormSection>
      {guard}
    </>
  );
}
