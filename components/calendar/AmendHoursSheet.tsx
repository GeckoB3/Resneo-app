/**
 * The diary's clock button (web `CalendarHoursQuickEdit`, 2026-09-10).
 *
 * Admins choose between amending calendar hours and amending business hours;
 * staff go straight to calendar hours, where the Availability screen already
 * limits them to the calendars they are allocated. Both destinations are the
 * real settings screens, so nothing here saves anything itself: the chooser
 * pushes the screen with the diary's day (and, for calendar hours, the viewed
 * calendar) so the closures editor opens on that day.
 *
 * On the web both editors open in a dialog over the diary; the app pushes the
 * screens instead, because a second Sheet over the calendar's own sheets is
 * the stacked-modal pattern iOS drops ([[ios-no-stacked-modals]]). Every save
 * on those screens invalidates what the diary reads — the calendars, the leave
 * feed, the venue's blocks and its hours — so the diary is already right when
 * the user comes back; nothing refetches on focus.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type AmendHoursTarget = {
  /** yyyy-mm-dd the diary is showing; the closures editors open with it picked. */
  date: string;
  /** The viewed calendar, when the diary shows one; preselected in the editor. */
  calendarId?: string | null;
};

/** Where the chooser sends the user (exported for the calendar screen's tests). */
export function amendCalendarHoursHref(target: AmendHoursTarget): Href {
  return {
    pathname: '/availability',
    params: {
      tab: 'daysoff',
      date: target.date,
      ...(target.calendarId ? { calendar: target.calendarId } : {}),
    },
  };
}

export function amendBusinessHoursHref(target: AmendHoursTarget): Href {
  return { pathname: '/manage/hours', params: { date: target.date } };
}

type Props = {
  target: AmendHoursTarget | null;
  /** A venue admin may amend business hours; everyone else goes to calendar hours. */
  isAdmin: boolean;
  onClose: () => void;
};

export function AmendHoursSheet({ target, isAdmin, onClose }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  // Staff have one destination, so the chooser never shows: go straight there.
  const direct = target && !isAdmin ? amendCalendarHoursHref(target) : null;
  useEffect(() => {
    if (!direct) return;
    onClose();
    router.push(direct);
    // `direct` is rebuilt per render; the target's identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.date, target?.calendarId, isAdmin]);

  const go = (href: Href) => {
    hapticSelect();
    onClose();
    router.push(href);
  };

  const visible = Boolean(target) && isAdmin;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <Text variant="subheading">Amend hours</Text>
          <Text variant="bodySmall" tone="secondary">
            Change when a calendar works, or when the business is open.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Amend calendar hours"
          onPress={() => target && go(amendCalendarHoursHref(target))}
          style={({ pressed }) => [
            styles.option,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text variant="label">Amend calendar hours</Text>
          <Text variant="caption" tone="muted">
            Weekly availability, breaks, and closures or amended hours for one calendar.
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Amend business hours"
          onPress={() => target && go(amendBusinessHoursHref(target))}
          style={({ pressed }) => [
            styles.option,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text variant="label">Amend business hours</Text>
          <Text variant="caption" tone="muted">
            Weekly opening hours, and closures or amended hours for the whole venue.
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  option: {
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
});
