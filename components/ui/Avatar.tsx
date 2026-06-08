import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

type AvatarProps = {
  /** Full name — initials are derived from it. */
  name: string;
  size?: number;
};

/** Deterministic tint per guest so the same person keeps the same colour. */
const TINTS = ['#003B6F', '#00A0A4', '#3D72A0', '#007E81', '#1A5587', '#005F61'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** Circular initials avatar — used in booking rows and client lists. */
export function Avatar({ name, size = 40 }: AvatarProps) {
  const { colors } = useTheme();
  const backgroundColor = tintFor(name);

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}>
      <Text
        color={colors.onColor}
        style={{ fontFamily: 'Inter_600SemiBold', fontSize: size * 0.36 }}>
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
