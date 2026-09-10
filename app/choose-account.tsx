import * as WebBrowser from 'expo-web-browser';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { useAppMode } from '@/lib/mode/useAppMode';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Where would you like to go?" The web's `/auth/choose-destination`, in the
 * app: shown once per sign-in, after the session lands (password or magic
 * link alike), when the person has more than one account. The choice is
 * remembered until they sign out; both sides keep a switcher for changing
 * their mind.
 *
 * A real, routable screen guarded by the root router on `mode === 'choose'`,
 * for the same reason `mode-loading` is: the router must always have exactly
 * one legitimate place to be, and no side is mounted before it is chosen.
 *
 * The app has no platform-admin screens, so the superuser option opens the
 * web's `/super` in the browser and leaves this screen in place for picking a
 * side afterwards.
 */
export default function ChooseAccountScreen() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const { surfaces, choose } = useAppMode();
  const email = session?.user?.email ?? null;

  const openPlatformAdmin = () => {
    const base = getWebUrl() || 'https://app.resneo.com';
    const url = `${base}/super`;
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  };

  const options: { key: string; title: string; description: string; onPress: () => void }[] = [];
  if (surfaces.staff) {
    options.push({
      key: 'staff',
      title: 'Venue dashboard',
      description: 'Manage bookings, clients and your venue',
      onPress: () => choose('staff'),
    });
  }
  if (surfaces.customer) {
    options.push({
      key: 'customer',
      title: 'My bookings',
      description: 'View and manage your own bookings',
      onPress: () => choose('customer'),
    });
  }
  if (surfaces.superuser) {
    options.push({
      key: 'superuser',
      title: 'Platform admin',
      description: 'Opens the ResNeo platform console on the web',
      onPress: openPlatformAdmin,
    });
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="heading">Where would you like to go?</Text>
        <Text variant="bodySmall" tone="secondary">
          {email ? `${email} has ` : 'Your account has '}access to more than one area. Pick one; you can
          switch later.
        </Text>
      </View>
      <View style={styles.options}>
        {options.map((opt, index) => (
          <PressableScale
            key={opt.key}
            onPress={opt.onPress}
            accessibilityRole="button"
            accessibilityLabel={opt.title}>
            <Card style={[styles.option, index === 0 ? { borderColor: colors.brand } : null]}>
              <Text variant="subheading">{opt.title}</Text>
              <Text variant="bodySmall" tone="secondary">
                {opt.description}
              </Text>
            </Card>
          </PressableScale>
        ))}
      </View>
      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.base,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  options: {
    gap: spacing.md,
  },
  option: {
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
