import { Stack, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';

import { TapToPaySettings } from '@/components/payments/TapToPaySettings';
import { SetupSection, StatusLine } from '@/components/pos/setup/parts';
import { StripeBlock, useStripeState } from '@/components/pos/setup/StripeBlock';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { TAP_TO_PAY_UPDATE_IOS_MESSAGE } from '@/lib/payments/tap-to-pay-errors';
import { setupT } from '@/lib/pos/setup/copy';
import { androidApiLevel, phoneCanTakeCards, phoneCheck, thisPhoneRegistered, type PhoneCheck } from '@/lib/pos/setup/phone';
import { Notifications } from '@/lib/push/notificationsModule';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useCollectPhones, useRefreshPosBootstrap } from '@/lib/queries/usePosSetup';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

type Permission = 'loading' | 'granted' | 'denied' | 'undetermined' | 'unsupported';

const CHECK_LINE: Record<PhoneCheck, { tone: 'done' | 'warn'; text: () => string }> = {
  iphone_ok: { tone: 'done', text: () => setupT('app.setup.phone.ok.iphone') },
  android_ok: { tone: 'done', text: () => setupT('app.setup.phone.ok.android') },
  iphone_old: { tone: 'warn', text: () => setupT('app.setup.phone.no.iphone') },
  ipad: { tone: 'warn', text: () => setupT('app.setup.phone.no.ipad') },
  android_old: { tone: 'warn', text: () => setupT('app.setup.phone.no.android') },
  ios_update: { tone: 'warn', text: () => TAP_TO_PAY_UPDATE_IOS_MESSAGE },
  other: { tone: 'warn', text: () => setupT('app.setup.phone.no.other') },
};

/**
 * "Get this phone ready" (design 6.6, drawn as C4), from W3 and from "Take cards on your phone" on
 * the set-up card: whether this phone can take cards (an iPhone XS or newer; Android 13 or newer
 * with contactless), whether notifications are on (a sale sent from the desk reaches the phone
 * through them), Tap to Pay on iPhone through the app's own set-up (only an admin accepts Apple's
 * terms; anyone else is told to ask one), and a tick once this phone has registered as ready
 * (`GET /api/venue/pos/collect-phones`, read every five seconds while this screen is on top).
 * Until Stripe can take charges and card payments in person are on, it says what is missing first.
 */
export function PhoneReadyScreen() {
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const accessToken = useAccessToken();
  const { venue } = useVenueContext();
  const staffQuery = useStaffMe();
  const staff = staffQuery.data?.staff ?? null;
  const isAdmin = (staff?.role ?? venue?.current_user_role) === 'admin';
  const tapToPay = useTapToPay();
  const stripe = useStripeState();
  const updateVenue = useUpdateVenue();
  const refreshBootstrap = useRefreshPosBootstrap();
  const focused = useIsFocused();
  const [permission, setPermission] = useState<Permission>(() => (Notifications ? 'loading' : 'unsupported'));
  const [enabling, setEnabling] = useState(false);
  const [inPersonError, setInPersonError] = useState<string | null>(null);

  const inPersonOn = venue?.in_person_payments_enabled === true;
  const ready = stripe.state === 'done' && inPersonOn;
  const check = phoneCheck({
    platform: Platform.OS,
    isPad: Platform.OS === 'ios' && Boolean((Platform as { isPad?: boolean }).isPad),
    buildSupports: buildSupportsTapToPay(),
    probeSupported: Platform.OS === 'ios' && tapToPay.applies ? tapToPay.supported : null,
    updateRequired: tapToPay.updateRequired,
    androidApiLevel: androidApiLevel(Platform.OS, Platform.Version),
  });
  const staffId = staff?.id ?? null;
  const phones = useCollectPhones({
    enabled: ready && phoneCanTakeCards(check),
    poll: focused,
    until: (data) => thisPhoneRegistered(data, staffId, Platform.OS),
  });
  const registered = thisPhoneRegistered(phones.data, staffId, Platform.OS);

  const checkPermission = useCallback(async () => {
    if (!Notifications) return;
    try {
      const result = await Notifications.getPermissionsAsync();
      setPermission(result.status === 'granted' ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    // checkPermission only sets state after an await, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkPermission();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const turnOnNotifications = async () => {
    if (!accessToken) return;
    setEnabling(true);
    try {
      await registerCurrentDeviceForPush({ accessToken, audience: 'staff' });
    } finally {
      setEnabling(false);
      void checkPermission();
    }
  };

  const turnOnInPerson = () => {
    setInPersonError(null);
    updateVenue.mutate(
      { in_person_payments_enabled: true },
      {
        onSuccess: () => void refreshBootstrap(),
        onError: (e) =>
          setInPersonError(e instanceof ApiError && e.status !== 0 && e.status < 500 ? e.message : setupT('app.setup.cards.inPersonFailed')),
      },
    );
  };

  const header = <Stack.Screen options={{ headerShown: true, title: setupT('app.setup.phone.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={setupT('app.setup.off.title')} message={setupT('app.setup.off.body')} />
      </Screen>
    );
  }

  const line = CHECK_LINE[check];
  const canTake = phoneCanTakeCards(check);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {header}

      {stripe.state !== 'done' && !stripe.loading ? (
        <SetupSection>
          <StripeBlock isAdmin={isAdmin} />
        </SetupSection>
      ) : null}

      {!inPersonOn ? (
        <SetupSection>
          <StatusLine tone="warn">{setupT('app.setup.phone.inPersonOff')}</StatusLine>
          {isAdmin ? (
            <Button label={setupT('app.setup.phone.inPersonOn')} onPress={turnOnInPerson} loading={updateVenue.isPending} fullWidth />
          ) : (
            <Text variant="caption" tone="muted">
              {setupT('app.setup.phone.inPersonAdmin')}
            </Text>
          )}
          {inPersonError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {inPersonError}
            </Text>
          ) : null}
        </SetupSection>
      ) : null}

      <View style={styles.lines}>
        <StatusLine tone={line.tone}>{line.text()}</StatusLine>
        {permission === 'granted' ? <StatusLine tone="done">{setupT('app.setup.phone.notifications.on')}</StatusLine> : null}
        {permission === 'undetermined' ? <StatusLine tone="warn">{setupT('app.setup.phone.notifications.off')}</StatusLine> : null}
        {permission === 'denied' ? <StatusLine tone="warn">{setupT('app.setup.phone.notifications.denied')}</StatusLine> : null}
        {/* Apple's own answer, once the warm-up has it (unknown says nothing). */}
        {Platform.OS === 'ios' && tapToPay.applies && canTake && tapToPay.termsAccepted !== null ? (
          <StatusLine tone={tapToPay.termsAccepted === true ? 'done' : 'warn'}>
            {tapToPay.termsAccepted === true ? setupT('app.setup.phone.ttp.ready') : setupT('app.setup.phone.ttp.todo')}
          </StatusLine>
        ) : null}
        {ready && canTake ? (
          registered ? (
            <StatusLine tone="done">{setupT('app.setup.phone.ready')}</StatusLine>
          ) : (
            <StatusLine tone="wait">{setupT('app.setup.phone.waiting')}</StatusLine>
          )
        ) : null}
      </View>

      {permission === 'undetermined' ? (
        <Button label={setupT('app.setup.phone.notifications.turnOn')} variant="secondary" onPress={() => void turnOnNotifications()} loading={enabling} fullWidth />
      ) : null}
      {permission === 'denied' ? (
        <Button
          label={setupT('app.setup.phone.notifications.settings')}
          variant="secondary"
          onPress={() => void Linking.openSettings().catch(() => undefined)}
          fullWidth
        />
      ) : null}

      {Platform.OS === 'ios' && tapToPay.applies && canTake ? (
        <View style={styles.lines}>
          {/* The app's own Tap to Pay on iPhone set-up and "How to use", as in Booking settings (Apple's checklist). */}
          <Card padded={false}>
            <TapToPaySettings />
          </Card>
          <Text variant="caption" tone="muted">
            {setupT('app.setup.phone.ttp.once')}
          </Text>
        </View>
      ) : null}

      <Text variant="caption" tone="muted">
        {setupT('app.setup.phone.devices')}
      </Text>

      <Button label={setupT('app.setup.phone.done')} size="lg" fullWidth onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing['3xl'] },
  lines: { gap: spacing.sm },
});
