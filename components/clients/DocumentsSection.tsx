import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  fetchDocumentDownloadUrl,
  useDeleteGuestDocument,
  useGuestDocuments,
  useUploadGuestDocument,
} from '@/lib/queries/useGuestDocuments';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type DocumentsSectionProps = {
  guestId: string;
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/**
 * Card for listing, uploading, downloading, and deleting guest documents.
 * Upload uses the signed-URL three-step flow:
 *   POST /sign → PUT to signed URL → POST /complete
 * Note: expo-document-picker is used for file selection if available.
 * The import is dynamic so the component degrades gracefully if not installed.
 */
export function DocumentsSection({ guestId }: DocumentsSectionProps) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const toast = useToast();
  const docsQuery = useGuestDocuments(guestId);
  const uploadMutation = useUploadGuestDocument(guestId);
  const deleteMutation = useDeleteGuestDocument(guestId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Document pending delete confirmation (Alert.alert is a no-op on web).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null);

  const documents = docsQuery.data?.documents ?? [];

  async function handlePickAndUpload() {
    setUploadError(null);
    try {
      // Dynamic import — graceful if the native module is unavailable at runtime
       
      const DocumentPicker = (await import('expo-document-picker').catch(() => null)) as any | null;
      if (!DocumentPicker) {
        toast.info('Document picker unavailable. Upload from the web dashboard instead.');
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      await uploadMutation.mutateAsync({
        signInput: {
          file_name: asset.name ?? 'document',
          mime_type: asset.mimeType ?? 'application/octet-stream',
          file_size_bytes: asset.size ?? 0,
        },
        fileUri: asset.uri,
      });
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      setUploadError(e instanceof ApiError ? e.message : 'Upload failed. Please try again.');
    }
  }

  async function handleDownload(docId: string) {
    if (!accessToken) return;
    setDownloadingId(docId);
    try {
      const url = await fetchDocumentDownloadUrl(accessToken, guestId, docId);
      await Linking.openURL(url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not download file.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const docId = pendingDelete.id;
    try {
      await deleteMutation.mutateAsync(docId);
      hapticSuccess();
      setPendingDelete(null);
      toast.success('Document removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove document.');
    }
  }

  return (
    <>
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="label">Documents</Text>
        <Button
          label={uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          variant="secondary"
          size="sm"
          loading={uploadMutation.isPending}
          onPress={() => void handlePickAndUpload()}
        />
      </View>

      {uploadError ? (
        <Text variant="bodySmall" tone="danger" style={styles.errorText}>
          {uploadError}
        </Text>
      ) : null}

      {docsQuery.isLoading ? (
        <Text variant="caption" tone="muted">
          Loading documents…
        </Text>
      ) : documents.length === 0 ? (
        <Text variant="bodySmall" tone="muted" style={styles.emptyText}>
          No documents yet. Tap &ldquo;Upload&rdquo; to add a file.
        </Text>
      ) : (
        <View style={styles.docList}>
          {documents.map((doc) => (
            <View
              key={doc.id}
              style={[styles.docRow, { borderTopColor: colors.border }]}>
              <View style={styles.docInfo}>
                <Text variant="bodySmall" numberOfLines={1} style={styles.docName}>
                  {doc.file_name}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDocDate(doc.created_at)}
                  {doc.file_size_bytes ? ` · ${formatFileSize(doc.file_size_bytes)}` : ''}
                  {doc.category ? ` · ${doc.category}` : ''}
                </Text>
              </View>
              <View style={styles.docActions}>
                <Pressable
                  onPress={() => void handleDownload(doc.id)}
                  style={({ pressed }) => [styles.docAction, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Download">
                  <Text variant="caption" tone="brand">
                    {downloadingId === doc.id ? '…' : 'Open'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPendingDelete({ id: doc.id, fileName: doc.file_name })}
                  style={({ pressed }) => [styles.docAction, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Remove">
                  <Text variant="caption" tone="danger">
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>

      <Sheet visible={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <View style={styles.confirmBody}>
          <Text variant="subheading">Remove document</Text>
          <Text variant="bodySmall" tone="secondary">
            Remove &ldquo;{pendingDelete?.fileName}&rdquo;? This cannot be undone.
          </Text>
          <View style={styles.confirmActions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setPendingDelete(null)}
            />
            <Button
              label="Remove"
              variant="danger"
              style={styles.flex1}
              loading={deleteMutation.isPending}
              onPress={() => void handleConfirmDelete()}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  errorText: {
    marginBottom: spacing.sm,
  },
  emptyText: {
    marginTop: spacing.xs,
  },
  docList: {
    marginTop: spacing.xs,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  docName: {
    flexShrink: 1,
  },
  docActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  docAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBody: {
    gap: spacing.md,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
