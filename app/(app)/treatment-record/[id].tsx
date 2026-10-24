import { onlineManager, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ComplianceCaptureSheet } from '@/components/compliance/ComplianceCaptureSheet';
import { ClientAlertsStrip } from '@/components/treatment-records/ClientAlertsStrip';
import { TreatmentFormsPanel, TreatmentProductsEditor, TreatmentRecordChanges } from '@/components/treatment-records/EditorParts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  createTreatmentRecord,
  deleteTreatmentRecord,
  fetchTreatmentPhotoUrl,
  fetchTreatmentRecord,
  labelTreatmentPhoto,
  removeTreatmentPhoto,
  saveTreatmentRecord,
  shareTreatmentPdf,
  uploadTreatmentPhoto,
  useTreatmentContext,
  useTreatmentRecord,
  useTreatmentSuggestions,
} from '@/lib/queries/useTreatmentRecords';
import { useScreenCaptureProtection } from '@/lib/security/useScreenCaptureProtection';
import { PHOTO_LABELS, TR_COPY } from '@/lib/treatment-records/copy';
import { canOfferCopy, changesBetween, draftFromDetail, photoMimeType, savedProducts, savedRecordFields, type TreatmentDraft } from '@/lib/treatment-records/draft';
import { formatDay, formatTime, ymdIn } from '@/lib/treatment-records/format';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { useViewerAccess } from '@/providers/ViewerAccessProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { TreatmentEditorContext, TreatmentPhotoLabel, TreatmentRecordDetail } from '@/types/treatment-records';

/**
 * The treatment record editor (web plan §9): a pushed screen, not a sheet, so it never opens a
 * Modal over the booking sheet, screenshots are blocked while it has focus (TR21), and the camera
 * gets the whole screen. `id` is a record id, or `new` with `guestId` and, from a booking,
 * `bookingId`.
 *
 * It saves as the person types, one save at a time, each naming the version it edited. A new
 * record is created by its first change, not by opening the screen; the first photo creates it too.
 * The service, practitioner and treatment time come from the booking or the record and are changed
 * on the web.
 */

const AUTOSAVE_MS = 1500;

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict' | 'deleted';

interface LocalPhoto {
  id: string;
  label: TreatmentPhotoLabel;
  uri: string | null;
}

export default function TreatmentRecordScreen() {
  const params = useLocalSearchParams<{ id: string; guestId?: string; bookingId?: string }>();
  const initialId = params.id && params.id !== 'new' ? params.id : null;
  useScreenCaptureProtection('treatment-record');

  const record = useTreatmentRecord(initialId);
  const detail = record.data ?? null;
  const guestId = params.guestId ?? '';
  const bookingId = initialId ? (detail?.record.booking_id ?? null) : (params.bookingId ?? null);
  const context = useTreatmentContext(bookingId ? { bookingId } : { guestId }, initialId ? Boolean(detail) : true);

  const header = <Stack.Screen options={{ headerShown: true, title: TR_COPY.editorTitle }} />;

  const loadError = record.error ?? context.error;
  if (loadError) {
    const deleted = apiErrorCode(loadError) === 'TREATMENT_RECORD_DELETED';
    return (
      <Screen>
        {header}
        <ErrorState message={deleted ? TR_COPY.errorDeleted : loadError instanceof ApiError ? loadError.message : 'Could not open this record.'} />
      </Screen>
    );
  }
  if ((initialId && !detail) || !context.data) {
    return (
      <Screen>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  return (
    <>
      {header}
      <TreatmentRecordEditor
        key={initialId ?? 'new'}
        initialDetail={detail}
        context={context.data}
        guestId={guestId || context.data.client.guest_id}
        bookingId={bookingId}
        refetchContext={() => void context.refetch()}
      />
    </>
  );
}

function TreatmentRecordEditor({
  initialDetail,
  context,
  guestId,
  bookingId,
  refetchContext,
}: {
  initialDetail: TreatmentRecordDetail | null;
  context: TreatmentEditorContext;
  guestId: string;
  bookingId: string | null;
  refetchContext: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const { venue } = useVenueContext();
  const { canExportClients } = useViewerAccess();
  const timeZone = venue?.timezone ?? null;
  const suggestions = useTreatmentSuggestions(context.linked ? context.owner_venue_id : null);

  const startDraft = (): TreatmentDraft =>
    initialDetail ? draftFromDetail(initialDetail) : { note: context.service?.template_text ?? '', products: [] };

  const [detail, setDetail] = useState<TreatmentRecordDetail | null>(initialDetail);
  const [recordId, setRecordId] = useState<string | null>(initialDetail?.record.id ?? null);
  const [draft, setDraft] = useState<TreatmentDraft>(startDraft);
  const [touched, setTouched] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(initialDetail?.record.deleted_at ? 'deleted' : 'idle');
  const [conflict, setConflict] = useState<{ message: string; note: string } | null>(null);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>(() =>
    (initialDetail?.photos ?? []).map((p) => ({ id: p.id, label: p.label, uri: p.preview_url })),
  );
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<{ text: string; settings: boolean } | null>(null);
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null);
  const [view, setView] = useState<'edit' | 'changes'>('edit');
  const [capture, setCapture] = useState<{ typeId: string; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  // Shown in the delete sheet: a toast raised while a sheet is open is drawn behind it.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'copy' | 'delete' | 'print' | null>(null);
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);

  const readOnly = saveState === 'deleted' || saveState === 'conflict' || Boolean(detail && !detail.can_edit);

  const recordIdRef = useRef<string | null>(recordId);
  const versionRef = useRef<number | null>(initialDetail?.record.version ?? null);
  const savedRef = useRef<TreatmentDraft>(startDraft());
  const draftRef = useRef<TreatmentDraft>(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const savingRef = useRef<Promise<void> | null>(null);
  // The save state as the latest save left it, for code running after an await.
  const saveStateRef = useRef<SaveState>(saveState);
  const setSave = useCallback((next: SaveState) => {
    saveStateRef.current = next;
    setSaveState(next);
  }, []);
  const leavingOk = useRef(false);

  const invalidateLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.treatmentRecords.all(), 'list'] });
  }, [queryClient]);

  const adopt = useCallback((d: TreatmentRecordDetail) => {
    setDetail(d);
    setRecordId(d.record.id);
    recordIdRef.current = d.record.id;
    versionRef.current = d.record.version;
    const next = draftFromDetail(d);
    savedRef.current = next;
    setDraft(next);
    setPhotos(d.photos.map((p) => ({ id: p.id, label: p.label, uri: p.preview_url })));
    setSave(d.record.deleted_at ? 'deleted' : 'idle');
  }, [setSave]);

  const createWith = useCallback(
    async (current: TreatmentDraft): Promise<TreatmentRecordDetail> => {
      if (!accessToken) throw new ApiError('You are signed out. Sign in again.', 401);
      const created = await createTreatmentRecord(accessToken, {
        guest_id: guestId,
        booking_id: bookingId,
        note: current.note,
        practitioner_calendar_id: context.practitioner?.calendar_id ?? null,
        products: savedProducts(current.products),
      });
      setDetail(created);
      setRecordId(created.record.id);
      recordIdRef.current = created.record.id;
      versionRef.current = created.record.version;
      savedRef.current = current;
      invalidateLists();
      return created;
    },
    [accessToken, bookingId, context.practitioner, guestId, invalidateLists],
  );

  /** Sends whatever differs from the last save. One at a time; a change made meanwhile goes next. */
  const flush = useCallback(async (): Promise<void> => {
    for (;;) {
      if (savingRef.current) await savingRef.current;
      const current = draftRef.current;
      const changes = changesBetween(savedRef.current, current);
      if (!changes || !accessToken) return;
      if (!onlineManager.isOnline()) {
        setSave('offline');
        return;
      }
      const run = (async () => {
        setSave('saving');
        try {
          if (!recordIdRef.current) {
            await createWith(current);
          } else {
            const out = await saveTreatmentRecord(accessToken, recordIdRef.current, { version: versionRef.current ?? 1, ...changes });
            versionRef.current = out.version;
            savedRef.current = current;
            // A save that kept a version shows "Edited by" and See changes straight away.
            setDetail((d) => (d ? { ...d, record: { ...d.record, ...savedRecordFields(out) } } : d));
            invalidateLists();
          }
          setSave('saved');
        } catch (err) {
          const code = apiErrorCode(err);
          if (code === 'TREATMENT_RECORD_CHANGED') {
            const body = (err as ApiError).body as { changed_by?: string; changed_by_self?: boolean } | undefined;
            setSave('conflict');
            setConflict({
              message: body?.changed_by_self ? TR_COPY.conflictSelf : TR_COPY.conflict(body?.changed_by ?? 'Someone'),
              note: current.note,
            });
          } else if (code === 'TREATMENT_RECORD_DELETED') {
            setSave('deleted');
          } else if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
            setSave(onlineManager.isOnline() ? 'error' : 'offline');
          } else {
            setSave('error');
            toast.error(err instanceof ApiError ? err.message : TR_COPY.notSaved);
          }
        }
      })();
      savingRef.current = run;
      try {
        await run;
      } finally {
        if (savingRef.current === run) savingRef.current = null;
      }
      const state = saveStateRef.current;
      if (state !== 'saved') return;
      // A change typed while that save was on its way goes next; otherwise the loop ends above.
    }
  }, [accessToken, createWith, invalidateLists, setSave, toast]);

  // Autosave 1.5 seconds after typing stops, once the person has changed something.
  useEffect(() => {
    if (!touched || readOnly) return;
    const t = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, touched, readOnly, flush]);

  // Back online: save what is waiting.
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online && (saveStateRef.current === 'offline' || saveStateRef.current === 'error')) void flush();
      }),
    [flush],
  );

  const hasUnsaved = useCallback(() => {
    if (readOnly) return false;
    return changesBetween(savedRef.current, draftRef.current) !== null;
  }, [readOnly]);

  // Leaving with a save pending or failed: save first, and ask if it still is not saved.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (leavingOk.current || !hasUnsaved()) return;
      e.preventDefault();
      void (async () => {
        await flush();
        if (!hasUnsaved()) {
          leavingOk.current = true;
          navigation.dispatch(e.data.action);
        } else {
          setLeaving(e.data.action);
        }
      })();
    });
    return unsubscribe;
  }, [navigation, hasUnsaved, flush]);

  const edit = (patch: Partial<TreatmentDraft>) => {
    if (readOnly) return;
    setTouched(true);
    if (saveStateRef.current === 'error' || saveStateRef.current === 'offline') setSave('idle');
    setDraft((d) => ({ ...d, ...patch }));
  };

  async function ensureRecord(): Promise<string> {
    if (recordIdRef.current) return recordIdRef.current;
    setTouched(true);
    const created = await createWith(draftRef.current);
    return created.record.id;
  }

  async function copyFromLast() {
    if (!context.last_record || !accessToken) return;
    setBusy('copy');
    try {
      const created = await createTreatmentRecord(accessToken, {
        guest_id: guestId,
        booking_id: bookingId,
        copy_from_record_id: context.last_record.id,
        practitioner_calendar_id: context.practitioner?.calendar_id ?? null,
      });
      adopt(created);
      setCopiedFrom(formatDay(context.last_record.treated_at, timeZone));
      setTouched(true);
      invalidateLists();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not copy the last record.');
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos(source: 'camera' | 'library') {
    if (!accessToken) return;
    setPhotoNotice(null);
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPhotoNotice({ text: TR_COPY.cameraDenied, settings: permission.canAskAgain === false });
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 0.7 });
    }
    const assets = result.canceled ? [] : (result.assets ?? []);
    if (assets.length === 0) return;
    try {
      // Waiting saves go first, so the record the photos land on holds the latest text.
      await flush();
      const id = await ensureRecord();
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]!;
        setUploadProgress(TR_COPY.uploading(i + 1, assets.length));
        const mimeType = photoMimeType(asset.mimeType, asset.uri);
        if (!mimeType) {
          setPhotoNotice({ text: TR_COPY.wrongFormat, settings: false });
          continue;
        }
        const { photoId } = await uploadTreatmentPhoto(accessToken, id, { uri: asset.uri, mimeType });
        setPhotos((ps) => [...ps, { id: photoId, label: 'other', uri: asset.uri }]);
      }
      hapticSuccess();
      invalidateLists();
    } catch (err) {
      hapticWarning();
      setPhotoNotice({ text: err instanceof ApiError ? err.message : 'A photo did not upload.', settings: false });
    } finally {
      setUploadProgress(null);
    }
  }

  async function relabel(photoId: string, label: TreatmentPhotoLabel) {
    if (!recordIdRef.current || !accessToken) return;
    const before = photos;
    setPhotos((ps) => ps.map((p) => (p.id === photoId ? { ...p, label } : p)));
    try {
      await labelTreatmentPhoto(accessToken, recordIdRef.current, photoId, label);
    } catch (err) {
      setPhotos(before);
      toast.error(err instanceof ApiError ? err.message : 'Could not change the label.');
    }
  }

  async function removePhoto(photoId: string) {
    if (!recordIdRef.current || !accessToken) return;
    try {
      await removeTreatmentPhoto(accessToken, recordIdRef.current, photoId);
      setPhotos((ps) => ps.filter((p) => p.id !== photoId));
      invalidateLists();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the photo.');
    }
  }

  async function viewPhoto(photo: LocalPhoto) {
    if (!recordIdRef.current || !accessToken) return;
    try {
      const url = await fetchTreatmentPhotoUrl(accessToken, recordIdRef.current, photo.id);
      setViewing({ url, label: PHOTO_LABELS.find((l) => l.value === photo.label)?.label ?? 'Photo' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not open the photo.');
    }
  }

  async function print() {
    if (!recordIdRef.current || !accessToken) return;
    setBusy('print');
    try {
      await flush();
      const out = await shareTreatmentPdf(accessToken, { recordId: recordIdRef.current });
      if (!out.ok) toast.error(out.message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not print the record.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!recordIdRef.current || !accessToken) return;
    setBusy('delete');
    setDeleteError(null);
    try {
      await flush();
      await deleteTreatmentRecord(accessToken, recordIdRef.current, deleteReason.trim() || null);
      hapticSuccess();
      invalidateLists();
      setDeleteOpen(false);
      leavingOk.current = true;
      router.back();
    } catch (err) {
      hapticWarning();
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the record.');
    } finally {
      setBusy(null);
    }
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeleteError(null);
  }

  async function reloadAfterConflict() {
    if (!recordIdRef.current || !accessToken) return;
    try {
      const fresh = await fetchTreatmentRecord(accessToken, recordIdRef.current);
      adopt(fresh);
      setConflict(null);
      setTouched(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reload the record.');
    }
  }

  const saveLabel =
    saveState === 'saving'
      ? TR_COPY.saving
      : saveState === 'saved'
        ? TR_COPY.saved
        : saveState === 'offline'
          ? TR_COPY.offline
          : saveState === 'error'
            ? TR_COPY.notSaved
            : '';

  const r = detail?.record ?? null;
  const author = r ? `${r.author_name ?? 'A team member'}${r.author_venue_name ? ` (${r.author_venue_name})` : ''}` : null;
  const lateEntry = r && ymdIn(r.created_at, timeZone) > ymdIn(r.treated_at, timeZone) ? TR_COPY.lateEntry(formatDay(r.created_at, timeZone)) : null;
  const edited = r && r.version_count > 0 ? TR_COPY.editedLine(r.last_edited_by_name ?? 'A team member', formatDay(r.last_edited_at, timeZone)) : null;
  const treatedAt = r?.treated_at ?? context.treated_at;
  const facts = [
    treatedAt ? `${formatDay(treatedAt, timeZone)} at ${formatTime(treatedAt, timeZone)}` : null,
    r?.service_name ?? context.service?.name ?? null,
    r?.practitioner_name ?? context.practitioner?.name ?? null,
  ].filter(Boolean);

  if (view === 'changes' && recordId) {
    return (
      <Screen scroll={false} padded={false}>
        <ScrollView contentContainerStyle={styles.content}>
          <TreatmentRecordChanges recordId={recordId} timeZone={timeZone} onBack={() => setView('edit')} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <View style={styles.flex1}>
            <Text variant="heading" numberOfLines={1}>
              {context.client.name}
            </Text>
            {facts.length > 0 ? (
              <Text variant="caption" tone="muted">
                {facts.join(' · ')}
              </Text>
            ) : null}
            {context.linked ? (
              <Text variant="caption" tone="muted">
                A linked venue’s record
              </Text>
            ) : null}
          </View>
          <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {saveLabel}
          </Text>
        </View>

        <ClientAlertsStrip guestId={guestId} />

        {saveState === 'deleted' && r ? (
          <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall">
              {r.deleted_at ? TR_COPY.deletedLine(r.deleted_by_name ?? 'A team member', formatDay(r.deleted_at, timeZone), r.deleted_reason) : TR_COPY.errorDeleted}
            </Text>
          </View>
        ) : null}

        {conflict ? (
          <View accessibilityRole="alert" style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text variant="bodySmall">{conflict.message}</Text>
            <TextInput value={conflict.note} editable={false} multiline accessibilityLabel="Your text" style={[styles.conflictText, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]} />
            <Button label="Reload" size="sm" onPress={() => void reloadAfterConflict()} />
          </View>
        ) : null}

        {copiedFrom ? (
          <View style={[styles.note, { backgroundColor: colors.infoSurface, borderColor: colors.brandBorder }]}>
            <Text variant="bodySmall">{TR_COPY.copyBanner(copiedFrom)}</Text>
          </View>
        ) : null}

        {context.forms ? (
          <TreatmentFormsPanel
            forms={context.forms}
            timeZone={timeZone}
            readOnly={readOnly || context.linked}
            onCapture={(typeId, name) => setCapture({ typeId, name })}
          />
        ) : null}

        {r ? (
          <View style={styles.lines}>
            <Text variant="caption" tone="muted">
              {TR_COPY.writtenLine(author ?? 'A team member', formatDay(r.created_at, timeZone), formatTime(r.created_at, timeZone))}
            </Text>
            {lateEntry ? (
              <Text variant="caption" tone="muted">
                {lateEntry}
              </Text>
            ) : null}
            {edited ? (
              <Pressable accessibilityRole="button" onPress={() => setView('changes')}>
                <Text variant="caption" tone="muted">
                  {`${edited} · `}
                  <Text variant="caption" tone="brand" style={styles.link}>
                    {TR_COPY.seeChanges}
                  </Text>
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!recordId && context.last_record && !readOnly && canOfferCopy(draft, context.service?.template_text) ? (
          <Button label={TR_COPY.copyButton} variant="secondary" size="sm" loading={busy === 'copy'} onPress={() => void copyFromLast()} />
        ) : null}

        <Input
          label={TR_COPY.notesLabel}
          value={draft.note}
          onChangeText={(note) => edit({ note })}
          placeholder={TR_COPY.notesPlaceholder}
          multiline
          editable={!readOnly}
          maxLength={20000}
          style={styles.notes}
          textAlignVertical="top"
        />

        <TreatmentProductsEditor
          lines={draft.products}
          readOnly={readOnly}
          suggestions={suggestions.data}
          timeZone={timeZone}
          onChange={(products) => edit({ products })}
        />

        <View style={styles.section}>
          <Text variant="label">{TR_COPY.photosHeading}</Text>
          {!readOnly ? (
            <View style={styles.actions}>
              <Button label={TR_COPY.takePhoto} size="sm" variant="secondary" disabled={uploadProgress !== null} onPress={() => void addPhotos('camera')} />
              <Button label={TR_COPY.choosePhotos} size="sm" variant="secondary" disabled={uploadProgress !== null} onPress={() => void addPhotos('library')} />
            </View>
          ) : null}
          {uploadProgress ? (
            <Text variant="caption" tone="muted">
              {uploadProgress}
            </Text>
          ) : null}
          {photoNotice ? (
            <View style={styles.actions}>
              <Text variant="caption" tone="danger" style={styles.flex1}>
                {photoNotice.text}
              </Text>
              {photoNotice.settings ? <Button label={TR_COPY.openSettings} size="sm" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
            </View>
          ) : null}
          {photos.length === 0 ? (
            <Text variant="caption" tone="muted">
              No photos.
            </Text>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <View key={p.id} style={[styles.photoCell, { borderColor: colors.border }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel="View photo" onPress={() => void viewPhoto(p)}>
                    {p.uri ? <Image source={{ uri: p.uri }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: colors.surface }]} />}
                  </Pressable>
                  <View style={styles.photoSide}>
                    <View style={styles.chips} accessibilityLabel="Photo label">
                      {PHOTO_LABELS.map((l) => (
                        <Chip key={l.value} label={l.label} selected={p.label === l.value} onPress={readOnly ? undefined : () => void relabel(p.id, l.value)} />
                      ))}
                    </View>
                    {!readOnly ? (
                      <Button label="Remove" size="sm" variant="ghost" customColors={{ background: 'transparent', text: colors.danger }} onPress={() => setRemovingPhoto(p.id)} />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {recordId && saveState !== 'deleted' ? (
          <View style={styles.actions}>
            {canExportClients ? (
              <Button label={TR_COPY.print} variant="secondary" style={styles.flex1} loading={busy === 'print'} onPress={() => void print()} />
            ) : null}
            {detail?.can_delete !== false ? (
              <Button label={TR_COPY.deleteButton} variant="secondary" style={styles.flex1} customColors={{ background: colors.surface, text: colors.danger, border: colors.border }} onPress={() => setDeleteOpen(true)} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={viewing !== null} onClose={() => setViewing(null)} maxHeight="90%">
        {viewing ? (
          <View style={styles.viewer}>
            <Text variant="subheading">{viewing.label}</Text>
            <Image source={{ uri: viewing.url }} style={styles.viewerImage} resizeMode="contain" accessibilityLabel={viewing.label} />
            <Button label="Close" variant="secondary" onPress={() => setViewing(null)} fullWidth />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={deleteOpen} onClose={closeDelete}>
        <View style={styles.sheetBody}>
          <Text variant="subheading">{TR_COPY.deleteTitle}</Text>
          <Text variant="bodySmall" tone="secondary">
            {TR_COPY.deleteMessage(context.client.name)}
          </Text>
          <Input label={TR_COPY.deleteReason} value={deleteReason} onChangeText={setDeleteReason} maxLength={500} multiline />
          {deleteError ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {deleteError}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} disabled={busy === 'delete'} onPress={closeDelete} />
            <Button label={TR_COPY.deleteButton} variant="danger" style={styles.flex1} loading={busy === 'delete'} onPress={() => void confirmDelete()} />
          </View>
        </View>
      </Sheet>

      <ConfirmSheet
        visible={removingPhoto !== null}
        title="Remove this photo?"
        message="It leaves the record. It stays in the record’s history."
        confirmLabel="Remove"
        onConfirm={() => {
          const id = removingPhoto;
          setRemovingPhoto(null);
          if (id) void removePhoto(id);
        }}
        onClose={() => setRemovingPhoto(null)}
      />

      <ConfirmSheet
        visible={leaving !== null}
        title={TR_COPY.leaveTitle}
        message={TR_COPY.leaveMessage}
        confirmLabel={TR_COPY.leaveConfirm}
        cancelLabel={TR_COPY.leaveCancel}
        onConfirm={() => {
          const action = leaving;
          setLeaving(null);
          leavingOk.current = true;
          if (action) navigation.dispatch(action);
        }}
        onClose={() => setLeaving(null)}
      />

      {capture ? (
        <ComplianceCaptureSheet
          visible
          onClose={() => setCapture(null)}
          guestId={guestId}
          complianceTypeId={capture.typeId}
          complianceTypeName={capture.name}
          bookingId={bookingId}
          onCaptured={() => {
            setCapture(null);
            refetchContext();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  note: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  conflictText: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 64,
  },
  lines: {
    gap: 2,
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  notes: {
    minHeight: 140,
  },
  section: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoGrid: {
    gap: spacing.sm,
  },
  photoCell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.md,
  },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 6,
  },
  photoSide: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  viewer: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  viewerImage: {
    width: '100%',
    height: 420,
  },
  sheetBody: {
    gap: spacing.md,
  },
});
