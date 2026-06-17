import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCreateCollective, useSlugAvailable } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView } from '@/types/linked-venues';

/** Sanitise typed input into a slug fragment (lowercase, a-z 0-9 and hyphens). */
function toSlugFragment(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/**
 * Create a venue collective (Flow 10). Name + booking-page address (slug, prefixed
 * `/book/c/`, with debounced availability) + ≥1 eligible (full-mutual) venue.
 * Copy ported verbatim from the web CreateCollectiveModal.
 */
export function CreateCollectiveSheet({
  visible,
  venueName,
  eligibleLinks,
  onClose,
  onCreated,
}: {
  visible: boolean;
  venueName: string;
  /** Linked venues eligible to invite (full mutual create/edit/cancel). */
  eligibleLinks: AccountLinkView[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateCollective();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [invited, setInvited] = useState<string[]>([]);

  const slugQuery = useSlugAvailable(slug);
  const slugState = slug.trim() ? slugQuery.data ?? null : null;

  const canSubmit =
    !create.isPending &&
    name.trim().length >= 2 &&
    slugState?.available === true &&
    invited.length >= 1;

  const toggleInvite = (venueId: string) =>
    setInvited((cur) =>
      cur.includes(venueId) ? cur.filter((v) => v !== venueId) : [...cur, venueId],
    );

  const handleCreate = () => {
    create.mutate(
      {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        inviteVenueIds: invited,
      },
      {
        onSuccess: () => {
          toast.success('Venue collective created.');
          setName('');
          setSlug('');
          setInvited([]);
          onCreated();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to create collective.'),
      },
    );
  };

  const slugColor = slugState
    ? slugState.available
      ? colors.success
      : colors.danger
    : colors.textMuted;

  const eligible = useMemo(() => eligibleLinks, [eligibleLinks]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text variant="subheading">Create a venue collective</Text>
        <Text variant="bodySmall" tone="secondary">
          Combine your venue with linked venues on one branded public booking page.
        </Text>

        <Input
          label="Collective name"
          value={name}
          onChangeText={setName}
          maxLength={120}
          placeholder="e.g. The Riverside Wellbeing Collective"
        />

        <View style={styles.field}>
          <Input
            label="Booking-page address"
            value={slug}
            onChangeText={(t) => setSlug(toSlugFragment(t))}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="riverside-wellbeing"
            leftIcon={
              <Text variant="bodySmall" tone="muted">
                /book/c/
              </Text>
            }
          />
          {slug.trim() ? (
            <Text variant="caption" color={slugColor}>
              {slugQuery.isFetching
                ? 'Checking address…'
                : slugState
                  ? slugState.available
                    ? 'Address is available.'
                    : slugState.reason ?? 'Address is not available.'
                  : ''}
            </Text>
          ) : null}
        </View>

        <View style={[styles.notice, { backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="muted">
            Your combined page works like a single venue — one services menu and one team across all
            members. After creating it, use Manage combined page to choose which services to offer,
            assign calendars from any venue, and design the page.
          </Text>
        </View>

        <View style={styles.inviteBlock}>
          <Text variant="label" tone="secondary">
            Invite linked venues
          </Text>
          <Text variant="caption" tone="muted">
            {`Only venues granting create/edit/cancel access both ways with ${venueName} can be invited.`}
          </Text>
          {eligible.length === 0 ? (
            <Text variant="caption" tone="danger">
              No eligible linked venues.
            </Text>
          ) : (
            <View style={styles.inviteList}>
              {eligible.map((link) => {
                const selected = invited.includes(link.otherVenue.id);
                return (
                  <PressableScale
                    key={link.id}
                    onPress={() => toggleInvite(link.otherVenue.id)}
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={link.otherVenue.name}>
                    <View
                      style={[
                        styles.inviteRow,
                        {
                          backgroundColor: selected ? colors.brandSubtle : colors.surface,
                          borderColor: selected ? colors.brand : colors.border,
                        },
                      ]}>
                      <CheckBox checked={selected} />
                      <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
                        {link.otherVenue.name}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            style={styles.flex1}
            disabled={create.isPending}
            onPress={onClose}
          />
          <Button
            label="Create collective"
            variant="primary"
            style={styles.flex1}
            disabled={!canSubmit}
            loading={create.isPending}
            onPress={handleCreate}
          />
        </View>
      </View>
    </Sheet>
  );
}

/** A simple square checkbox glyph driven by `checked`. */
function CheckBox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        {
          backgroundColor: checked ? colors.brand : 'transparent',
          borderColor: checked ? colors.brand : colors.borderStrong,
        },
      ]}>
      {checked ? (
        <Text variant="caption" color={colors.onBrand} style={styles.check}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  inviteBlock: {
    gap: spacing.xs,
  },
  inviteList: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
