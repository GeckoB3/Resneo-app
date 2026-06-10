import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import type { ColorValue } from 'react-native';

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
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerShadowVisible: false,
      headerShown,
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
