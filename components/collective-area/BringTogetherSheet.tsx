/**
 * "Bring your client lists together?" (web `BringTogetherDialog`; plan §1A.2 step 4, mockup board 2).
 * Real numbers first (POST preview), nothing changes until the venue presses Bring together (POST
 * start); then the Clients tab shows progress and a message when it is done.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import { useClientSharingPreview, useStartClientSharing } from '@/lib/queries/useClientSharing';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { ClientSharingPreviewResponse } from '@/types/client-sharing';

/** The confirmation's lines, in order, from the preview (also used by tests). */
export function bringTogetherLines(p: ClientSharingPreviewResponse): string[] {
  if (p.nobody) return [clientSharingCopy('cs.start.nobody')];
  const lines: string[] = [];
  const others = p.others
    .map((o) => clientSharingCopy('cs.start.other', { venue: o.name, count: formatClientCount(o.clients) }))
    .join(' ');
  lines.push(
    `${clientSharingCopy('cs.start.yours', { venue: p.venueName, count: formatClientCount(p.here) })}${others ? ` ${others}` : ''}`,
  );
  if (p.inBoth > 0) {
    lines.push(
      p.inBoth === 1
        ? clientSharingCopy('cs.start.inBothOne')
        : clientSharingCopy('cs.start.inBoth', { count: formatClientCount(p.inBoth) }),
    );
  }
  if (p.toAdd > 0) {
    lines.push(
      p.toAdd === 1
        ? clientSharingCopy('cs.start.toAddOne')
        : clientSharingCopy('cs.start.toAdd', { count: formatClientCount(p.toAdd) }),
    );
  }
  if (p.toCheck > 0) {
    lines.push(
      p.toCheck === 1
        ? clientSharingCopy('cs.start.toCheckOne')
        : clientSharingCopy('cs.start.toCheck', { count: formatClientCount(p.toCheck) }),
    );
  }
  return lines;
}

export function BringTogetherSheet({
  collectiveId,
  visible,
  onClose,
  onStarted,
}: {
  collectiveId: string;
  visible: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const toast = useToast();
  const preview = useClientSharingPreview(collectiveId);
  const start = useStartClientSharing(collectiveId);
  const { mutate: loadPreview, reset } = preview;

  useEffect(() => {
    if (visible) loadPreview();
    else reset();
  }, [visible, loadPreview, reset]);

  const lines = preview.data ? bringTogetherLines(preview.data) : [];

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text variant="subheading" accessibilityRole="header">
          {clientSharingCopy('cs.start.title')}
        </Text>
        {preview.isPending ? (
          <ActivityIndicator accessibilityLabel={clientSharingCopy('cs.start.title')} />
        ) : preview.isError ? (
          <Text variant="bodySmall" tone="danger">
            {preview.error instanceof ApiError ? preview.error.message : clientSharingCopy('cs.error.generic')}
          </Text>
        ) : (
          lines.map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))
        )}
        <Text variant="bodySmall" tone="secondary">
          {clientSharingCopy('cs.safe')}
        </Text>
        <Button
          label={clientSharingCopy('cs.start.confirm')}
          fullWidth
          loading={start.isPending}
          disabled={!preview.data || start.isPending}
          onPress={() =>
            start.mutate(undefined, {
              onSuccess: () => {
                onStarted();
                onClose();
              },
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic')),
            })
          }
        />
        <Button label={clientSharingCopy('cs.start.cancel')} variant="secondary" fullWidth onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
});
