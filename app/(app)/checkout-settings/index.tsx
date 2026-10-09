import { type Href, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MoreRow } from '@/components/more/MoreRow';
import { CheckoutSettingsShell, useCheckoutSettingsCtx } from '@/components/pos/settings/SettingsParts';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { TILE } from '@/lib/navigation/more-destinations';
import { checkoutSettingsHref, visibleCheckoutSettingsSections } from '@/lib/pos/checkout-settings-sections';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { spacing } from '@/theme/index';

/**
 * Checkout settings in the app (web: Settings, Checkout; `CheckoutSettingsSection.tsx`). One row
 * per web card, in the web's order and gated as the web shows each card
 * (`lib/pos/checkout-settings-sections.ts`); each row opens its own screen. Admins, and team members
 * with `manage_settings`, can open it (the shell says so to anyone else).
 */
export default function CheckoutSettingsHub() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['app.set.title']}>
      <Rows />
    </CheckoutSettingsShell>
  );
}

function Rows() {
  const router = useRouter();
  const { data, t, vouchersEnabled, loyaltyEnabled, shopEnabled } = useCheckoutSettingsCtx();
  const sections = visibleCheckoutSettingsSections({
    can: data.can,
    staffCapabilityMap: data.staff_capability_map,
    trackStockEnabled: data.settings.track_stock_enabled === true,
    vouchersEnabled,
    loyaltyEnabled,
    shopEnabled,
  });
  return (
    <View style={styles.stack}>
      <Text variant="bodySmall" tone="secondary">
        {t('app.set.intro')}
      </Text>
      <Card padded={false}>
        {sections.map((s, i) => (
          <MoreRow
            key={s.slug}
            isFirst={i === 0}
            icon={s.icon}
            tile={TILE.navy}
            label={t(s.title)}
            hint={t(s.hint)}
            // Some of these routes are built beside this screen set; a plain string keeps typed
            // routes happy until every route file is in the tree.
            onPress={() => router.push(checkoutSettingsHref(s.slug) as Href)}
          />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
