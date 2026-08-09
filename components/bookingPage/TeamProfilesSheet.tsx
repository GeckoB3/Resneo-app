import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ImageFramingEditor } from '@/components/bookingPage/ImageFramingEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { logoFramingTransform, type BookingTeamProfile } from '@/lib/booking/bookingPageConfig';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBookingPageTeam, useUpdateBookingPageConfig } from '@/lib/queries/useBookingPage';
import { pickVenueImage, useUploadTeamPhoto } from '@/lib/queries/useVenueImageUpload';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type TeamProfilesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type ProfileMap = Record<string, BookingTeamProfile>;

/** Circular member-photo thumbnail size; the framing transform scales to it. */
const THUMB = 64;

/**
 * "Meet the team" editor — per bookable member, set a photo, bio, specialties and
 * a hide toggle. Members come from GET /api/venue/booking-page-team; the
 * per-member profiles are stored in `booking_page_config.team_profiles` and saved
 * together. Needs the booking-page-team + team-photo routes deployed (Bearer).
 *
 * Each photo can be framed inside its public circle (`photo_crop`, web parity).
 * Framing edits swap the sheet content to the shared {@link ImageFramingEditor}
 * (no second stacked Sheet — flaky on iOS) and are drafts like the photo itself:
 * they publish on "Save team profiles". A replaced photo starts centred.
 */
export function TeamProfilesSheet({ visible, onClose }: TeamProfilesSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const teamQuery = useBookingPageTeam(visible);
  const update = useUpdateBookingPageConfig();
  const uploadPhoto = useUploadTeamPhoto();

  const [profiles, setProfiles] = useState<ProfileMap>({});
  // When set, the sheet shows the framing editor for this member instead of the
  // list (in-sheet mode step; see the component doc).
  const [framingId, setFramingId] = useState<string | null>(null);

  // Seed the local profile map from the stored config once the sheet is open AND
  // the venue has loaded (re-seeds if the venue arrives after open, so a Save can
  // never write an empty map over real profiles).
  useEffect(() => {
    if (!visible || !venue) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the sheet opens
    setProfiles({ ...(venue.booking_page_config?.team_profiles ?? {}) });
    setFramingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, venue?.id]);

  const members = teamQuery.data ?? [];

  const setProfile = (id: string, patch: Partial<BookingTeamProfile>) =>
    setProfiles((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handlePhoto = async (id: string) => {
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      const url = await uploadPhoto.mutateAsync(picked);
      // A new photo starts centred: framing chosen for the old one means nothing.
      setProfile(id, { photo: url, photo_crop: null });
      toast.info('Photo ready — tap Save to publish.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the photo.');
    }
  };

  async function handleSave() {
    try {
      await update.mutateAsync({ team_profiles: profiles });
      hapticSuccess();
      toast.success('Team profiles saved.');
      onClose();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save team profiles.');
    }
  }

  const framingMember = framingId ? members.find((m) => m.id === framingId) : undefined;
  const framingProfile = framingId ? (profiles[framingId] ?? {}) : {};

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
      {framingId ? (
        <View style={styles.framingWrap}>
          <ImageFramingEditor
            imageUrl={framingProfile.photo ?? null}
            value={framingProfile.photo_crop ?? null}
            frameShape="circle"
            title={framingMember ? `Reposition — ${framingMember.name}` : 'Reposition photo'}
            emptyLabel="Add a photo to reposition it"
            accessibilityLabel="Team photo position and zoom"
            onCancel={() => setFramingId(null)}
            onSave={(next) => {
              setProfile(framingId, { photo_crop: next });
              setFramingId(null);
              toast.info('Framing ready — tap Save to publish.');
            }}
          />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text variant="subheading">Meet the team</Text>
            <IconButton
              icon={{ ios: 'xmark', android: 'close', web: 'close' }}
              accessibilityLabel="Close"
              tint={colors.textSecondary}
              onPress={onClose}
            />
          </View>

          {teamQuery.isLoading ? (
            <ListSkeleton />
          ) : teamQuery.isError ? (
            <View style={styles.stateWrap}>
              <ErrorState
                message={
                  teamQuery.error instanceof ApiError && teamQuery.error.status === 401
                    ? 'Team editing needs the latest backend update. It’ll be available once that deploys.'
                    : teamQuery.error instanceof ApiError
                      ? teamQuery.error.message
                      : 'Could not load your team.'
                }
                onRetry={() => void teamQuery.refetch()}
              />
            </View>
          ) : members.length === 0 ? (
            <View style={styles.stateWrap}>
              <EmptyState
                title="No bookable team yet"
                message="Add team members with their own calendars, then introduce them here."
              />
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {members.map((member) => {
                  const profile = profiles[member.id] ?? {};
                  const t = logoFramingTransform(profile.photo_crop ?? null, THUMB);
                  return (
                    <Card key={member.id} style={styles.memberCard}>
                      <View style={styles.memberHeader}>
                        <View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          {profile.photo ? (
                            <View
                              style={[
                                styles.thumbInner,
                                {
                                  transform: [
                                    { translateX: t.translateX },
                                    { translateY: t.translateY },
                                    { scale: t.scale },
                                  ],
                                },
                              ]}>
                              <Image source={{ uri: profile.photo }} style={styles.thumbInner} contentFit="cover" />
                            </View>
                          ) : (
                            <Text variant="caption" tone="muted">No photo</Text>
                          )}
                        </View>
                        <View style={styles.memberMeta}>
                          <Text variant="bodyMedium" numberOfLines={1}>{member.name}</Text>
                          <View style={styles.photoActions}>
                            <Button
                              label={profile.photo ? 'Change photo' : 'Add photo'}
                              variant="secondary"
                              size="sm"
                              loading={uploadPhoto.isPending}
                              onPress={() => void handlePhoto(member.id)}
                            />
                            {profile.photo ? (
                              <Button
                                label="Adjust"
                                variant="ghost"
                                size="sm"
                                disabled={uploadPhoto.isPending}
                                onPress={() => setFramingId(member.id)}
                              />
                            ) : null}
                          </View>
                        </View>
                      </View>
                      <Input
                        label="Specialties"
                        optional
                        value={profile.specialties ?? ''}
                        onChangeText={(v) => setProfile(member.id, { specialties: v })}
                        maxLength={200}
                      />
                      <Input
                        label="Bio"
                        optional
                        value={profile.bio ?? ''}
                        onChangeText={(v) => setProfile(member.id, { bio: v })}
                        multiline
                        style={styles.multiline}
                        maxLength={600}
                      />
                      <View style={styles.switchRow}>
                        <Text variant="bodyMedium">Hide from booking page</Text>
                        <Switch
                          value={profile.hidden === true}
                          onValueChange={(v) => setProfile(member.id, { hidden: v })}
                        />
                      </View>
                    </Card>
                  );
                })}
                <View style={styles.spacer} />
              </ScrollView>
              <View style={styles.footer}>
                <Button label="Save team profiles" fullWidth loading={update.isPending} onPress={() => void handleSave()} />
              </View>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  framingWrap: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  memberCard: {
    gap: spacing.md,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbInner: {
    width: '100%',
    height: '100%',
  },
  memberMeta: {
    flex: 1,
    gap: spacing.sm,
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
