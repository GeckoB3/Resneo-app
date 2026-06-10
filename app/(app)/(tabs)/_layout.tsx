import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';

import { LinkedVenueBanner } from '@/components/ui/LinkedVenueBanner';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import { bookingsScreenTitle, clientsScreenTitle } from '@/lib/booking/terminology';
import { useNotifications } from '@/lib/queries/useNotifications';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { darkColors, fonts, lightColors, spacing } from '@/theme/index';

type TabIconProps = { color: ColorValue };

function CalendarTabIcon({ color }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
      tintColor={color}
      size={24}
    />
  );
}

function BookingsTabIcon({ color }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'list.bullet', android: 'list', web: 'list' }}
      tintColor={color}
      size={24}
    />
  );
}

function ClientsTabIcon({ color }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'person.2', android: 'group', web: 'group' }}
      tintColor={color}
      size={24}
    />
  );
}

function MoreTabIcon({ color }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
      tintColor={color}
      size={24}
    />
  );
}

type TabBarIconRenderProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Tab button without the navigator's default *borderless* Android ripple,
 * which radiates past the bar into the system-navigation area on
 * edge-to-edge devices. A bounded, clipped highlight + a gentle opacity dip
 * stay strictly inside the tab — and feel closer to a native iOS tab bar.
 */
function TabBarButton({
  children,
  style,
  // Injected for the navigator's default PlatformPressable — not Pressable props.
  ref: _ref,
  href: _href,
  pressColor: _pressColor,
  pressOpacity: _pressOpacity,
  hoverEffect: _hoverEffect,
  android_ripple: _ripple,
  ...rest
}: BottomTabBarButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <Pressable
      {...(rest as ComponentProps<typeof Pressable>)}
      android_ripple={{
        color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 59, 111, 0.08)',
        borderless: false,
      }}
      style={({ pressed }) => [style, styles.tabButton, { opacity: pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}

function renderTabBarButton(props: BottomTabBarButtonProps) {
  return <TabBarButton {...props} />;
}

function renderCalendarIcon({ color }: TabBarIconRenderProps) {
  return <CalendarTabIcon color={color} />;
}

function renderBookingsIcon({ color }: TabBarIconRenderProps) {
  return <BookingsTabIcon color={color} />;
}

function renderClientsIcon({ color }: TabBarIconRenderProps) {
  return <ClientsTabIcon color={color} />;
}

function renderMoreIcon({ color }: TabBarIconRenderProps) {
  return <MoreTabIcon color={color} />;
}

/**
 * Main tab shell — Calendar · Appointments · Contacts · More.
 * Calendar lives at the `index` route so it's the default tab on launch.
 * Mirrors the web dashboard IA for appointments-plan venues.
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const { terminology, pricingTier, bookingModel } = useVenueContext();
  const headerShown = useClientOnlyValue(false, true);
  const isAppointment = isAppointmentFromVenue(pricingTier, bookingModel);

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: colors.tabIconActive,
      tabBarInactiveTintColor: colors.tabIcon,
      tabBarStyle: {
        backgroundColor: colors.surfaceRaised,
        borderTopColor: colors.border,
      },
      tabBarButton: renderTabBarButton,
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerShadowVisible: false,
      headerShown,
      // Match the app's Inter type ramp — native headers default to the system font.
      headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
      tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12, marginBottom: spacing.xs },
      // Mount tab screens on first visit — avoids duplicate hooks firing at once.
      lazy: true,
    }),
    [colors, headerShown],
  );

  const calendarOptions = useMemo(
    () => ({ title: 'Calendar', tabBarIcon: renderCalendarIcon }),
    [],
  );
  const bookingsOptions = useMemo(
    () => ({
      title: bookingsScreenTitle(terminology, isAppointment),
      tabBarIcon: renderBookingsIcon,
    }),
    [terminology, isAppointment],
  );
  const clientsOptions = useMemo(
    () => ({ title: clientsScreenTitle(terminology), tabBarIcon: renderClientsIcon }),
    [terminology],
  );
  // Unread notifications surface as a badge on the More tab.
  const notificationsQuery = useNotifications();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  const settingsOptions = useMemo(
    () => ({
      title: 'More',
      tabBarIcon: renderMoreIcon,
      tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined,
    }),
    [unreadCount],
  );

  return (
    <>
      <OfflineBanner />
      <LinkedVenueBanner />
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen name="index" options={calendarOptions} />
        <Tabs.Screen name="bookings" options={bookingsOptions} />
        <Tabs.Screen name="clients" options={clientsOptions} />
        <Tabs.Screen name="settings" options={settingsOptions} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  // Clip the bounded ripple to a soft rounded rect inside the tab.
  tabButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
});
