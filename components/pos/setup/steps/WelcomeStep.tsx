import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { SetupFrame, useSetupNav, type SetupData } from '@/components/pos/setup/SetupFrame';
import { TickLine } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { profileReady } from '@/lib/pos/setup/business';
import { setupT } from '@/lib/pos/setup/copy';
import { extrasForSentence } from '@/lib/pos/switches/model';
import { useStripeConnect } from '@/lib/queries/useBillingStatus';
import { useSaveSetupProgress } from '@/lib/queries/usePosSetup';
import { spacing } from '@/theme/index';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

/**
 * W0, Welcome (design 6.3, drawn as B1): straight after "Switch on and set up", or from the set-up
 * card. What is ready already (Stripe, the profile's details), that anything can be skipped, then
 * "Let's go" or "I'll do it later" (back to where set-up was opened; the card on Today waits).
 * Opening it stamps when set-up started, once. An extra that did not come on at switch-on is named.
 */
export function WelcomeStep({ data, missed }: { data: SetupData; missed: readonly PosSwitchExtraKey[] }) {
  const { advance, leave } = useSetupNav('welcome');
  const saveProgress = useSaveSetupProgress();
  const stripe = useStripeConnect(Boolean(data.venue.stripe_connected_account_id));
  const stamped = useRef(false);

  useEffect(() => {
    if (data.status.started_at || stamped.current) return;
    stamped.current = true;
    void saveProgress({ started: true });
  }, [data.status.started_at, saveProgress]);

  const stripeDone = stripe.data?.charges_enabled === true;
  const profileDone = profileReady(data.venue);

  return (
    <SetupFrame
      screen="welcome"
      data={data}
      title={setupT('setup.welcome.title')}
      intro={setupT('app.setup.welcome.body')}
      footer={
        <View style={styles.buttons}>
          <Button label={setupT('setup.welcome.start')} size="lg" fullWidth onPress={() => advance()} />
          <Button label={setupT('setup.welcome.later')} variant="ghost" fullWidth onPress={() => leave()} />
        </View>
      }>
      {missed.length > 0 ? (
        <Notice tone="warning">{setupT('app.setup.welcome.missed', { extras: extrasForSentence(missed) })}</Notice>
      ) : null}
      {stripeDone || profileDone ? (
        <View style={styles.ticks}>
          {stripeDone ? <TickLine>{setupT('setup.welcome.done.stripe')}</TickLine> : null}
          {profileDone ? <TickLine>{setupT('setup.welcome.done.profile')}</TickLine> : null}
        </View>
      ) : null}
      <Text variant="bodySmall" tone="muted">
        {setupT('setup.welcome.skipNote')}
      </Text>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  ticks: { gap: spacing.sm },
  buttons: { gap: spacing.sm },
});
