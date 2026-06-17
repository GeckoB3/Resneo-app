import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Input } from '@/components/ui/Input';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  pickVenueImage,
  useCollectiveCatalogue,
  useUpdateCollective,
  useUploadPageAsset,
} from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingTeamProfile, CombinedBookingPageConfig } from '@/types/collectives';

/** Web parity: max bio length on a team profile. */
const TEAM_BIO_MAX = 600;
/** Web parity: max specialties length on a team profile. */
const TEAM_SPECIALTIES_MAX = 200;

/** A practitioner/calendar that can have a public team profile. */
type TeamMember = { id: string; name: string };

/**
 * Build the team list from the catalogue's member sources — every member
 * venue's calendars/practitioners, deduped by id, venue-qualified on a name
 * clash (parity with the web `buildEditorTeam`). The web list draws from the
 * curated catalogue providers; this brief sources directly from
 * `memberSources[].practitioners` so a profile can be set up before a
 * calendar is assigned to an offering.
 */
function buildTeamList(
  memberSources: { venueName: string; practitioners: { id: string; name: string }[] }[],
): TeamMember[] {
  const byId = new Map<string, { name: string; venueName: string }>();
  for (const ms of memberSources) {
    for (const p of ms.practitioners) {
      if (!byId.has(p.id)) byId.set(p.id, { name: p.name, venueName: ms.venueName });
    }
  }
  const nameCounts = new Map<string, number>();
  for (const { name } of byId.values()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  return [...byId.entries()].map(([id, { name, venueName }]) => ({
    id,
    name: (nameCounts.get(name) ?? 0) > 1 ? `${name} · ${venueName}` : name,
  }));
}

/**
 * Per-calendar team-profile editor for the combined booking page (parity with
 * the web BookingPageEditor "Meet the team" section). Lists every member
 * practitioner/calendar; each expands into an editor for its
 * `bookingPageConfig.team_profiles[id]` profile: photo, specialties, bio, and a
 * "Hide from page" toggle.
 *
 * Every save merges `team_profiles[id] = profile` into the current config
 * non-destructively — other ids and every other bookingPageConfig key are
 * spread back untouched.
 */
export function CombinedPageTeamProfiles({
  collectiveId,
  config,
  onChanged,
}: {
  collectiveId: string;
  /** The current merged bookingPageConfig (so we preserve sibling keys/ids on save). */
  config: CombinedBookingPageConfig;
  /** Called after a save that affects the collective list. */
  onChanged: () => void;
}) {
  const catalogueQuery = useCollectiveCatalogue(collectiveId);
  const memberSources = catalogueQuery.data?.catalogue?.memberSources;

  const team = useMemo(() => buildTeamList(memberSources ?? []), [memberSources]);
  const profiles = config.team_profiles ?? {};

  return (
    <>
      <SectionHeader title="Meet the team" />
      {catalogueQuery.isLoading ? (
        <Card>
          <Text variant="caption" tone="muted">
            Loading the team…
          </Text>
        </Card>
      ) : team.length === 0 ? (
        <Card>
          <Text variant="caption" tone="muted">
            Add bookable team members to configure their profiles.
          </Text>
        </Card>
      ) : (
        <>
          <Text variant="caption" tone="muted">
            Add a photo, short bio, and specialties for each team member.
          </Text>
          {team.map((member) => (
            <TeamMemberRow
              key={member.id}
              collectiveId={collectiveId}
              config={config}
              member={member}
              profile={profiles[member.id] ?? {}}
              onChanged={onChanged}
            />
          ))}
        </>
      )}
    </>
  );
}

function TeamMemberRow({
  collectiveId,
  config,
  member,
  profile,
  onChanged,
}: {
  collectiveId: string;
  config: CombinedBookingPageConfig;
  member: TeamMember;
  profile: BookingTeamProfile;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateCollective();
  const upload = useUploadPageAsset();

  // Local draft so typing is smooth; persisted on blur (text) or immediately
  // (photo / hidden toggle). Seeded from the stored profile.
  const [bio, setBio] = useState(profile.bio ?? '');
  const [specialties, setSpecialties] = useState(profile.specialties ?? '');

  const photo = profile.photo ?? null;
  const hidden = profile.hidden === true;

  /**
   * Merge a partial profile change for THIS member into the config and save.
   * Non-destructive: other team_profiles ids and other config keys are spread
   * back unchanged. Reads the latest stored profile so independent fields
   * (text + photo + toggle) never clobber one another.
   */
  async function savePatch(patch: Partial<BookingTeamProfile>) {
    const existing = config.team_profiles?.[member.id] ?? {};
    const nextProfile: BookingTeamProfile = { ...existing, ...patch };
    const nextProfiles = { ...(config.team_profiles ?? {}), [member.id]: nextProfile };
    await update.mutateAsync({
      collectiveId,
      payload: { bookingPageConfig: { ...config, team_profiles: nextProfiles } },
    });
    onChanged();
  }

  function commitBio() {
    const next = bio.trim() || null;
    if (next === (profile.bio ?? null)) return;
    void savePatch({ bio: next }).catch((e) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not save the bio.'),
    );
  }

  function commitSpecialties() {
    const next = specialties.trim() || null;
    if (next === (profile.specialties ?? null)) return;
    void savePatch({ specialties: next }).catch((e) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not save the specialties.'),
    );
  }

  async function handlePhoto() {
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      const url = await upload.mutateAsync({
        collectiveId,
        kind: 'team',
        uri: picked.uri,
        mimeType: picked.mimeType,
      });
      await savePatch({ photo: url });
      hapticSuccess();
      toast.success('Photo updated.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the photo.');
    }
  }

  async function removePhoto() {
    try {
      await savePatch({ photo: null });
      hapticSuccess();
      toast.success('Photo removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove the photo.');
    }
  }

  function toggleHidden(nextValue: boolean) {
    // Switch label is "Hide from page" — on means hidden.
    void savePatch({ hidden: nextValue }).catch((e) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not update visibility.'),
    );
  }

  const summary = hidden ? 'Hidden' : photo || bio.trim() || specialties.trim() ? 'Set up' : undefined;

  return (
    <CollapsibleCard title={member.name} summary={summary}>
      <View style={styles.body}>
        <View style={styles.photoRow}>
          <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text variant="subheading" tone="muted">
                {member.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.photoActions}>
            <Button
              label={photo ? 'Change photo' : 'Add photo'}
              variant="secondary"
              size="sm"
              loading={upload.isPending}
              onPress={() => void handlePhoto()}
            />
            {photo ? (
              <Button
                label="Remove photo"
                variant="ghost"
                size="sm"
                loading={update.isPending}
                onPress={() => void removePhoto()}
              />
            ) : null}
          </View>
        </View>

        <Input
          label="Specialties"
          optional
          placeholder="Specialties (comma-separated)"
          value={specialties}
          onChangeText={setSpecialties}
          onBlur={commitSpecialties}
          maxLength={TEAM_SPECIALTIES_MAX}
        />
        <Input
          label="Short bio"
          optional
          placeholder="Short bio"
          value={bio}
          onChangeText={setBio}
          onBlur={commitBio}
          multiline
          style={styles.multiline}
          maxLength={TEAM_BIO_MAX}
        />

        <View style={styles.switchRow}>
          <Text variant="bodyMedium" style={styles.flex1}>
            Hide from page
          </Text>
          <Switch value={hidden} onValueChange={toggleHidden} disabled={update.isPending} />
        </View>
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  photoActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
