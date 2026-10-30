/**
 * The amber box that says what a link change does to a collective (CQ-01; web
 * `CollectiveBreakWarning.tsx`, 2026-10-29), shown in Unlink, Reduce access, Edit permissions and
 * Accept change whenever the change takes a venue out: who leaves, whether the collective carries on,
 * waits or ends, that the venue's other links stay, the way to do only that instead (the host removes
 * the venue, a member leaves), and, when the collective would end, its name to type before the
 * confirm button works.
 *
 * The words come from the plan the server works out (`collectiveHolds`, or a 409's
 * `collectiveBreak`), the same one it checks and the reconcile follows.
 */
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { linkBreakInstead, linkBreakLines } from '@/lib/linked/collective-hold';
import { setupCopy } from '@/lib/linked/setup-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkCollectiveBreak } from '@/types/linked-venues';

export function CollectiveBreakWarning({
  info,
  myVenueId,
  otherVenueName,
  proposal = false,
  onRemoveInstead,
  onLeaveInstead,
  typed,
  onTypedChange,
  disabled = false,
}: {
  info: LinkCollectiveBreak;
  myVenueId: string;
  otherVenueName: string;
  /** A proposed change: nothing happens until the other venue accepts it. */
  proposal?: boolean;
  /** The host can take the other venue off the page and keep the link instead. */
  onRemoveInstead?: () => void;
  /** A member can leave the collective and keep its links instead. */
  onLeaveInstead?: () => void;
  /** The typed name, when the collective would end and the change happens on confirm. */
  typed?: string;
  onTypedChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const collective = info.collectiveName;
  const title = setupCopy('linkBreak.title', { collective });
  const venuesInIt = info.plan.leaving.length + info.plan.remaining.length;
  const instead = linkBreakInstead(info);
  const offerRemove = instead === 'remove' && !!onRemoveInstead;
  const offerLeave = instead === 'leave' && !!onLeaveInstead;

  return (
    <View
      accessibilityLabel={title}
      testID="collective-break-warning"
      style={[styles.box, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="label">{title}</Text>
      {proposal ? (
        <Text variant="bodySmall" style={styles.strong}>
          {setupCopy('linkBreak.ifAccepted', { venue: otherVenueName })}
        </Text>
      ) : null}
      {linkBreakLines(info, myVenueId).map((line) => (
        <View key={line} style={styles.bullet}>
          <Text variant="bodySmall">{'•'}</Text>
          <Text variant="bodySmall" style={styles.flex1}>
            {line}
          </Text>
        </View>
      ))}
      {venuesInIt > 2 ? <Text variant="bodySmall">{setupCopy('linkBreak.otherLinks', { collective })}</Text> : null}
      {offerRemove || offerLeave ? (
        <View style={[styles.instead, { borderTopColor: colors.warning }]}>
          <Text variant="bodySmall">
            {offerRemove
              ? setupCopy('linkBreak.instead.remove', { venue: otherVenueName, collective })
              : setupCopy('linkBreak.instead.leave', { collective })}
          </Text>
          <Button
            label={
              offerRemove
                ? setupCopy('linkBreak.instead.removeButton', { venue: otherVenueName, collective })
                : setupCopy('linkBreak.instead.leaveButton', { collective })
            }
            variant="secondary"
            size="sm"
            style={styles.start}
            disabled={disabled}
            onPress={offerRemove ? onRemoveInstead : onLeaveInstead}
          />
        </View>
      ) : null}
      {info.plan.outcome === 'ends' && onTypedChange ? (
        <Input
          label={setupCopy('dissolve.typeToConfirm', { collective })}
          value={typed ?? ''}
          onChangeText={onTypedChange}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          testID="collective-break-typed"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  strong: {
    fontWeight: '600',
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  instead: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  start: {
    alignSelf: 'flex-start',
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
