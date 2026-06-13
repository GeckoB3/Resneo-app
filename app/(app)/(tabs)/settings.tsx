import Constants from 'expo-constants';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { FeatureTile } from '@/components/more/FeatureTile';
import { MoreHero } from '@/components/more/MoreHero';
import { MoreRow } from '@/components/more/MoreRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useNotifications } from '@/lib/queries/useNotifications';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { StaffRole } from '@/types/staff';
import type { BookingModel } from '@/types/venue';

/** Subscription/plan statuses that warrant a warning banner. */
const WARN_PLAN_STATUSES = new Set(['past_due', 'canceled', 'cancelled', 'unpaid', 'expired']);

/** The staff dashboard lives on the same host the app's API points at. */
function webDashboardUrl(path = '/dashboard'): string {
  try {
    return `${getApiUrl()}${path}`;
  } catch {
    return `https://reserve-ni.vercel.app${path}`;
  }
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

/** Icon-tile hues — a curated ramp so each destination feels distinct. */
const TILE = {
  amber: '#D97706',
  teal: '#0D9488',
  sky: '#0369A1',
  navy: '#003B6F',
  indigo: '#4F46E5',
  emerald: '#059669',
  rose: '#BE123C',
  slate: '#475569',
  violet: '#7C3AED',
  orange: '#EA580C',
};

type DestKind = 'route' | 'web' | 'action';
type DestGroup = 'workspace' | 'manage' | 'bookingTypes' | 'app' | 'account';

/** One navigable surface — the single source of truth for the grid, the grouped
 *  list and search. Role/enablement filtering happens where the list is built. */
type Destination = {
  id: string;
  label: string;
  hint: string;
  icon: SymbolViewProps['name'];
  tile: string;
  group: DestGroup;
  kind: DestKind;
  /** Route path (kind 'route') or web dashboard path (kind 'web'). */
  target?: string;
  /** Built-in action (kind 'action'). */
  action?: 'push';
  /** Show in the "Quick actions" grid. */
  featured?: boolean;
  /** Opens an external surface — shows the "open" glyph. */
  external?: boolean;
};

/** Groups rendered as inset lists, in order. (workspace → grid; account → hero.) */
const LIST_GROUPS: { key: DestGroup; title: string }[] = [
  { key: 'manage', title: 'Manage' },
  { key: 'bookingTypes', title: 'Booking types' },
  { key: 'app', title: 'App' },
];

/**
 * Secondary booking models. Classes/Events/Resources have in-app screens;
 * setup & products still live on the web. Tables remain web-only.
 */
const SECONDARY_MODEL_ROWS: {
  model: BookingModel;
  label: string;
  hint: string;
  appRoute?: string;
  webPath: string;
  icon: SymbolViewProps['name'];
  tile: string;
}[] = [
  { model: 'class_session', label: 'Classes', hint: 'Timetable & session rosters', appRoute: '/classes', webPath: '/dashboard/class-timetable', icon: { ios: 'figure.run', android: 'fitness_center', web: 'fitness_center' }, tile: TILE.emerald },
  { model: 'event_ticket', label: 'Events', hint: 'Events & attendee rosters', appRoute: '/events', webPath: '/dashboard/event-manager', icon: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' }, tile: TILE.violet },
  { model: 'resource_booking', label: 'Resources', hint: 'Resource day view', appRoute: '/resources', webPath: '/dashboard/resource-timeline', icon: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }, tile: TILE.slate },
  { model: 'table_reservation', label: 'Tables', hint: 'Table & floor plan setup', webPath: '/dashboard/tables', icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }, tile: TILE.orange },
];

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
  const { session, signOut } = useAuth();
  const toast = useToast();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const { venue, name: venueName, isLoading: venueLoading } = useVenueContext();
  const notificationsQuery = useNotifications();
  const [query, setQuery] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const staff = staffData?.staff;
  const isAdmin = staff?.role === 'admin';
  const accessToken = session?.access_token ?? null;
  const appVersion = Constants.expoConfig?.version ?? '—';
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  /** Derive a plan status warning from the venue's pricing tier. */
  const planStatus: string | undefined = (venue as unknown as { plan_status?: string })?.plan_status;
  const showPlanWarning =
    isAdmin && planStatus != null && WARN_PLAN_STATUSES.has(planStatus.toLowerCase());

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

  const handleRetryPush = useCallback(async () => {
    if (!accessToken) {
      toast.info('Sign in before enabling push notifications.');
      return;
    }
    setPushBusy(true);
    try {
      const result = await registerCurrentDeviceForPush({ accessToken });
      if (result.registered) {
        toast.success('This device is registered for push.');
      } else {
        const message =
          result.reason === 'expo-go'
            ? 'Push notifications are not available in Expo Go. Use a development build to test push.'
            : result.reason === 'denied'
              ? 'Permission was denied. Enable notifications for Resneo in system Settings, then try again.'
              : result.reason === 'simulator'
                ? 'Push tokens are only available on a real device.'
                : result.reason === 'web'
                  ? 'Push notifications are not available on the web build.'
                  : 'Could not register this device for push.';
        toast.error(message);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Push registration failed.';
      toast.error(message);
    } finally {
      setPushBusy(false);
    }
  }, [accessToken, toast]);

  // Build the full, role-aware index once. The grid, the grouped list and search
  // all derive from this single array.
  const destinations = useMemo<Destination[]>(() => {
    const slug = venue?.slug;
    const enabledModels = new Set<BookingModel>([
      ...(venue?.active_booking_models ?? []),
      ...(venue?.enabled_models ?? []),
      ...(venue?.booking_model ? [venue.booking_model] : []),
    ]);

    const list: Destination[] = [];

    // Account — reached via the hero; indexed here so search can surface it.
    list.push({ id: 'account', label: 'Account settings', hint: 'Name, sign-in email, phone & password', icon: { ios: 'person.circle.fill', android: 'account_circle', web: 'account_circle' }, tile: TILE.navy, group: 'account', kind: 'route', target: '/manage/account' });

    // Workspace — the daily-driver tools surfaced in the quick-actions grid.
    list.push({ id: 'today', label: 'Today', hint: 'KPIs, forecast & arrivals', icon: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' }, tile: TILE.amber, group: 'workspace', kind: 'route', target: '/today', featured: true });
    if (isAdmin) {
      list.push({ id: 'reports', label: 'Reports', hint: 'Bookings, no-shows, deposits & insights', icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }, tile: TILE.indigo, group: 'workspace', kind: 'route', target: '/reports', featured: true });
    }
    list.push({ id: 'waitlist', label: 'Waitlist', hint: 'Offer & confirm waiting clients', icon: { ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }, tile: TILE.teal, group: 'workspace', kind: 'route', target: '/waitlist', featured: true });
    list.push({ id: 'availability', label: 'Calendar availability', hint: 'Block time & book leave', icon: { ios: 'calendar', android: 'edit_calendar', web: 'edit_calendar' }, tile: TILE.sky, group: 'workspace', kind: 'route', target: '/availability', featured: true });
    list.push({ id: 'notifications', label: 'Notifications', hint: 'In-app notification feed', icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' }, tile: TILE.rose, group: 'workspace', kind: 'route', target: '/notifications' });

    // Manage — venue configuration.
    list.push({ id: 'services', label: 'Services', hint: 'Review & edit your appointment services', icon: { ios: 'scissors', android: 'content_cut', web: 'content_cut' }, tile: TILE.navy, group: 'manage', kind: 'route', target: '/manage/services' });
    if (isAdmin) {
      list.push({ id: 'venue-profile', label: 'Venue profile', hint: 'Name, contact details & address', icon: { ios: 'building.2.fill', android: 'storefront', web: 'storefront' }, tile: TILE.teal, group: 'manage', kind: 'route', target: '/manage/venue-profile' });
    }
    list.push({ id: 'hours', label: 'Business hours', hint: 'Weekly opening hours', icon: { ios: 'clock.fill', android: 'access_time', web: 'access_time' }, tile: TILE.sky, group: 'manage', kind: 'route', target: '/manage/hours' });
    if (isAdmin) {
      list.push({ id: 'team', label: 'Team', hint: 'Staff logins & roles', icon: { ios: 'person.2.fill', android: 'group', web: 'group' }, tile: TILE.emerald, group: 'manage', kind: 'route', target: '/manage/team' });
      list.push({ id: 'booking-settings', label: 'Booking settings', hint: 'Booking types & guest accounts', icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }, tile: TILE.slate, group: 'manage', kind: 'route', target: '/manage/booking-settings' });
      list.push({ id: 'communications', label: 'Communications', hint: 'Confirmations, reminders & alerts', icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' }, tile: TILE.amber, group: 'manage', kind: 'route', target: '/manage/communications' });
      list.push({ id: 'compliance', label: 'Compliance', hint: 'Forms, records & expiries', icon: { ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }, tile: TILE.emerald, group: 'manage', kind: 'route', target: '/manage/compliance' });
      list.push({ id: 'plan', label: 'Plan & payments', hint: 'Subscription tier & Stripe', icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }, tile: TILE.violet, group: 'manage', kind: 'route', target: '/manage/plan' });
      list.push({ id: 'booking-page', label: 'Booking page', hint: slug ? 'Preview your public booking page' : 'Public page, branding & widget', icon: { ios: 'globe', android: 'public', web: 'public' }, tile: TILE.indigo, group: 'manage', kind: 'web', target: slug ? `/book/${slug}` : '/dashboard/settings', external: true });
    }

    // Booking types — only the models this venue has enabled (admin only).
    if (isAdmin) {
      for (const row of SECONDARY_MODEL_ROWS) {
        if (!enabledModels.has(row.model)) continue;
        list.push({ id: `model-${row.model}`, label: row.label, hint: row.hint, icon: row.icon, tile: row.tile, group: 'bookingTypes', kind: row.appRoute ? 'route' : 'web', target: row.appRoute ?? row.webPath, external: !row.appRoute });
      }
    }

    // App.
    list.push({ id: 'support', label: 'Support', hint: 'Contact the Resneo team', icon: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' }, tile: TILE.teal, group: 'app', kind: 'route', target: '/support' });
    list.push({ id: 'push', label: 'Push notifications', hint: 'Re-register this device for push', icon: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }, tile: TILE.rose, group: 'app', kind: 'action', action: 'push' });
    list.push({ id: 'web-dashboard', label: 'Web dashboard', hint: 'Open the full dashboard in your browser', icon: { ios: 'desktopcomputer', android: 'computer', web: 'computer' }, tile: TILE.slate, group: 'app', kind: 'web', target: '/dashboard', external: true });

    return list;
  }, [isAdmin, venue]);

  const handlePress = useCallback(
    (dest: Destination) => {
      if (dest.kind === 'route' && dest.target) router.push(dest.target as Href);
      else if (dest.kind === 'web' && dest.target) openWeb(dest.target);
      else if (dest.kind === 'action' && dest.action === 'push') void handleRetryPush();
    },
    [router, openWeb, handleRetryPush],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmedQuery) return [];
    return destinations.filter(
      (d) =>
        d.label.toLowerCase().includes(trimmedQuery) || d.hint.toLowerCase().includes(trimmedQuery),
    );
  }, [destinations, trimmedQuery]);

  const featured = useMemo(() => destinations.filter((d) => d.featured), [destinations]);

  /** Live hint override — the push row reflects in-flight registration. */
  const hintFor = (dest: Destination) =>
    dest.id === 'push' && pushBusy ? 'Registering…' : dest.hint;

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
                hint={hintFor(dest)}
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
                    hint={hintFor(dest)}
                    external={dest.external}
                    onPress={() => handlePress(dest)}
                  />
                ))}
              </Group>
            );
          })}
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
    gap: spacing.sm,
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
