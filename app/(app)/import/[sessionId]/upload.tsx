import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ImportBanner, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import { IMPORT_HUB_ROUTE, importStepRoute } from '@/lib/import/session-status';
import type { ImportFile, KindDetection, ReshapePreview } from '@/lib/import/types';
import {
  canContinueUpload,
  FILE_TYPE_OPTIONS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_PICKER_TYPES,
  importFileAllowed,
  importFileMimeType,
  KIND_LABELS,
  sampleCsv,
} from '@/lib/import/upload';
import { shareTextFile } from '@/lib/share/share-text-file';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Step 1, Upload (web `UploadStepClient`): choose your old system's exports (CSV or Excel, one
 * file per sheet), confirm what each one is, and let report-shaped files be reorganised into a
 * table first. Continue unlocks once every file has a label.
 */
export default function UploadStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Upload your files" sessionId={sessionId} step="upload">
      <UploadStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

type ReshapeShown = ReshapePreview & { notes: string[] };

function UploadStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const api = useImportApi();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [detections, setDetections] = useState<Record<string, KindDetection>>({});
  const [reshaping, setReshaping] = useState<Set<string>>(new Set());
  const [reshapePreview, setReshapePreview] = useState<Record<string, ReshapeShown>>({});
  const [reshapeFailed, setReshapeFailed] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<ImportFile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const reshapeTriggered = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api.getSession(sessionId);
      setFiles(data.files ?? []);
    } catch (e) {
      setError(importErrorMessage(e, 'This import could not be loaded.'));
    }
  }, [api, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const runReshape = useCallback(
    async (fileId: string) => {
      setReshaping((prev) => new Set(prev).add(fileId));
      try {
        const j = await api.reshapeFile(sessionId, fileId);
        if (j.preview) {
          const preview = j.preview;
          setReshapePreview((prev) => ({ ...prev, [fileId]: { ...preview, notes: j.notes ?? [] } }));
        }
        if (j.status === 'failed') {
          setReshapeFailed((prev) => ({ ...prev, [fileId]: j.message ?? 'We could not reorganise this file.' }));
        }
        await load();
      } catch {
        setReshapeFailed((prev) => ({ ...prev, [fileId]: 'We could not reorganise this file. Please try again.' }));
      } finally {
        setReshaping((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    },
    [api, sessionId, load],
  );

  // Report-shaped files the server flagged are reorganised straight away, once each.
  useEffect(() => {
    for (const f of files) {
      if (f.reshape_status === 'pending' && !reshapeTriggered.current.has(f.id)) {
        reshapeTriggered.current.add(f.id);
        void runReshape(f.id);
      }
    }
  }, [files, runReshape]);

  async function chooseFiles() {
    setError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: IMPORT_PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
    } catch {
      setError('Your files could not be opened. Please try again.');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;

    setUploading(true);
    setWarnings([]);
    const collected: string[] = [];
    try {
      for (const asset of picked.assets) {
        const name = asset.name ?? 'upload.csv';
        if (!importFileAllowed(name)) {
          throw new Error(`"${name}" is not a CSV or Excel file. Choose a .csv, .xlsx, .xls, .tsv or .txt file.`);
        }
        if ((asset.size ?? 0) > IMPORT_MAX_FILE_BYTES) {
          throw new Error(`"${name}" is larger than 20 MB. Split the export and upload the parts separately.`);
        }
        const res = await api.uploadFile(sessionId, { uri: asset.uri, name, mimeType: importFileMimeType(name, asset.mimeType) });
        if (Array.isArray(res.warnings)) collected.push(...res.warnings);
        if (Array.isArray(res.kind_detections)) {
          const found = res.kind_detections;
          setDetections((prev) => {
            const next = { ...prev };
            for (const d of found) next[d.file_id] = d;
            return next;
          });
        }
      }
    } catch (e) {
      setError(importErrorMessage(e, 'The upload did not finish. Please try again.'));
    }
    setWarnings(collected);
    await load();
    setUploading(false);
  }

  async function setType(fileId: string, fileType: string) {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, file_type: fileType } : f)));
    try {
      await api.setFileType(sessionId, fileId, fileType);
    } catch (e) {
      setError(importErrorMessage(e, 'That label could not be saved. Please try again.'));
    }
    await load();
  }

  async function confirmRemove() {
    const f = removing;
    if (!f) return;
    setRemoveBusy(true);
    try {
      await api.removeFile(sessionId, f.id);
      await load();
    } catch (e) {
      setError(importErrorMessage(e, 'That file could not be removed. Please try again.'));
    }
    setRemoveBusy(false);
    setRemoving(null);
  }

  async function undoReshape(fileId: string) {
    reshapeTriggered.current.add(fileId);
    try {
      await api.undoReshape(sessionId, fileId);
      setReshapePreview((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      await load();
    } catch (e) {
      setError(importErrorMessage(e, 'The original file could not be put back. Please try again.'));
    }
  }

  async function shareSample(kind: 'clients' | 'bookings') {
    const { filename, body } = sampleCsv(kind);
    const res = await shareTextFile({ filename, body, mimeType: 'text/csv', uti: 'public.comma-separated-values-text', dialogTitle: filename });
    if (!res.ok && res.reason !== 'web-download') toast.error('The example could not be shared. Please try again.');
  }

  const anyReshaping = reshaping.size > 0 || files.some((f) => f.reshape_status === 'pending');
  const continueOpen = canContinueUpload(files, reshaping.size);

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Upload your files</Text>
        <Text variant="bodySmall" tone="secondary">
          Upload the exports from your old system, Excel or CSV, just as they came. We work out whether each one is a
          client list, booking history or staff list, and you confirm. If a file has both bookings and client details
          (most do), label it Booking history and the client details come in too.
        </Text>
      </View>

      <Button
        label={uploading ? 'Uploading…' : 'Choose files'}
        loading={uploading}
        disabled={uploading}
        onPress={() => void chooseFiles()}
        fullWidth
      />
      <Text variant="caption" tone="muted">
        You can choose several files. Each sheet in a workbook is read separately. Up to 20 MB a file.
      </Text>

      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}
      {warnings.length > 0 ? (
        <ImportBanner tone="warning" title="We tidied a few things while reading your files:">
          {warnings.map((w, i) => (
            <Text key={`${i}-${w}`} variant="bodySmall">{`• ${w}`}</Text>
          ))}
        </ImportBanner>
      ) : null}

      {loading ? (
        <ListSkeleton />
      ) : (
        <View style={importStyles.stack}>
          {files.some((f) => f.file_type === 'staff') ? (
            <ImportBanner tone="info">
              Staff lists: each staff member is matched to your calendars on the Services and staff step, where you can
              also add them as new bookable staff.
            </ImportBanner>
          ) : null}
          {files.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              detection={detections[f.id]}
              isReshaping={reshaping.has(f.id) || f.reshape_status === 'pending'}
              preview={reshapePreview[f.id]}
              reshapeError={reshapeFailed[f.id]}
              onType={(t) => void setType(f.id, t)}
              onRemove={() => setRemoving(f)}
              onUndoReshape={() => void undoReshape(f.id)}
            />
          ))}
        </View>
      )}

      <Button
        label={expanded ? 'Hide what I can import' : 'What can I import?'}
        variant="ghost"
        onPress={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <Card padded>
          <View style={importStyles.stack}>
            <Text variant="label">Supported files</Text>
            <Text variant="bodySmall" tone="secondary">
              Excel workbooks (.xlsx, .xls) and CSV exports from salon, clinic and studio booking systems all work,
              including files with title rows, several sheets or unusual characters. On the next step your columns are
              matched to ResNeo fields automatically and you check the result, so we do not need to recognise your old
              system.
            </Text>
            <Text variant="label">Not sure what a file should look like?</Text>
            <Text variant="bodySmall" tone="secondary">
              Share an example to see the kind of columns we expect. Your own file does not need to match it exactly.
            </Text>
            <Button label="Example client list" variant="secondary" size="sm" onPress={() => void shareSample('clients')} />
            <Button label="Example booking history" variant="secondary" size="sm" onPress={() => void shareSample('bookings')} />
          </View>
        </Card>
      ) : null}

      <View style={importStyles.between}>
        <Button label="Back" variant="secondary" onPress={() => router.replace(IMPORT_HUB_ROUTE)} />
        <Button
          label="Continue"
          disabled={!continueOpen}
          onPress={() => router.push(importStepRoute(sessionId, 'map'))}
        />
      </View>
      {!continueOpen && files.length > 0 ? (
        <Text variant="caption" tone="secondary">
          {anyReshaping
            ? 'Hang on, we are reorganising a report-style file into a table. Continue unlocks when it is done.'
            : 'Confirm a label for each file: Client list, Booking history or Staff list. We fill in the ones we can work out.'}
        </Text>
      ) : null}

      <ConfirmSheet
        visible={removing !== null}
        title="Remove this file?"
        message={removing ? `"${removing.filename}" is taken out of this import.` : undefined}
        confirmLabel="Remove"
        loading={removeBusy}
        onConfirm={() => void confirmRemove()}
        onClose={() => {
          if (!removeBusy) setRemoving(null);
        }}
      />
    </View>
  );
}

function FileCard({
  file: f,
  detection: det,
  isReshaping,
  preview,
  reshapeError,
  onType,
  onRemove,
  onUndoReshape,
}: {
  file: ImportFile;
  detection: KindDetection | undefined;
  isReshaping: boolean;
  preview: ReshapeShown | undefined;
  reshapeError: string | undefined;
  onType: (fileType: string) => void;
  onRemove: () => void;
  onUndoReshape: () => void;
}) {
  const { colors } = useTheme();
  const wasReshaped = f.reshaped === true || f.reshape_status === 'done';
  const notes = preview?.notes?.length ? preview.notes : (f.reshape_notes ?? []);
  return (
    <Card padded testID={`import-file-${f.id}`}>
      <View style={importStyles.stack}>
        <View style={importStyles.tight}>
          <Text variant="bodyMedium">{f.filename}</Text>
          <Text variant="caption" tone="muted">
            {`${f.row_count ?? 0} rows, ${f.column_count ?? 0} columns`}
          </Text>
          {det?.applied && f.file_type === det.detected_kind ? (
            <Text variant="caption" tone="success">
              {`We worked out this is a ${(KIND_LABELS[det.detected_kind] ?? det.detected_kind).toLowerCase()}. Change it below if that is wrong.`}
            </Text>
          ) : null}
          {det && !det.applied && det.detected_kind !== 'unknown' && f.file_type === 'unknown' ? (
            <Text variant="caption" color={colors.warning}>
              {`Our best guess: ${KIND_LABELS[det.detected_kind] ?? det.detected_kind}. ${det.reason} Please confirm below.`}
            </Text>
          ) : null}
        </View>
        <View style={importStyles.row} accessibilityLabel={`What is ${f.filename}?`}>
          {FILE_TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={f.file_type === o.value} onPress={() => onType(o.value)} />
          ))}
        </View>

        {isReshaping ? (
          <View style={[importStyles.row, styles.reshaping, { backgroundColor: colors.infoSurface }]}>
            <ActivityIndicator color={colors.brand} />
            <Text variant="caption" style={styles.flex}>
              Reorganising this file into a table, reading the dates, times and staff. This can take several minutes for
              large files, so keep this screen open.
            </Text>
          </View>
        ) : null}
        {!isReshaping && reshapeError ? <ImportBanner tone="warning">{reshapeError}</ImportBanner> : null}
        {!isReshaping && wasReshaped ? (
          <ImportBanner
            tone="success"
            title={`Reorganised into a table (${preview?.total_rows ?? f.row_count ?? 0} bookings).`}
            action={{ label: 'Undo (use the original)', onPress: onUndoReshape }}>
            {notes.map((n, i) => (
              <Text key={`${i}-${n}`} variant="caption">{`• ${n}`}</Text>
            ))}
            <Text variant="caption">Glance over the table below to check the dates look right, then continue.</Text>
          </ImportBanner>
        ) : null}
        {!isReshaping && wasReshaped && preview ? <PreviewTable headers={preview.headers} rows={preview.rows} /> : null}

        <Button label="Remove" size="sm" variant="ghost" onPress={onRemove} style={styles.start} />
      </View>
    </Card>
  );
}

/** The first rows of a reorganised file, scrolled sideways. */
function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal style={[styles.table, { borderColor: colors.border }]}>
      <View>
        <View style={[styles.tr, { backgroundColor: colors.surface }]}>
          {headers.map((h, i) => (
            <Text key={`h-${i}`} variant="caption" style={styles.cell} numberOfLines={1}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={`r-${ri}`} style={[styles.tr, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            {headers.map((_, ci) => (
              <Text key={`c-${ri}-${ci}`} variant="caption" tone="secondary" style={styles.cell} numberOfLines={1}>
                {row[ci] ?? ''}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  reshaping: { padding: spacing.md, borderRadius: radius.md, flexWrap: 'nowrap' },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  table: { borderWidth: 1, borderRadius: radius.sm },
  tr: { flexDirection: 'row' },
  cell: { width: 120, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
