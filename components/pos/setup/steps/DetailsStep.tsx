import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RadioList, useSettingsT } from '@/components/pos/settings/SettingsParts';
import { BusinessDetailsFields, useBusinessDetailsDraft } from '@/components/pos/setup/BusinessDetailsFields';
import { ChoiceCard, ChoiceGroup, SetupSection } from '@/components/pos/setup/parts';
import { ReceiptPreviewSheet } from '@/components/pos/setup/ReceiptPreviewSheet';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { setupT } from '@/lib/pos/setup/copy';
import { useSaveCheckoutSettings } from '@/lib/queries/useCheckoutSettings';
import { spacing } from '@/theme/index';
import type { PosCheckoutSettings, PosTaxCategory } from '@/types/pos-settings';

type ReceiptSending = 'email_if_known' | 'ask';

/**
 * W5, "Your details for receipts" (design 6.3, drawn as B6, with the owner's OB5): the business
 * name, address, email and phone are the profile's, shown and edited here (which also changes the
 * booking page), with an optional receipt-only value for each. Then the legal name, VAT (the number
 * and the two rates only once "Yes"), how receipts are sent (the wizard suggests emailing them
 * automatically, OB6; the stored default stays "Ask each time") with the message at the bottom, and
 * "Preview a receipt".
 *
 * Continue saves the profile's changes through `PATCH /api/venue` and everything else in one
 * versioned `PATCH /api/venue/pos/settings`.
 */
export function DetailsStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('details', data);
  const saveSettings = useSaveCheckoutSettings();
  const { t } = useSettingsT();
  const settings = data.settings.settings;
  const draft = useBusinessDetailsDraft(data.venue, settings);
  const [legal, setLegal] = useState(settings.legal_name ?? '');
  const [vat, setVat] = useState<boolean>(settings.vat_registered);
  const [vatNumber, setVatNumber] = useState(settings.vat_number ?? '');
  const [serviceRate, setServiceRate] = useState<PosTaxCategory>(settings.default_service_tax_category);
  const [productRate, setProductRate] = useState<PosTaxCategory>(settings.default_product_tax_category);
  // OB6: suggested the first time through; a venue that chose otherwise keeps its choice.
  const [sending, setSending] = useState<ReceiptSending | null>(() =>
    settings.receipt_auto_send === 'email_if_known'
      ? 'email_if_known'
      : settings.receipt_auto_send === 'ask'
        ? data.status.finished_at
          ? 'ask'
          : 'email_if_known'
        : null,
  );
  const [footer, setFooter] = useState(settings.receipt_footer ?? '');
  const [previewing, setPreviewing] = useState(false);

  const taxOptions: { value: PosTaxCategory; label: string }[] = [
    { value: 'standard', label: t('vat.rate.standard') },
    { value: 'reduced', label: t('vat.rate.reduced') },
    { value: 'zero', label: t('vat.rate.zero') },
    { value: 'exempt', label: t('vat.rate.exempt') },
  ];

  const settingsChanges = (): Partial<PosCheckoutSettings> => {
    const out: Partial<PosCheckoutSettings> = { ...draft.receiptChanges };
    const legalName = legal.trim() || null;
    if (legalName !== (settings.legal_name ?? null)) out.legal_name = legalName;
    if (vat !== settings.vat_registered) out.vat_registered = vat;
    if (vat) {
      const number = vatNumber.trim() || null;
      if (number !== (settings.vat_number ?? null)) out.vat_number = number;
      if (serviceRate !== settings.default_service_tax_category) out.default_service_tax_category = serviceRate;
      if (productRate !== settings.default_product_tax_category) out.default_product_tax_category = productRate;
    }
    if (sending && sending !== settings.receipt_auto_send) out.receipt_auto_send = sending;
    const message = footer.trim() || null;
    if (message !== (settings.receipt_footer ?? null)) out.receipt_footer = message;
    return out;
  };

  const onContinue = () => {
    void runner.proceed(async () => {
      const profileProblem = await draft.saveProfile();
      if (profileProblem) return profileProblem;
      const partial = settingsChanges();
      if (Object.keys(partial).length === 0) return null;
      const saved = await saveSettings(partial);
      return saved.ok ? null : saved.message;
    });
  };

  const busy = runner.busy !== null;

  return (
    <SetupFrame
      screen="details"
      data={data}
      title={setupT('setup.biz.title')}
      intro={setupT('app.setup.biz.help')}
      footer={<SetupButtons onContinue={onContinue} onSkip={() => void runner.skip()} busy={runner.busy} error={runner.error} />}>
      <BusinessDetailsFields draft={draft} canEditProfile={!busy} canEditReceipts={!busy} />

      <Input
        label={setupT('setup.biz.legal')}
        helper={setupT('setup.biz.legal.help')}
        value={legal}
        onChangeText={setLegal}
        editable={!busy}
        maxLength={160}
      />

      <ChoiceGroup label={setupT('setup.biz.vat.title')}>
        <View style={styles.row}>
          <View style={styles.half}>
            <ChoiceCard title={setupT('setup.biz.vat.no')} selected={!vat} onPress={() => setVat(false)} disabled={busy} />
          </View>
          <View style={styles.half}>
            <ChoiceCard title={setupT('setup.biz.vat.yes')} selected={vat} onPress={() => setVat(true)} disabled={busy} />
          </View>
        </View>
      </ChoiceGroup>
      {vat ? (
        <SetupSection>
          <Input
            label={setupT('setup.biz.vat.number')}
            helper={setupT('setup.biz.vat.number.help')}
            value={vatNumber}
            onChangeText={setVatNumber}
            editable={!busy}
            maxLength={20}
            autoCapitalize="characters"
          />
          <RadioList<PosTaxCategory>
            label={setupT('setup.biz.vat.services')}
            value={serviceRate}
            options={taxOptions}
            disabled={busy}
            onChange={setServiceRate}
          />
          <RadioList<PosTaxCategory>
            label={setupT('setup.biz.vat.products')}
            value={productRate}
            options={taxOptions}
            disabled={busy}
            onChange={setProductRate}
          />
          <Text variant="caption" tone="muted">
            {setupT('setup.biz.vat.help')}
          </Text>
        </SetupSection>
      ) : null}

      <ChoiceGroup label={setupT('setup.biz.receipts.title')}>
        <ChoiceCard
          title={setupT('setup.biz.receipts.auto')}
          selected={sending === 'email_if_known'}
          onPress={() => setSending('email_if_known')}
          disabled={busy}
        />
        <ChoiceCard title={setupT('setup.biz.receipts.ask')} selected={sending === 'ask'} onPress={() => setSending('ask')} disabled={busy} />
      </ChoiceGroup>
      <Input
        label={setupT('setup.biz.receipts.footer')}
        placeholder={setupT('setup.biz.receipts.footer.placeholder')}
        value={footer}
        onChangeText={setFooter}
        editable={!busy}
        maxLength={500}
        multiline
        style={styles.multiline}
      />
      <Button label={setupT('setup.biz.preview')} variant="secondary" onPress={() => setPreviewing(true)} disabled={busy} />

      <ReceiptPreviewSheet visible={previewing} onClose={() => setPreviewing(false)} />
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
});
