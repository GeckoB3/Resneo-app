import { CashCountToggle, TillsToggle, TrackStockToggle } from '@/components/pos/settings/FeatureToggles';
import { CheckoutSettingsShell, FormSection, useCheckoutSettingsCtx } from '@/components/pos/settings/SettingsParts';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';

/**
 * Features (web `FeaturesCard` in `SimpleCards.tsx`, UX spec §9.16): Track stock, Count cash in till
 * sessions and Use more than one till. Each switch saves on its own; there is no Save button.
 */
export default function FeaturesSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['feat.title']}>
      <FeaturesSection />
    </CheckoutSettingsShell>
  );
}

function FeaturesSection() {
  const { t } = useCheckoutSettingsCtx();
  return (
    <FormSection title={t('feat.title')} description={t('feat.help')}>
      <TrackStockToggle />
      <CashCountToggle />
      <TillsToggle />
    </FormSection>
  );
}
