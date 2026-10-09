/**
 * ResNeo's platform announcements at the top of Today and More: web parity with
 * `src/components/dashboard/PlatformAnnouncementBanners.tsx`. Each banner carries its severity
 * pill, title and body, and a close button that dismisses it for this person on every device.
 */
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import {
  ANNOUNCEMENT_PILL_LABEL,
  useDismissAnnouncement,
  usePlatformAnnouncements,
  type AnnouncementSeverity,
} from '@/lib/queries/usePlatformAnnouncements';
import { radius, spacing, type ThemeColors } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

function severityColours(severity: AnnouncementSeverity, colors: ThemeColors) {
  switch (severity) {
    case 'critical':
      return { bg: colors.dangerSurface, border: colors.danger, fg: colors.danger };
    case 'warning':
      return { bg: colors.warningSurface, border: colors.warning, fg: colors.warning };
    default:
      return { bg: colors.infoSurface, border: colors.brandBorder, fg: colors.brand };
  }
}

export function PlatformAnnouncementBanners() {
  const { colors } = useTheme();
  const { data } = usePlatformAnnouncements();
  const dismiss = useDismissAnnouncement();

  const visible = data ?? [];
  if (visible.length === 0) return null;

  return (
    <View style={styles.stack}>
      {visible.map((a) => {
        const c = severityColours(a.severity, colors);
        return (
          <View
            key={a.id}
            style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}
            accessibilityRole="summary"
            testID={`announcement-${a.id}`}>
            <View style={styles.text}>
              <View style={[styles.pill, { borderColor: c.border }]}>
                <Text variant="caption" color={c.fg} style={styles.pillText}>
                  {ANNOUNCEMENT_PILL_LABEL[a.severity]}
                </Text>
              </View>
              <Text variant="bodyMedium">{a.title}</Text>
              <Text variant="bodySmall" tone="secondary">
                {a.body}
              </Text>
            </View>
            <IconButton
              icon={{ ios: 'xmark', android: 'close', web: 'close' }}
              accessibilityLabel="Dismiss announcement"
              tint={colors.textMuted}
              iconSize={16}
              onPress={() => dismiss.mutate(a.id)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: { flex: 1, gap: spacing.xs, paddingVertical: spacing.sm },
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  pillText: { fontWeight: '600' },
});
