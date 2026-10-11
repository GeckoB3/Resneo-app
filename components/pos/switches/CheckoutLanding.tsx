import { type Href, Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Notice, usePosT } from '@/components/pos/parts';
import { CheckoutGlyph, SWITCH_ICONS, TextLink, TickLine, TickRow } from '@/components/pos/switches/parts';
import { SwitchOnSheet } from '@/components/pos/switches/SwitchOnSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posFinishingOpen, posOffer } from '@/lib/pos/pos-enabled';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { extraLanding, swT } from '@/lib/pos/switches/copy';
import { landingExtras, landingState, pausedSentence } from '@/lib/pos/switches/model';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

/** Where Sales history opens while Checkout is off (read only, refunds for admins). */
export const SALES_HISTORY_HREF = '/checkout/all-sales';

/** Where switching on lands: Checkout settings, saying "Checkout is on. Let's get it ready." */
export function welcomeHref(missed: readonly PosSwitchExtraKey[]): string {
  return `/checkout-settings?welcome=1${missed.length ? `&missed=${missed.join(',')}` : ''}`;
}

/**
 * Checkout while it is off (POS Part 5, design section 14 steps 2 and 8, drawn as C2): the Checkout
 * tile's page (`/checkout`) and, while off, Checkout settings too (`variant="settings"`), as the web
 * shows the landing on the Checkout page and in Settings, Checkout.
 *
 * For an admin of an offered venue: what Checkout is, the extras the dial offers as ticks, what it
 * costs ("Included in your plan"), what they'll need, the collective sentence at a collective, and
 * "Switch on Checkout", which opens the confirmation sheet. Otherwise the state in place of the
 * button: paused by ResNeo (with its public reason) or for everyone, pounds only, the plan needing
 * attention, not available yet (today's words), and for a team member "Ask an admin to switch on
 * Checkout." (SW1). While the venue has had Checkout, Sales history is one tap away.
 *
 * No selling and no prices: Checkout is included in every plan (SW3).
 */
export function CheckoutLanding({ variant = 'checkout' }: { variant?: 'checkout' | 'settings' }) {
  const t = usePosT();
  const router = useRouter();
  const { colors } = useTheme();
  const { venue, refetch: refetchVenue } = useVenueContext();
  const staffQuery = useStaffMe();
  const role = staffQuery.data?.staff?.role ?? venue?.current_user_role ?? null;
  const isAdmin = role === 'admin';
  const offer = posOffer(venue);
  // Read only while offered: a cached answer from when Checkout was on must not decide a pause.
  const wantsSwitches = isAdmin && offer.state === 'available';
  const switchesQuery = useFeatureSwitches({ enabled: wantsSwitches });
  const res = wantsSwitches ? (switchesQuery.data ?? null) : null;
  const state = landingState({ isAdmin, offer, switches: res });
  const finishing = posFinishingOpen(venue);
  const venueName = res?.venue?.name?.trim() || venue?.name?.trim() || 'your business';
  const [ticked, setTicked] = useState<PosSwitchExtraKey[]>([]);
  const [confirming, setConfirming] = useState(false);

  const title = variant === 'settings' ? SETTINGS_COPY['app.set.title'] : t('till.title');
  const header = <Stack.Screen options={{ headerShown: true, title }} />;

  // The switches say Checkout is on, so the venue the app holds is behind: read it again.
  useEffect(() => {
    if (state.kind === 'on') refetchVenue();
  }, [state.kind, refetchVenue]);

  const salesHistory = finishing && isAdmin ? () => router.push(SALES_HISTORY_HREF as Href) : undefined;

  if (!role && staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (state.kind === 'staff') {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={swT('app.sw.adminOnly')} />
      </Screen>
    );
  }
  if (state.kind === 'on') {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (state.kind === 'paused' || state.kind === 'environment') {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<SymbolView name={SWITCH_ICONS.pause} tintColor={colors.warning} size={44} />}
          title={swT('sw.na.paused.title')}
          message={state.kind === 'environment' ? swT('sw.na.env') : pausedSentence(venueName, state.publicReason)}
          actionLabel={salesHistory ? t('hist.link') : undefined}
          onAction={salesHistory}
        />
      </Screen>
    );
  }
  if (state.kind === 'unavailable') {
    // Not offered yet (or not eligible for another reason): today's `till.off` words.
    return (
      <Screen>
        {header}
        <EmptyState
          title={t('till.off.title')}
          message={t('till.off.body', { venue: venue?.name?.trim() || 'your venue' })}
          actionLabel={salesHistory ? t('hist.link') : undefined}
          onAction={salesHistory}
        />
      </Screen>
    );
  }

  const extras = state.kind === 'available' ? landingExtras(res) : [];
  const collective = res?.venue?.collective_name?.trim() || null;
  const stripeDone = res?.prerequisites?.stripe_connected === true;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <CheckoutGlyph size={52} />
        <View style={styles.hero}>
          <Text variant="title" accessibilityRole="header">
            {swT('app.sw.title')}
          </Text>
          <Text variant="body" tone="secondary">
            {swT('app.sw.body')}
          </Text>
        </View>

        {state.kind === 'currency' || state.kind === 'billing' ? (
          <Notice tone="warning">{state.kind === 'currency' ? swT('sw.na.currency') : swT('app.sw.na.billing')}</Notice>
        ) : (
          <>
            {collective ? <Notice>{swT('sw.landing.collective', { venue: venueName, collective })}</Notice> : null}

            {extras.length > 0 ? (
              <Card>
                <View style={styles.stack}>
                  <Text variant="label">{swT('sw.landing.extras.title')}</Text>
                  {extras.map((key) => (
                    <TickRow
                      key={key}
                      title={extraLanding(key).name}
                      detail={extraLanding(key).description}
                      checked={ticked.includes(key)}
                      onChange={(on) => setTicked((list) => (on ? [...list, key] : list.filter((k) => k !== key)))}
                    />
                  ))}
                  <Text variant="caption" tone="muted">
                    {swT('sw.landing.extras.help')}
                  </Text>
                </View>
              </Card>
            ) : null}

            <Card>
              <View style={styles.block}>
                <Text variant="label">{swT('sw.landing.cost.title')}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {swT('sw.landing.cost.included')}
                </Text>
              </View>
            </Card>

            <Card>
              <View style={styles.block}>
                <Text variant="label">{swT('sw.landing.need.title')}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {swT('sw.landing.need.nothing')}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {swT('sw.landing.need.cards')}
                </Text>
                {stripeDone ? <TickLine>{swT('sw.landing.need.stripeDone')}</TickLine> : null}
              </View>
            </Card>

            {switchesQuery.isError && !res ? (
              <Notice tone="warning" action={{ label: swT('sw.error.tryAgain'), onPress: () => void switchesQuery.refetch() }}>
                {swT('sw.error.load')}
              </Notice>
            ) : null}

            <View style={styles.block}>
              <Button
                label={swT('app.sw.switchOn')}
                size="lg"
                fullWidth
                loading={switchesQuery.isLoading}
                disabled={!res}
                onPress={() => setConfirming(true)}
              />
              <Text variant="caption" tone="muted" style={styles.centre}>
                {swT('sw.landing.small')}
              </Text>
            </View>
          </>
        )}

        {salesHistory ? (
          <View style={styles.centreRow}>
            <TextLink label={t('hist.link')} onPress={salesHistory} />
          </View>
        ) : null}
      </ScrollView>

      {res && state.kind === 'available' ? (
        <SwitchOnSheet
          visible={confirming}
          onClose={() => setConfirming(false)}
          venueName={venueName}
          switches={res}
          ticked={ticked}
          onDone={({ missed }) => {
            setConfirming(false);
            if (variant === 'settings') router.setParams({ welcome: '1', missed: missed.join(',') });
            else router.push(welcomeHref(missed) as Href);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  hero: { gap: spacing.sm },
  stack: { gap: spacing.sm },
  block: { gap: spacing.xs },
  centre: { textAlign: 'center' },
  centreRow: { alignItems: 'center', paddingTop: spacing.sm },
});
