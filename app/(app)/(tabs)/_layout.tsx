import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useCallback, useMemo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinkedVenueBanner } from '@/components/ui/LinkedVenueBanner';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useColorScheme } from '@/components/useColorScheme';
import { bookingsScreenTitle, clientsScreenTitle } from '@/lib/booking/terminology';
import { useNotifications } from '@/lib/queries/useNotifications';
import { tabBarHeight, useIsTablet } from '@/lib/responsive';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { darkColors, fonts, lightColors, radius, spacing } from '@/theme/index';

/** Standard tab icon size; tablets bump it up to balance the taller bar. */
const TAB_ICON_SIZE = 24;
const TAB_ICON_SIZE_TABLET = 28;

type TabIconProps = { color: ColorValue; size: number };

function CalendarTabIcon({ color, size }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
      tintColor={color}
      size={size}
    />
  );
}

function BookingsTabIcon({ color, size }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'list.bullet', android: 'list', web: 'list' }}
      tintColor={color}
      size={size}
    />
  );
}

function ClientsTabIcon({ color, size }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'person.2', android: 'group', web: 'group' }}
      tintColor={color}
      size={size}
    />
  );
}

function MoreTabIcon({ color, size }: TabIconProps) {
  return (
    <SymbolView
      name={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
      tintColor={color}
      size={size}
    />
  );
}

type TabBarIconRenderProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Wraps a tab icon with the active "pill" marker. The pill is ABSOLUTELY
 * positioned behind the icon so it never grows the icon's layout box — that
 * keeps the icon at its natural size and the label below it untouched (a padded
 * wrapper bled into the label). The wrapper only hugs the icon; the pill extends
 * a few dp around it.
 */
function TabBarIcon({
  focused,
  pillColor,
  children,
}: {
  focused: boolean;
  pillColor: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.iconWrap}>
      {focused ? (
        <View pointerEvents="none" style={[styles.iconPill, { backgroundColor: pillColor }]} />
      ) : null}
      {children}
    </View>
  );
}

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

/**
 * Main tab shell — Calendar · Appointments · Contacts · More.
 * Calendar lives at the `index` route so it's the default tab on launch.
 * Mirrors the web dashboard IA for appointments-plan venues.
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const { terminology, pricingTier, bookingModel } = useVenueContext();
  const isAppointment = isAppointmentFromVenue(pricingTier, bookingModel);

  // Taller, safe-area-aware tab bar — comfortable touch targets, more so on
  // tablets. Both recompute on rotation (insets/dimensions are reactive).
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const iconSize = isTablet ? TAB_ICON_SIZE_TABLET : TAB_ICON_SIZE;
  const bottomInset = insets.bottom;

  // Active tab gets a filled "pill" behind its icon (Material-You style) so the
  // current page is unmistakable beyond the active tint alone. brandBorder is a
  // mid-tone container — clearly readable against the bar in both themes.
  const activePillColor = colors.brandBorder;
  const renderCalendarIcon = useCallback(
    ({ color, focused }: TabBarIconRenderProps) => (
      <TabBarIcon focused={focused} pillColor={activePillColor}>
        <CalendarTabIcon color={color} size={iconSize} />
      </TabBarIcon>
    ),
    [iconSize, activePillColor],
  );
  const renderBookingsIcon = useCallback(
    ({ color, focused }: TabBarIconRenderProps) => (
      <TabBarIcon focused={focused} pillColor={activePillColor}>
        <BookingsTabIcon color={color} size={iconSize} />
      </TabBarIcon>
    ),
    [iconSize, activePillColor],
  );
  const renderClientsIcon = useCallback(
    ({ color, focused }: TabBarIconRenderProps) => (
      <TabBarIcon focused={focused} pillColor={activePillColor}>
        <ClientsTabIcon color={color} size={iconSize} />
      </TabBarIcon>
    ),
    [iconSize, activePillColor],
  );
  const renderMoreIcon = useCallback(
    ({ color, focused }: TabBarIconRenderProps) => (
      <TabBarIcon focused={focused} pillColor={activePillColor}>
        <MoreTabIcon color={color} size={iconSize} />
      </TabBarIcon>
    ),
    [iconSize, activePillColor],
  );

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: colors.tabIconActive,
      tabBarInactiveTintColor: colors.tabIcon,
      tabBarStyle: {
        backgroundColor: colors.surfaceRaised,
        borderTopColor: colors.border,
        // Explicit height = comfortable content + the bottom safe-area inset, so
        // the bar clears the home indicator / gesture bar in any orientation.
        height: tabBarHeight(isTablet, bottomInset),
        paddingTop: isTablet ? spacing.sm : spacing.xs,
        paddingBottom: bottomInset,
      },
      tabBarButton: renderTabBarButton,
      // Always stack the label BELOW the icon. react-navigation otherwise
      // switches to a side-by-side (label-right-of-icon) layout on wide/tablet
      // bars, which our icon highlight pill is not designed for (it would sit
      // behind the label). Forcing 'below-icon' keeps icon→highlight→label
      // consistent on every device size.
      tabBarLabelPosition: 'below-icon' as const,
      // No native headers on tabs — the screens' own toolbars are the visual
      // top, and the redundant title + double safe-area inset wasted ~90px.
      headerShown: false,
      tabBarLabelStyle: {
        fontFamily: fonts.medium,
        fontSize: isTablet ? 13 : 12,
        marginBottom: spacing.xs,
      },
      // Mount tab screens on first visit — avoids duplicate hooks firing at once.
      lazy: true,
    }),
    [colors, isTablet, bottomInset],
  );

  const calendarOptions = useMemo(
    () => ({ title: 'Calendar', tabBarIcon: renderCalendarIcon }),
    [renderCalendarIcon],
  );
  const bookingsOptions = useMemo(
    () => ({
      title: bookingsScreenTitle(terminology, isAppointment),
      tabBarIcon: renderBookingsIcon,
    }),
    [terminology, isAppointment, renderBookingsIcon],
  );
  const clientsOptions = useMemo(
    () => ({ title: clientsScreenTitle(terminology), tabBarIcon: renderClientsIcon }),
    [terminology, renderClientsIcon],
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
    [unreadCount, renderMoreIcon],
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
  // Hugs the icon at its natural size so the label below is never displaced.
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Active "you are here" marker — absolutely positioned BEHIND the icon so it
  // adds no height (can't overlap the label). Extends horizontally into a
  // capsule; vertical reach is 0 so it stays exactly within the icon's row.
  iconPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -spacing.base,
    right: -spacing.base,
    borderRadius: radius.pill,
  },
});
