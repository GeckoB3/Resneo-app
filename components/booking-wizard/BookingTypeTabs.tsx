import { SymbolView } from 'expo-symbols';
import { type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/ui/PressableScale';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The bookable models the new-booking form supports (one tab each). */
export type BookingFlowType = 'service' | 'class' | 'event' | 'resource';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type TabMeta = {
  label: string;
  icon: SymbolName;
};

const TAB_META: Record<BookingFlowType, TabMeta> = {
  service: { label: 'Appointments', icon: { ios: 'calendar', android: 'event', web: 'event' } },
  class: { label: 'Classes', icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' } },
  event: { label: 'Events', icon: { ios: 'ticket.fill', android: 'local_activity', web: 'local_activity' } },
  resource: {
    label: 'Resources',
    icon: { ios: 'square.grid.2x2.fill', android: 'grid_view', web: 'grid_view' },
  },
};

type BookingTypeTabsProps = {
  tabs: BookingFlowType[];
  active: BookingFlowType;
  onChange: (tab: BookingFlowType) => void;
};

/**
 * Horizontal pill tabs to choose what to book — mirrors the web staff booking
 * surface tabs. Scrolls horizontally so labels never truncate on narrow phones.
 */
export function BookingTypeTabs({ tabs, active, onChange }: BookingTypeTabsProps) {
  const { colors } = useTheme();

  return (
    <View accessibilityRole="tablist" style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {tabs.map((tab) => {
          const meta = TAB_META[tab];
          const isActive = tab === active;
          return (
            <PressableScale
              key={tab}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: isActive }}
              onPress={() => {
                if (isActive) return;
                hapticSelect();
                onChange(tab);
              }}
              style={[
                styles.pill,
                {
                  backgroundColor: isActive ? colors.brand : colors.surface,
                  borderColor: isActive ? colors.brand : colors.border,
                },
              ]}>
              <SymbolView
                name={meta.icon}
                tintColor={isActive ? colors.onBrand : colors.textSecondary}
                size={16}
              />
              <Text variant="label" color={isActive ? colors.onBrand : colors.textSecondary}>
                {meta.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.base },
  content: { gap: spacing.sm, paddingVertical: spacing.xxs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
