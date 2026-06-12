import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

type AvatarProps = {
  /** Full name — initials are derived from it. */
  name: string;
  size?: number;
};

/**
 * Deterministic tint per guest so the same person keeps the same colour.
 * Lighter, more saturated tints in dark mode so navy initials don't turn muddy
 * against a dark surface.
 */
const LIGHT_TINTS = ['#003B6F', '#00A0A4', '#3D72A0', '#007E81', '#1A5587', '#005F61'];
const DARK_TINTS = ['#4F8FCB', '#22CDD1', '#6E9AC2', '#2DB7BA', '#3D72A0', '#1FA8AB'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(name: string, tints: string[]): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return tints[hash % tints.length];
}

/** Circular initials avatar — used in booking rows and client lists. */
export function Avatar({ name, size = 40 }: AvatarProps) {
  const { isDark } = useTheme();
  const backgroundColor = tintFor(name, isDark ? DARK_TINTS : LIGHT_TINTS);
  // Dark-mode tints are light enough to need dark text for contrast.
  const textColor = isDark ? '#04101F' : '#FFFFFF';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}>
      <Text color={textColor} style={{ fontFamily: 'Inter_600SemiBold', fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
