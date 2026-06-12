import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';

export type SwipeAction = {
  key: string;
  label: string;
  icon: SymbolViewProps['name'];
  /** Background colour of the action button. */
  color: string;
  /** Glyph/label colour (default white). */
  tint?: string;
  onPress: () => void;
};

type SwipeRowProps = {
  children: ReactNode;
  /** Actions revealed by swiping left (shown on the right edge). */
  rightActions?: SwipeAction[];
  /** Actions revealed by swiping right (shown on the left edge). */
  leftActions?: SwipeAction[];
};

const ACTION_WIDTH = 76;

function ActionGroup({
  actions,
  methods,
}: {
  actions: SwipeAction[];
  methods: SwipeableMethods;
}) {
  return (
    <View style={[styles.actions, { width: actions.length * ACTION_WIDTH }]}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            methods.close();
            action.onPress();
          }}
          style={[styles.action, { backgroundColor: action.color }]}>
          <SymbolView name={action.icon} tintColor={action.tint ?? '#FFFFFF'} size={20} />
          <Text variant="caption" color={action.tint ?? '#FFFFFF'} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * iOS-style swipe-to-action row. Wraps a list row so a left-swipe reveals
 * quick actions (e.g. Confirm / No-show on a booking, Call / Message on a
 * contact) without opening the detail sheet. Tapping the row is unaffected.
 *
 * Gesture feel can only be confirmed on a device build (the web preview and
 * emulator can't exercise it), so keep actions additive — never the only way to
 * perform them.
 */
export function SwipeRow({ children, rightActions, leftActions }: SwipeRowProps) {
  const hasRight = !!rightActions?.length;
  const hasLeft = !!leftActions?.length;

  if (!hasRight && !hasLeft) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      overshootLeft={false}
      rightThreshold={ACTION_WIDTH * 0.6}
      leftThreshold={ACTION_WIDTH * 0.6}
      onSwipeableWillOpen={hapticSelect}
      renderRightActions={
        hasRight
          ? (_progress, _translation, methods) => (
              <ActionGroup actions={rightActions!} methods={methods} />
            )
          : undefined
      }
      renderLeftActions={
        hasLeft
          ? (_progress, _translation, methods) => (
              <ActionGroup actions={leftActions!} methods={methods} />
            )
          : undefined
      }>
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
});
