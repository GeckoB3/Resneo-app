import {
  CheckoutSettingsShell,
  FormSection,
  RadioList,
  TextField,
  useCheckoutSettingsCtx,
  useSettingsSection,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import type { PosCheckoutSettings } from '@/types/pos-settings';

/**
 * Receipts (web `ReceiptsCard` in `SimpleCards.tsx`, UX spec §9.3): the receipt number prefix, the
 * message at the bottom, and what happens when a sale is paid.
 */

const KEYS = ['receipt_prefix', 'receipt_footer', 'receipt_auto_send'] as const;

export default function ReceiptsSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.rcpt.title']}>
      <ReceiptsSection />
    </CheckoutSettingsShell>
  );
}

function ReceiptsSection() {
  const { t, canEdit } = useCheckoutSettingsCtx();
  const f = useSettingsSection(KEYS, t('set.rcpt.saved'));
  const guard = useUnsavedGuard(f.dirty);
  const v = f.value;
  return (
    <>
      <FormSection
        title={t('set.rcpt.title')}
        dirty={f.dirty}
        saving={f.saving}
        error={f.error}
        stale={f.stale}
        canEdit={canEdit}
        onSave={() => void f.submit()}
        onDiscard={f.discard}>
        <TextField
          label={t('set.rcpt.prefix')}
          help={t('set.rcpt.prefix.help')}
          value={v.receipt_prefix}
          maxLength={8}
          autoCapitalize="characters"
          disabled={!canEdit}
          error={f.fieldError('receipt_prefix')}
          onChange={(x) => f.set('receipt_prefix', x)}
        />
        <TextField
          label={t('set.rcpt.footer')}
          help={t('set.rcpt.footer.help')}
          value={v.receipt_footer}
          maxLength={500}
          multiline
          disabled={!canEdit}
          error={f.fieldError('receipt_footer')}
          onChange={(x) => f.set('receipt_footer', x)}
        />
        <Text variant="caption" tone="muted" style={{ textAlign: 'right' }}>
          {`${(v.receipt_footer ?? '').length} / 500`}
        </Text>
        <RadioList<PosCheckoutSettings['receipt_auto_send']>
          label={t('set.rcpt.auto')}
          value={v.receipt_auto_send}
          disabled={!canEdit}
          error={f.fieldError('receipt_auto_send')}
          onChange={(x) => f.set('receipt_auto_send', x)}
          options={[
            { value: 'ask', label: t('set.rcpt.auto.ask') },
            { value: 'email_if_known', label: t('set.rcpt.auto.email_if_known') },
            { value: 'never', label: t('set.rcpt.auto.never') },
          ]}
        />
      </FormSection>
      {guard}
    </>
  );
}
