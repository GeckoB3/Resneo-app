import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
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

/**
 * Per-service photos for the public booking page's Services tab. Each upload
 * stores the URL in `booking_page_config.service_photos[serviceId]` (the map is
 * sent whole on each change so the server's shallow merge keeps the rest).
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
  const services = servicesQuery.data?.services ?? [];
  // The service id with an upload/remove in flight — so only that row spins.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (serviceId: string) => {
      const picked = await pickVenueImage();
      if (!picked) return;
      setPendingId(serviceId);
      try {
        const url = await upload.mutateAsync(picked);
        await update.mutateAsync({ service_photos: { ...photos, [serviceId]: url } });
        hapticSuccess();
        toast.success('Service photo updated.');
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not upload the photo.');
      } finally {
        setPendingId(null);
      }
    },
    [photos, upload, update, toast],
  );

  const handleRemove = useCallback(
    async (serviceId: string) => {
      const url = photos[serviceId];
      const next = { ...photos };
      delete next[serviceId];
      setPendingId(serviceId);
      try {
        await update.mutateAsync({ service_photos: next });
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
    [photos, update, remove, toast],
  );

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="88%" fill>
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
            return (
              <Card key={service.id} style={styles.row}>
                <View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {url ? (
                    <Image source={{ uri: url }} style={styles.thumbInner} contentFit="cover" />
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
    width: 72,
    height: 56,
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
  meta: {
    flex: 1,
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
