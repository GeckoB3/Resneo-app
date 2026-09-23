import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  COULD_NOT_REACH,
  createAddonGroup,
  createAppointmentService,
  createServiceCategory,
  deleteAddonGroup,
  deleteAppointmentService,
  fetchAppointmentServices,
  listServiceCategories,
  offerOnCollectivePage,
  patchAppointmentService,
  readSetupSource,
  takeOffCollectivePage,
  updateAddonGroup,
  type CategoryRef,
  type SetupAddonGroupBody,
  type SetupFilePart,
} from '@/lib/services-setup/api';
import {
  DEFAULT_SETUP_DEFAULTS,
  cleanPriceInput,
  draftCanBeAdded,
  draftIssues,
  draftReadyForBulkAdd,
  draftToForm,
  formToCreateBody,
  mergeIntoDrafts,
  normaliseServiceName,
  parseMinutesInput,
  updatableDuplicate,
  type ExistingServiceRef,
  type ServiceDraft,
  type SetupDefaults,
  type SetupServiceForm,
} from '@/lib/services-setup/drafts';
import { clearUploadCache, stageDocument } from '@/lib/services-setup/files';
import {
  MAX_UPLOAD_BYTES,
  prepareImageForUpload,
  type ImagePainter,
  type PickedImage,
  type PreparedImage,
} from '@/lib/services-setup/prepare-images';
import {
  clearServicesSetup,
  loadServicesSetup,
  saveServicesSetup,
  type SetupAddonGroup,
  type SetupNotice,
} from '@/lib/services-setup/setup-storage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { AddonPanel, useAddonForm, type AddonTargetService } from './AddonPanel';
import { Panel, SourceStatusIcon, TextLink, hostLabel } from './bits';
import { DraftServiceCard, type DraftCardActions } from './DraftServiceCard';
import { HeadingHeader, type HeadingActions } from './HeadingHeader';
import { ImagePainterHost } from './ImagePainter';
import { ReviewSettings } from './ReviewSettings';
import { SetupShell } from './SetupShell';
import { SourcePicker, type SetupSource } from './SourcePicker';

/**
 * "Set up with AI" on the app's Services screen (web `ServicesSetupWizard.tsx`; plan
 * `Docs/ai-services-setup-plan.md` in the web repo).
 *
 * @see _reference/Resneo/src/components/dashboard/appointment-services/services-setup/ServicesSetupWizard.tsx
 *
 * The owner shows us their services (a link, photos or screenshots, a document, a typed list);
 * each source is read by `POST /api/venue/services-setup/extract`, two at a time; the services
 * found become drafts the owner checks, edits and adds one by one or all at once, each through
 * the ordinary `POST /api/venue/appointment-services`. Nothing is added until they say so, and
 * the review is kept on the phone per venue so it can be finished later.
 *
 * Differences from the web, all for a phone: one sheet (iOS cannot stack them), so the add-on
 * editor and the confirmations are pages and panels inside it, and More settings hands over to
 * the Services screen's own form and comes back; photos come from the library or the clipboard,
 * not the camera (the app's build has no camera permission); pictures are resized and long
 * screenshots cut in a hidden WebView canvas, as the browser does with its own.
 */

type Step = 'loading' | 'sources' | 'reading' | 'review' | 'done';
type Filter = 'all' | 'pending' | 'added' | 'skipped';

const MAX_SOURCES = 12;
const READ_CONCURRENCY = 2;
const NO_HEADING = '';
/** A search box appears once the list is long enough to need one. */
const SEARCH_FROM = 12;
const ADDON_PROMPT = 'Would you like to add any extras?';
const SAVE_DEBOUNCE_MS = 400;

/** Web `APPOINTMENT_SERVICE_COLOUR_OPTIONS`: one colour per heading, in heading order. */
const COLOUR_OPTIONS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/comma-separated-values',
  'text/tab-separated-values',
  'text/plain',
  'text/html',
];

/** A service the venue already has, with the heading it sits under. */
export type ExistingServiceForSetup = ExistingServiceRef & { categoryName: string };

export interface ServicesSetupHandle {
  /** The Services screen's form, opened by More settings, closed: with the new service's id, or null if not saved. */
  moreSettingsDone: (draftKey: string, serviceId: string | null) => void;
}

export interface ServicesSetupSheetProps {
  /** False while More settings has the Services screen's form open; the setup keeps its place. */
  visible: boolean;
  onClose: () => void;
  /** Services were added or removed: the Services screen should reload its list. */
  onServicesChanged: () => void;
  /** Open the Services screen's Add service form with these values (More settings). */
  onMoreSettings: (draftKey: string, form: SetupServiceForm) => void;
  onOpenBookingPage: (() => void) | null;
  onOpenCalendars: () => void;
  venueId: string | null;
  websiteUrl: string | null;
  currencyCode: string;
  currencySymbol: string;
  categories: CategoryRef[];
  existingServices: ExistingServiceForSetup[];
  /** Team calendars a service can be offered on (active, not resources). */
  calendars: { id: string; name: string }[];
  stripeConnected: boolean;
  /** Set when this venue hosts a live collective: new services can go on its combined page. */
  collectiveHost: { id: string; name: string } | null;
}

let keySeq = 0;
function makeKey(): string {
  keySeq += 1;
  return `d${Date.now().toString(36)}${keySeq.toString(36)}`;
}

function headingKey(heading: string): string {
  return heading.trim().toLowerCase();
}

/** The sentence the server gave, as the web shows it (`error`, plus string `details`). */
function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 0 || e.status === 408) return COULD_NOT_REACH;
    const body = (e.body ?? null) as { error?: unknown; details?: unknown } | null;
    const base =
      typeof body?.error === 'string' && body.error.trim()
        ? body.error
        : e.status === 403
          ? 'Only an admin can add services.'
          : fallback;
    return typeof body?.details === 'string' && body.details.trim() ? `${base} ${body.details}` : base;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Ticks once a second while `active`, for the reading timer. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    gif: 'image/gif',
  };
  return map[ext] ?? 'image/jpeg';
}

export const ServicesSetupSheet = forwardRef<ServicesSetupHandle, ServicesSetupSheetProps>(function ServicesSetupSheet(
  {
    visible,
    onClose,
    onServicesChanged,
    onMoreSettings,
    onOpenBookingPage,
    onOpenCalendars,
    venueId,
    websiteUrl,
    currencyCode,
    currencySymbol,
    categories,
    existingServices,
    calendars,
    stripeConnected,
    collectiveHost,
  },
  ref,
) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  const [stored, setStored] = useState(false);
  const [step, setStep] = useState<Step>('loading');
  const [sources, setSourcesState] = useState<SetupSource[]>([]);
  const sourcesRef = useRef<SetupSource[]>([]);
  const [instructions, setInstructions] = useState('');
  const instructionsRef = useRef('');
  useEffect(() => {
    instructionsRef.current = instructions;
  }, [instructions]);
  const [drafts, setDraftsState] = useState<ServiceDraft[]>([]);
  const draftsRef = useRef<ServiceDraft[]>([]);
  const [calendarIds, setCalendarIds] = useState<string[] | null>(null);
  const [headingCalendars, setHeadingCalendars] = useState<Record<string, string[]>>({});
  const [defaults, setDefaults] = useState<SetupDefaults>(DEFAULT_SETUP_DEFAULTS);
  const [notices, setNotices] = useState<SetupNotice[]>([]);
  const [addonGroups, setAddonGroupsState] = useState<SetupAddonGroup[]>([]);
  const addonGroupsRef = useRef<SetupAddonGroup[]>([]);
  const [addToCollective, setAddToCollective] = useState(true);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [reading, setReading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addonFor, setAddonFor] = useState<string | null>(null);
  /** Counts openings of the add-on page, so each one starts with the draft's own values. */
  const [addonOpenSeq, setAddonOpenSeq] = useState(0);
  const [addonBusy, setAddonBusy] = useState(false);
  const [addonError, setAddonError] = useState<string | null>(null);
  const [sourceCurrencies, setSourceCurrencies] = useState<string[]>([]);
  const [canPaste, setCanPaste] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => void;
  } | null>(null);
  const changedRef = useRef(false);
  const categoryIdsRef = useRef<Map<string, string> | null>(null);
  const painterRef = useRef<ImagePainter | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const listScrollY = useRef(0);
  const now = useNow(reading);

  // ---------- State helpers ----------

  const setSources = useCallback((updater: (prev: SetupSource[]) => SetupSource[]) => {
    sourcesRef.current = updater(sourcesRef.current);
    setSourcesState(sourcesRef.current);
  }, []);

  const commitDrafts = useCallback((next: ServiceDraft[]) => {
    draftsRef.current = next;
    setDraftsState(next);
  }, []);

  const updateDraft = useCallback(
    (key: string, patch: Partial<ServiceDraft>) => {
      commitDrafts(draftsRef.current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    },
    [commitDrafts],
  );

  function commitAddonGroups(next: SetupAddonGroup[]) {
    addonGroupsRef.current = next;
    setAddonGroupsState(next);
  }

  function setBusy(key: string, on: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Heading name (lower case) to id: the venue's own, plus any this setup creates. */
  function categoryIds(): Map<string, string> {
    if (categoryIdsRef.current === null) {
      categoryIdsRef.current = new Map(categories.map((c) => [headingKey(c.name), c.id]));
    }
    return categoryIdsRef.current;
  }

  function scrollToTop() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  }

  function goTo(next: Step) {
    setStep(next);
    scrollToTop();
  }

  // ---------- Resume ----------

  useEffect(() => {
    let alive = true;
    void loadServicesSetup(venueId).then((saved) => {
      if (!alive) return;
      if (saved && saved.drafts.some((d) => d.status === 'pending')) {
        commitDrafts(saved.drafts);
        setCalendarIds(saved.calendarIds ?? null);
        setInstructions(saved.instructions ?? '');
        setHeadingCalendars(saved.headingCalendars ?? {});
        setDefaults(saved.defaults ?? DEFAULT_SETUP_DEFAULTS);
        setNotices(saved.notices ?? []);
        commitAddonGroups(saved.addonGroups ?? []);
        setStored(true);
        setStep('review');
      } else {
        setStep('sources');
      }
    });
    return () => {
      alive = false;
    };
    // Read once, when the setup opens for this venue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Kept on the phone as the owner works, a moment after each change, and on the way out.
  const latestSave = useRef<Parameters<typeof saveServicesSetup>[1] | null>(null);
  useEffect(() => {
    if (step === 'loading' || drafts.length === 0) return;
    const data = { drafts, calendarIds, instructions, headingCalendars, defaults, notices, addonGroups };
    latestSave.current = data;
    const t = setTimeout(() => {
      latestSave.current = null;
      void saveServicesSetup(venueId, data);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [step, drafts, calendarIds, instructions, headingCalendars, defaults, notices, addonGroups, venueId]);
  useEffect(
    () => () => {
      if (latestSave.current) void saveServicesSetup(venueId, latestSave.current);
      void clearUploadCache();
    },
    [venueId],
  );

  // ---------- Derived ----------

  const validCalendarIds = useMemo(() => new Set(calendars.map((c) => c.id)), [calendars]);

  // Every calendar offers the new services unless the owner narrows it.
  const effectiveCalendarIds = useMemo(
    () => (calendarIds === null ? calendars.map((c) => c.id) : calendarIds.filter((id) => validCalendarIds.has(id))),
    [calendarIds, calendars, validCalendarIds],
  );

  const headingCalendarIds = useCallback(
    (heading: string): string[] => {
      const own = headingCalendars[headingKey(heading)];
      return own ? own.filter((id) => validCalendarIds.has(id)) : effectiveCalendarIds;
    },
    [headingCalendars, effectiveCalendarIds, validCalendarIds],
  );

  const calendarsFor = useCallback(
    (d: ServiceDraft): string[] =>
      d.calendarIds ? d.calendarIds.filter((id) => validCalendarIds.has(id)) : headingCalendarIds(d.category),
    [headingCalendarIds, validCalendarIds],
  );

  const existingNames = useMemo(() => new Set(existingServices.map((s) => normaliseServiceName(s.name))), [existingServices]);
  const addedNames = useMemo(
    () =>
      new Set(
        drafts.filter((d) => d.status === 'added' && d.outcome?.kind === 'service').map((d) => normaliseServiceName(d.name)),
      ),
    [drafts],
  );
  // The Services list refreshes after adds, so a service this setup added must not flag itself.
  const issueContext = useMemo(
    () => ({
      existingServiceNames: new Set([...existingNames].filter((n) => !addedNames.has(n))),
      currencySymbol,
    }),
    [existingNames, addedNames, currencySymbol],
  );
  const issuesByKey = useMemo(() => {
    const m = new Map<string, ReturnType<typeof draftIssues>>();
    for (const d of drafts) m.set(d.key, draftIssues(d, issueContext));
    return m;
  }, [drafts, issueContext]);

  /** Headings in the order the owner's list gave them, so the page keeps that order. */
  const headingOrder = useMemo(() => {
    const order: string[] = [];
    for (const d of drafts) {
      const h = d.category.trim();
      if (!order.some((o) => headingKey(o) === headingKey(h))) order.push(h);
    }
    return order.sort((a, b) => (a === NO_HEADING ? 1 : b === NO_HEADING ? -1 : 0));
  }, [drafts]);

  /** One colour per heading, so the diary is easy to read. */
  const colourForHeading = useCallback(
    (heading: string) => {
      const named = headingOrder.filter((h) => h !== NO_HEADING);
      const i = named.findIndex((h) => headingKey(h) === headingKey(heading));
      return i < 0 ? COLOUR_OPTIONS[0]! : COLOUR_OPTIONS[i % COLOUR_OPTIONS.length]!;
    },
    [headingOrder],
  );

  const headingSuggestions = useMemo(() => {
    const out: string[] = [];
    for (const name of [...categories.map((c) => c.name), ...headingOrder]) {
      if (name && !out.some((o) => headingKey(o) === headingKey(name))) out.push(name);
    }
    return out;
  }, [categories, headingOrder]);

  const readyKeys = useMemo(
    () => new Set(drafts.filter((d) => draftReadyForBulkAdd(d, issuesByKey.get(d.key) ?? [])).map((d) => d.key)),
    [drafts, issuesByKey],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let added = 0;
    let skipped = 0;
    for (const d of drafts) {
      if (d.status === 'pending') pending++;
      else if (d.status === 'added') added++;
      else skipped++;
    }
    return { pending, added, skipped, ready: readyKeys.size, total: drafts.length };
  }, [drafts, readyKeys]);

  /** Services an add-on can be offered with: added by this setup, or already on the venue's list. */
  const addonTargets = useMemo<AddonTargetService[]>(() => {
    const out: AddonTargetService[] = [];
    const seen = new Set<string>();
    for (const d of drafts) {
      if (d.status === 'added' && d.outcome?.kind === 'service' && d.createdServiceId && !seen.has(d.createdServiceId)) {
        seen.add(d.createdServiceId);
        out.push({ id: d.createdServiceId, name: d.name, heading: d.category.trim() });
      }
    }
    for (const s of existingServices) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ id: s.id, name: s.name, heading: s.categoryName });
    }
    return out;
  }, [drafts, existingServices]);

  // ---------- Sources ----------

  function addSource(source: Omit<SetupSource, 'key' | 'status'>) {
    setSources((prev) => (prev.length >= MAX_SOURCES ? prev : [...prev, { ...source, key: makeKey(), status: 'waiting' }]));
  }

  function roomLeft(): number {
    return MAX_SOURCES - sourcesRef.current.length;
  }

  function addUrl(url: string) {
    setPickerNotice(null);
    if (roomLeft() <= 0) {
      setPickerNotice(`You can add up to ${MAX_SOURCES} things at a time. Read these first, then add more.`);
      return;
    }
    addSource({ kind: 'url', label: hostLabel(url), url });
  }

  function addText(text: string) {
    setPickerNotice(null);
    if (roomLeft() <= 0) {
      setPickerNotice(`You can add up to ${MAX_SOURCES} things at a time. Read these first, then add more.`);
      return;
    }
    const n = sourcesRef.current.filter((s) => s.kind === 'text').length;
    addSource({ kind: 'text', label: n === 0 ? 'Your typed list' : `Your typed list ${n + 1}`, text });
  }

  /** Photos, screenshots and documents in; sources out, with the web's notes about what did not fit. */
  async function addPrepared(items: ({ image: PickedImage } | { document: SetupFilePart })[]) {
    setPickerNotice(null);
    const tooBig: string[] = [];
    const cutShort: string[] = [];
    const accepted: (PreparedImage & { isImage: boolean })[] = [];
    setPreparing(true);
    try {
      for (const item of items) {
        if ('image' in item) {
          const prepared = await prepareImageForUpload(item.image, painterRef.current);
          if (prepared.truncated) cutShort.push(item.image.name || 'A photo');
          for (const part of prepared.parts) {
            const size = part.files.reduce((n, x) => n + x.size, 0);
            if (size > MAX_UPLOAD_BYTES) tooBig.push(part.label);
            else accepted.push({ ...part, isImage: true });
          }
        } else if (item.document.size > MAX_UPLOAD_BYTES) {
          tooBig.push(item.document.name);
        } else {
          const uri = await stageDocument(item.document.uri, item.document.name);
          accepted.push({ label: item.document.name, files: [{ ...item.document, uri }], isImage: false });
        }
      }
    } finally {
      setPreparing(false);
    }
    const room = Math.max(0, roomLeft());
    const dropped = Math.max(0, accepted.length - room);
    setSources((prev) => [
      ...prev,
      ...accepted.slice(0, room).map((a) => ({
        kind: 'file' as const,
        label: a.label,
        files: a.files,
        isImage: a.isImage,
        key: makeKey(),
        status: 'waiting' as const,
      })),
    ]);
    const messages: string[] = [];
    if (tooBig.length > 0) {
      messages.push(
        `${tooBig.join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 4 MB, so we cannot read ${tooBig.length === 1 ? 'it' : 'them'}. Try a photo or screenshot instead.`,
      );
    }
    if (cutShort.length > 0) {
      messages.push(
        `${cutShort.join(', ')} ${cutShort.length === 1 ? 'is' : 'are'} very long, so we read the top part. Add a second screenshot of the rest.`,
      );
    }
    if (dropped > 0) messages.push(`You can add up to ${MAX_SOURCES} things at a time. Read these first, then add the rest.`);
    setPickerNotice(messages.length > 0 ? messages.join(' ') : null);
  }

  /** The highest "Photo N" among the sources and the drafts' sources, so a new one never repeats a name. */
  function highestPhotoNumber(): number {
    let max = 0;
    const labels = [...sourcesRef.current.map((s) => s.label), ...draftsRef.current.flatMap((d) => d.sources)];
    for (const label of labels) {
      const m = /^Photo (\d+)/.exec(label);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  }

  async function pickPhotos() {
    if (roomLeft() <= 0) {
      setPickerNotice(`You can add up to ${MAX_SOURCES} things at a time. Read these first, then add more.`);
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: roomLeft(),
        // The picture as it is: resizing is done here, and only when it has to be.
        quality: 1,
        // An iPhone's HEIC photos arrive as JPEG, which the reader and the canvas both take.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
    } catch {
      setPickerNotice('Your photos could not be opened. Please try again.');
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    // Android's photo picker hands out media numbers ("1000039265.png"), not the photo's name, so
    // those become "Photo 1", "Photo 2", numbered on from any photo already in this setup.
    let photoNumber = highestPhotoNumber();
    await addPrepared(
      result.assets.map((a) => {
        const picked = a.fileName?.trim() ?? '';
        // The reader knows a picture by its bytes, so the label needs no extension.
        const name = picked && !/^\d+\.[a-z0-9]+$/i.test(picked) ? picked : `Photo ${(photoNumber += 1)}`;
        return {
          image: {
            uri: a.uri,
            name,
            mimeType: a.mimeType ?? mimeFromName(name),
            width: a.width,
            height: a.height,
            size: typeof a.fileSize === 'number' ? a.fileSize : null,
          },
        };
      }),
    );
  }

  async function pastePhoto() {
    let img: Clipboard.ClipboardImage | null = null;
    try {
      img = await Clipboard.getImageAsync({ format: 'png' });
    } catch {
      img = null;
    }
    if (!img?.data) {
      setCanPaste(false);
      setPickerNotice('There is no picture to paste. Copy a screenshot first, then try again.');
      return;
    }
    const base64 = img.data.slice(img.data.indexOf(',') + 1);
    await addPrepared([
      {
        image: {
          uri: null,
          base64,
          name: 'Pasted screenshot',
          mimeType: 'image/png',
          width: img.size?.width ?? 0,
          height: img.size?.height ?? 0,
          size: Math.floor((base64.length * 3) / 4),
        },
      },
    ]);
  }

  async function checkClipboard() {
    try {
      setCanPaste(await Clipboard.hasImageAsync());
    } catch {
      setCanPaste(false);
    }
  }

  async function pickFiles() {
    if (roomLeft() <= 0) {
      setPickerNotice(`You can add up to ${MAX_SOURCES} things at a time. Read these first, then add more.`);
      return;
    }
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_TYPES,
        multiple: true,
        // Android: the picker's own link (content://), which carries a read grant, rather than its
        // cache copy, which Expo Go's file access refuses; `stageDocument` copies it for the upload.
        copyToCacheDirectory: Platform.OS !== 'android',
      });
    } catch {
      setPickerNotice('That file could not be opened. Please try again.');
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    await addPrepared(
      result.assets.map((a) => ({
        document: { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 },
      })),
    );
  }

  function removeSource(key: string) {
    setSources((prev) => prev.filter((s) => s.key !== key));
  }

  function patchSource(key: string, patch: Partial<SetupSource>) {
    setSources((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function readSource(source: SetupSource): Promise<boolean> {
    patchSource(source.key, { status: 'reading', error: undefined, warnings: undefined, startedAt: Date.now() });
    const result = await readSetupSource(
      { kind: source.kind, label: source.label, url: source.url, text: source.text, files: source.files },
      instructionsRef.current,
      tokenRef.current,
    );
    if (!result.ok) {
      patchSource(source.key, { status: 'failed', error: result.error });
      return false;
    }
    const data = result.data;
    const label = source.kind === 'url' ? data.source.label : source.label;
    const merged = mergeIntoDrafts(draftsRef.current, data.services, label, makeKey);
    commitDrafts(merged.drafts);
    if (data.currency) {
      const code = data.currency;
      setSourceCurrencies((prev) => (prev.includes(code) ? prev : [...prev, code]));
    }
    if (data.warnings.length > 0) {
      setNotices((prev) => [
        ...prev,
        ...data.warnings.filter((w) => !prev.some((n) => n.source === label && n.text === w)).map((text) => ({ source: label, text })),
      ]);
    }
    patchSource(source.key, {
      status: 'done',
      label,
      found: merged.added,
      alreadyListed: merged.alreadyListed,
      warnings: data.warnings,
      followed: data.source.followed ?? [],
    });
    return true;
  }

  /** 'unread' is everything not read yet, including a source that failed and was not removed. */
  async function readAll(which: 'unread' | 'failed' | 'one', onlyKey?: string) {
    const queue = sourcesRef.current.filter((s) =>
      which === 'one'
        ? s.key === onlyKey
        : which === 'failed'
          ? s.status === 'failed'
          : s.status === 'waiting' || s.status === 'failed',
    );
    if (queue.length === 0) return;
    goTo('reading');
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
      hapticSuccess();
      setFilter('all');
      goTo('review');
    } else if (failures > 0) {
      hapticWarning();
    }
  }

  function startAgain() {
    const pending = draftsRef.current.filter((d) => d.status === 'pending').length;
    setConfirm({
      title: 'Start again?',
      message: `This clears the ${pending} service${pending === 1 ? '' : 's'} still waiting to be checked. Services you already added stay on your list.`,
      confirmLabel: 'Clear and start again',
      destructive: true,
      onConfirm: () => {
        setConfirm(null);
        void clearServicesSetup(venueId);
        setStored(false);
        commitDrafts([]);
        commitAddonGroups([]);
        setSources(() => []);
        setNotices([]);
        setHeadingCalendars({});
        setSourceCurrencies([]);
        setFilter('all');
        setSearch('');
        goTo('sources');
      },
    });
  }

  // ---------- Adding ----------

  async function ensureCategoryId(name: string): Promise<string | null> {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!clean) return null;
    const lower = headingKey(clean);
    const known = categoryIds().get(lower);
    if (known) return known;
    try {
      const data = await createServiceCategory(clean, tokenRef.current);
      if (data.category?.id) {
        categoryIds().set(lower, data.category.id);
        return data.category.id;
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const list = await listServiceCategories(tokenRef.current).catch(() => null);
        for (const c of list?.categories ?? []) categoryIds().set(headingKey(c.name), c.id);
        const found = categoryIds().get(lower);
        if (found) return found;
      } else if (e instanceof ApiError && (e.status === 0 || e.status === 408)) {
        throw new Error(COULD_NOT_REACH);
      }
    }
    throw new Error(`We could not create the heading "${clean}". Clear the heading and try again, or add it on the Categories tab.`);
  }

  /** Never throws: the service exists by now, so nothing here may leave the card looking unadded. */
  async function afterCreated(key: string, serviceId: string) {
    changedRef.current = true;
    // Recorded first: if anything below fails, adding it again would make a second copy.
    updateDraft(key, { status: 'added', createdServiceId: serviceId, error: null, outcome: { kind: 'service' } });
    if (collectiveHost && addToCollective) {
      const name = draftsRef.current.find((d) => d.key === key)?.name ?? 'A service';
      try {
        await offerOnCollectivePage(collectiveHost.id, serviceId, tokenRef.current);
      } catch (e) {
        setNotice(
          `"${name}" was added, but it could not be put on the ${collectiveHost.name} page: ${describeError(e, 'That did not go through. Please try again.')}`,
        );
      }
    }
  }

  function formFor(d: ServiceDraft, categoryId: string | null): SetupServiceForm {
    return draftToForm(d, { categoryId, calendarIds: calendarsFor(d), colour: colourForHeading(d.category), defaults });
  }

  async function addDraft(key: string): Promise<boolean> {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d || d.status !== 'pending') return false;
    if (!draftCanBeAdded(draftIssues(d, issueContext))) return false;
    setBusy(key, true);
    updateDraft(key, { error: null });
    try {
      const categoryId = await ensureCategoryId(d.category);
      const built = formToCreateBody(formFor(d, categoryId));
      if (!built.ok) throw new Error(built.error);
      const data = await createAppointmentService(built.body, tokenRef.current);
      const id = data?.id ?? data?.service?.id;
      if (!id) throw new Error('The service may have been added. Close this and check your list before trying again.');
      await afterCreated(key, id);
      return true;
    } catch (e) {
      updateDraft(key, { error: describeError(e, 'This service could not be added.') });
      return false;
    } finally {
      setBusy(key, false);
    }
  }

  /** A duplicate whose length or price changed: update the venue's own service instead of adding a second. */
  async function updateExisting(key: string) {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d || d.status !== 'pending') return;
    const match = updatableDuplicate(d, existingServices);
    if (!match) return;
    const minutes = parseMinutesInput(d.duration);
    const price = cleanPriceInput(d.price);
    const body: Record<string, unknown> = { id: match.id };
    if (minutes !== null && minutes !== match.durationMinutes) body.duration_minutes = minutes;
    if (price) body.price_pence = Math.round(Number(price) * 100);
    setBusy(key, true);
    updateDraft(key, { error: null });
    try {
      await patchAppointmentService(body, tokenRef.current);
      changedRef.current = true;
      updateDraft(key, {
        status: 'added',
        outcome: { kind: 'updated', serviceId: match.id, before: { durationMinutes: match.durationMinutes, pricePence: match.pricePence } },
      });
    } catch (e) {
      updateDraft(key, { error: `Your existing service could not be updated. ${describeError(e, 'Please try again.')}` });
    } finally {
      setBusy(key, false);
    }
  }

  function addonGroupBody(name: string, addons: SetupAddonGroup['addons'], serviceIds: string[]): SetupAddonGroupBody {
    return {
      group: {
        name,
        prompt_to_client: ADDON_PROMPT,
        selection_type: 'multi',
        min_select: 0,
        max_select: null,
        addons: addons.map((a, i) => ({
          name: a.name,
          additional_price_pence: a.pricePence,
          additional_duration_minutes: a.minutes,
          sort_order: i,
          is_active: true,
        })),
      },
      service_links: { service_item_ids: serviceIds },
    };
  }

  async function deleteAddedService(serviceId: string): Promise<string | null> {
    // At a host, a service the setup put on the combined page comes off it first, reading the page
    // item from a fresh list because the one on screen may not have the new service yet.
    if (collectiveHost) {
      const data = await fetchAppointmentServices(tokenRef.current).catch(() => null);
      const svc = data?.services?.find((s) => s.id === serviceId) ?? null;
      if (svc?.collective?.role === 'master' && svc.collective.item_id) {
        try {
          await takeOffCollectivePage(collectiveHost.id, svc.collective.item_id, tokenRef.current);
        } catch (e) {
          return describeError(e, 'That did not go through. Please try again.');
        }
      }
    }
    try {
      await deleteAppointmentService(serviceId, tokenRef.current);
      return null;
    } catch (e) {
      return describeError(e, 'Please try again.');
    }
  }

  async function undoDraft(key: string) {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d || d.status !== 'added') return;
    const outcome = d.outcome ?? { kind: 'service' as const };
    setBusy(key, true);
    setNotice(null);
    try {
      if (outcome.kind === 'service') {
        if (!d.createdServiceId) return;
        const failed = await deleteAddedService(d.createdServiceId);
        if (failed) {
          setNotice(`"${d.name}" could not be removed. ${failed}`);
          return;
        }
      } else if (outcome.kind === 'updated') {
        try {
          await patchAppointmentService(
            {
              id: outcome.serviceId,
              duration_minutes: outcome.before.durationMinutes,
              ...(outcome.before.pricePence !== null ? { price_pence: outcome.before.pricePence } : {}),
            },
            tokenRef.current,
          );
        } catch (e) {
          setNotice(`"${d.name}" could not be put back. ${describeError(e, 'Please try again.')}`);
          return;
        }
        if (outcome.before.pricePence === null && cleanPriceInput(d.price)) {
          setNotice(
            `"${d.name}" is back to its old length. It had no price before, so it keeps the new one; change it on your services list if you need to.`,
          );
        }
      } else {
        const group = addonGroupsRef.current.find((g) => g.id === outcome.groupId);
        const remaining = group?.addons.filter((a) => a.draftKey !== d.key) ?? [];
        try {
          if (!group || remaining.length === 0) await deleteAddonGroup(outcome.groupId, tokenRef.current);
          else await updateAddonGroup(outcome.groupId, addonGroupBody(group.name, remaining, group.serviceIds), tokenRef.current);
        } catch (e) {
          setNotice(`"${d.name}" could not be removed. ${describeError(e, 'Please try again.')}`);
          return;
        }
        commitAddonGroups(
          remaining.length === 0 || !group
            ? addonGroupsRef.current.filter((g) => g.id !== outcome.groupId)
            : addonGroupsRef.current.map((g) => (g.id === outcome.groupId ? { ...g, addons: remaining } : g)),
        );
      }
      changedRef.current = true;
      updateDraft(key, { status: 'pending', createdServiceId: null, outcome: null });
    } finally {
      setBusy(key, false);
    }
  }

  async function runBulk(list: ServiceDraft[]) {
    setNotice(null);
    setBulk({ done: 0, total: list.length });
    let failedInARow = 0;
    let stopped = false;
    for (let i = 0; i < list.length; i++) {
      const success = await addDraft(list[i]!.key);
      setBulk({ done: i + 1, total: list.length });
      failedInARow = success ? 0 : failedInARow + 1;
      if (failedInARow >= 3) {
        stopped = true;
        setNotice('Several services in a row could not be added, so we stopped. Check the messages on them, then try again.');
        break;
      }
    }
    setBulk(null);
    if (stopped) hapticWarning();
    else hapticSuccess();
  }

  // ---------- Review list ----------

  const orderedDrafts = useMemo(() => {
    const rank = new Map(headingOrder.map((h, i) => [headingKey(h), i]));
    return drafts
      .map((d, i) => ({ d, i }))
      .sort((a, b) => (rank.get(headingKey(a.d.category)) ?? 0) - (rank.get(headingKey(b.d.category)) ?? 0) || a.i - b.i)
      .map((x) => x.d);
  }, [drafts, headingOrder]);

  function addAllReady() {
    const ready = orderedDrafts.filter((d) => readyKeys.has(d.key));
    if (ready.length === 0) return;
    const estimated = ready.filter((d) => d.durationEstimated).length;
    const noPrice = ready.filter((d) => d.options.length === 0 && cleanPriceInput(d.price) === '').length;
    const details: string[] = [];
    if (estimated > 0) details.push(`${estimated} ${estimated === 1 ? 'has a length we suggested' : 'have lengths we suggested'}.`);
    if (noPrice > 0) details.push(`${noPrice} ${noPrice === 1 ? 'has' : 'have'} no price, so clients will not see one.`);
    const label = `Add ${ready.length} service${ready.length === 1 ? '' : 's'}`;
    setConfirm({
      title: `${label}?`,
      message: [
        'This adds every service that is ready.',
        ...details,
        'You can change any service afterwards, and anything that needs a decision stays here for you.',
      ].join(' '),
      confirmLabel: label,
      destructive: false,
      onConfirm: () => {
        setConfirm(null);
        void runBulk(ready);
      },
    });
  }

  async function openMoreSettings(key: string) {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d) return;
    setBusy(key, true);
    try {
      const categoryId = await ensureCategoryId(d.category);
      onMoreSettings(key, formFor(d, categoryId));
    } catch (e) {
      updateDraft(key, { error: e instanceof Error ? e.message : 'Could not open the full form.' });
    } finally {
      setBusy(key, false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      moreSettingsDone(draftKey: string, serviceId: string | null) {
        if (!serviceId) return;
        setBusy(draftKey, true);
        void afterCreated(draftKey, serviceId).finally(() => setBusy(draftKey, false));
      },
    }),
    // afterCreated reads refs and the current props; a fresh handle each render keeps them current.
  );

  // ---------- Headings ----------

  function renameHeading(from: string, to: string) {
    const key = headingKey(from);
    // Added services already have their heading; the rename moves the ones still to decide.
    commitDrafts(draftsRef.current.map((d) => (headingKey(d.category) === key && d.status !== 'added' ? { ...d, category: to } : d)));
    setHeadingCalendars((prev) => {
      if (!prev[key] || prev[headingKey(to)]) return prev;
      const next = { ...prev, [headingKey(to)]: prev[key]! };
      delete next[key];
      return next;
    });
  }

  function setStatusInHeading(heading: string, from: ServiceDraft['status'], to: ServiceDraft['status']) {
    const key = headingKey(heading);
    commitDrafts(draftsRef.current.map((d) => (headingKey(d.category) === key && d.status === from ? { ...d, status: to, error: null } : d)));
  }

  function setCalendarsForHeading(heading: string, ids: string[] | null) {
    const key = headingKey(heading);
    setHeadingCalendars((prev) => {
      const next = { ...prev };
      if (ids === null) delete next[key];
      else next[key] = ids;
      return next;
    });
  }

  // ---------- Add-ons ----------

  function openAddon(key: string) {
    listScrollY.current = scrollY.current;
    setAddonError(null);
    setAddonOpenSeq((n) => n + 1);
    setAddonFor(key);
    scrollToTop();
  }

  function closeAddon() {
    setAddonFor(null);
    const y = listScrollY.current;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  }

  // The card actions go through a ref so every card gets the same object and stays memoised.
  const handlers = useRef({
    change: (_key: string, _patch: Partial<ServiceDraft>) => {},
    add: (_key: string) => {},
    skip: (_key: string) => {},
    restore: (_key: string) => {},
    undo: (_key: string) => {},
    moreSettings: (_key: string) => {},
    updateExisting: (_key: string) => {},
    makeAddon: (_key: string) => {},
    renameHeading: (_from: string, _to: string) => {},
    addReadyInHeading: (_heading: string) => {},
    setStatusInHeading: (_heading: string, _from: ServiceDraft['status'], _to: ServiceDraft['status']) => {},
    setCalendarsForHeading: (_heading: string, _ids: string[] | null) => {},
  });
  // Refreshed after every render, before anyone can tap: the actions always see the current state.
  useLayoutEffect(() => {
    handlers.current = {
      change: updateDraft,
      add: (key) => void addDraft(key),
      skip: (key) => updateDraft(key, { status: 'skipped', error: null }),
      restore: (key) => updateDraft(key, { status: 'pending' }),
      undo: (key) => void undoDraft(key),
      moreSettings: (key) => void openMoreSettings(key),
      updateExisting: (key) => void updateExisting(key),
      makeAddon: openAddon,
      renameHeading,
      addReadyInHeading: (heading) =>
        void runBulk(
          orderedDrafts.filter((d) => headingKey(d.category) === headingKey(heading) && readyKeys.has(d.key)),
        ),
      setStatusInHeading,
      setCalendarsForHeading,
    };
  });
  const cardActions = useMemo<DraftCardActions>(
    () => ({
      change: (k, p) => handlers.current.change(k, p),
      add: (k) => handlers.current.add(k),
      skip: (k) => handlers.current.skip(k),
      restore: (k) => handlers.current.restore(k),
      undo: (k) => handlers.current.undo(k),
      moreSettings: (k) => handlers.current.moreSettings(k),
      updateExisting: (k) => handlers.current.updateExisting(k),
      makeAddon: (k) => handlers.current.makeAddon(k),
    }),
    [],
  );
  const headingActions = useMemo<HeadingActions>(
    () => ({
      rename: (from, to) => handlers.current.renameHeading(from, to),
      addReady: (heading) => handlers.current.addReadyInHeading(heading),
      skipAll: (heading) => handlers.current.setStatusInHeading(heading, 'pending', 'skipped'),
      restoreAll: (heading) => handlers.current.setStatusInHeading(heading, 'skipped', 'pending'),
      setCalendars: (heading, ids) => handlers.current.setCalendarsForHeading(heading, ids),
    }),
    [],
  );

  const searchText = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    const groups: { heading: string; drafts: ServiceDraft[]; all: ServiceDraft[] }[] = [];
    for (const d of orderedDrafts) {
      const h = d.category.trim();
      let g = groups.find((x) => headingKey(x.heading) === headingKey(h));
      if (!g) {
        g = { heading: h, drafts: [], all: [] };
        groups.push(g);
      }
      g.all.push(d);
      if (filter !== 'all' && d.status !== filter) continue;
      if (searchText && !d.name.toLowerCase().includes(searchText) && !h.toLowerCase().includes(searchText)) continue;
      g.drafts.push(d);
    }
    return groups.filter((g) => g.drafts.length > 0);
  }, [orderedDrafts, filter, searchText]);

  const currencyMismatch = sourceCurrencies.find((c) => c !== currencyCode.toUpperCase()) ?? null;
  const locked = bulk !== null;
  const addonDraft = addonFor ? (drafts.find((d) => d.key === addonFor) ?? null) : null;
  const existingAddonGroup = addonDraft ? (addonGroups.find((g) => g.headingKey === headingKey(addonDraft.category)) ?? null) : null;

  async function saveAddon() {
    const d = draftsRef.current.find((x) => x.key === addonFor);
    const values = addonForm.values();
    if (!d || !values) return;
    setAddonBusy(true);
    setAddonError(null);
    try {
      const existing = values.joinGroupId ? (addonGroupsRef.current.find((g) => g.id === values.joinGroupId) ?? null) : null;
      const addons = [
        ...(existing?.addons.filter((a) => a.draftKey !== d.key) ?? []),
        { draftKey: d.key, name: values.name, pricePence: values.pricePence, minutes: values.minutes },
      ];
      const body = addonGroupBody(values.groupName, addons, values.serviceIds);
      const data = existing
        ? await updateAddonGroup(existing.id, body, tokenRef.current)
        : await createAddonGroup(body, tokenRef.current);
      const groupId = existing?.id ?? data?.group?.id;
      if (!groupId) throw new Error('The add-on may have been saved. Check the Add-ons tab before trying again.');
      const group: SetupAddonGroup = {
        id: groupId,
        name: values.groupName,
        headingKey: headingKey(d.category),
        addons,
        serviceIds: values.serviceIds,
      };
      commitAddonGroups([...addonGroupsRef.current.filter((g) => g.id !== groupId), group]);
      changedRef.current = true;
      updateDraft(d.key, { status: 'added', outcome: { kind: 'addon', groupId }, error: null });
      hapticSuccess();
      closeAddon();
    } catch (e) {
      setAddonError(describeError(e, 'The add-on could not be saved. Please try again.'));
    } finally {
      setAddonBusy(false);
    }
  }

  // ---------- Closing ----------

  function closeNow() {
    setConfirm(null);
    if (changedRef.current) {
      changedRef.current = false;
      onServicesChanged();
    }
    onClose();
  }

  function requestClose() {
    if (reading || bulk || busyKeys.size > 0 || addonBusy || preparing) return;
    // On a phone a swipe or Back closes easily; what was added but not read yet is not kept.
    const unread = sourcesRef.current.filter((s) => s.status === 'waiting' || s.status === 'failed').length;
    if (step === 'sources' && unread > 0) {
      setConfirm({
        title: 'Close without reading?',
        message: `${unread === 1 ? 'The thing you added has' : `The ${unread} things you added have`} not been read yet, and will not be kept.`,
        confirmLabel: 'Close',
        destructive: true,
        onConfirm: closeNow,
      });
      return;
    }
    if (changedRef.current) {
      changedRef.current = false;
      onServicesChanged();
    }
    onClose();
  }

  function finish() {
    if (changedRef.current) {
      changedRef.current = false;
      onServicesChanged();
    }
    setConfirm(null);
    goTo('done');
  }

  function doneAndClose() {
    if (!draftsRef.current.some((d) => d.status === 'pending')) {
      void clearServicesSetup(venueId);
      commitDrafts([]);
      commitAddonGroups([]);
      setSources(() => []);
      setNotices([]);
      setSourceCurrencies([]);
      setFilter('all');
    }
    onClose();
  }

  function addMore() {
    setSources((prev) => prev.filter((s) => s.status !== 'done'));
    setConfirm(null);
    goTo('sources');
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }

  // ---------- Render ----------

  const waitingCount = sources.filter((s) => s.status === 'waiting' || s.status === 'failed').length;
  const failedSources = sources.filter((s) => s.status === 'failed');
  const addedServices = drafts.filter((d) => d.status === 'added' && d.outcome?.kind === 'service').length;
  const addedAddons = drafts.filter((d) => d.status === 'added' && d.outcome?.kind === 'addon').length;
  const updatedServices = drafts.filter((d) => d.status === 'added' && d.outcome?.kind === 'updated').length;

  const addonForm = useAddonForm(
    addonDraft ? `${addonDraft.key}#${addonOpenSeq}` : 'closed',
    addonDraft ?? PLACEHOLDER_DRAFT,
    addonTargets,
    existingAddonGroup,
  );

  const description =
    step === 'sources' || step === 'loading'
      ? 'Bring your services over from your old system.'
      : step === 'reading'
        ? 'Reading what you gave us. This usually takes under a minute.'
        : step === 'review'
          ? 'Check each service, then add it. Nothing is added until you say so.'
          : 'All done.';

  let footer: React.ReactNode = null;
  if (confirm) {
    footer = (
      <View style={styles.fullWidth}>
        <ConfirmPanel
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      </View>
    );
  } else if (addonDraft) {
    footer = (
      <>
        <Button label="Cancel" variant="ghost" onPress={closeAddon} disabled={addonBusy} />
        <Button
          label="Add as an add-on"
          onPress={() => void saveAddon()}
          loading={addonBusy}
          disabled={addonBusy || addonForm.problems.length > 0}
        />
      </>
    );
  } else if (step === 'sources' || step === 'loading') {
    footer = (
      <>
        <Button label="Cancel" variant="ghost" onPress={requestClose} />
        {drafts.some((d) => d.status === 'pending') ? (
          <Button label="Back to your services" variant="secondary" onPress={() => goTo('review')} />
        ) : null}
        <Button
          label={waitingCount > 1 ? `Find my services in these ${waitingCount}` : 'Find my services'}
          onPress={() => void readAll('unread')}
          disabled={waitingCount === 0 || preparing || step === 'loading'}
        />
      </>
    );
  } else if (step === 'reading') {
    footer = (
      <>
        <Button label="Back" variant="ghost" onPress={() => goTo('sources')} disabled={reading} />
        {!reading && failedSources.length > 0 ? (
          <Button label="Try again" variant="secondary" onPress={() => void readAll('failed')} />
        ) : null}
        <Button
          label={counts.pending > 0 ? `Check ${counts.pending} service${counts.pending === 1 ? '' : 's'}` : 'Check your services'}
          onPress={() => goTo('review')}
          disabled={reading || counts.pending === 0}
        />
      </>
    );
  } else if (step === 'review') {
    // Two buttons only, side by side, so the list keeps the screen.
    footer = (
      <View style={styles.footerPair}>
        {counts.ready > 0 || bulk ? (
          <Button
            label={bulk ? `Adding ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}…` : `Add all ready (${counts.ready})`}
            variant="secondary"
            style={styles.flex}
            onPress={addAllReady}
            loading={locked}
            disabled={locked || busyKeys.size > 0}
          />
        ) : null}
        <Button
          label={counts.pending === 0 ? 'Finish' : 'Finish for now'}
          style={styles.flex}
          onPress={finish}
          disabled={locked || busyKeys.size > 0}
        />
      </View>
    );
  } else {
    footer = (
      <>
        <Button label="Add more services" variant="secondary" onPress={addMore} />
        <Button label="Done" onPress={doneAndClose} />
      </>
    );
  }

  const doneParts: string[] = [];
  if (addedServices > 0) doneParts.push(`${addedServices} service${addedServices === 1 ? '' : 's'} added`);
  if (addedAddons > 0) doneParts.push(`${addedAddons} add-on${addedAddons === 1 ? '' : 's'}`);
  if (updatedServices > 0) doneParts.push(`${updatedServices} existing service${updatedServices === 1 ? '' : 's'} updated`);

  const stepIndex = step === 'sources' || step === 'loading' ? 0 : step === 'reading' ? 1 : step === 'review' ? 2 : null;

  return (
    <SetupShell
      ref={scrollRef}
      visible={visible}
      onClose={() => {
        if (addonDraft && !addonBusy) closeAddon();
        else if (confirm) setConfirm(null);
        else requestClose();
      }}
      description={description}
      stepIndex={addonDraft ? null : stepIndex}
      footer={footer}
      onScroll={onScroll}>
      {step === 'sources' || step === 'loading' ? <ImagePainterHost ref={painterRef} /> : null}

      {addonDraft ? (
        <AddonPanel
          form={addonForm}
          currencySymbol={currencySymbol}
          services={addonTargets}
          existingGroup={existingAddonGroup}
          waitingInHeading={
            addonDraft.category.trim()
              ? drafts
                  .filter(
                    (d) =>
                      d.key !== addonDraft.key &&
                      d.status === 'pending' &&
                      !d.looksLikeAddon &&
                      headingKey(d.category) === headingKey(addonDraft.category),
                  )
                  .map((d) => d.name)
              : []
          }
          error={addonError}
        />
      ) : null}

      {!addonDraft && step === 'loading' ? (
        <Text variant="bodySmall" tone="muted">
          Getting ready…
        </Text>
      ) : null}

      {!addonDraft && step === 'sources' ? (
        <SourcePicker
          sources={sources.filter((s) => s.status !== 'done')}
          websiteUrl={websiteUrl}
          preparing={preparing}
          notice={pickerNotice}
          instructions={instructions}
          canPaste={canPaste}
          onInstructionsChange={setInstructions}
          onAddUrl={addUrl}
          onAddText={addText}
          onPickPhotos={() => void pickPhotos()}
          onPastePhoto={() => void pastePhoto()}
          onPickFiles={() => void pickFiles()}
          onRemove={removeSource}
          onPhotoPanel={() => void checkClipboard()}
        />
      ) : null}

      {!addonDraft && step === 'reading' ? (
        <View style={styles.stack} accessibilityLiveRegion="polite">
          <View style={[styles.list, { borderColor: colors.border }]}>
            {sources.map((s, i) => {
              const seconds = s.status === 'reading' && s.startedAt ? Math.max(0, Math.round((now - s.startedAt) / 1000)) : 0;
              return (
                <View
                  key={s.key}
                  style={[styles.sourceRow, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                  <SourceStatusIcon status={s.status} />
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {s.label}
                    </Text>
                    <Text variant="bodySmall" color={s.status === 'failed' ? colors.danger : colors.textSecondary}>
                      {s.status === 'waiting'
                        ? 'Waiting'
                        : s.status === 'reading'
                          ? seconds >= 3
                            ? `Reading… ${seconds}s`
                            : 'Reading…'
                          : s.status === 'failed'
                            ? s.error
                            : s.found === 0 && (s.alreadyListed ?? 0) > 0
                              ? `Found ${s.alreadyListed} service${s.alreadyListed === 1 ? '' : 's'} you had already added from somewhere else`
                              : `Found ${s.found} service${s.found === 1 ? '' : 's'}${
                                  s.alreadyListed ? `, plus ${s.alreadyListed} already on your list` : ''
                                }`}
                    </Text>
                    {s.followed && s.followed.length > 0 ? (
                      <Text variant="caption" tone="muted">
                        {`Also read the ${s.followed.length === 1 ? 'page' : 'pages'} it links to: ${s.followed.map(hostLabel).join(', ')}`}
                      </Text>
                    ) : null}
                    {s.warnings && s.warnings.length > 0
                      ? s.warnings.map((w) => (
                          <Text key={w} variant="bodySmall" color={colors.warning}>
                            {w}
                          </Text>
                        ))
                      : null}
                    {s.status === 'failed' && !reading ? (
                      <View style={styles.inlineLinks}>
                        <TextLink label="Retry" accessibilityLabel={`Retry ${s.label}`} onPress={() => void readAll('one', s.key)} />
                        <TextLink label="Remove" accessibilityLabel={`Remove ${s.label}`} onPress={() => removeSource(s.key)} />
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {!reading && counts.pending === 0 && failedSources.length > 0 ? (
            <Panel tone="warning">
              <Text variant="bodySmall">
                We could not get any services from that. Go back and try a screenshot or photo of your price list, or type your
                services in.
              </Text>
            </Panel>
          ) : null}
          {reading ? (
            <Text variant="bodySmall" tone="muted">
              A long price list can take a minute or two. Please keep this open.
            </Text>
          ) : null}
        </View>
      ) : null}

      {!addonDraft && step === 'review' ? (
        <View style={styles.stack}>
          <Panel>
            <Text variant="bodySmall">
              <Text variant="bodySmall" style={styles.bold}>{`${counts.total} service${counts.total === 1 ? '' : 's'} found. `}</Text>
              {`${counts.added} added, ${counts.skipped} skipped, ${counts.pending} still to check.`}
            </Text>
            {stored ? (
              <Text variant="bodySmall" tone="secondary">
                Carrying on from where you left off.
              </Text>
            ) : null}
            <View style={styles.inlineLinks}>
              <TextLink label="Add more from another source" onPress={addMore} disabled={locked} />
              {counts.pending > 0 ? <TextLink label="Start again" onPress={startAgain} disabled={locked} /> : null}
            </View>
            <View
              style={[styles.progress, { backgroundColor: colors.border }]}
              accessibilityRole="progressbar"
              accessibilityLabel="Services checked"
              accessibilityValue={{ min: 0, max: counts.total, now: counts.added + counts.skipped }}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.success,
                    width: `${counts.total === 0 ? 0 : Math.round(((counts.added + counts.skipped) / counts.total) * 100)}%`,
                  },
                ]}
              />
            </View>
            <ReviewSettings
              calendars={calendars}
              calendarIds={effectiveCalendarIds}
              onCalendarIds={setCalendarIds}
              defaults={defaults}
              onDefaults={setDefaults}
              stripeConnected={stripeConnected}
              currencySymbol={currencySymbol}
              collectiveHost={collectiveHost}
              addToCollective={addToCollective}
              onAddToCollective={setAddToCollective}
              locked={locked}
            />
          </Panel>

          {notices.length > 0 ? (
            <Panel tone="warning">
              <View style={styles.rowBetween}>
                <Text variant="label" style={styles.flex}>
                  Things we noticed while reading
                </Text>
                <TextLink label="Hide" small onPress={() => setNotices([])} />
              </View>
              {notices.map((n) => (
                <Text key={`${n.source}|${n.text}`} variant="bodySmall">
                  <Text variant="bodySmall" style={styles.bold}>{`${n.source}: `}</Text>
                  {n.text}
                </Text>
              ))}
              <TextLink label="Add a screenshot or another source" small onPress={addMore} />
            </Panel>
          ) : null}
          {currencyMismatch ? (
            <Panel tone="warning">
              <Text variant="bodySmall">
                {`Your list showed prices in ${currencyMismatch}, but you charge in ${currencyCode.toUpperCase()}. We copied the numbers as they were, so check each price.`}
              </Text>
            </Panel>
          ) : null}
          {notice ? (
            <Panel tone="danger">
              <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
                {notice}
              </Text>
            </Panel>
          ) : null}

          <View style={styles.filters} accessibilityLabel="Show">
            {(
              [
                ['all', 'All', counts.total],
                ['pending', 'To check', counts.pending],
                ['added', 'Added', counts.added],
                ['skipped', 'Skipped', counts.skipped],
              ] as const
            ).map(([value, label, count]) => (
              <Chip key={value} label={label} count={count} selected={filter === value} onPress={() => setFilter(value)} />
            ))}
          </View>
          {counts.total >= SEARCH_FROM ? (
            <Input
              accessibilityLabel="Find a service"
              placeholder="Find a service"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
          ) : null}

          {visibleGroups.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Text variant="bodySmall" tone="muted" style={styles.center}>
                {searchText ? 'No services match that.' : filter === 'pending' ? 'Nothing left to check.' : 'Nothing here yet.'}
              </Text>
            </View>
          ) : (
            visibleGroups.map((group) => {
              const pendingHere = group.all.filter((d) => d.status === 'pending');
              const readyHere = pendingHere.filter((d) => readyKeys.has(d.key));
              const ownCalendars = headingCalendars[headingKey(group.heading)];
              return (
                <View key={group.heading || 'none'} style={styles.group} accessibilityLabel={group.heading || 'No heading'}>
                  <HeadingHeader
                    heading={group.heading}
                    colour={colourForHeading(group.heading)}
                    count={group.all.length}
                    pending={pendingHere.length}
                    skipped={group.all.filter((d) => d.status === 'skipped').length}
                    ready={readyHere.length}
                    otherHeadings={headingSuggestions.filter((h) => headingKey(h) !== headingKey(group.heading))}
                    calendars={calendars}
                    calendarIds={headingCalendarIds(group.heading)}
                    calendarsCustom={Boolean(ownCalendars)}
                    locked={locked}
                    actions={headingActions}
                  />
                  {group.drafts.map((d) => (
                    <DraftServiceCard
                      key={d.key}
                      draft={d}
                      issueContext={issueContext}
                      currencySymbol={currencySymbol}
                      headingSuggestions={headingSuggestions}
                      busy={busyKeys.has(d.key)}
                      locked={locked}
                      calendars={calendars}
                      inheritedCalendarIds={headingCalendarIds(d.category)}
                      updatable={d.status === 'pending' ? updatableDuplicate(d, existingServices) : null}
                      actions={cardActions}
                    />
                  ))}
                </View>
              );
            })
          )}
        </View>
      ) : null}

      {!addonDraft && step === 'done' ? (
        <View style={styles.done}>
          <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor={colors.success} size={48} />
          <Text variant="heading" style={styles.center}>
            {doneParts.length === 0 ? 'Nothing added this time' : `Done: ${doneParts.join(', ')}`}
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.center}>
            {counts.pending > 0
              ? `${counts.pending} ${counts.pending === 1 ? 'is' : 'are'} still waiting to be checked. Open Set up with AI again to finish ${counts.pending === 1 ? 'it' : 'them'}.`
              : doneParts.length === 0
                ? 'Open Set up with AI again whenever you are ready.'
                : 'You can change any of them on your services list, including deposits, processing time and which calendars offer them.'}
          </Text>
          {addedServices + updatedServices > 0 ? (
            <View style={styles.doneActions}>
              {onOpenBookingPage ? <Button label="See your booking page" variant="secondary" onPress={onOpenBookingPage} fullWidth /> : null}
              <Button label="Check your calendars' working hours" variant="secondary" onPress={onOpenCalendars} fullWidth />
            </View>
          ) : null}
        </View>
      ) : null}
    </SetupShell>
  );
});

/** `useAddonForm` must run on every render; with no add-on open it holds this and is never shown. */
const PLACEHOLDER_DRAFT: ServiceDraft = {
  key: '',
  status: 'pending',
  createdServiceId: null,
  name: '',
  category: '',
  description: '',
  duration: '',
  durationEstimated: false,
  price: '',
  priceKind: 'not_stated',
  options: [],
  notes: [],
  looksLikeAddon: false,
  sources: [],
  error: null,
  calendarIds: null,
  outcome: null,
};

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  fullWidth: {
    width: '100%',
  },
  footerPair: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
  },
  inlineLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
  },
  progress: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bold: {
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  center: {
    textAlign: 'center',
  },
  group: {
    gap: spacing.sm,
  },
  done: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  doneActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
