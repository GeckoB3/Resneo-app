/**
 * The calendar toolbar's "More" sheet: the web toolbar's contact search button
 * (`searchAriaLabel="Search contacts"`) and its colour key button
 * (`CalendarKeyDialog`), folded behind one button so the phone toolbar keeps
 * room for the Day / Week / Month switch.
 *
 * One Sheet with steps rather than a menu that opens two more sheets: a second
 * Modal over a visible one is dropped on iOS ([[ios-no-stacked-modals]]). The
 * sheet always reopens on the menu.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CALENDAR_KEY_TITLE } from '@/components/calendar/calendar-key';
import { CalendarClientSearchPanel } from '@/components/calendar/CalendarClientSearchPanel';
import { CalendarKeyPanel } from '@/components/calendar/CalendarKeyPanel';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';

export type CalendarToolsMode = 'menu' | 'search' | 'key';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The venue's word for a client ("Client", "Guest"...). */
  clientWord: string;
  timeZone: string;
  onPickBooking: (row: GuestBookingHistoryRow) => void;
  onBook: (guestId: string) => void;
  onViewContact: (guestId: string) => void;
};

export function CalendarToolsSheet({
  visible,
  onClose,
  clientWord,
  timeZone,
  onPickBooking,
  onBook,
  onViewContact,
}: Props) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<CalendarToolsMode>('menu');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- every open starts on the menu
    if (visible) setMode('menu');
  }, [visible]);

  const open = (next: CalendarToolsMode) => {
    hapticSelect();
    setMode(next);
  };

  const clientLower = clientWord.toLowerCase();
  const optionStyle = ({ pressed }: { pressed: boolean }) => [
    styles.option,
    { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} fill={mode !== 'menu'} maxHeight="88%">
      {mode === 'menu' ? (
        <View style={styles.menu}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search contacts"
            onPress={() => open('search')}
            style={optionStyle}>
            <Text variant="label">Search contacts</Text>
            <Text variant="caption" tone="muted">
              {`Find a ${clientLower} by name, phone or email and go to one of their bookings.`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CALENDAR_KEY_TITLE}
            onPress={() => open('key')}
            style={optionStyle}>
            <Text variant="label">{CALENDAR_KEY_TITLE}</Text>
            <Text variant="caption" tone="muted">
              What the tints on closed and unavailable time tell you.
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.step}>
          <View style={styles.stepHeader}>
            <IconButton
              icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              accessibilityLabel="Back"
              onPress={() => setMode('menu')}
            />
            <Text variant="subheading" numberOfLines={1} style={styles.flex}>
              {mode === 'search' ? `Search ${clientLower}` : CALENDAR_KEY_TITLE}
            </Text>
          </View>
          {mode === 'search' ? (
            <CalendarClientSearchPanel
              clientWord={clientWord}
              timeZone={timeZone}
              onPickBooking={onPickBooking}
              onBook={onBook}
              onViewContact={onViewContact}
            />
          ) : (
            <KeyBody />
          )}
        </View>
      )}
    </Sheet>
  );
}

function KeyBody() {
  // The key is short, but a large text size can still outgrow the sheet.
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.keyContent}>
      <CalendarKeyPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  menu: {
    gap: spacing.md,
  },
  option: {
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  step: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keyContent: {
    paddingBottom: spacing.lg,
  },
});
