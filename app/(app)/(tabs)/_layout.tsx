import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import type { ColorValue } from 'react-native';

import { LinkedVenueBanner } from '@/components/ui/LinkedVenueBanner';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import { bookingsScreenTitle, clientsScreenTitle } from '@/lib/booking/terminology';
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

function SettingsTabIcon({ color }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
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

function renderSettingsIcon({ color }: TabBarIconRenderProps) {
  return <SettingsTabIcon color={color} />;
}

/**
 * Main tab shell — Calendar · Bookings · Clients · Settings.
 * Calendar lives at the `index` route so it's the default tab on launch.
 * Labels follow venue terminology (e.g. "Appointments", "Guests").
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
  const settingsOptions = useMemo(
    () => ({ title: 'Settings', tabBarIcon: renderSettingsIcon }),
    [],
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
