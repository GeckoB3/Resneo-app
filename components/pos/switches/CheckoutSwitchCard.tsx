import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { welcomeHref } from '@/components/pos/switches/CheckoutLanding';
import { TextLink } from '@/components/pos/switches/parts';
import { SwitchOffSheet } from '@/components/pos/switches/SwitchOffSheet';
import { SwitchOnSheet } from '@/components/pos/switches/SwitchOnSheet';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { swT } from '@/lib/pos/switches/copy';
import { bookingSettingsSwitch, sinceLine } from '@/lib/pos/switches/model';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Checkout settings, where the extras (gift vouchers, loyalty card, online shop) are. */
export const CHECKOUT_SETTINGS_HREF = '/checkout-settings';
/** Plan & payments, where a plan that needs attention is sorted. */
export const PLAN_HREF = '/manage/plan';

/**
 * Booking settings, the Checkout switch, under "Take card payments at your venue" (the web's
 * `CheckoutSwitchSection` in Settings, Booking Settings). It is the same switch as the landing's
 * "Switch on Checkout" and Checkout settings' "Switch off Checkout" (`POST
 * /api/venue/feature-switches`): switching on goes through the one confirmation (with the seller's
 * tick at the first switch-on, and no extras) and on to the set-up wizard; switching off goes
 * through the sheet that refuses while money is moving, and stays here with a toast. The venue and
 * the POS bootstrap are read again by the switch call itself, so the menus follow.
 *
 * The extras stay in Checkout settings. A venue ResNeo has not offered Checkout to sees nothing
 * here (gate G0), and nothing shows while the switches cannot be read (a team member, an older
 * server). Admins only: the screen it sits on is.
 */
export function CheckoutSwitchCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const query = useFeatureSwitches();
  const [sheet, setSheet] = useState<'on' | 'off' | null>(null);

  if (query.isLoading) {
    return (
      <View testID="checkout-switch-loading">
        <Skeleton height={112} radius={radius.card} />
      </View>
    );
  }
  const res = query.data ?? null;
  const venueName = res?.venue?.name?.trim() || venue?.name?.trim() || 'your business';
  const card = bookingSettingsSwitch(res, venueName);
  if (!res || !card) return null;

  const timeZone = venue?.timezone || 'Europe/London';
  const since = card.on ? (sinceLine(res, timeZone) ?? swT('sw.panel.title')) : swT('sw.bs.off.help');

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.head}>
          <Text variant="overline" tone="muted">
            {swT('sw.bs.eyebrow')}
          </Text>
          <Text variant="label">{swT('sw.landing.title')}</Text>
          <Text variant="caption" tone="muted">
            {swT('sw.offer.body')}
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="bodyMedium">{swT('sw.bs.switch')}</Text>
            <Text variant="caption" tone="muted">
              {since}
            </Text>
          </View>
          <Switch
            value={card.on}
            onValueChange={() => setSheet(card.on ? 'off' : 'on')}
            disabled={!card.canToggle}
            accessibilityLabel={swT('sw.bs.switch')}
            accessibilityState={{ checked: card.on, disabled: !card.canToggle }}
            trackColor={{ true: colors.brand }}
          />
        </View>

        {card.note ? (
          <View testID="checkout-switch-note" style={styles.stack}>
            <Notice tone="warning">{card.note}</Notice>
            {card.billingLink ? <TextLink label={swT('app.sw.na.billing.link')} onPress={() => router.push(PLAN_HREF as Href)} /> : null}
          </View>
        ) : null}

        {card.on ? (
          <View style={[styles.onBox, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
            <Text variant="bodySmall" tone="secondary">
              {swT('app.sw.bs.on.help')}
            </Text>
            <TextLink label={swT('sw.bs.settings')} onPress={() => router.push(CHECKOUT_SETTINGS_HREF as Href)} />
          </View>
        ) : null}
      </View>

      <SwitchOnSheet
        visible={sheet === 'on'}
        onClose={() => setSheet(null)}
        venueName={venueName}
        switches={res}
        ticked={[]}
        onDone={({ missed }) => {
          setSheet(null);
          // Straight into set-up, as the landing does; Booking settings stays underneath.
          router.push(welcomeHref(missed) as Href);
        }}
      />
      <SwitchOffSheet feature="pos_enabled" visible={sheet === 'off'} onClose={() => setSheet(null)} timeZone={timeZone} />
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  head: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.base, minHeight: 44 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  onBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
