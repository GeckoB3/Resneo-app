import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useAuth } from '@/providers/AuthProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { StaffRole } from '@/types/staff';
import type { BookingModel } from '@/types/venue';

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

/** Secondary booking models with their own settings area (managed on web). */
const SECONDARY_MODEL_ROWS: { model: BookingModel; label: string; hint: string; webPath: string }[] = [
  { model: 'class_session', label: 'Classes', hint: 'Timetable & class products', webPath: '/dashboard/class-timetable' },
  { model: 'event_ticket', label: 'Events', hint: 'Event sessions & tickets', webPath: '/dashboard/event-manager' },
  { model: 'resource_booking', label: 'Resources', hint: 'Bookable resources', webPath: '/dashboard/resource-timeline' },
  { model: 'table_reservation', label: 'Tables', hint: 'Table & floor plan setup', webPath: '/dashboard/tables' },
];

function MenuRow({
  label,
  hint,
  onPress,
  external = false,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  external?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.55 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}>
      <View style={styles.menuText}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <Text variant="title" tone="muted">
        {external ? '↗' : '›'}
      </Text>
    </Pressable>
  );
}

/**
 * More tab — the entry point to every surface beyond Calendar / Appointments /
 * Contacts, mirroring the web dashboard's sidebar + settings for appointments venues.
 */
export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const { venue, name: venueName, isLoading: venueLoading } = useVenueContext();
  const [pushBusy, setPushBusy] = useState(false);

  const staff = staffData?.staff;
  const isAdmin = staff?.role === 'admin';
  const accessToken = session?.access_token ?? null;
  const appVersion = Constants.expoConfig?.version ?? '—';

  const enabledSecondaryRows = SECONDARY_MODEL_ROWS.filter((row) => {
    const models = new Set<BookingModel>([
      ...(venue?.active_booking_models ?? []),
      ...(venue?.enabled_models ?? []),
      ...(venue?.booking_model ? [venue.booking_model] : []),
    ]);
    return models.has(row.model);
  });

  const openWeb = useCallback((path: string) => {
    const url = webDashboardUrl(path);
    void Linking.openURL(url).catch(() => Alert.alert('Could not open browser', url));
  }, []);

  const handleRetryPush = useCallback(async () => {
    if (!accessToken) {
      Alert.alert('Sign in required', 'Sign in before enabling push notifications.');
      return;
    }
    setPushBusy(true);
    try {
      const result = await registerCurrentDeviceForPush({ accessToken });
      if (result.registered) {
        Alert.alert('Notifications enabled', 'This device is registered for push.');
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
        Alert.alert('Not registered', message);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Push registration failed.';
      Alert.alert('Push registration failed', message);
    } finally {
      setPushBusy(false);
    }
  }, [accessToken]);

  if (staffLoading || venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {/* Profile header */}
      <Card>
        <View style={styles.profileHeader}>
          <Avatar name={staff?.name ?? staff?.email ?? 'Staff'} size={48} />
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

      {/* Workspace — day-to-day tools */}
      <Card>
        <Text variant="overline" tone="muted">
          Workspace
        </Text>
        <View style={styles.menu}>
          <MenuRow
            label="Today"
            hint="KPIs, forecast & arrivals"
            onPress={() => router.push('/today' as Href)}
          />
          <MenuRow
            label="Waitlist"
            hint="Offer & confirm waiting clients"
            onPress={() => router.push('/waitlist' as Href)}
          />
          <MenuRow
            label="Calendar availability"
            hint="Block time & book leave"
            onPress={() => router.push('/availability' as Href)}
          />
          <MenuRow
            label="Notifications"
            hint="In-app notification feed"
            onPress={() => router.push('/notifications' as Href)}
          />
          {isAdmin ? (
            <MenuRow
              label="Reports"
              hint="Bookings, no-shows, deposits & insights"
              onPress={() => router.push('/reports' as Href)}
            />
          ) : null}
        </View>
      </Card>

      {/* Manage — services + venue settings */}
      <Card>
        <Text variant="overline" tone="muted">
          Manage
        </Text>
        <View style={styles.menu}>
          <MenuRow
            label="Services"
            hint="Review & edit your appointment services"
            onPress={() => router.push('/manage/services' as Href)}
          />
          {isAdmin ? (
            <MenuRow
              label="Venue profile"
              hint="Name, contact details & address"
              onPress={() => router.push('/manage/venue-profile' as Href)}
            />
          ) : null}
          <MenuRow
            label="Business hours"
            hint="Weekly opening hours"
            onPress={() => router.push('/manage/hours' as Href)}
          />
          {isAdmin ? (
            <MenuRow
              label="Team"
              hint="Staff logins & roles"
              onPress={() => router.push('/manage/team' as Href)}
            />
          ) : null}
          {isAdmin ? (
            <MenuRow
              label="Booking settings"
              hint="Booking types & guest accounts"
              onPress={() => router.push('/manage/booking-settings' as Href)}
            />
          ) : null}
          {isAdmin ? (
            <MenuRow
              label="Communications"
              hint="Confirmations, reminders & alerts"
              onPress={() => router.push('/manage/communications' as Href)}
            />
          ) : null}
          {isAdmin ? (
            <MenuRow
              label="Compliance"
              hint="Forms, records & expiries"
              onPress={() => router.push('/manage/compliance' as Href)}
            />
          ) : null}
          {isAdmin ? (
            <MenuRow
              label="Plan & payments"
              hint="Subscription tier & Stripe"
              onPress={() => router.push('/manage/plan' as Href)}
            />
          ) : null}
          {isAdmin ? (
            <MenuRow
              label="Booking page"
              hint="Public page, branding & widget"
              external
              onPress={() => openWeb('/dashboard/settings')}
            />
          ) : null}
        </View>
      </Card>

      {/* Booking models — only when those models are enabled */}
      {isAdmin && enabledSecondaryRows.length > 0 ? (
        <Card>
          <Text variant="overline" tone="muted">
            Booking types
          </Text>
          <View style={styles.menu}>
            {enabledSecondaryRows.map((row) => (
              <MenuRow
                key={row.model}
                label={row.label}
                hint={row.hint}
                external
                onPress={() => openWeb(row.webPath)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {/* App */}
      <Card>
        <Text variant="overline" tone="muted">
          App
        </Text>
        <View style={styles.menu}>
          <MenuRow
            label="Push notifications"
            hint="Re-register this device for push"
            onPress={() => void handleRetryPush()}
          />
          <MenuRow
            label="Web dashboard"
            hint="Open the full dashboard in your browser"
            external
            onPress={() => openWeb('/dashboard')}
          />
        </View>
        <Text variant="caption" tone="muted" style={styles.version}>
          Resneo v{appVersion}
          {pushBusy ? ' · registering push…' : ''}
        </Text>
      </Card>

      <Button
        label="Sign out"
        variant="secondary"
        fullWidth
        onPress={() => void signOut()}
        style={styles.signOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.base,
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
  menu: {
    marginTop: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  version: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  signOut: {
    marginTop: spacing.sm,
  },
});
