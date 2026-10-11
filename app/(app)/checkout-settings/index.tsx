import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MoreRow } from '@/components/more/MoreRow';
import { CheckoutLanding } from '@/components/pos/switches/CheckoutLanding';
import { CheckoutOnGroup, SwitchOffCheckout } from '@/components/pos/switches/CheckoutOnGroup';
import { CheckoutSettingsShell, useCheckoutSettingsCtx } from '@/components/pos/settings/SettingsParts';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { TILE } from '@/lib/navigation/more-destinations';
import { checkoutSettingsHref, groupedCheckoutSettingsSections } from '@/lib/pos/checkout-settings-sections';
import { isPosEnabled, posOffer } from '@/lib/pos/pos-enabled';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { parseMissedExtras } from '@/lib/pos/switches/model';
import { useVenue } from '@/lib/queries/useVenue';
import { spacing } from '@/theme/index';

/**
 * Checkout settings in the app (web: Settings, Checkout; `CheckoutSettingsSection.tsx`). One row
 * per web card, in the web's order and gated as the web shows each card
 * (`lib/pos/checkout-settings-sections.ts`); each row opens its own screen. Admins, and team members
 * with `manage_settings`, can open it (the shell says so to anyone else).
 *
 * Switching Checkout on and off (POS Part 5): for admins, "Checkout is on" with the three extras
 * and the History sits on top, and "Switch off Checkout" at the bottom. While Checkout is off, an
 * admin of a venue offered it (or paused by ResNeo) gets the landing here, as on the web.
 */
export default function CheckoutSettingsHub() {
  const venue = useVenue();
  const offer = posOffer(venue.data).state;
  if (!isPosEnabled(venue.data) && (offer === 'available' || offer === 'paused')) {
    return <CheckoutLanding variant="settings" />;
  }
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['app.set.title']}>
      <Rows />
    </CheckoutSettingsShell>
  );
}

function Rows() {
  const router = useRouter();
  const params = useLocalSearchParams<{ welcome?: string; missed?: string }>();
  const { data, t, vouchersEnabled, loyaltyEnabled, shopEnabled } = useCheckoutSettingsCtx();
  const groups = groupedCheckoutSettingsSections({
    can: data.can,
    staffCapabilityMap: data.staff_capability_map,
    trackStockEnabled: data.settings.track_stock_enabled === true,
    vouchersEnabled,
    loyaltyEnabled,
    shopEnabled,
  });
  // Switching Checkout and its extras on and off is for admins only (SW1).
  const isAdmin = data.can.is_admin === true;
  const timeZone = data.venue?.timezone || 'Europe/London';
  return (
    <View style={styles.stack}>
      {isAdmin ? (
        <CheckoutOnGroup
          welcome={params.welcome === '1'}
          missed={parseMissedExtras(params.missed)}
          timeZone={timeZone}
          venueName={data.venue?.name?.trim() || 'your business'}
        />
      ) : null}
      <Text variant="bodySmall" tone="secondary">
        {t('app.set.intro')}
      </Text>
      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text variant="overline" tone="muted" style={styles.groupTitle}>
            {g.title}
          </Text>
          <Card padded={false}>
            {g.sections.map((s, i) => (
              <MoreRow
                key={s.slug}
                isFirst={i === 0}
                icon={s.icon}
                tile={TILE.navy}
                label={t(s.title)}
                hint={t(s.hint)}
                // A plain string keeps typed routes happy for the routes built beside this screen.
                onPress={() => router.push(checkoutSettingsHref(s.slug) as Href)}
              />
            ))}
          </Card>
        </View>
      ))}
      {isAdmin ? <SwitchOffCheckout timeZone={timeZone} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  group: { gap: spacing.sm },
  groupTitle: { paddingHorizontal: spacing.xs },
});
