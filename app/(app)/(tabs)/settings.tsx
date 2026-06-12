import Constants from 'expo-constants';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
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

/** Icon-tile hues — a curated ramp so each group feels distinct (iOS Settings style). */
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

/**
 * Secondary booking models. Classes/Events/Resources now have in-app screens
 * (timetables/rosters); setup & products still live on the web (each screen
 * links out). Tables remain web-only.
 */
const SECONDARY_MODEL_ROWS: {
  model: BookingModel;
  label: string;
  hint: string;
  /** In-app route when set; otherwise opens the web dashboard path. */
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

/** 30pt rounded-square icon tile — the iOS Settings row glyph. */
function IconTile({ name, tint }: { name: SymbolViewProps['name']; tint: string }) {
  return (
    <View style={[styles.iconTile, { backgroundColor: tint }]}>
      <SymbolView name={name} tintColor="#FFFFFF" size={17} />
    </View>
  );
}

function MenuRow({
  icon,
  tile,
  label,
  hint,
  onPress,
  external = false,
  destructive = false,
  isFirst = false,
}: {
  icon: SymbolViewProps['name'];
  tile: string;
  label: string;
  hint?: string;
  onPress: () => void;
  external?: boolean;
  destructive?: boolean;
  isFirst?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {!isFirst ? (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      ) : null}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.menuRow,
          pressed ? { backgroundColor: colors.surface } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}>
        <IconTile name={icon} tint={tile} />
        <View style={styles.menuText}>
          <Text variant="bodyMedium" color={destructive ? colors.danger : undefined}>
            {label}
          </Text>
          {hint ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        <SymbolView
          name={
            external
              ? { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }
              : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
          }
          tintColor={colors.textMuted}
          size={external ? 14 : 16}
        />
      </Pressable>
    </View>
  );
}

/** Uppercase section header sitting above its inset group (iOS Settings style). */
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
 * Contacts, mirroring the web dashboard's sidebar + settings for appointments venues.
 */
export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const toast = useToast();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const { venue, name: venueName, isLoading: venueLoading } = useVenueContext();
  const [pushBusy, setPushBusy] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const staff = staffData?.staff;
  const isAdmin = staff?.role === 'admin';
  const accessToken = session?.access_token ?? null;
  const appVersion = Constants.expoConfig?.version ?? '—';

  /** Derive a plan status warning from the venue's pricing tier. */
  const planStatus: string | undefined = (venue as unknown as { plan_status?: string })?.plan_status;
  const showPlanWarning = isAdmin && planStatus != null && WARN_PLAN_STATUSES.has(planStatus.toLowerCase());

  const enabledSecondaryRows = SECONDARY_MODEL_ROWS.filter((row) => {
    const models = new Set<BookingModel>([
      ...(venue?.active_booking_models ?? []),
      ...(venue?.enabled_models ?? []),
      ...(venue?.booking_model ? [venue.booking_model] : []),
    ]);
    return models.has(row.model);
  });

  // In-app browser tab (SFSafariViewController / Chrome Custom Tab) so web
  // content opens without bouncing the user out of the app.
  const openWeb = useCallback(
    (path: string) => {
      const url = webDashboardUrl(path);
      void WebBrowser.openBrowserAsync(url).catch(() =>
        // Fallback to the system browser if the in-app tab is unavailable.
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

  if (staffLoading || venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.content}>
      <Text variant="display" style={styles.pageTitle}>
        More
      </Text>

      {/* Profile header — tappable to open Account settings */}
      <Card onPress={() => router.push('/manage/account' as Href)}>
        <View style={styles.profileHeader}>
          <Avatar name={staff?.name ?? staff?.email ?? 'Staff'} size={52} />
          <View style={styles.profileText}>
            <Text variant="subheading" numberOfLines={1}>
              {staff?.name ?? 'Staff member'}
            </Text>
            <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
              {venueName ?? staff?.email ?? ''}
            </Text>
          </View>
          {staff ? (
            <Badge
              label={formatStaffRole(staff.role)}
              tone={staff.role === 'admin' ? 'brand' : 'neutral'}
            />
          ) : null}
        </View>
      </Card>

      {/* Account settings — available to all roles */}
      <Group>
        <MenuRow
          isFirst
          icon={{ ios: 'person.circle.fill', android: 'account_circle', web: 'account_circle' }}
          tile={TILE.navy}
          label="Account settings"
          hint="Name, sign-in email, phone & password"
          onPress={() => router.push('/manage/account' as Href)}
        />
      </Group>

      {/* Plan warning banner for admins when billing has an issue */}
      {showPlanWarning ? (
        <Pressable
          onPress={() => router.push('/manage/plan' as Href)}
          style={({ pressed }) => [
            styles.planWarning,
            { backgroundColor: colors.warningSurface, borderColor: colors.warning },
            pressed ? styles.planWarningPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Plan issue — tap to view">
          <Text variant="label" color={colors.warning}>
            Subscription issue
          </Text>
          <Text variant="caption" color={colors.warning}>
            Your plan is {planStatus}. Tap to manage billing.
          </Text>
        </Pressable>
      ) : null}

      <Group title="Workspace">
        <MenuRow
          isFirst
          icon={{ ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' }}
          tile={TILE.amber}
          label="Today"
          hint="KPIs, forecast & arrivals"
          onPress={() => router.push('/today' as Href)}
        />
        <MenuRow
          icon={{ ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }}
          tile={TILE.teal}
          label="Waitlist"
          hint="Offer & confirm waiting clients"
          onPress={() => router.push('/waitlist' as Href)}
        />
        <MenuRow
          icon={{ ios: 'calendar', android: 'edit_calendar', web: 'edit_calendar' }}
          tile={TILE.sky}
          label="Calendar availability"
          hint="Block time & book leave"
          onPress={() => router.push('/availability' as Href)}
        />
        <MenuRow
          icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
          tile={TILE.rose}
          label="Notifications"
          hint="In-app notification feed"
          onPress={() => router.push('/notifications' as Href)}
        />
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            tile={TILE.indigo}
            label="Reports"
            hint="Bookings, no-shows, deposits & insights"
            onPress={() => router.push('/reports' as Href)}
          />
        ) : null}
      </Group>

      <Group title="Manage">
        <MenuRow
          isFirst
          icon={{ ios: 'scissors', android: 'content_cut', web: 'content_cut' }}
          tile={TILE.navy}
          label="Services"
          hint="Review & edit your appointment services"
          onPress={() => router.push('/manage/services' as Href)}
        />
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'building.2.fill', android: 'storefront', web: 'storefront' }}
            tile={TILE.teal}
            label="Venue profile"
            hint="Name, contact details & address"
            onPress={() => router.push('/manage/venue-profile' as Href)}
          />
        ) : null}
        <MenuRow
          icon={{ ios: 'clock.fill', android: 'access_time', web: 'access_time' }}
          tile={TILE.sky}
          label="Business hours"
          hint="Weekly opening hours"
          onPress={() => router.push('/manage/hours' as Href)}
        />
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            tile={TILE.emerald}
            label="Team"
            hint="Staff logins & roles"
            onPress={() => router.push('/manage/team' as Href)}
          />
        ) : null}
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
            tile={TILE.slate}
            label="Booking settings"
            hint="Booking types & guest accounts"
            onPress={() => router.push('/manage/booking-settings' as Href)}
          />
        ) : null}
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
            tile={TILE.amber}
            label="Communications"
            hint="Confirmations, reminders & alerts"
            onPress={() => router.push('/manage/communications' as Href)}
          />
        ) : null}
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }}
            tile={TILE.emerald}
            label="Compliance"
            hint="Forms, records & expiries"
            onPress={() => router.push('/manage/compliance' as Href)}
          />
        ) : null}
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }}
            tile={TILE.violet}
            label="Plan & payments"
            hint="Subscription tier & Stripe"
            onPress={() => router.push('/manage/plan' as Href)}
          />
        ) : null}
        {isAdmin ? (
          <MenuRow
            icon={{ ios: 'globe', android: 'public', web: 'public' }}
            tile={TILE.indigo}
            label="Booking page"
            hint={venue?.slug ? `Preview your public booking page` : 'Public page, branding & widget'}
            external
            // Opens the guest-facing booking page in an IN-APP browser tab.
            onPress={() => openWeb(venue?.slug ? `/book/${venue.slug}` : '/dashboard/settings')}
          />
        ) : null}
      </Group>

      {/* Booking models — only when those models are enabled */}
      {isAdmin && enabledSecondaryRows.length > 0 ? (
        <Group title="Booking types">
          {enabledSecondaryRows.map((row, index) => (
            <MenuRow
              key={row.model}
              isFirst={index === 0}
              icon={row.icon}
              tile={row.tile}
              label={row.label}
              hint={row.hint}
              external={!row.appRoute}
              onPress={() =>
                row.appRoute ? router.push(row.appRoute as Href) : openWeb(row.webPath)
              }
            />
          ))}
        </Group>
      ) : null}

      <Group title="App">
        <MenuRow
          isFirst
          icon={{ ios: 'questionmark.circle.fill', android: 'help', web: 'help' }}
          tile={TILE.teal}
          label="Support"
          hint="Contact the Resneo team"
          onPress={() => router.push('/support' as Href)}
        />
        <MenuRow
          icon={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
          tile={TILE.rose}
          label="Push notifications"
          hint={pushBusy ? 'Registering…' : 'Re-register this device for push'}
          onPress={() => void handleRetryPush()}
        />
        <MenuRow
          icon={{ ios: 'desktopcomputer', android: 'computer', web: 'computer' }}
          tile={TILE.slate}
          label="Web dashboard"
          hint="Open the full dashboard in your browser"
          external
          onPress={() => openWeb('/dashboard')}
        />
      </Group>

      <Group>
        <Pressable
          onPress={() => setSignOutOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [
            styles.signOutRow,
            pressed ? { backgroundColor: colors.surface } : null,
          ]}>
          <Text variant="bodyMedium" color={colors.danger}>
            Sign out
          </Text>
        </Pressable>
      </Group>

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
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  pageTitle: {
    marginBottom: -spacing.xs,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    marginLeft: spacing.md,
  },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
  },
  menuText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + 30 + spacing.md,
  },
  signOutRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
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
  version: {
    textAlign: 'center',
  },
  planWarning: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
    gap: spacing.xs,
  },
  planWarningPressed: {
    opacity: 0.8,
  },
});
