import { StyleSheet, View } from 'react-native';

import { GrantEditor } from '@/components/linked/GrantEditor';
import { Text } from '@/components/ui/Text';
import { isLinkConfigurationValid, normaliseGrant } from '@/lib/linked/grants';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkGrant } from '@/types/linked-venues';

/**
 * Editor for BOTH directions of a link, with the zero-way validity check.
 * Mirrors the web `GrantPairEditor`:
 *  - `mine`   = what {otherVenueName} can do with YOUR data (= link.theyCan).
 *               Only this direction is calendar-scopeable (your own calendars).
 *  - `theirs` = what YOU can do with {otherVenueName}'s data (= link.iCan).
 */
export function GrantPairEditor({
  otherVenueName,
  mine,
  theirs,
  onChangeMine,
  onChangeTheirs,
  myCalendars,
  disabled = false,
}: {
  otherVenueName: string;
  mine: LinkGrant;
  theirs: LinkGrant;
  onChangeMine: (g: LinkGrant) => void;
  onChangeTheirs: (g: LinkGrant) => void;
  /** §18 — your own calendars; only the "mine" direction can be scoped. */
  myCalendars: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const valid = isLinkConfigurationValid(normaliseGrant(mine), normaliseGrant(theirs));

  return (
    <View style={styles.container}>
      <GrantEditor
        label={`What ${otherVenueName} can do with your data`}
        hint="This is the access your venue grants."
        value={mine}
        onChange={onChangeMine}
        disabled={disabled}
        calendars={myCalendars}
      />
      <GrantEditor
        label={`What you can do with ${otherVenueName}'s data`}
        hint="This is the access you are asking the other venue to grant."
        value={theirs}
        onChange={onChangeTheirs}
        disabled={disabled}
        calendars={[]}
      />
      {!valid ? (
        <View style={[styles.error, { backgroundColor: colors.dangerSurface }]}>
          <Text variant="caption" tone="danger">
            A link must grant access in at least one direction.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  error: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
