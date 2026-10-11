import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CheckoutSettingsShell,
  FieldBlock,
  FormSection,
  RadioList,
  SwitchRow,
  TextField,
  useCheckoutSettingsCtx,
  useSettingsSection,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { BusinessDetailsFields, useBusinessDetailsDraft } from '@/components/pos/setup/BusinessDetailsFields';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { setupT } from '@/lib/pos/setup/copy';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosAddress, PosCompanyRegisteredIn, PosTaxCategory } from '@/types/pos-settings';

/**
 * Business and tax details (web `BusinessCard.tsx`, UX spec §9.2), with the owner's OB5 (POS Part 4):
 * the business name, address, email and phone receipts show are the venue profile's, shown and
 * edited here (which also changes the booking page), each with an optional receipt-only value
 * (`BusinessDetailsFields`, shared with set-up's W5). Checkout's own details follow: legal name,
 * company number, registered office and where the company is registered (limited companies), VAT
 * registration, VAT number and the default VAT rates. The server works out the rules from the
 * address; the screen does not show them.
 */

const KEYS = [
  'legal_name',
  'company_number',
  'registered_office_address',
  'company_registered_in',
  'vat_registered',
  'vat_number',
  'default_service_tax_category',
  'default_product_tax_category',
] as const;

const EMPTY_ADDRESS: PosAddress = { line1: null, line2: null, town: null, postcode: null };

export default function BusinessSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.biz.title']}>
      <ProfileDetailsSection />
      <BusinessSection />
    </CheckoutSettingsShell>
  );
}

function AddressFields({
  value,
  onChange,
  disabled,
  error,
}: {
  value: PosAddress | null;
  onChange: (a: PosAddress) => void;
  disabled: boolean;
  error: (path: string) => string | null;
}) {
  const { t } = useCheckoutSettingsCtx();
  const a = value ?? EMPTY_ADDRESS;
  const set = (k: keyof PosAddress) => (v: string | null) => onChange({ ...a, [k]: v });
  return (
    <View style={styles.stack}>
      <TextField label={t('set.biz.address.line1')} value={a.line1} onChange={set('line1')} disabled={disabled} maxLength={120} autoComplete="street-address" error={error('line1')} />
      <TextField label={t('set.biz.address.line2')} value={a.line2} onChange={set('line2')} disabled={disabled} maxLength={120} error={error('line2')} />
      <TextField label={t('set.biz.address.town')} value={a.town} onChange={set('town')} disabled={disabled} maxLength={80} error={error('town')} />
      <TextField label={t('set.biz.address.postcode')} value={a.postcode} onChange={set('postcode')} disabled={disabled} maxLength={12} autoComplete="postal-code" autoCapitalize="characters" error={error('postcode')} />
    </View>
  );
}

/**
 * OB5: the profile's name, address, email and phone, with the receipt-only values. Its own Save:
 * the profile's changes go through `PATCH /api/venue` (admins; it also changes the booking page),
 * the receipt-only values through the versioned settings save. Started again from what is saved
 * when the venue arrives.
 */
function ProfileDetailsSection() {
  const { venue } = useVenueContext();
  return <ProfileDetailsForm key={venue?.id ?? 'none'} />;
}

function ProfileDetailsForm() {
  const { venue } = useVenueContext();
  const { data, canEdit, save } = useCheckoutSettingsCtx();
  const toast = useToast();
  const draft = useBusinessDetailsDraft(venue, data.settings);
  const guard = useUnsavedGuard(draft.dirty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const isAdmin = data.can.is_admin === true;
  const { reset } = draft;

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const problem = isAdmin ? await draft.saveProfile() : null;
    if (problem) {
      setSaving(false);
      setError({ text: problem, stale: false });
      return;
    }
    if (Object.keys(draft.receiptChanges).length > 0) {
      const r = await save(draft.receiptChanges);
      if (!r.ok) {
        setSaving(false);
        setError({ text: r.message, stale: r.stale });
        return;
      }
    }
    setSaving(false);
    toast.success(setupT('app.setup.biz.saved'));
  };

  const discard = useCallback(() => {
    reset(venue, data.settings);
    setError(null);
  }, [data.settings, reset, venue]);

  return (
    <>
      <FormSection
        title={setupT('app.setup.biz.title')}
        description={setupT('app.setup.biz.help')}
        dirty={draft.dirty}
        saving={saving}
        error={error?.text ?? null}
        stale={error?.stale ?? false}
        canEdit={canEdit}
        onSave={() => void submit()}
        onDiscard={discard}>
        <BusinessDetailsFields draft={draft} canEditProfile={isAdmin && canEdit && !saving} canEditReceipts={canEdit && !saving} />
      </FormSection>
      {guard}
    </>
  );
}

function BusinessSection() {
  const { data, t, canEdit } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const f = useSettingsSection(KEYS, t('set.biz.saved'));
  const guard = useUnsavedGuard(f.dirty);
  const v = f.value;
  const disabled = !canEdit;
  const [officeDifferent, setOfficeDifferent] = useState(() => v.registered_office_address != null);
  const country = data.settings.business_country === 'IE' ? t('set.biz.country.ie') : t('set.biz.country.gb');
  const sub = (key: 'registered_office_address') => (path: string) => f.fieldError(`${key}.${path}`);
  const taxOptions: { value: PosTaxCategory; label: string }[] = [
    { value: 'standard', label: t('vat.rate.standard') },
    { value: 'reduced', label: t('vat.rate.reduced') },
    { value: 'zero', label: t('vat.rate.zero') },
    { value: 'exempt', label: t('vat.rate.exempt') },
  ];

  return (
    <>
      <FormSection
        title={t('set.biz.title')}
        description={t('set.biz.help')}
        dirty={f.dirty}
        saving={f.saving}
        error={f.error}
        stale={f.stale}
        canEdit={canEdit}
        onSave={() => void f.submit()}
        onDiscard={f.discard}>
        <TextField label={t('set.biz.legalName')} help={t('set.biz.legalName.help')} value={v.legal_name} onChange={(x) => f.set('legal_name', x)} disabled={disabled} maxLength={160} error={f.fieldError('legal_name')} />
        <TextField label={t('set.biz.companyNumber')} help={t('set.biz.companyNumber.help')} value={v.company_number} onChange={(x) => f.set('company_number', x)} disabled={disabled} maxLength={20} autoCapitalize="characters" error={f.fieldError('company_number')} />

        <FieldBlock label={t('set.biz.country')} help={t('set.biz.country.help')}>
          <Text variant="body">{country}</Text>
        </FieldBlock>

        {v.company_number ? (
          <View style={styles.stack}>
            <Text variant="subheading">{t('set.biz.registeredOffice')}</Text>
            <Text variant="caption" tone="muted">
              {t('set.biz.registeredOffice.help')}
            </Text>
            <SwitchRow
              label={t('set.biz.registeredOffice.same')}
              value={!officeDifferent}
              disabled={disabled}
              onChange={(same) => {
                setOfficeDifferent(!same);
                if (same) f.set('registered_office_address', null);
              }}
            />
            {officeDifferent ? (
              <AddressFields
                value={v.registered_office_address}
                onChange={(a) => f.set('registered_office_address', a)}
                disabled={disabled}
                error={sub('registered_office_address')}
              />
            ) : null}
            <RadioList<PosCompanyRegisteredIn>
              label={t('set.biz.registeredIn')}
              value={v.company_registered_in}
              disabled={disabled}
              error={f.fieldError('company_registered_in')}
              onChange={(x) => f.set('company_registered_in', x)}
              options={[
                { value: 'england_wales', label: t('set.biz.registeredIn.ew') },
                { value: 'scotland', label: t('set.biz.registeredIn.scotland') },
                { value: 'northern_ireland', label: t('set.biz.registeredIn.ni') },
              ]}
            />
          </View>
        ) : null}

        <View style={[styles.vat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <SwitchRow label={t('set.biz.vatRegistered')} value={v.vat_registered} disabled={disabled} onChange={(x) => f.set('vat_registered', x)} />
          {v.vat_registered ? (
            <>
              <TextField label={t('set.biz.vatNumber')} value={v.vat_number} onChange={(x) => f.set('vat_number', x)} disabled={disabled} maxLength={20} autoCapitalize="characters" error={f.fieldError('vat_number')} />
              <RadioList<PosTaxCategory>
                label={t('set.biz.serviceRate')}
                value={v.default_service_tax_category}
                options={taxOptions}
                disabled={disabled}
                error={f.fieldError('default_service_tax_category')}
                onChange={(x) => f.set('default_service_tax_category', x)}
              />
              <RadioList<PosTaxCategory>
                label={t('set.biz.productRate')}
                value={v.default_product_tax_category}
                options={taxOptions}
                disabled={disabled}
                error={f.fieldError('default_product_tax_category')}
                onChange={(x) => f.set('default_product_tax_category', x)}
              />
              <Text variant="caption" tone="secondary">
                {t('set.biz.pricesInclude')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('set.biz.accountant')}
              </Text>
            </>
          ) : null}
        </View>
      </FormSection>
      {guard}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  vat: { gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
