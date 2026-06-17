import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  pickVenueImage,
  useUpdateCollective,
  useUploadPageAsset,
} from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CombinedBookingPageConfig } from '@/types/collectives';

/**
 * Max gallery photos. The web editor's BOOKING_GALLERY_MAX is 12, but this
 * combined-page brief sets a higher cap of 50 (Add disables at the cap).
 */
const GALLERY_MAX = 50;

/**
 * Photo gallery manager for the combined booking page (parity with the web
 * BookingPageEditor "Photo gallery" section). Shows current
 * `bookingPageConfig.gallery` thumbnails; each is removable; "Add photo" picks an
 * image, uploads it via `useUploadPageAsset({ kind: 'gallery' })`, appends the
 * returned URL and persists the merged `gallery` array via `useUpdateCollective`.
 *
 * Saves are non-destructive: the whole current `config` is spread back with only
 * `gallery` replaced, so no other bookingPageConfig key is dropped.
 */
export function CombinedPageGallery({
  collectiveId,
  config,
  onChanged,
}: {
  collectiveId: string;
  /** The current merged bookingPageConfig (so we preserve sibling keys on save). */
  config: CombinedBookingPageConfig;
  /** Called after a save that affects the collective list. */
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateCollective();
  const upload = useUploadPageAsset();

  const gallery = config.gallery ?? [];
  const atCap = gallery.length >= GALLERY_MAX;

  const [removeIdx, setRemoveIdx] = useState<number | null>(null);

  /** Persist a new gallery array, preserving every other config key. */
  async function saveGallery(nextUrls: string[]) {
    await update.mutateAsync({
      collectiveId,
      payload: { bookingPageConfig: { ...config, gallery: nextUrls } },
    });
    onChanged();
  }

  async function handleAdd() {
    if (atCap) return;
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      const url = await upload.mutateAsync({
        collectiveId,
        kind: 'gallery',
        uri: picked.uri,
        mimeType: picked.mimeType,
      });
      await saveGallery([...gallery, url]);
      hapticSuccess();
      toast.success('Photo added.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not add the photo.');
    }
  }

  async function handleRemoveConfirmed() {
    if (removeIdx === null) return;
    const idx = removeIdx;
    try {
      await saveGallery(gallery.filter((_, i) => i !== idx));
      hapticSuccess();
      toast.success('Photo removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove the photo.');
    } finally {
      setRemoveIdx(null);
    }
  }

  return (
    <>
      <SectionHeader title="Photo gallery" />
      <Card style={styles.card}>
        <Text variant="caption" tone="muted">
          Showcase your space and work. Photos appear on the About tab when it is enabled.
          ({gallery.length}/{GALLERY_MAX})
        </Text>

        {gallery.length > 0 ? (
          <View style={styles.grid}>
            {gallery.map((url, idx) => (
              <View key={`${url}-${idx}`} style={[styles.thumb, { borderColor: colors.border }]}>
                <Image source={{ uri: url }} style={styles.thumbImage} contentFit="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  onPress={() => setRemoveIdx(idx)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.removeBadge,
                    { backgroundColor: colors.danger, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text variant="caption" color={colors.onBrand}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Button
          label={atCap ? 'Gallery full' : 'Add photo'}
          variant="secondary"
          size="sm"
          loading={upload.isPending || update.isPending}
          disabled={atCap}
          onPress={() => void handleAdd()}
        />
        {atCap ? (
          <Text variant="caption" tone="muted">
            You can add up to {GALLERY_MAX} photos. Remove one to add another.
          </Text>
        ) : null}
      </Card>

      <ConfirmSheet
        visible={removeIdx !== null}
        title="Remove photo?"
        message="This photo will no longer appear on your booking page."
        confirmLabel="Remove"
        loading={update.isPending}
        onConfirm={() => void handleRemoveConfirmed()}
        onClose={() => setRemoveIdx(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
