import { View, type StyleProp, type ViewStyle } from 'react-native';

type DotProps = {
  color: string;
  size?: number;
  /** Optional ring (e.g. a live/pulse halo handled by the caller). */
  ring?: boolean;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Small status dot — unifies the booking attendance/arrived dots, the live-sync
 * dot, and the compliance-flag dot so they share one size + shape contract.
 * Decorative by default (status is announced by the parent row's label).
 */
export function Dot({ color, size = 8, ring = false, ringColor, style }: DotProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        ring ? { borderWidth: 2, borderColor: ringColor ?? color } : null,
        style,
      ]}
    />
  );
}
