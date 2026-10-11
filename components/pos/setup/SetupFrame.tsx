import { useQueryClient } from '@tanstack/react-query';
import { type Href, Stack, useNavigation, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/pos/setup/parts';
import { TextLink } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { isLoyaltyEnabled, isShopEnabled, isVouchersEnabled } from '@/lib/pos/pos-enabled';
import { sellProductsFact } from '@/lib/pos/setup/answers';
import { setupT } from '@/lib/pos/setup/copy';
import { nextScreen, setupHref, setupRoutesOnTop, setupScreens, stepCount, type SetupFlowFacts } from '@/lib/pos/setup/flow';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { settingsKeys, useCheckoutSettingsQuery } from '@/lib/queries/useCheckoutSettings';
import { usePosEnabled } from '@/lib/queries/usePos';
import { setupKeys, usePosSetupStatus } from '@/lib/queries/usePosSetup';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { PosSetupScreen, PosSetupStatus } from '@/types/pos-setup';
import type { PosSettingsResponse } from '@/types/pos-settings';
import type { VenueBootstrap } from '@/types/venue';

/**
 * The frame every set-up screen sits in (design 6.1: a step count at the top on a phone, "Save and
 * finish later" always there, every step skippable), the gate in front of it (admins only, with
 * Checkout on), and how a screen moves on.
 *
 * Progress lives on the server (`pos_setup_progress`), never on the phone, so leaving at any point
 * keeps every answer given so far, and the set-up card on Today picks up where the owner stopped.
 */

/** What every screen reads: the set-up status, Checkout's settings and the venue. */
export interface SetupData {
  status: PosSetupStatus;
  settings: PosSettingsResponse;
  venue: VenueBootstrap;
}

/** The flow's facts from what is on screen, or from what the caches hold right now. */
export function flowFacts(input: {
  status: Pick<PosSetupStatus, 'answers' | 'steps'> | null | undefined;
  settings: Pick<PosSettingsResponse, 'settings'> | null | undefined;
  venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined;
}): SetupFlowFacts {
  return {
    answers: input.status?.answers ?? {},
    steps: input.status?.steps ?? [],
    sellProducts: sellProductsFact(input.settings?.settings, input.status?.answers),
    extras: {
      vouchers: isVouchersEnabled(input.venue),
      loyalty: isLoyaltyEnabled(input.venue),
      shop: isShopEnabled(input.venue),
    },
  };
}

/**
 * Moving through the wizard. `advance` pushes the next screen of this venue's flow, worked out when
 * it is pressed from what the caches hold then (a screen's own writes, an extra just switched on,
 * "Sell products" just turned off, are all in). `leave` takes the owner back to where set-up was
 * opened from, every screen of the wizard at once, then optionally on to `then`.
 */
export function useSetupNav(screen: PosSetupScreen) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();

  const currentFlow = useCallback(
    (fresh?: PosSetupStatus | null) =>
      setupScreens(
        flowFacts({
          status: fresh ?? queryClient.getQueryData<PosSetupStatus>(setupKeys.status(accessToken)),
          settings: queryClient.getQueryData<PosSettingsResponse>(settingsKeys.settings(accessToken)),
          venue: queryClient.getQueryData<VenueBootstrap>(queryKeys.venue.bootstrap(accessToken)),
        }),
      ),
    [accessToken, queryClient],
  );

  const advance = useCallback(
    (fresh?: PosSetupStatus | null) => {
      router.push(setupHref(nextScreen(screen, currentFlow(fresh))) as Href);
    },
    [currentFlow, router, screen],
  );

  const leave = useCallback(
    (then?: { href: string; routeName: string }) => {
      const routes = (navigation.getState()?.routes ?? []) as { name?: string }[];
      const count = setupRoutesOnTop(routes);
      if (count > 0 && count < routes.length) {
        router.dismiss(count);
        // Set-up opened from that screen already (switching on from Checkout): it is there now.
        const below = routes[routes.length - 1 - count];
        if (then && below?.name !== then.routeName) router.push(then.href as Href);
        return;
      }
      // Set-up was the first screen (opened from a link): there is nothing to go back to.
      router.replace((then?.href ?? '/') as Href);
    },
    [navigation, router],
  );

  return { advance, leave, currentFlow };
}

/**
 * Admins only, with Checkout on (design 6.1). Loads the status and Checkout's settings, and shows a
 * plain state instead of the screen while they load, when either fails, when Checkout is off (the
 * answers are kept) and to anyone who is not an admin.
 */
export function SetupGate({ children }: { children: (data: SetupData) => ReactNode }) {
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const { venue } = useVenueContext();
  const staffQuery = useStaffMe();
  const role = staffQuery.data?.staff?.role ?? venue?.current_user_role ?? null;
  const isAdmin = role === 'admin';
  const statusQuery = usePosSetupStatus({ enabled: isAdmin });
  const settingsQuery = useCheckoutSettingsQuery({ enabled: isAdmin });
  const header = <Stack.Screen options={{ headerShown: true, title: setupT('setup.page.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState
          title={setupT('app.setup.off.title')}
          message={setupT('app.setup.off.body')}
          actionLabel={setupT('app.setup.toSettings')}
          onAction={() => router.replace('/checkout-settings' as Href)}
        />
      </Screen>
    );
  }
  if (!role && staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title={setupT('app.setup.adminOnly.title')} message={setupT('app.setup.adminOnly.body')} />
      </Screen>
    );
  }
  if (statusQuery.isError || settingsQuery.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          title={setupT('app.setup.loadError.title')}
          message={setupT('setup.error.network')}
          onRetry={() => {
            void statusQuery.refetch();
            void settingsQuery.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!statusQuery.data || !settingsQuery.data || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  return <>{children({ status: statusQuery.data, settings: settingsQuery.data, venue })}</>;
}

/**
 * One set-up screen: "Save and finish later" and the step count on top, the question, the body,
 * then its buttons. The body scrolls and keeps the focused box above the keyboard.
 */
export function SetupFrame({
  screen,
  data,
  title,
  intro,
  children,
  footer,
  showCount = true,
}: {
  screen: PosSetupScreen;
  data: SetupData;
  title: string;
  intro?: string | null;
  children?: ReactNode;
  footer?: ReactNode;
  showCount?: boolean;
}) {
  const { leave } = useSetupNav(screen);
  const count = stepCount(screen, setupScreens(flowFacts(data)));
  const countText = setupT('setup.stepCount', { n: count.n, total: count.total });
  return (
    <Screen scroll keyboardAvoiding keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: setupT('setup.page.title') }} />
      {showCount ? (
        <View style={styles.bar}>
          <View style={styles.barTop}>
            <TextLink label={setupT('setup.saveLater')} onPress={() => leave()} />
            <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
              {countText}
            </Text>
          </View>
          <ProgressBar done={count.n} total={count.total} label={countText} />
        </View>
      ) : null}
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {intro ? (
          <Text variant="body" tone="secondary">
            {intro}
          </Text>
        ) : null}
      </View>
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Screen>
  );
}

/**
 * The usual buttons: Continue, and "Skip for now" under it (the first screens have no skip). The
 * busy one spins; both wait while anything is being saved.
 */
export function SetupButtons({
  onContinue,
  onSkip,
  busy = null,
  continueLabel = setupT('setup.continue'),
  skipLabel = setupT('setup.skip'),
  continueDisabled = false,
  error,
}: {
  onContinue: () => void;
  onSkip?: (() => void) | null;
  busy?: 'continue' | 'skip' | null;
  continueLabel?: string;
  skipLabel?: string;
  continueDisabled?: boolean;
  error?: string | null;
}) {
  return (
    <View style={styles.buttons}>
      {error ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label={continueLabel}
        size="lg"
        fullWidth
        onPress={onContinue}
        loading={busy === 'continue'}
        disabled={busy !== null || continueDisabled}
      />
      {onSkip ? (
        <Button label={skipLabel} variant="ghost" fullWidth onPress={onSkip} loading={busy === 'skip'} disabled={busy !== null} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing['3xl'] },
  bar: { gap: spacing.sm },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  head: { gap: spacing.sm },
  footer: { gap: spacing.sm },
  buttons: { gap: spacing.sm, paddingTop: spacing.sm },
});
