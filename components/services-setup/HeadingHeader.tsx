import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { CalendarChips, TextLink, calendarSummary } from './bits';

/**
 * The line above each heading's services on the review list (web `HeadingHeader.tsx`): its
 * colour, name and count; Rename (renaming onto another heading merges the two); Add ready (n);
 * Skip all or Bring all back; and "Offered by …" for choosing that heading's calendars.
 */

export interface HeadingHeaderProps {
  heading: string;
  colour: string;
  count: number;
  pending: number;
  skipped: number;
  ready: number;
  /** Other headings, for the rename suggestions (renaming onto one merges the two). */
  otherHeadings: string[];
  calendars: { id: string; name: string }[];
  /** The calendars this heading's services go to, and whether that is the heading's own choice. */
  calendarIds: string[];
  calendarsCustom: boolean;
  locked: boolean;
  /** The setup's heading actions, the same object for every heading (so this stays memoised). */
  actions: HeadingActions;
}

/** Each takes the heading's name as the list shows it. */
export interface HeadingActions {
  /** Rename; renaming onto another heading merges the two. */
  rename: (heading: string, next: string) => void;
  /** Add every service under this heading that is ready. */
  addReady: (heading: string) => void;
  skipAll: (heading: string) => void;
  restoreAll: (heading: string) => void;
  /** The heading's own calendars, or null to follow the setup's choice. */
  setCalendars: (heading: string, ids: string[] | null) => void;
}

function HeadingHeaderImpl({
  heading,
  colour,
  count,
  pending,
  skipped,
  ready,
  otherHeadings,
  calendars,
  calendarIds,
  calendarsCustom,
  locked,
  actions,
}: HeadingHeaderProps) {
  const { colors } = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(heading);
  const [showCalendars, setShowCalendars] = useState(false);
  const label = heading || 'No heading';

  function submitRename() {
    const next = draftName.trim().replace(/\s+/g, ' ').slice(0, 80);
    setRenaming(false);
    if (next !== heading) actions.rename(heading, next);
  }

  return (
    <View style={styles.wrap}>
      {renaming ? (
        <View style={styles.stackSm}>
          <Input
            label="Heading name"
            autoFocus
            value={draftName}
            maxLength={80}
            placeholder="Leave blank for no heading"
            onChangeText={setDraftName}
            returnKeyType="done"
            onSubmitEditing={submitRename}
          />
          {otherHeadings.length > 0 ? (
            <View style={styles.chips}>
              {otherHeadings.slice(0, 8).map((h) => (
                <Chip key={h} label={h} onPress={() => setDraftName(h)} />
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" size="sm" onPress={() => setRenaming(false)} />
            <Button label="Save" size="sm" onPress={submitRename} />
          </View>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: colour }]} />
          <Text variant="label" accessibilityRole="header" style={styles.flex}>
            {label}
            <Text variant="label" tone="muted">{` (${count})`}</Text>
          </Text>
        </View>
      )}
      {!renaming ? (
        <View style={styles.links}>
          {pending > 0 ? (
            <TextLink
              label="Rename"
              small
              accessibilityLabel={`Rename ${label}`}
              onPress={() => {
                setDraftName(heading);
                setRenaming(true);
              }}
              disabled={locked}
            />
          ) : null}
          {ready > 0 ? <TextLink label={`Add ready (${ready})`} small onPress={() => actions.addReady(heading)} disabled={locked} /> : null}
          {pending > 0 ? (
            <TextLink label="Skip all" small accessibilityLabel={`Skip all in ${label}`} onPress={() => actions.skipAll(heading)} disabled={locked} />
          ) : skipped > 0 ? (
            <TextLink label="Bring all back" small onPress={() => actions.restoreAll(heading)} disabled={locked} />
          ) : null}
        </View>
      ) : null}
      {calendars.length > 1 && pending > 0 ? (
        <View style={styles.stackXs}>
          <TextLink
            label={`Offered by ${calendarSummary(calendarIds, calendars)}`}
            small
            onPress={() => setShowCalendars((v) => !v)}
            disabled={locked}
          />
          {showCalendars ? (
            <View style={[styles.calendars, { borderColor: colors.border }]}>
              <CalendarChips calendars={calendars} selectedIds={calendarIds} onChange={(ids) => actions.setCalendars(heading, ids)} disabled={locked} />
              {calendarsCustom ? <TextLink label="Use the choice above" small onPress={() => actions.setCalendars(heading, null)} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const HeadingHeader = memo(HeadingHeaderImpl);

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  flex: {
    flex: 1,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
  },
  stackSm: {
    gap: spacing.sm,
  },
  stackXs: {
    gap: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  calendars: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
});
