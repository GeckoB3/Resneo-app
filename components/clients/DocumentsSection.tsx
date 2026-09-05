import { format, parseISO } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  GUEST_DOCUMENT_ALLOWED_MIME_TYPES,
  GUEST_DOCUMENT_MAX_LABEL,
  documentKind,
  formatFileSize,
  type DocumentKind,
} from '@/lib/guests/guest-document-limits';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  fetchDocumentDownloadUrl,
  useDeleteGuestDocument,
  useGuestDocuments,
  useUploadGuestDocument,
  type GuestDocumentRow,
} from '@/lib/queries/useGuestDocuments';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type DocumentsSectionProps = {
  guestId: string;
  /** Render inside a tap-to-expand CollapsibleCard instead of a plain Card. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

/** One file as either picker hands it over. */
type PickedFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  /** What the picker reported; the upload reads the real byte count itself. */
  sizeBytes: number;
};

const TILE_WIDTH = 104;

/** Web copy, verbatim: what the section takes and what opens in place. */
const HELPER_COPY = `Photos, PDFs, Word and Excel files up to ${GUEST_DOCUMENT_MAX_LABEL} each. Photos are resized on upload. Photos and PDFs open here for viewing; other files download.`;

function formatDocDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/**
 * Photos come from the photo library, not the Files browser: on iOS
 * `getDocumentAsync` browses iCloud Drive and file providers, where the Photos
 * library does not appear (see `pickVenueImage`). The library picker also
 * re-encodes on the way out at the quality asked for, which is the app's
 * downscale: a phone photo of several MB lands well under the cap.
 */
async function pickPhotos(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
  });
  if (result.canceled) return [];
  return result.assets
    .filter((asset) => Boolean(asset.uri))
    .map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}-${index + 1}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? 0,
    }));
}

/** Documents (PDF, Word, Excel, and a photo already saved as a file) from the Files browser. */
async function pickFiles(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...GUEST_DOCUMENT_ALLOWED_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return [];
  return (result.assets ?? []).map((asset) => ({
    uri: asset.uri,
    name: asset.name ?? 'document',
    mimeType: asset.mimeType ?? null,
    sizeBytes: asset.size ?? 0,
  }));
}

function glyphLabel(kind: DocumentKind, fileName: string): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Photo';
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return (ext || 'File').slice(0, 5).toUpperCase();
}

function FileGlyph({ kind, fileName, tint }: { kind: DocumentKind; fileName: string; tint: string }) {
  return (
    <View style={styles.glyph}>
      <SymbolView
        name={
          kind === 'image'
            ? { ios: 'photo', android: 'image', web: 'image' }
            : { ios: 'doc.text', android: 'description', web: 'description' }
        }
        tintColor={tint}
        size={26}
      />
      <Text variant="caption" tone="muted">
        {glyphLabel(kind, fileName)}
      </Text>
    </View>
  );
}

/**
 * "Documents and photos" for one contact (web 2026-09-05, the Records section):
 * a thumbnail grid, an in-place viewer for photos and PDFs, multi-file upload
 * from the photo library or the Files browser, and the same size cap and type
 * allowlist the server and bucket enforce, checked before a request is made.
 *
 * Lives on the contact screen and in the booking detail, so both show the same
 * files for the same guest: the records belong to the person, not to a booking.
 *
 * Upload uses the signed-URL three-step flow (sign, PUT, complete) in
 * `useUploadGuestDocument`, one file at a time so a refusal names the file.
 */
export function DocumentsSection({
  guestId,
  collapsible = false,
  defaultExpanded = false,
}: DocumentsSectionProps) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const toast = useToast();
  const docsQuery = useGuestDocuments(guestId);
  const uploadMutation = useUploadGuestDocument(guestId);
  const deleteMutation = useDeleteGuestDocument(guestId);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Document pending delete confirmation (Alert.alert is a no-op on web).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null);
  // The photo open in the viewer; `url` is null while the fresh view link loads.
  const [viewing, setViewing] = useState<{ doc: GuestDocumentRow; url: string | null } | null>(null);

  const documents = docsQuery.data?.documents ?? [];

  async function uploadAll(files: PickedFile[]) {
    if (files.length === 0) return;
    setUploadError(null);
    setUploading({ done: 0, total: files.length });
    const problems: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setUploading({ done: index, total: files.length });
        try {
          await uploadMutation.mutateAsync({
            fileUri: file.uri,
            fileName: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          });
        } catch (e) {
          problems.push(
            e instanceof ApiError || e instanceof Error
              ? e.message
              : `${file.name} could not be uploaded.`,
          );
        }
      }
    } finally {
      setUploading(null);
    }
    if (problems.length > 0) {
      hapticWarning();
      setUploadError(problems.join('\n'));
    } else {
      hapticSuccess();
    }
  }

  async function handleAddPhotos() {
    try {
      await uploadAll(await pickPhotos());
    } catch {
      toast.error('Could not open the photo library. Please try again.');
    }
  }

  async function handleAddFiles() {
    try {
      await uploadAll(await pickFiles());
    } catch {
      toast.error('Could not open the file picker. Please try again.');
    }
  }

  /**
   * A photo opens in the viewer sheet, a PDF in the in-app browser, and
   * anything else downloads, as on the web. Photos and PDFs ask for a fresh
   * link with `intent=view`, which is what the contact's audit trail records.
   */
  async function open(doc: GuestDocumentRow) {
    if (!accessToken) return;
    const kind = documentKind(doc.mime_type);
    if (kind === 'image') {
      setViewing({ doc, url: null });
      try {
        const url = await fetchDocumentDownloadUrl(accessToken, guestId, doc.id, 'view');
        setViewing((current) => (current && current.doc.id === doc.id ? { doc, url } : current));
      } catch (e) {
        setViewing(null);
        toast.error(e instanceof ApiError ? e.message : 'Could not open the file.');
      }
      return;
    }
    setOpeningId(doc.id);
    try {
      const url = await fetchDocumentDownloadUrl(
        accessToken,
        guestId,
        doc.id,
        kind === 'pdf' ? 'view' : 'download',
      );
      if (kind === 'pdf' && Platform.OS !== 'web') {
        await WebBrowser.openBrowserAsync(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open the file.');
    } finally {
      setOpeningId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const docId = pendingDelete.id;
    try {
      await deleteMutation.mutateAsync(docId);
      hapticSuccess();
      setPendingDelete(null);
      toast.success('File removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove the file.');
    }
  }

  const busy = uploading !== null;
  const addButtons = (
    <View style={styles.addRow}>
      <Button
        label={busy ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : 'Add photos'}
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={busy}
        onPress={() => void handleAddPhotos()}
      />
      {!busy ? (
        <Button label="Add files" variant="secondary" size="sm" onPress={() => void handleAddFiles()} />
      ) : null}
    </View>
  );

  const body = (
    <>
      <Text variant="caption" tone="muted">
        {HELPER_COPY}
      </Text>

      {uploadError ? (
        <Text variant="bodySmall" tone="danger" style={styles.errorText}>
          {uploadError}
        </Text>
      ) : null}

      {docsQuery.isLoading ? (
        <Text variant="caption" tone="muted">
          Loading files…
        </Text>
      ) : documents.length === 0 ? (
        <Text variant="bodySmall" tone="muted" style={styles.emptyText}>
          No documents or photos yet.
        </Text>
      ) : (
        <View style={styles.grid} accessibilityLabel="Documents and photos">
          {documents.map((doc) => {
            const kind = documentKind(doc.mime_type);
            const meta = [formatDocDate(doc.uploaded_at ?? doc.created_at), formatFileSize(doc.file_size_bytes)]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={doc.id}
                style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${kind === 'other' ? 'Download' : 'View'} ${doc.file_name}`}
                  onPress={() => void open(doc)}
                  style={({ pressed }) => [
                    styles.thumb,
                    { backgroundColor: colors.background, opacity: pressed || openingId === doc.id ? 0.6 : 1 },
                  ]}>
                  {kind === 'image' && doc.preview_url ? (
                    <Image
                      source={{ uri: doc.preview_url }}
                      style={styles.thumbImage}
                      contentFit="cover"
                      accessibilityLabel={doc.file_name}
                    />
                  ) : (
                    <FileGlyph kind={kind} fileName={doc.file_name} tint={colors.textMuted} />
                  )}
                </Pressable>
                <Text variant="caption" numberOfLines={1}>
                  {doc.file_name}
                </Text>
                {meta ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => setPendingDelete({ id: doc.id, fileName: doc.file_name })}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${doc.file_name}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeAction, pressed && { opacity: 0.6 }]}>
                  <Text variant="caption" tone="danger">
                    Remove
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  const docCount = documents.length;
  const summary = docsQuery.isLoading
    ? 'Documents & photos'
    : docCount === 0
      ? 'No files yet'
      : `${docCount} file${docCount === 1 ? '' : 's'}`;

  return (
    <>
      {collapsible ? (
        <CollapsibleCard title="Records" summary={summary} defaultExpanded={defaultExpanded}>
          <Text variant="overline" tone="muted">
            Documents and photos
          </Text>
          {body}
          {addButtons}
        </CollapsibleCard>
      ) : (
        <Card>
          <View style={styles.cardHeader}>
            <Text variant="label">Documents and photos</Text>
          </View>
          {body}
          {addButtons}
        </Card>
      )}

      <Sheet visible={viewing !== null} onClose={() => setViewing(null)} fill>
        <View style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <Text variant="subheading" numberOfLines={1} style={styles.flex1}>
              {viewing?.doc.file_name ?? ''}
            </Text>
            <Button label="Close" variant="ghost" size="sm" onPress={() => setViewing(null)} />
          </View>
          {viewing?.url ? (
            <Image
              source={{ uri: viewing.url }}
              style={styles.viewerImage}
              contentFit="contain"
              accessibilityLabel={viewing.doc.file_name}
            />
          ) : (
            <LoadingState message="Opening…" />
          )}
        </View>
      </Sheet>

      <Sheet visible={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <View style={styles.confirmBody}>
          <Text variant="subheading">Remove file</Text>
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
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
  },
  emptyText: {
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tile: {
    width: TILE_WIDTH,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    padding: spacing.xs,
    gap: 2,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  glyph: {
    alignItems: 'center',
    gap: 2,
  },
  removeAction: {
    minHeight: 32,
    justifyContent: 'center',
  },
  viewer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  viewerImage: {
    flex: 1,
    width: '100%',
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
