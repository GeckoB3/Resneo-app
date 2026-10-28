import { StyleSheet, Switch, View } from 'react-native';

import { SyncBadge } from '@/components/collective-area/AreaPieces';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { groupStatus, valueChips, venueWarnings, type CollectiveCalendarGroup } from '@/lib/collective-area/model';
import {
  collectiveCalendarState,
  lastChangedLine,
  toggleCollectiveCalendar,
  type CollectiveCalendarsDiff,
} from '@/lib/services/collective-calendars';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ServiceCollectiveBlock } from '@/types/services-manage';

/**
 * Which calendars offer a page service, at every venue in the collective (web
 * `CollectiveCalendarsSection.tsx`, 2026-10-28). It takes the place of the host's own "Offered by"
 * in the service form: the host's venue first, then the members, each calendar a switch with what
 * it charges or times differently and an "Edit values" for one that offers it now.
 *
 * Nothing here writes. The ticks are held as a diff and go with the form's Save; "Edit values"
 * opens a step of the same sheet.
 */
export function CollectiveCalendarsSection({
  groups,
  itemId,
  collectiveName,
  currencySymbol,
  value,
  onChange,
  onEditValues,
  hiddenReasons = [],
  disabled = false,
}: {
  groups: CollectiveCalendarGroup[];
  /** The offering this service is on the page. */
  itemId: string;
  collectiveName: string;
  currencySymbol: string;
  value: CollectiveCalendarsDiff;
  onChange: (next: CollectiveCalendarsDiff) => void;
  onEditValues?: (venueId: string, calendarId: string) => void;
  /** From the service's `collective.hidden_reasons`: where guests cannot book it, and why. */
  hiddenReasons?: ServiceCollectiveBlock['hidden_reasons'];
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  // The host's venue first, then the members as the server orders them.
  const ordered = [...groups.filter((g) => g.is_host), ...groups.filter((g) => !g.is_host)];

  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted">
        {areaCopy('svc.cal.heading')}
      </Text>
      <Text variant="caption" tone="muted">
        {areaCopy('svc.cal.help.collective', { collective: collectiveName })}
      </Text>
      {ordered.map((group) => {
        const warnings = venueWarnings(group, hiddenReasons, collectiveName, itemId);
        const venueLabel = group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name;
        return (
          <View key={group.venue_id} style={[styles.venue, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.venueHead}>
              <Text variant="label" style={styles.flex1}>
                {venueLabel}
              </Text>
              <SyncBadge status={groupStatus(group)} />
            </View>
            {warnings.map((warning) => (
              <Text key={warning} variant="caption" color={colors.warning}>
                {warning}
              </Text>
            ))}
            {group.calendars.length === 0 ? (
              <Text variant="caption" tone="muted">
                {areaCopy('svc.cal.noCalendars', { venue: group.venue_name })}
              </Text>
            ) : null}
            {group.calendars.map((calendar) => {
              const ref = { calendar_id: calendar.id, venue_id: group.venue_id };
              const assignment = calendar.assigned.find((a) => a.item_id === itemId) ?? null;
              const savedOn = assignment !== null;
              const state = collectiveCalendarState(value, ref, savedOn);
              const chips = valueChips(assignment ?? undefined, currencySymbol);
              const changed = lastChangedLine(assignment);
              return (
                <View key={calendar.id} style={styles.calendarRow}>
                  <View style={styles.flex1}>
                    <Text variant="bodySmall">{calendar.name}</Text>
                    {!calendar.is_active ? (
                      <Text variant="caption" tone="muted">
                        {areaCopy('svc.cal.inactiveOther', { venue: group.venue_name })}
                      </Text>
                    ) : null}
                    {chips.length > 0 ? (
                      <Text variant="caption" tone="muted">
                        {chips.join(' · ')}
                      </Text>
                    ) : null}
                    {state.pendingAdd ? (
                      <Text variant="caption" tone="brand">
                        {areaCopy('svc.cal.notSaved.add')}
                      </Text>
                    ) : null}
                    {state.pendingRemove ? (
                      <Text variant="caption" color={colors.warning}>
                        {areaCopy('svc.cal.notSaved.remove')}
                      </Text>
                    ) : null}
                    {changed ? (
                      <Text variant="caption" tone="muted">
                        {changed}
                      </Text>
                    ) : null}
                  </View>
                  {savedOn && onEditValues ? (
                    <Button
                      label={areaCopy('svc.cal.editValues')}
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      accessibilityLabel={areaCopy('svc.member.view.editValuesFor', { calendar: calendar.name })}
                      onPress={() => onEditValues(group.venue_id, calendar.id)}
                    />
                  ) : null}
                  <Switch
                    value={state.checked}
                    disabled={disabled}
                    accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                    onValueChange={(next) => onChange(toggleCollectiveCalendar(value, ref, savedOn, next))}
                    trackColor={{ true: colors.brand, false: colors.border }}
                    thumbColor={colors.surfaceRaised}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  venue: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  venueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
