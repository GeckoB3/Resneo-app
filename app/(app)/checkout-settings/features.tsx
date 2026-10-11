import { CashCountToggle, SellProductsToggle, TillsToggle, TrackStockToggle } from '@/components/pos/settings/FeatureToggles';
import { CheckoutSettingsShell, FormSection, useCheckoutSettingsCtx } from '@/components/pos/settings/SettingsParts';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';

/**
 * Features (web `FeaturesCard` in `SimpleCards.tsx`, UX spec §9.16): Track stock, Count cash in till
 * sessions, Use more than one till, and Sell products (POS Part 4, OB3). Each switch saves on its
 * own; there is no Save button.
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
      <SellProductsToggle />
      <TrackStockToggle />
      <CashCountToggle />
      <TillsToggle />
    </FormSection>
  );
}
