import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { BOOKING_GALLERY_MAX } from '@/lib/booking/bookingPageConfig';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateBookingPageConfig } from '@/lib/queries/useBookingPage';
import { pickVenueImage, useUploadGalleryPhoto } from '@/lib/queries/useVenueImageUpload';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type GalleryEditorSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Public booking-page photo gallery editor. Add (≤{@link BOOKING_GALLERY_MAX}),
 * remove and reorder photos. Each change persists immediately via a partial
 * `booking_page_config` PATCH (server-merged), then the venue bootstrap refetch
 * updates the grid. Upload needs the `/api/venue/gallery` route deployed (Bearer).
 */
export function GalleryEditorSheet({ visible, onClose }: GalleryEditorSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const update = useUpdateBookingPageConfig();
  const upload = useUploadGalleryPhoto();

  const gallery = useMemo(
    () => venue?.booking_page_config?.gallery ?? [],
    [venue?.booking_page_config?.gallery],
  );
  const busy = update.isPending || upload.isPending;

  const persist = useCallback(
    async (next: string[], successMessage: string) => {
      try {
        await update.mutateAsync({ gallery: next });
        hapticSuccess();
        toast.success(successMessage);
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not update the gallery.');
      }
    },
    [update, toast],
  );

  const handleAdd = useCallback(async () => {
    if (gallery.length >= BOOKING_GALLERY_MAX) {
      toast.info(`Up to ${BOOKING_GALLERY_MAX} photos.`);
      return;
    }
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      const url = await upload.mutateAsync(picked);
      await persist([...gallery, url], 'Photo added.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the photo.');
    }
  }, [gallery, upload, persist, toast]);

  const handleRemove = useCallback(
    (url: string) => void persist(gallery.filter((u) => u !== url), 'Photo removed.'),
    [gallery, persist],
  );

  const move = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= gallery.length) return;
      const next = [...gallery];
      const [moved] = next.splice(index, 1);
      if (!moved) return;
      next.splice(target, 0, moved);
      void persist(next, 'Gallery reordered.');
    },
    [gallery, persist],
  );

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="88%" fill>
      <View style={styles.header}>
        <Text variant="subheading">Photo gallery</Text>
        <IconButton
          icon={{ ios: 'xmark', android: 'close', web: 'close' }}
          accessibilityLabel="Close"
          tint={colors.textSecondary}
          onPress={onClose}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Button
          label={gallery.length >= BOOKING_GALLERY_MAX ? 'Gallery full' : 'Add photo'}
          fullWidth
          loading={busy}
          disabled={gallery.length >= BOOKING_GALLERY_MAX}
          onPress={() => void handleAdd()}
        />
        <Text variant="caption" tone="muted">
          {gallery.length}/{BOOKING_GALLERY_MAX} photos shown on your public booking page.
        </Text>

        {gallery.length === 0 ? (
          <Text variant="bodySmall" tone="muted" style={styles.empty}>
            No photos yet. Add a few to showcase your space.
          </Text>
        ) : (
          gallery.map((url, index) => (
            <View key={url} style={[styles.row, { borderColor: colors.border }]}>
              <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
              <View style={styles.rowActions}>
                <IconButton
                  icon={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                  accessibilityLabel="Move up"
                  tint={index === 0 ? colors.textMuted : colors.text}
                  disabled={index === 0 || busy}
                  onPress={() => move(index, -1)}
                />
                <IconButton
                  icon={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }}
                  accessibilityLabel="Move down"
                  tint={index === gallery.length - 1 ? colors.textMuted : colors.text}
                  disabled={index === gallery.length - 1 || busy}
                  onPress={() => move(index, 1)}
                />
                <IconButton
                  icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                  accessibilityLabel="Remove photo"
                  tint={colors.danger}
                  disabled={busy}
                  onPress={() => handleRemove(url)}
                />
              </View>
            </View>
          ))
        )}
        <View style={styles.spacer} />
      </ScrollView>
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
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  thumb: {
    width: 88,
    height: 64,
    borderRadius: radius.sm,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  spacer: {
    height: spacing.xl,
  },
});
