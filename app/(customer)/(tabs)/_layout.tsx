import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, type ComponentProps } from 'react';
import { type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabBarHeight, useIsTablet } from '@/lib/responsive';
import { fonts, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The customer's tabs.
 *
 * **Three, not four, and the fourth is deliberate rather than forgotten.** The
 * web portal settled on Bookings, Passes and plans, Profile and Help, with the
 * hub reached by the wordmark rather than by a nav item. An app has no wordmark
 * to press, so the hub becomes a tab and Help becomes a link rather than a tab.
 * That gives Home, Bookings, Passes and Profile as the shape, and Profile
 * arrives with the screen behind it in C4. A tab that leads nowhere is worse
 * than one that is not there yet.
 *
 * Styling follows the staff tab bar rather than inventing a second one: the
 * explicit height plus bottom inset is what keeps the bar clear of the home
 * indicator, and it is not a detail worth rediscovering.
 */
export default function CustomerTabsLayout() {
  const { colors } = useTheme();
  const isTablet = useIsTablet();
  const { bottom: bottomInset } = useSafeAreaInsets();

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: colors.tabIconActive,
      tabBarInactiveTintColor: colors.tabIcon,
      tabBarStyle: {
        backgroundColor: colors.surfaceRaised,
        borderTopColor: colors.border,
        height: tabBarHeight(isTablet, bottomInset),
        paddingTop: isTablet ? spacing.sm : spacing.xs,
        paddingBottom: bottomInset,
      },
      tabBarLabelPosition: 'below-icon' as const,
      headerShown: false,
      tabBarLabelStyle: {
        fontFamily: fonts.medium,
        fontSize: isTablet ? 13 : 12,
        marginBottom: spacing.xs,
      },
      // Mount on first visit, so three sets of queries do not fire at once on
      // a cold start.
      lazy: true,
    }),
    [colors, isTablet, bottomInset],
  );

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: (p) => <TabIcon {...p} ios="house" android="home" /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: (p) => <TabIcon {...p} ios="calendar" android="calendar_today" />,
        }}
      />
      <Tabs.Screen
        name="passes"
        options={{
          title: 'Passes',
          tabBarIcon: (p) => <TabIcon {...p} ios="ticket" android="confirmation_number" />,
        }}
      />
    </Tabs>
  );
}

type IconProps = { color: ColorValue; size: number; ios: string; android: string };

function TabIcon({ color, size, ios, android }: IconProps) {
  return (
    <SymbolView
      name={{ ios, android, web: android } as ComponentProps<typeof SymbolView>['name']}
      tintColor={color}
      size={size}
    />
  );
}
