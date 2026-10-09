/**
 * The colour key's body (web `CalendarKeyDialog`), drawn inline so it can be a
 * step of the calendar tools sheet rather than a second Modal over it
 * ([[ios-no-stacked-modals]]).
 *
 * Each swatch is the band the grids draw (`closureBandLook`): the same wash,
 * hairline border and label colour, with a sample of the label text in it, so
 * the key matches the screen in light and dark mode alike.
 */
import { StyleSheet, View } from 'react-native';

import {
  CALENDAR_KEY_DESCRIPTION,
  CALENDAR_KEY_ENTRIES,
  CALENDAR_KEY_FOOTNOTE,
  calendarKeySwatch,
} from '@/components/calendar/calendar-key';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export function CalendarKeyPanel() {
  const { isDark } = useTheme();
  return (
    <View style={styles.body}>
      <Text variant="bodySmall" tone="secondary">
        {CALENDAR_KEY_DESCRIPTION}
      </Text>
      <View style={styles.list}>
        {CALENDAR_KEY_ENTRIES.map((entry) => {
          const look = calendarKeySwatch(entry, isDark);
          return (
            <View
              key={entry.label}
              style={styles.row}
              accessible
              accessibilityLabel={`${entry.label}. ${entry.meaning}`}>
              <View
                testID={`calendar-key-swatch-${entry.blockType}`}
                style={[
                  styles.swatch,
                  { backgroundColor: look.backgroundColor, borderColor: look.borderColor },
                ]}>
                <Text variant="caption" numberOfLines={1} style={{ color: look.labelColor }}>
                  Aa
                </Text>
              </View>
              <View style={styles.copy}>
                <Text variant="label">{entry.label}</Text>
                <Text variant="caption" tone="secondary">
                  {entry.meaning}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="muted">
        {CALENDAR_KEY_FOOTNOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingTop: 1,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
