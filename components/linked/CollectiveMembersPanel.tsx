import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCollectiveMemberAction, useDissolveCollective } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => void;
};

/**
 * Members tab (Flow 12, host only). Lists members (Make host / Remove with
 * confirms), invites eligible non-members, and dissolves the collective.
 * Copy ported verbatim from the web MembersSection.
 */
export function CollectiveMembersPanel({
  collective,
  eligibleLinks,
  onDissolved,
}: {
  collective: CollectiveView;
  /** Linked venues eligible to invite (full mutual create/edit/cancel). */
  eligibleLinks: AccountLinkView[];
  /** Called after the collective is dissolved (so the parent can navigate away). */
  onDissolved: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const memberAction = useCollectiveMemberAction();
  const dissolve = useDissolveCollective();

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const busy = memberAction.isPending || dissolve.isPending;

  const memberVenueIds = new Set(collective.members.map((m) => m.venueId));
  const invitable = eligibleLinks.filter((l) => !memberVenueIds.has(l.otherVenue.id));

  const runMember = (
    payload: Parameters<typeof memberAction.mutate>[0]['payload'],
    successMsg: string,
  ) => {
    memberAction.mutate(
      { collectiveId: collective.id, payload },
      {
        onSuccess: () => toast.success(successMsg),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Action failed.'),
      },
    );
  };

  const handleDissolve = () => {
    dissolve.mutate(collective.id, {
      onSuccess: () => {
        toast.success('Collective dissolved.');
        onDissolved();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Failed to dissolve the collective.'),
    });
  };

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <Text variant="label">Members</Text>
        {collective.members.map((m, i) => {
          const isHostMember = m.venueId === collective.hostVenueId;
          return (
            <View
              key={m.venueId}
              style={[
                styles.memberRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}>
              <View style={styles.flex1}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {m.venueName}
                </Text>
                {isHostMember ? (
                  <Text variant="caption" color={colors.brand}>
                    Host
                  </Text>
                ) : m.status === 'invited' ? (
                  <Text variant="caption" color={colors.warning}>
                    Invited
                  </Text>
                ) : null}
              </View>
              <View style={styles.memberActions}>
                {m.status === 'active' && !isHostMember ? (
                  <Button
                    label="Make host"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({
                        title: 'Transfer host?',
                        message: `Make ${m.venueName} the host? They will control this collective's settings and members; your venue becomes a regular member. Only the new host can transfer it back.`,
                        confirmLabel: 'Transfer host',
                        danger: false,
                        run: () =>
                          runMember(
                            { action: 'transfer_host', venueId: m.venueId },
                            `${m.venueName} is now the host.`,
                          ),
                      })
                    }
                  />
                ) : null}
                {!isHostMember ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({
                        title: 'Remove member?',
                        message: `Remove ${m.venueName} from "${collective.name}"? It will no longer appear on the combined page.`,
                        confirmLabel: 'Remove member',
                        danger: true,
                        run: () =>
                          runMember(
                            { action: 'remove', venueId: m.venueId },
                            `${m.venueName} removed.`,
                          ),
                      })
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={styles.card}>
        <Text variant="label">Invite a venue</Text>
        {invitable.length === 0 ? (
          <Text variant="caption" tone="muted">
            No further venues with full create/edit/cancel links both ways are available to invite.
          </Text>
        ) : (
          <Button
            label="Choose a venue to invite"
            variant="secondary"
            disabled={busy}
            onPress={() => setInviteOpen(true)}
          />
        )}
      </Card>

      <Button
        label="Dissolve collective"
        variant="danger"
        fullWidth
        disabled={busy}
        loading={dissolve.isPending}
        onPress={() =>
          setConfirm({
            title: 'Dissolve collective?',
            message: `Dissolve "${collective.name}"? The combined booking page goes offline immediately. Each venue keeps its own page and data.`,
            confirmLabel: 'Dissolve collective',
            danger: true,
            run: handleDissolve,
          })
        }
      />

      {/* Invite picker */}
      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)}>
        <View style={styles.inviteSheet}>
          <Text variant="subheading">Invite a venue</Text>
          <Text variant="bodySmall" tone="secondary">
            Only venues granting create/edit/cancel access both ways are eligible.
          </Text>
          <View style={styles.inviteList}>
            {invitable.map((l) => (
              <PressableScale
                key={l.id}
                disabled={busy}
                accessibilityLabel={`Invite ${l.otherVenue.name}`}
                onPress={() => {
                  setInviteOpen(false);
                  runMember(
                    { action: 'invite', venueId: l.otherVenue.id },
                    `Invitation sent to ${l.otherVenue.name}.`,
                  );
                }}>
                <View style={[styles.inviteRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
                    {l.otherVenue.name}
                  </Text>
                  <Badge label="Eligible" tone="success" />
                </View>
              </PressableScale>
            ))}
          </View>
        </View>
      </Sheet>

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.danger ?? true}
        loading={busy}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          run?.();
        }}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  inviteSheet: {
    gap: spacing.md,
  },
  inviteList: {
    gap: spacing.sm,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 48,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
