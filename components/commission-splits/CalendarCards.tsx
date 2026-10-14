import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { splitsT } from '@/lib/commission/splits-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SplitPartnerOption, SplitView } from '@/types/commission-splits';

/**
 * The calendar-first page's rows (web `CalendarRow`, `LineRow` and `PartnerGroups`): one card per
 * calendar (or login) with a line per share of what it takes, and the calendars at businesses you
 * work with, grouped by business.
 */

/** One calendar (or login): its name, an action beside it, and a line per share of what it takes. */
export function CalendarCard({ name, action, children }: { name: string; action?: ReactNode; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.head}>
        <Text variant="bodyMedium" style={styles.flex}>
          {name}
        </Text>
        {action ?? null}
      </View>
      <View style={styles.lines}>{children}</View>
    </View>
  );
}

/** One share in words, the small print under it, its badge and its button. */
export function LineRow({
  text,
  extra,
  badge,
  action,
}: {
  text: string;
  extra?: string | null;
  badge?: { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' } | null;
  action?: ReactNode;
}) {
  return (
    <View style={styles.line}>
      <Text variant="bodySmall">{text}</Text>
      {extra ? (
        <Text variant="caption" tone="muted">
          {extra}
        </Text>
      ) : null}
      {badge || action ? (
        <View style={styles.foot}>
          <View style={styles.flex}>{badge ? <Badge label={badge.label} tone={badge.tone} /> : null}</View>
          {action ?? null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Calendars at businesses you work with, grouped by business: each listed calendar with the splits
 * they pay you on it, or "No split yet." and "Set up a split". A business with a live split on a
 * calendar it no longer lists still shows that split. With none at all, what links and collectives
 * make possible, and the way to Linked venues.
 */
export function PartnerGroups({
  partners,
  live,
  splitLine,
  onSetUp,
  onLinkedVenues,
}: {
  partners: SplitPartnerOption[];
  live: SplitView[];
  splitLine: (s: SplitView) => ReactNode;
  onSetUp: (partnerId: string, calendarId: string) => void;
  onLinkedVenues: () => void;
}) {
  const theirs = live.filter((s) => s.role === 'payee');
  const groups = partners.map((p) => ({
    partner: { venue_id: p.venue_id, name: p.name },
    access: p.access as SplitPartnerOption['access'] | null,
    calendars: p.their_calendars,
  }));
  for (const s of theirs) {
    if (!groups.some((g) => g.partner.venue_id === s.partner.venue_id)) groups.push({ partner: s.partner, access: null, calendars: [] });
  }
  const shown = groups.filter((g) => g.calendars.length || theirs.some((s) => s.partner.venue_id === g.partner.venue_id));

  if (!shown.length) {
    return (
      <View style={styles.empty}>
        <Text variant="bodySmall" tone="secondary">
          {splitsT('cal.theirs.empty')}
        </Text>
        <Pressable onPress={onLinkedVenues} accessibilityRole="link" hitSlop={8}>
          <Text variant="label" tone="brand">
            {splitsT('cal.theirs.emptyAction')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.groups}>
      {shown.map((g) => {
        const listed = new Set(g.calendars.map((c) => c.id));
        const extraCalendars = theirs
          .filter((s) => s.partner.venue_id === g.partner.venue_id && !listed.has(s.calendar.id))
          .map((s) => s.calendar)
          .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
        return (
          <View key={g.partner.venue_id} style={styles.group}>
            <View style={styles.groupHead}>
              <Text variant="label" accessibilityRole="header">
                {g.partner.name}
              </Text>
              {g.access ? <Badge label={splitsT(g.access === 'link' ? 'cal.theirs.link' : 'cal.theirs.collective')} /> : null}
            </View>
            {[...g.calendars, ...extraCalendars].map((c) => {
              const lines = theirs.filter((s) => s.partner.venue_id === g.partner.venue_id && s.calendar.id === c.id);
              return (
                <CalendarCard
                  key={c.id}
                  name={c.name}
                  action={
                    !lines.length && listed.has(c.id) ? (
                      <Button
                        label={splitsT('cal.setUp')}
                        size="sm"
                        variant="secondary"
                        accessibilityLabel={`${splitsT('cal.setUp')}: ${splitsT('biz.calendarAt', { calendar: c.name, business: g.partner.name })}`}
                        onPress={() => onSetUp(g.partner.venue_id, c.id)}
                      />
                    ) : null
                  }>
                  {lines.length ? lines.map(splitLine) : <LineRow text={splitsT('cal.none')} />}
                </CalendarCard>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  flex: { flex: 1, minWidth: 0 },
  lines: { gap: spacing.md },
  line: { gap: spacing.xxs },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxs },
  empty: { gap: spacing.sm, alignItems: 'flex-start' },
  groups: { gap: spacing.lg },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
