import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useAuth } from '@/providers/AuthProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { StaffRole } from '@/types/staff';

const WEB_DASHBOARD_URL = 'https://reserveni.com/dashboard';

/** Human-readable staff role for the settings screen. */
function formatStaffRole(role: StaffRole): string {
  return role === 'admin' ? 'Admin' : 'Staff';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const {
    name: venueName,
    pricingTier,
    bookingModel,
    isLoading: venueLoading,
  } = useVenueContext();
  const [pushBusy, setPushBusy] = useState(false);

  const staff = staffData?.staff;
  const accessToken = session?.access_token ?? null;
  const appVersion = Constants.expoConfig?.version ?? '—';

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

  const handleOpenWebDashboard = useCallback(() => {
    void Linking.openURL(WEB_DASHBOARD_URL).catch(() => {
      Alert.alert('Could not open browser', WEB_DASHBOARD_URL);
    });
  }, []);

  if (staffLoading || venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading settings…" />
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {/* Staff profile */}
      <Card>
        <View style={styles.profileHeader}>
          <Avatar name={staff?.name ?? staff?.email ?? 'Staff'} size={48} />
          <View style={styles.profileText}>
            <Text variant="subheading" numberOfLines={1}>
              {staff?.name ?? 'Staff member'}
            </Text>
            {staff?.email ? (
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {staff.email}
              </Text>
            ) : null}
          </View>
          {staff ? (
            <Badge
              label={formatStaffRole(staff.role)}
              tone={staff.role === 'admin' ? 'brand' : 'neutral'}
            />
          ) : null}
        </View>
      </Card>

      {/* Venue */}
      <Card>
        <Text variant="overline" tone="muted">
          Venue
        </Text>
        <View style={styles.rows}>
          <InfoRow label="Name" value={venueName ?? 'Not loaded'} />
          {pricingTier ? <InfoRow label="Plan" value={pricingTier} /> : null}
          {bookingModel ? <InfoRow label="Booking model" value={bookingModel} /> : null}
        </View>
      </Card>

      {/* Notifications */}
      <Card>
        <Text variant="label">Notifications</Text>
        <Text variant="bodySmall" tone="secondary" style={styles.help}>
          Re-register this device for push notifications. The app registers automatically the first
          time you sign in.
        </Text>
        <Button
          label={pushBusy ? 'Working…' : 'Re-register for push'}
          variant="secondary"
          fullWidth
          loading={pushBusy}
          onPress={() => void handleRetryPush()}
        />
      </Card>

      {/* App */}
      <Card>
        <Text variant="label">App</Text>
        <View style={styles.rows}>
          <InfoRow label="Version" value={appVersion} />
        </View>
        <Button
          label="Manage billing & settings on web"
          variant="ghost"
          onPress={handleOpenWebDashboard}
        />
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
  rows: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  help: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  signOut: {
    marginTop: spacing.sm,
  },
});
