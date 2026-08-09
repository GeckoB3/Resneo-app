import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ImageFramingEditor } from '@/components/bookingPage/ImageFramingEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  framingTransform,
  servicePhotoCropsForSave,
  type BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateBookingPageConfig } from '@/lib/queries/useBookingPage';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import {
  pickVenueImage,
  useDeleteServicePhoto,
  useUploadServicePhoto,
} from '@/lib/queries/useVenueImageUpload';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ServicePhotosSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** List-row thumbnail size; the framing transform scales to this box. */
const THUMB_W = 72;
const THUMB_H = 56;

/**
 * Per-service photos for the public booking page's Services tab. Each upload
 * stores the URL in `booking_page_config.service_photos[serviceId]` (the map is
 * sent whole on each change so the server's shallow merge keeps the rest).
 *
 * Each photo can also be framed (pan/zoom inside the public tab's fixed square
 * thumbnail — web parity with `service_photo_crops`). "Adjust" swaps the sheet
 * content to the shared {@link ImageFramingEditor} rather than opening a second
 * Sheet (stacked modals are flaky on iOS). A new or removed photo drops its
 * framing: framing chosen for the old image means nothing for the next one.
 */
export function ServicePhotosSheet({ visible, onClose }: ServicePhotosSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const servicesQuery = useManagedServices();
  const update = useUpdateBookingPageConfig();
  const upload = useUploadServicePhoto();
  const remove = useDeleteServicePhoto();

  const photos = useMemo(
    () => venue?.booking_page_config?.service_photos ?? {},
    [venue?.booking_page_config?.service_photos],
  );
  const crops = useMemo(
    () => venue?.booking_page_config?.service_photo_crops ?? {},
    [venue?.booking_page_config?.service_photo_crops],
  );
  const services = servicesQuery.data?.services ?? [];
  // The service id with an upload/remove in flight — so only that row spins.
  const [pendingId, setPendingId] = useState<string | null>(null);
  // When set, the sheet shows the framing editor for this service instead of
  // the list (in-sheet mode step; see the component doc).
  const [framingId, setFramingId] = useState<string | null>(null);

  // Re-open on the list, not a stale framing step (render-time adjust pattern,
  // as in DeleteAccountSheet).
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setFramingId(null);
  }

  const handleUpload = useCallback(
    async (serviceId: string) => {
      const picked = await pickVenueImage();
      if (!picked) return;
      setPendingId(serviceId);
      try {
        const url = await upload.mutateAsync(picked);
        const nextPhotos = { ...photos, [serviceId]: url };
        // A new photo starts centred: framing chosen for the old one means
        // nothing here, so it rides along dropped in the same PATCH.
        const nextCrops = { ...crops };
        delete nextCrops[serviceId];
        await update.mutateAsync({
          service_photos: nextPhotos,
          service_photo_crops: servicePhotoCropsForSave(nextCrops, nextPhotos),
        });
        hapticSuccess();
        toast.success('Service photo updated.');
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not upload the photo.');
      } finally {
        setPendingId(null);
      }
    },
    [photos, crops, upload, update, toast],
  );

  const handleRemove = useCallback(
    async (serviceId: string) => {
      const url = photos[serviceId];
      const nextPhotos = { ...photos };
      delete nextPhotos[serviceId];
      const nextCrops = { ...crops };
      delete nextCrops[serviceId];
      setPendingId(serviceId);
      try {
        await update.mutateAsync({
          service_photos: nextPhotos,
          service_photo_crops: servicePhotoCropsForSave(nextCrops, nextPhotos),
        });
        if (url) void remove.mutateAsync(url).catch(() => undefined);
        hapticSuccess();
        toast.success('Service photo removed.');
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not remove the photo.');
      } finally {
        setPendingId(null);
      }
    },
    [photos, crops, update, remove, toast],
  );

  const handleFramingSave = useCallback(
    async (serviceId: string, next: BookingPageImageFraming | null) => {
      if (update.isPending) return;
      const nextCrops = { ...crops };
      if (next) nextCrops[serviceId] = next;
      else delete nextCrops[serviceId];
      try {
        await update.mutateAsync({
          service_photo_crops: servicePhotoCropsForSave(nextCrops, photos),
        });
        hapticSuccess();
        toast.success('Photo framing saved.');
        setFramingId(null);
      } catch (e) {
        // Stay in the editor so the chosen framing isn't lost on a flaky save.
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not save the framing.');
      }
    },
    [crops, photos, update, toast],
  );

  const framingService = framingId ? services.find((s) => s.id === framingId) : undefined;
  const framingUrl = framingId ? (photos[framingId] ?? null) : null;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="88%" fill>
      {framingId ? (
        <View style={styles.framingWrap}>
          <ImageFramingEditor
            imageUrl={framingUrl}
            value={crops[framingId] ?? null}
            frameShape="square"
            title={framingService ? `Reposition — ${framingService.name}` : 'Reposition photo'}
            emptyLabel="Upload a photo to reposition it"
            accessibilityLabel="Service photo position and zoom"
            onCancel={() => setFramingId(null)}
            onSave={(next) => void handleFramingSave(framingId, next)}
          />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text variant="subheading">Service photos</Text>
            <IconButton
              icon={{ ios: 'xmark', android: 'close', web: 'close' }}
              accessibilityLabel="Close"
              tint={colors.textSecondary}
              onPress={onClose}
            />
          </View>

          {servicesQuery.isLoading ? (
            <ListSkeleton />
          ) : services.length === 0 ? (
            <View style={styles.stateWrap}>
              <EmptyState
                title="No services yet"
                message="Add services first, then give each one a photo for your public booking page."
              />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {services.map((service) => {
                const url = photos[service.id] ?? null;
                const t = framingTransform(crops[service.id] ?? null, THUMB_W, THUMB_H);
                return (
                  <Card key={service.id} style={styles.row}>
                    <View
                      style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {url ? (
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
                          <Image source={{ uri: url }} style={styles.thumbInner} contentFit="cover" />
                        </View>
                      ) : (
                        <Text variant="caption" tone="muted">None</Text>
                      )}
                    </View>
                    <View style={styles.meta}>
                      <Text variant="bodyMedium" numberOfLines={1}>{service.name}</Text>
                      <View style={styles.actions}>
                        <Button
                          label={url ? 'Change' : 'Upload'}
                          variant="secondary"
                          size="sm"
                          loading={pendingId === service.id}
                          disabled={pendingId !== null && pendingId !== service.id}
                          onPress={() => void handleUpload(service.id)}
                        />
                        {url ? (
                          <Button
                            label="Adjust"
                            variant="ghost"
                            size="sm"
                            disabled={pendingId !== null}
                            onPress={() => setFramingId(service.id)}
                          />
                        ) : null}
                        {url ? (
                          <Button
                            label="Remove"
                            variant="ghost"
                            size="sm"
                            disabled={pendingId !== null}
                            onPress={() => void handleRemove(service.id)}
                          />
                        ) : null}
                      </View>
                    </View>
                  </Card>
                );
              })}
              <View style={styles.spacer} />
            </ScrollView>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbInner: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  meta: {
    flex: 1,
    gap: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
