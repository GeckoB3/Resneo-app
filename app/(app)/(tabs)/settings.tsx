import Constants from 'expo-constants';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { FeatureTile } from '@/components/more/FeatureTile';
import { MoreHero } from '@/components/more/MoreHero';
import { MoreRow } from '@/components/more/MoreRow';
import { PrimaryTile } from '@/components/more/PrimaryTile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import {
  buildDestinations,
  LIST_GROUPS,
  type Destination,
} from '@/lib/navigation/more-destinations';
import { useBillingStatus } from '@/lib/queries/useBillingStatus';
import { useNotifications } from '@/lib/queries/useNotifications';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useAppLock } from '@/providers/AppLockProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { StaffRole } from '@/types/staff';
import type { BookingModel } from '@/types/venue';

/**
 * Subscription/plan statuses that warrant a warning banner. These are the exact
 * values the billing backend emits (`PlanStatus`) — the old set used Stripe-ish
 * names (`canceled`/`unpaid`/`expired`) the server never writes, and omitted the
 * real `cancelling`, so the banner could never fire.
 */
const WARN_PLAN_STATUSES = new Set(['past_due', 'cancelling', 'cancelled']);

/** Resolve a staff-dashboard URL on the WEB origin (not the API origin). */
function webDashboardUrl(path = '/dashboard'): string {
  const base = getWebUrl();
  return base ? `${base}${path}` : `https://reserve-ni.vercel.app${path}`;
}

function formatStaffRole(role: StaffRole): string {
  return role === 'admin' ? 'Admin' : 'Staff';
}

/** Time-of-day eyebrow for the hero. */
function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Uppercase section header sitting above its inset group. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="overline" tone="muted" style={styles.groupTitle}>
          {title}
        </Text>
      ) : null}
      <Card padded={false}>{children}</Card>
    </View>
  );
}

/**
 * More tab — the entry point to every surface beyond Calendar / Appointments /
 * Contacts. A brand-gradient identity hero, a searchable index of every
 * destination, a "quick actions" grid of the daily-driver tools, and the full
 * grouped settings list.
 */
export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const toast = useToast();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const { venue, name: venueName, isLoading: venueLoading } = useVenueContext();
  const notificationsQuery = useNotifications();
  const { appLockEnabled, setAppLockEnabled, supported: appLockSupported } = useAppLock();
  const [query, setQuery] = useState('');
  const [appLockBusy, setAppLockBusy] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const staff = staffData?.staff;
  const isAdmin = staff?.role === 'admin';
  const appVersion = Constants.expoConfig?.version ?? '—';
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  // Live subscription status drives the billing-problem nudge. `plan_status` is
  // NOT on the venue bootstrap (GET /api/venue omits it), so read it from the
  // admin-only billing endpoint — gated so non-admins never hit (and 403) it.
  const billingStatusQuery = useBillingStatus(isAdmin);
  const planStatus = billingStatusQuery.data?.plan_status ?? null;
  const showPlanWarning = isAdmin && planStatus != null && WARN_PLAN_STATUSES.has(planStatus);

  // In-app browser tab (SFSafariViewController / Chrome Custom Tab) so web
  // content opens without bouncing the user out of the app.
  const openWeb = useCallback(
    (path: string) => {
      const url = webDashboardUrl(path);
      void WebBrowser.openBrowserAsync(url).catch(() =>
        Linking.openURL(url).catch(() => toast.error('Could not open the browser.')),
      );
    },
    [toast],
  );

  // Toggle the opt-in biometric lock. Enabling prompts for Face ID/passcode
  // (handled inside the provider); if the user cancels, the switch stays off.
  const handleAppLockToggle = useCallback(
    async (next: boolean) => {
      setAppLockBusy(true);
      try {
        const ok = await setAppLockEnabled(next);
        if (ok) {
          toast.success(next ? 'Biometric lock turned on.' : 'Biometric lock turned off.');
        } else if (next) {
          // Auth was cancelled/failed, or the preference could not be saved.
          toast.info('Biometric lock was not turned on.');
        }
      } finally {
        setAppLockBusy(false);
      }
    },
    [setAppLockEnabled, toast],
  );

  // Build the full, role- and eligibility-aware index once. The grid, the
  // grouped list and search all derive from this single array. Gating lives in
  // the pure `buildDestinations` builder (unit-tested separately).
  const destinations = useMemo<Destination[]>(() => {
    const enabledModels = new Set<BookingModel>([
      ...(venue?.active_booking_models ?? []),
      ...(venue?.enabled_models ?? []),
      ...(venue?.booking_model ? [venue.booking_model] : []),
    ]);
    return buildDestinations({
      isAdmin,
      enabledModels,
      pricingTier: venue?.pricing_tier,
      complianceEnabled: venue?.feature_flags?.resolved?.compliance_records_enabled === true,
      waitlistEnabled: venue?.feature_flags?.resolved?.waitlist_v2 === true,
    });
  }, [isAdmin, venue]);

  const handlePress = useCallback(
    (dest: Destination) => {
      if (dest.kind === 'route' && dest.target) router.push(dest.target as Href);
      else if (dest.kind === 'web' && dest.target) openWeb(dest.target);
    },
    [router, openWeb],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmedQuery) return [];
    return destinations.filter(
      (d) =>
        d.label.toLowerCase().includes(trimmedQuery) ||
        d.hint.toLowerCase().includes(trimmedQuery) ||
        d.keywords?.some((k) => k.toLowerCase().includes(trimmedQuery)),
    );
  }, [destinations, trimmedQuery]);

  // The hero tile (single most-used) sits above the two-up grid of the other
  // daily-driver tools, giving the top zone a clear size hierarchy.
  const primary = useMemo(() => destinations.find((d) => d.primary) ?? null, [destinations]);
  const featured = useMemo(
    () => destinations.filter((d) => d.featured && !d.primary),
    [destinations],
  );

  if (staffLoading || venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.content}>
      <MoreHero
        name={staff?.name ?? 'Staff member'}
        subtitle={venueName ?? staff?.email ?? ''}
        roleLabel={staff ? formatStaffRole(staff.role) : ''}
        greeting={greetingFor()}
        unreadCount={unreadCount}
        onPressProfile={() => router.push('/manage/account' as Href)}
        onPressNotifications={() => router.push('/notifications' as Href)}
      />

      {/* Plan warning banner for admins when billing has an issue */}
      {showPlanWarning ? (
        <PressableScale
          onPress={() => router.push('/manage/plan' as Href)}
          accessibilityLabel="Plan issue — tap to view billing"
          style={[
            styles.planWarning,
            { backgroundColor: colors.warningSurface, borderColor: colors.warning },
          ]}>
          <SymbolView
            name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
            tintColor={colors.warning}
            size={18}
          />
          <View style={styles.planWarningText}>
            <Text variant="label" color={colors.warning}>
              Subscription issue
            </Text>
            <Text variant="caption" color={colors.warning}>
              Your plan is {planStatus}. Tap to manage billing.
            </Text>
          </View>
        </PressableScale>
      ) : null}

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search settings"
        accessibilityLabel="Search settings"
      />

      {trimmedQuery ? (
        results.length ? (
          <Group title="Results">
            {results.map((dest, index) => (
              <MoreRow
                key={dest.id}
                isFirst={index === 0}
                icon={dest.icon}
                tile={dest.tile}
                label={dest.label}
                hint={dest.hint}
                external={dest.external}
                onPress={() => handlePress(dest)}
              />
            ))}
          </Group>
        ) : (
          <View style={styles.noResults}>
            <Text variant="bodySmall" tone="muted">
              No settings match “{query.trim()}”.
            </Text>
          </View>
        )
      ) : (
        <>
          <View style={styles.section}>
            <Text variant="overline" tone="muted" style={styles.sectionLabel}>
              Quick actions
            </Text>
            {primary ? (
              <PrimaryTile
                icon={primary.icon}
                tint={primary.tile}
                label={primary.label}
                hint={primary.hint}
                onPress={() => handlePress(primary)}
              />
            ) : null}
            {featured.length ? (
              <View style={styles.grid}>
                {featured.map((dest) => (
                  <FeatureTile
                    key={dest.id}
                    icon={dest.icon}
                    tint={dest.tile}
                    label={dest.label}
                    hint={dest.hint}
                    onPress={() => handlePress(dest)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {LIST_GROUPS.map((g) => {
            const rows = destinations.filter((d) => d.group === g.key);
            if (rows.length === 0) return null;
            return (
              <Group key={g.key} title={g.title}>
                {rows.map((dest, index) => (
                  <MoreRow
                    key={dest.id}
                    isFirst={index === 0}
                    icon={dest.icon}
                    tile={dest.tile}
                    label={dest.label}
                    hint={dest.hint}
                    external={dest.external}
                    onPress={() => handlePress(dest)}
                  />
                ))}
              </Group>
            );
          })}

          {/* Privacy & security — opt-in biometric app lock. Only shown when the
              device actually has Face ID / fingerprint enrolled (W9.1). */}
          {appLockSupported ? (
            <Group title="Privacy & security">
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabel}>
                  <Text variant="bodyMedium">Require Face ID / biometric unlock</Text>
                  <Text variant="caption" tone="muted">
                    Lock the app when it returns from the background so client records stay private.
                  </Text>
                </View>
                <Switch
                  value={appLockEnabled}
                  onValueChange={(v) => void handleAppLockToggle(v)}
                  disabled={appLockBusy}
                  accessibilityLabel="Require biometric unlock"
                />
              </View>
            </Group>
          ) : null}
        </>
      )}

      {/* Sign out */}
      <Card padded={false}>
        <PressableScale
          onPress={() => setSignOutOpen(true)}
          haptic
          accessibilityLabel="Sign out"
          style={styles.signOutRow}>
          <SymbolView
            name={{
              ios: 'rectangle.portrait.and.arrow.right',
              android: 'logout',
              web: 'logout',
            }}
            tintColor={colors.danger}
            size={18}
          />
          <Text variant="bodyMedium" color={colors.danger}>
            Sign out
          </Text>
        </PressableScale>
      </Card>

      <Text variant="caption" tone="muted" style={styles.version}>
        Resneo v{appVersion}
      </Text>

      {/* Sign-out confirm — a Sheet (not Alert.alert, which is a no-op on web). */}
      <Sheet visible={signOutOpen} onClose={() => setSignOutOpen(false)}>
        <View style={styles.signOutSheet}>
          <Text variant="subheading">Sign out?</Text>
          <Text variant="bodySmall" tone="secondary">
            You can sign back in with the same work email.
          </Text>
          <View style={styles.signOutActions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setSignOutOpen(false)}
            />
            <Button
              label="Sign out"
              variant="danger"
              style={styles.flex1}
              onPress={() => {
                setSignOutOpen(false);
                void signOut();
              }}
            />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    marginLeft: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    marginLeft: spacing.md,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.base,
  },
  toggleLabel: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  version: {
    textAlign: 'center',
  },
  planWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  planWarningText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  signOutSheet: {
    gap: spacing.md,
  },
  signOutActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
