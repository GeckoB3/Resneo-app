import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, Notice, posStyles } from '@/components/pos/parts';
import { ImagePainterHost } from '@/components/services-setup/ImagePainter';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch } from '@/lib/pos/api';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useSaveProduct } from '@/lib/queries/useRetail';
import { useAddNamed, useNamedList } from '@/lib/queries/useStockSetup';
import { stockSetupPaths } from '@/lib/retail/stock-setup-paths';
import type { ImagePainter } from '@/lib/services-setup/prepare-images';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProductsAiImportProps } from '@/types/pos-setup';

import { readProductsAi, useProductsAiAvailability } from './api';
import { aiCount, aiT } from './copy';
import { DraftCard } from './DraftCard';
import { DraftEditorSheet } from './DraftEditorSheet';
import {
  buildProductBody,
  draftCanBeAdded,
  draftNotes,
  draftReadyForBulkAdd,
  foundLine,
  linkLabel,
  MAX_SOURCES,
  MAX_TEXT_CHARS,
  mergeServerDrafts,
  normaliseLink,
  READ_CONCURRENCY,
  requestFor,
  type AiSource,
  type ProductDraftState,
} from './model';
import { MAX_FILE_MB, PICKER_TYPES, prepareFile, preparePhoto } from './prepare';

/**
 * "Add products with AI" in the app (POS test round 2026-10-11, Part 4, OB7; design section 6.7,
 * mock-up B9): the web's `ProductsAiImport` on a phone, step for step, opened by "Add with AI" on
 * Products and by the set-up wizard's W7 through the route `/stock/ai-import`.
 *
 *   1. Add what you have: photos (taken there and then, one after another, or chosen from the
 *      library), a price list or invoice (PDF, Excel, CSV, Word), a link, or a typed list.
 *   2. We read it: each source is one request to the reader, two at a time; a photo is one request
 *      of its own (a long screenshot's slices together), each under the web host's body limit.
 *   3. Check and add: a card per product with Ready, Check or Fix and its notes, Edit, Skip and Add,
 *      and "Add all ready". Each product goes in through the ordinary products route (its brand and
 *      category found or added first), never with a stock count.
 *   4. Done.
 *
 * The camera and the pickers open from this screen (system screens, never a window over a sheet).
 * `onAdded(count)` is called once, on the way out, when anything was added. Nothing is kept on the
 * phone; leaving with products still to check asks first.
 */

type Step = 'sources' | 'reading' | 'review' | 'done';
type Panel = 'photos' | 'file' | 'link' | 'text';
type Filter = 'all' | 'pending' | 'added' | 'skipped';
type Icon = SymbolViewProps['name'];

const ICONS: Record<Panel, Icon> = {
  photos: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
  file: { ios: 'doc.text', android: 'description', web: 'description' },
  link: { ios: 'link', android: 'link', web: 'link' },
  text: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
};

const TILE_COPY = {
  photos: ['ai.src.photos.title', 'ai.src.photos.body'],
  file: ['ai.src.file.title', 'ai.src.file.body'],
  link: ['ai.src.link.title', 'ai.src.link.body'],
  text: ['ai.src.text.title', 'ai.src.text.body'],
} as const;

/** Failures in a row before "Add all ready" stops and asks the owner to look (the web's rule). */
const STOP_AFTER_FAILURES = 3;

function Tile({ panel, active, onPress }: { panel: Panel; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [titleId, bodyId] = TILE_COPY[panel];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={aiT(titleId)}
      accessibilityHint={aiT(bodyId)}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: active ? colors.brand : colors.border,
          backgroundColor: active ? colors.brandSubtle : colors.surfaceRaised,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <SymbolView name={ICONS[panel]} tintColor={colors.brand} size={24} />
      <View style={styles.flex}>
        <Text variant="bodyMedium">{aiT(titleId)}</Text>
        <Text variant="bodySmall" tone="secondary">
          {aiT(bodyId)}
        </Text>
      </View>
    </Pressable>
  );
}

let keySeq = 0;
function makeKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}${Date.now().toString(36)}${keySeq.toString(36)}`;
}

export function ProductsAiImport({ onAdded, onClose }: ProductsAiImportProps) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const accessToken = useAccessToken();
  const availability = useProductsAiAvailability();
  const brands = useNamedList('brands');
  const categories = useNamedList('categories');
  const addNamed = useAddNamed();
  const save = useSaveProduct();

  /** Every product this session adds is saved under a key made from this, so a retry never adds it twice. */
  const [sessionId] = useState(() => newPaymentAttemptId());
  const [step, setStepState] = useState<Step>('sources');
  const stepRef = useRef<Step>('sources');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sources, setSourcesState] = useState<AiSource[]>([]);
  const sourcesRef = useRef<AiSource[]>([]);
  const [drafts, setDraftsState] = useState<ProductDraftState[]>([]);
  const draftsRef = useRef<ProductDraftState[]>([]);
  const [notices, setNotices] = useState<{ source: string; text: string }[]>([]);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<{ text: string; settings?: boolean } | null>(null);
  const [reading, setReading] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<ProductDraftState | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const painterRef = useRef<ImagePainter | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const photoSeq = useRef(0);
  /** Brand and category names (lower case, by kind) to their ids, including ones this session added. */
  const namedIds = useRef(new Map<string, string>());
  const leavingOk = useRef(false);
  const reported = useRef(0);
  const onAddedRef = useRef(onAdded);

  function setStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  }

  function commitSources(next: AiSource[]) {
    sourcesRef.current = next;
    setSourcesState(next);
  }

  function patchSource(key: string, patch: Partial<AiSource>) {
    commitSources(sourcesRef.current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function commitDrafts(next: ProductDraftState[]) {
    draftsRef.current = next;
    setDraftsState(next);
  }

  function updateDraft(key: string, patch: Partial<ProductDraftState>) {
    commitDrafts(draftsRef.current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function setBusy(key: string, on: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  useEffect(() => {
    onAddedRef.current = onAdded;
  }, [onAdded]);

  /** `onAdded` once, with how many this session added, on the way out. */
  function reportAdded() {
    const added = draftsRef.current.filter((d) => d.status === 'added').length;
    if (added > reported.current) {
      reported.current = added;
      onAddedRef.current(added);
    }
  }

  function close() {
    reportAdded();
    leavingOk.current = true;
    onClose();
  }

  // Leaving with products still to check asks first (the web's `ai.leave.*`). The listener reads
  // the latest drafts and step through refs, so it is added once.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (leavingOk.current) return;
      const pending = draftsRef.current.filter((d) => d.status === 'pending').length;
      if (stepRef.current !== 'done' && pending > 0) {
        e.preventDefault();
        setLeaving(e.data.action);
        return;
      }
      const added = draftsRef.current.filter((d) => d.status === 'added').length;
      if (added > reported.current) {
        reported.current = added;
        onAddedRef.current(added);
      }
    });
    return unsubscribe;
  }, [navigation]);

  // ─── Sources ─────────────────────────────────────────────────────────────

  /** Adds sources up to the limit; answers how many did not fit. */
  function appendSources(items: Omit<AiSource, 'key' | 'status'>[]): number {
    const room = Math.max(0, MAX_SOURCES - sourcesRef.current.length);
    const taken = items.slice(0, room).map((s) => ({ ...s, key: makeKey('s'), status: 'waiting' as const }));
    commitSources([...sourcesRef.current, ...taken]);
    return items.length - taken.length;
  }

  function maxNotice(): string {
    return aiT('ai.src.max', { count: MAX_SOURCES });
  }

  function addLink() {
    const link = normaliseLink(url);
    if (!link) {
      setPickerNotice({ text: aiT('app.ai.src.link.invalid') });
      return;
    }
    const dropped = appendSources([{ kind: 'link', label: linkLabel(link), url: link }]);
    setPickerNotice(dropped > 0 ? { text: maxNotice() } : null);
    if (dropped === 0) setUrl('');
  }

  function addText() {
    const value = text.trim();
    if (!value) return;
    if (value.length > MAX_TEXT_CHARS) {
      setPickerNotice({ text: aiT('app.ai.src.text.tooLong') });
      return;
    }
    const n = sourcesRef.current.filter((s) => s.kind === 'text').length;
    const label = n === 0 ? aiT('ai.src.typed') : aiT('ai.src.typedN', { n: n + 1 });
    const dropped = appendSources([{ kind: 'text', label, text: value }]);
    setPickerNotice(dropped > 0 ? { text: maxNotice() } : null);
    if (dropped === 0) setText('');
  }

  async function addPhotos(assets: ImagePicker.ImagePickerAsset[]) {
    setPickerNotice(null);
    setPreparing(true);
    const tooBig: string[] = [];
    const cutShort: string[] = [];
    const unreadable: string[] = [];
    const accepted: Omit<AiSource, 'key' | 'status'>[] = [];
    try {
      for (const a of assets) {
        photoSeq.current += 1;
        const label = aiT('app.ai.photo', { n: photoSeq.current });
        const prepared = await preparePhoto(
          { uri: a.uri, label, mimeType: a.mimeType ?? null, width: a.width, height: a.height },
          painterRef.current,
        );
        if (!prepared.ok) {
          (prepared.reason === 'too_big' ? tooBig : unreadable).push(label);
          continue;
        }
        if (prepared.truncated) cutShort.push(label);
        for (const part of prepared.parts) accepted.push({ kind: 'images', label: part.label, images: part.dataUrls, thumbUri: a.uri });
      }
    } finally {
      setPreparing(false);
    }
    const dropped = appendSources(accepted);
    const messages: string[] = [];
    if (tooBig.length) messages.push(aiCount('ai.src.tooBig', tooBig.length, { names: tooBig.join(', '), size: MAX_FILE_MB }));
    if (unreadable.length) messages.push(aiCount('ai.src.unreadable', unreadable.length, { names: unreadable.join(', ') }));
    if (cutShort.length) messages.push(aiCount('ai.src.cutShort', cutShort.length, { names: cutShort.join(', ') }));
    if (dropped > 0) messages.push(maxNotice());
    setPickerNotice(messages.length ? { text: messages.join(' ') } : null);
  }

  /** A photo taken there and then; the button stays for the next one. */
  async function takePhoto() {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setPickerNotice({ text: maxNotice() });
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      // Asked first on both platforms: iOS needs it, and Android refuses the camera to an app that
      // declares the CAMERA permission without holding it.
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPickerNotice({ text: aiT('app.ai.camera.denied'), settings: permission.canAskAgain === false });
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setPickerNotice({ text: aiT('app.ai.camera.failed') });
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    await addPhotos(result.assets);
  }

  async function choosePhotos() {
    const room = MAX_SOURCES - sourcesRef.current.length;
    if (room <= 0) {
      setPickerNotice({ text: maxNotice() });
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      // No media permission is asked for: the system picker hands back what was chosen (as
      // `pickVenueImage`). An iPhone's HEIC photos arrive as JPEG.
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: room,
        quality: 1,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
    } catch {
      setPickerNotice({ text: aiT('app.ai.library.failed') });
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    await addPhotos(result.assets);
  }

  async function chooseFiles() {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setPickerNotice({ text: maxNotice() });
      return;
    }
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: PICKER_TYPES,
        multiple: true,
        // Android: the picker's own link (content://), which carries a read grant, rather than its
        // cache copy, which Expo Go's file access refuses (as the services set-up).
        copyToCacheDirectory: Platform.OS !== 'android',
      });
    } catch {
      setPickerNotice({ text: aiCount('ai.src.fileUnreadable', 1, { names: aiT('ai.src.file.title') }) });
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    setPickerNotice(null);
    setPreparing(true);
    const tooBig: string[] = [];
    const unreadable: string[] = [];
    let wrongType = false;
    const accepted: Omit<AiSource, 'key' | 'status'>[] = [];
    try {
      for (const a of result.assets) {
        const prepared = await prepareFile({ uri: a.uri, name: a.name, size: typeof a.size === 'number' ? a.size : null, mimeType: a.mimeType ?? null });
        if (prepared.ok) accepted.push({ kind: 'file', label: prepared.file.name, file: prepared.file });
        else if (prepared.reason === 'type') wrongType = true;
        else (prepared.reason === 'too_big' ? tooBig : unreadable).push(a.name || aiT('ai.src.file.title'));
      }
    } finally {
      setPreparing(false);
    }
    const dropped = appendSources(accepted);
    const messages: string[] = [];
    if (wrongType) messages.push(aiT('app.ai.src.file.type'));
    if (tooBig.length) messages.push(aiCount('ai.src.tooBig', tooBig.length, { names: tooBig.join(', '), size: MAX_FILE_MB }));
    if (unreadable.length) messages.push(aiCount('ai.src.fileUnreadable', unreadable.length, { names: unreadable.join(', ') }));
    if (dropped > 0) messages.push(maxNotice());
    setPickerNotice(messages.length ? { text: messages.join(' ') } : null);
  }

  function removeSource(key: string) {
    commitSources(sourcesRef.current.filter((s) => s.key !== key));
  }

  // ─── Reading ─────────────────────────────────────────────────────────────

  async function readSource(source: AiSource): Promise<boolean> {
    patchSource(source.key, { status: 'reading', error: undefined });
    const res = await readProductsAi(requestFor(source), accessToken);
    if (!res.ok) {
      patchSource(source.key, { status: 'failed', error: res.error });
      return false;
    }
    const merged = mergeServerDrafts(draftsRef.current, res.data.drafts, source.label, () => makeKey('d'));
    commitDrafts(merged.drafts);
    if (res.data.notes.length > 0) {
      setNotices((prev) => [
        ...prev,
        ...res.data.notes.filter((t) => !prev.some((n) => n.source === source.label && n.text === t)).map((t) => ({ source: source.label, text: t })),
      ]);
    }
    patchSource(source.key, { status: 'done', found: merged.added, alreadyListed: merged.alreadyListed });
    return true;
  }

  /** 'unread' is everything not read yet, including a source that failed and was kept. */
  async function readAll(which: 'unread' | 'failed' | 'one', onlyKey?: string) {
    const queue = sourcesRef.current.filter((s) =>
      which === 'one' ? s.key === onlyKey : which === 'failed' ? s.status === 'failed' : s.status === 'waiting' || s.status === 'failed',
    );
    if (queue.length === 0) return;
    setStep('reading');
    setReading(true);
    let failures = 0;
    let next = 0;
    async function worker() {
      while (next < queue.length) {
        const s = queue[next++]!;
        if (!(await readSource(s))) failures++;
      }
    }
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, queue.length) }, worker));
    setReading(false);
    if (failures === 0 && draftsRef.current.some((d) => d.status === 'pending')) {
      setFilter('all');
      setStep('review');
    }
  }

  // ─── Adding ──────────────────────────────────────────────────────────────

  /** The id of the brand or category with this name, adding it when the venue has none. */
  async function ensureNamed(kind: 'brands' | 'categories', raw: string): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name) return { ok: true, id: null };
    const lower = name.toLowerCase();
    const cacheKey = `${kind}:${lower}`;
    const cached = namedIds.current.get(cacheKey);
    if (cached) return { ok: true, id: cached };
    const known = ((kind === 'brands' ? brands.data : categories.data) ?? []).find((i) => i.name.trim().toLowerCase() === lower);
    if (known) {
      namedIds.current.set(cacheKey, known.id);
      return { ok: true, id: known.id };
    }
    const failed = kind === 'brands' ? aiT('ai.add.brandFailed', { name }) : aiT('ai.add.categoryFailed', { name });
    try {
      const item = await addNamed.mutateAsync({ kind, name });
      namedIds.current.set(cacheKey, item.id);
      return { ok: true, id: item.id };
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && accessToken) {
        // Added meanwhile (or on another device): find it by name.
        try {
          const again = await posFetch<Record<string, unknown>>(stockSetupPaths.named(kind), { accessToken });
          const rows = Array.isArray(again[kind]) ? (again[kind] as { id?: unknown; name?: unknown }[]) : [];
          const hit = rows.find((r) => String(r.name ?? '').trim().toLowerCase() === lower);
          if (hit?.id) {
            namedIds.current.set(cacheKey, String(hit.id));
            return { ok: true, id: String(hit.id) };
          }
        } catch {
          // Fall through to the refusal.
        }
      }
      return { ok: false, error: e instanceof ApiError && e.status === 0 ? aiT('ai.err.network') : failed };
    }
  }

  async function saveDraft(key: string): Promise<boolean> {
    const start = draftsRef.current.find((x) => x.key === key);
    if (!start) return false;
    const brand = await ensureNamed('brands', start.brand);
    if (!brand.ok) {
      updateDraft(key, { error: brand.error });
      return false;
    }
    const category = await ensureNamed('categories', start.category);
    if (!category.ok) {
      updateDraft(key, { error: category.error });
      return false;
    }
    const d = draftsRef.current.find((x) => x.key === key) ?? start;
    const clientRequestId = `ai-${sessionId}-${d.key}`;
    const body = buildProductBody(d, { brandId: brand.id, categoryId: category.id, clientRequestId });
    try {
      const product = await save.mutateAsync({ kind: 'create', body, clientRequestId });
      if (!product?.id) {
        updateDraft(key, { error: aiT('ai.add.unclear') });
        return false;
      }
      updateDraft(key, { status: 'added', createdProductId: String(product.id), error: null });
      return true;
    } catch (e) {
      updateDraft(key, { error: e instanceof ApiError && e.status === 0 ? aiT('ai.err.network') : posErrorMessage(e, aiT('ai.add.failed')) });
      return false;
    }
  }

  async function addDraft(key: string): Promise<boolean> {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d || d.status !== 'pending' || !draftCanBeAdded(draftNotes(d))) return false;
    setBusy(key, true);
    updateDraft(key, { error: null });
    const ok = await saveDraft(key);
    setBusy(key, false);
    return ok;
  }

  async function addAllReady() {
    setConfirmAll(false);
    const ready = draftsRef.current.filter((d) => draftReadyForBulkAdd(d, draftNotes(d)));
    if (ready.length === 0) return;
    setNotice(null);
    setBulk({ done: 0, total: ready.length });
    let failedInARow = 0;
    for (let i = 0; i < ready.length; i++) {
      const success = await addDraft(ready[i]!.key);
      setBulk({ done: i + 1, total: ready.length });
      failedInARow = success ? 0 : failedInARow + 1;
      if (failedInARow >= STOP_AFTER_FAILURES) {
        setNotice(aiT('ai.bulk.stopped'));
        break;
      }
    }
    setBulk(null);
  }

  function addMore() {
    commitSources(sourcesRef.current.filter((s) => s.status !== 'done'));
    setPickerNotice(null);
    setPanel(null);
    setStep('sources');
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────

  if (availability.loading) {
    return (
      <View style={styles.center} accessibilityRole="progressbar">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (!availability.offered) {
    return (
      <View style={styles.content}>
        <Notice tone="warning">{aiT('app.ai.unavailable')}</Notice>
        <Button label={aiT('ai.done.close')} variant="secondary" onPress={onClose} fullWidth />
      </View>
    );
  }

  const notesByKey = new Map(drafts.map((d) => [d.key, draftNotes(d)]));
  const counts = { pending: 0, added: 0, skipped: 0, ready: 0, total: drafts.length };
  for (const d of drafts) {
    counts[d.status] += 1;
    if (draftReadyForBulkAdd(d, notesByKey.get(d.key) ?? [])) counts.ready += 1;
  }
  const visible = filter === 'all' ? drafts : drafts.filter((d) => d.status === filter);
  const waitingCount = sources.filter((s) => s.status === 'waiting' || s.status === 'failed').length;
  const failedCount = sources.filter((s) => s.status === 'failed').length;
  const locked = bulk !== null;
  const photosTaken = sources.some((s) => s.kind === 'images' && s.status !== 'done');
  const description =
    step === 'sources' ? aiT('ai.desc.sources') : step === 'reading' ? aiT('ai.desc.reading') : step === 'review' ? aiT('ai.desc.review') : aiT('ai.desc.done');

  return (
    <View style={styles.flex}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" tone="secondary">
          {description}
        </Text>

        {step === 'sources' ? (
          <>
            <Text variant="body">{aiT('ai.src.intro')}</Text>
            <View style={styles.tiles}>
              {(['photos', 'file', 'link', 'text'] as const).map((p) => (
                <Tile key={p} panel={p} active={panel === p} onPress={() => setPanel(p)} />
              ))}
            </View>

            {panel === 'photos' ? (
              <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Button
                  label={photosTaken ? aiT('app.ai.src.photos.another') : aiT('ai.src.photos.take')}
                  onPress={() => void takePhoto()}
                  disabled={preparing}
                  fullWidth
                />
                <Button label={aiT('ai.src.photos.choose')} variant="secondary" onPress={() => void choosePhotos()} disabled={preparing} fullWidth />
                <Text variant="caption" tone="muted">
                  {aiT('app.ai.src.photos.help')}
                </Text>
              </View>
            ) : panel === 'file' ? (
              <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Button label={aiT('ai.src.file.choose')} onPress={() => void chooseFiles()} disabled={preparing} fullWidth />
                <Text variant="caption" tone="muted">
                  {aiT('app.ai.src.file.help', { size: MAX_FILE_MB })}
                </Text>
              </View>
            ) : panel === 'link' ? (
              <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Input
                  label={aiT('ai.src.link.label')}
                  accessibilityLabel={aiT('ai.src.link.label')}
                  value={url}
                  onChangeText={setUrl}
                  placeholder={aiT('app.ai.src.link.placeholder')}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="url"
                  returnKeyType="done"
                  onSubmitEditing={addLink}
                />
                <Button label={aiT('ai.src.link.add')} onPress={addLink} disabled={!url.trim()} fullWidth />
                <Text variant="caption" tone="muted">
                  {aiT('ai.src.link.help')}
                </Text>
              </View>
            ) : panel === 'text' ? (
              <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Input
                  label={aiT('ai.src.text.label')}
                  accessibilityLabel={aiT('ai.src.text.label')}
                  value={text}
                  onChangeText={setText}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  style={styles.textArea}
                  placeholder={aiT('ai.src.text.placeholder')}
                />
                <Button label={aiT('ai.src.text.add')} onPress={addText} disabled={!text.trim()} fullWidth />
              </View>
            ) : null}

            {preparing ? (
              <View style={posStyles.row} accessibilityRole="progressbar" accessibilityLabel={aiT('ai.src.preparing')}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text variant="bodySmall" tone="secondary">
                  {aiT('ai.src.preparing')}
                </Text>
              </View>
            ) : null}
            {pickerNotice ? (
              <Notice
                tone="warning"
                action={
                  pickerNotice.settings ? { label: aiT('app.ai.camera.settings'), onPress: () => void Linking.openSettings() } : undefined
                }>
                {pickerNotice.text}
              </Notice>
            ) : null}

            {sources.length > 0 ? (
              <View style={posStyles.stack}>
                <Text variant="label">{aiT('ai.src.list', { count: sources.length })}</Text>
                <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                  {sources.map((s, i) => (
                    <SourceRow key={s.key} source={s} first={i === 0} onRemove={() => removeSource(s.key)} />
                  ))}
                </View>
              </View>
            ) : null}

            <Text variant="caption" tone="muted">
              {aiT('ai.disclosure')}
            </Text>
          </>
        ) : step === 'reading' ? (
          <>
            <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
              {sources.map((s, i) => (
                <SourceRow
                  key={s.key}
                  source={s}
                  first={i === 0}
                  status
                  onRemove={reading ? undefined : () => removeSource(s.key)}
                  onRetry={reading ? undefined : () => void readAll('one', s.key)}
                />
              ))}
            </View>
            {reading ? (
              <Text variant="bodySmall" tone="muted">
                {aiT('app.ai.read.keepOpen')}
              </Text>
            ) : counts.pending === 0 && failedCount === 0 ? (
              <Notice tone="warning">{aiT('ai.read.noneFound')}</Notice>
            ) : null}
          </>
        ) : step === 'review' ? (
          <>
            <Text variant="bodyMedium">
              {`${aiCount('ai.review.found', counts.total)} ${aiT('ai.review.progress', {
                added: counts.added,
                skipped: counts.skipped,
                pending: counts.pending,
              })}`}
            </Text>
            <Button label={aiT('ai.review.more')} variant="ghost" size="sm" onPress={addMore} disabled={locked} />
            {notices.length > 0 ? (
              <Notice>{[aiT('ai.review.noticed'), ...notices.map((n) => `${n.source}: ${n.text}`)].join('\n')}</Notice>
            ) : null}
            {notice ? <Notice tone="warning">{notice}</Notice> : null}
            <ChoiceChips<Filter>
              options={[
                { value: 'all', label: aiT('ai.review.filter.all', { count: counts.total }) },
                { value: 'pending', label: aiT('ai.review.filter.pending', { count: counts.pending }) },
                { value: 'added', label: aiT('ai.review.filter.added', { count: counts.added }) },
                { value: 'skipped', label: aiT('ai.review.filter.skipped', { count: counts.skipped }) },
              ]}
              value={filter}
              onChange={setFilter}
            />
            {visible.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {filter === 'pending' ? aiT('ai.review.nothingLeft') : aiT('ai.review.nothing')}
              </Text>
            ) : (
              visible.map((d) => (
                <DraftCard
                  key={d.key}
                  draft={d}
                  notes={notesByKey.get(d.key) ?? []}
                  busy={busyKeys.has(d.key)}
                  locked={locked}
                  onAdd={() => void addDraft(d.key)}
                  onEdit={() => setEditing(d)}
                  onSkip={() => updateDraft(d.key, { status: 'skipped', error: null })}
                  onRestore={() => updateDraft(d.key, { status: 'pending' })}
                />
              ))
            )}
          </>
        ) : (
          <View style={posStyles.stack}>
            <Text variant="heading" accessibilityRole="header">
              {counts.added === 0 ? aiT('ai.done.none') : aiCount('ai.done.title', counts.added)}
            </Text>
            <Text variant="body" tone="secondary">
              {counts.pending > 0
                ? aiCount('ai.done.pending', counts.pending)
                : counts.added === 0
                  ? aiT('ai.done.again')
                  : aiT('ai.done.body')}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {step === 'sources' ? (
          <>
            <Button
              label={waitingCount > 1 ? aiT('ai.findN', { count: waitingCount }) : aiT('ai.find')}
              onPress={() => void readAll('unread')}
              disabled={preparing || waitingCount === 0}
              fullWidth
            />
            {counts.total > 0 ? (
              <Button
                label={counts.pending > 0 ? aiCount('ai.read.check', counts.pending) : aiT('ai.read.checkNone')}
                variant="ghost"
                onPress={() => setStep('review')}
                disabled={preparing}
                fullWidth
              />
            ) : null}
          </>
        ) : step === 'reading' ? (
          reading ? (
            <View style={posStyles.row} accessibilityRole="progressbar" accessibilityLabel={aiT('ai.read.reading')}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text variant="bodySmall">{aiT('ai.read.reading')}</Text>
            </View>
          ) : (
            <>
              {counts.total > 0 ? (
                <Button
                  label={counts.pending > 0 ? aiCount('ai.read.check', counts.pending) : aiT('ai.read.checkNone')}
                  onPress={() => setStep('review')}
                  fullWidth
                />
              ) : null}
              {failedCount > 0 ? (
                <Button label={aiT('ai.tryAgain')} variant="secondary" onPress={() => void readAll('failed')} fullWidth />
              ) : null}
              <Button label={aiT('ai.back')} variant="ghost" onPress={() => setStep('sources')} fullWidth />
            </>
          )
        ) : step === 'review' ? (
          <>
            <Button
              label={bulk ? aiT('ai.adding', { done: Math.min(bulk.done + 1, bulk.total), total: bulk.total }) : aiT('ai.addAll', { count: counts.ready })}
              onPress={() => setConfirmAll(true)}
              loading={locked}
              disabled={locked || busyKeys.size > 0 || counts.ready === 0}
              fullWidth
            />
            <Button
              label={counts.pending === 0 ? aiT('ai.finish') : aiT('ai.finishLater')}
              variant="ghost"
              onPress={() => setStep('done')}
              disabled={locked || busyKeys.size > 0}
              fullWidth
            />
          </>
        ) : (
          <>
            <Button label={aiT('ai.done.close')} onPress={close} fullWidth />
            <Button label={aiT('ai.done.more')} variant="ghost" onPress={addMore} fullWidth />
          </>
        )}
      </View>

      {step === 'sources' ? <ImagePainterHost ref={painterRef} /> : null}

      <DraftEditorSheet
        draft={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          updateDraft(next.key, next);
          setEditing(null);
        }}
      />
      <ConfirmSheet
        visible={confirmAll}
        title={aiCount('ai.addAll.title', counts.ready)}
        message={aiT('ai.addAll.body')}
        confirmLabel={aiCount('ai.addAll.confirm', counts.ready)}
        cancelLabel={aiT('ai.cancel')}
        destructive={false}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => void addAllReady()}
      />
      <ConfirmSheet
        visible={leaving !== null}
        title={aiT('ai.leave.title')}
        message={aiCount('ai.leave.body', counts.pending)}
        confirmLabel={aiT('ai.leave.confirm')}
        cancelLabel={aiT('ai.leave.cancel')}
        onClose={() => setLeaving(null)}
        onConfirm={() => {
          const action = leaving;
          setLeaving(null);
          reportAdded();
          leavingOk.current = true;
          if (action) navigation.dispatch(action);
        }}
      />
    </View>
  );
}

/** One thing to read: its thumbnail or icon, its name, and where its read is. */
function SourceRow({
  source: s,
  first,
  status = false,
  onRemove,
  onRetry,
}: {
  source: AiSource;
  first: boolean;
  /** The reading step: Waiting, Reading…, what was found, or why it failed. */
  status?: boolean;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const icon = s.kind === 'file' ? ICONS.file : s.kind === 'link' ? ICONS.link : s.kind === 'text' ? ICONS.text : ICONS.photos;
  const line =
    s.status === 'failed' && s.error
      ? aiT('ai.src.lastTry', { error: s.error })
      : !status
        ? null
        : s.status === 'reading'
          ? aiT('ai.read.reading')
          : s.status === 'done'
            ? foundLine(s)
            : aiT('ai.read.waiting');
  return (
    <View style={[styles.sourceRow, first ? null : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      {s.kind === 'images' && s.thumbUri ? (
        <Image source={{ uri: s.thumbUri }} style={[styles.thumb, { borderColor: colors.border }]} contentFit="cover" />
      ) : (
        <SymbolView name={icon} tintColor={colors.brand} size={20} />
      )}
      <View style={styles.flex}>
        <Text variant="bodySmall" numberOfLines={1}>
          {s.label}
        </Text>
        {line ? (
          <Text variant="caption" tone={s.status === 'failed' ? 'danger' : 'muted'}>
            {line}
          </Text>
        ) : null}
      </View>
      {s.status === 'reading' ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      {s.status === 'failed' && onRetry ? <Button label={aiT('ai.retry')} size="sm" variant="secondary" onPress={onRetry} /> : null}
      {s.status !== 'reading' && s.status !== 'done' && onRemove ? (
        <Button label={aiT('ai.src.remove')} accessibilityLabel={aiT('ai.src.removeLabel', { label: s.label })} size="sm" variant="ghost" onPress={onRemove} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  tiles: { gap: spacing.sm },
  tile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 72,
  },
  panel: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  textArea: { minHeight: 132 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
});
