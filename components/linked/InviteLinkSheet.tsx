import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { format, parseISO } from 'date-fns';
import { useEffect } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCreateInvite } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

function formatExpiry(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/**
 * Invite-a-venue-to-link sheet (Phase 2 Flow 8). On open it mints a one-time,
 * 30-day shareable link (+ server-rendered QR data URL) and offers Copy + native
 * Share. The link grants nothing until both venues confirm.
 */
export function InviteLinkSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateInvite();

  // Mint a fresh invite each time the sheet opens.
  useEffect(() => {
    if (visible) create.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const data = create.data;

  const handleCopy = async () => {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.url);
      toast.success('Invite link copied.');
    } catch {
      toast.error('Couldn’t copy automatically — select the link and copy it.');
    }
  };

  const handleShare = async () => {
    if (!data) return;
    try {
      await Share.share({
        message: data.url,
        url: data.url,
      });
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="85%">
      <View style={styles.container}>
        <View>
          <Text variant="subheading">Invite a venue to link</Text>
          <Text variant="bodySmall" tone="secondary">
            Share this link with a venue you know. When an admin there opens it, it pre-fills a
            request back to you — it grants nothing until you both confirm, and expires in 30 days.
          </Text>
        </View>

        {create.isPending ? (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text variant="bodySmall" tone="muted">
              Generating your invite link…
            </Text>
          </View>
        ) : create.isError ? (
          <View style={styles.errorWrap}>
            <Text variant="bodySmall" tone="danger">
              {create.error instanceof ApiError
                ? create.error.message
                : 'Failed to create an invite link.'}
            </Text>
            <Button label="Try again" variant="secondary" size="sm" onPress={() => create.mutate()} />
          </View>
        ) : data ? (
          <>
            {data.qrDataUrl ? (
              <View style={styles.qrWrap}>
                <Image
                  source={{ uri: data.qrDataUrl }}
                  style={[styles.qr, { borderColor: colors.border, backgroundColor: '#FFFFFF' }]}
                  contentFit="contain"
                  accessibilityLabel="QR code for your venue's invite link"
                />
              </View>
            ) : null}

            <View style={[styles.urlField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" numberOfLines={1} style={styles.url}>
                {data.url}
              </Text>
            </View>

            <View style={styles.actions}>
              <Button label="Copy" style={styles.flex1} onPress={() => void handleCopy()} />
              <Button
                label="Share"
                variant="secondary"
                style={styles.flex1}
                onPress={() => void handleShare()}
              />
            </View>

            <Text variant="caption" tone="muted">
              {`Expires ${formatExpiry(data.expiresAt)}. Anyone with this link who signs in as a venue admin can start a request back to you — you still approve every link.`}
            </Text>

            <Button label="Done" variant="ghost" onPress={onClose} />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  errorWrap: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  qrWrap: {
    alignItems: 'center',
  },
  qr: {
    width: 200,
    height: 200,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.sm,
  },
  urlField: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  url: {
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
