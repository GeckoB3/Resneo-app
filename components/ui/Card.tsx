import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { elevation as elevationTokens, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type CardElevation = 'none' | 'card' | 'raised';

type CardProps = ViewProps & {
  /** Shadow tier (default: `card`). */
  elevation?: CardElevation;
  /** Inner padding (default true). */
  padded?: boolean;
  /** When provided, the card becomes pressable with a press-in dim. */
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
};

/** Raised surface for grouping content — matches the web's rounded cards. */
export function Card({
  elevation = 'card',
  padded = true,
  onPress,
  style,
  children,
  ...props
}: CardProps) {
  const { colors } = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    padded && styles.padded,
    {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
    },
    elevationTokens[elevation],
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.9 }]}
        accessibilityRole="button">
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: spacing.base,
  },
});
