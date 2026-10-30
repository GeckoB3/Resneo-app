/**
 * The host's services across every venue: the app's version of the web grid
 * (`CollectiveServicesGrid.tsx`, 2026-09-17).
 *
 * A phone cannot show services down and venues across, so each service is a card with one line
 * per venue (how many of its calendars offer it, hidden, changes not saved). Tapping a card opens
 * the service at every venue, with a switch per calendar, and "Edit values" for a calendar's own
 * price and times on one that offers it (saved there and then). A tick there is saved from there:
 * the sheet's Save sends that service's calendar ticks and nothing else (2026-10-28). Its "Put on
 * the page" and "Take off the page" ask first (`svc.offer.*`, `svc.withdraw.*`), go straight away
 * and leave the sheet open on the calendar ticks (CQ-10.8). A page service switched off on the
 * Services screen says so on its card, with "Switch it on" right there (web 2026-10-28).
 *
 * "Select" turns the cards into a checklist for the bulk lane. With something picked the bar
 * offers "Choose calendars", a picker of every calendar at the venues picked that saves straight
 * away. "Put on the page" and "Take off the page" act only on the services ticked: a venue picked
 * on its own means that venue's calendars for the services on the page, and can never empty the
 * page (CQ-03). Page changes stage, so the ask can name each service and what happens to it.
 *
 * Every save says what did not go through as "{service} at {venue}: {reason}"; only a change that
 * can still go through is kept to send again (CQ-04). A calendar with upcoming bookings for the
 * service shows them and asks "Take it off and keep these bookings" or "Keep offering it", inside
 * the sheet that saved it. After any save, Undo puts it back for 60 seconds (CQ-11).
 *
 * `useServicesGrid` holds the state; the list renders inside the screen's scroll and the bar is
 * pinned under it by the screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AffectedBookingsStep } from '@/components/collective-area/AffectedBookingsStep';
import { SyncBadge } from '@/components/collective-area/AreaPieces';
import { BulkCalendarsSheet } from '@/components/collective-area/BulkCalendarsSheet';
import { CalendarValuesStep } from '@/components/services/collective/CalendarValuesStep';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy, formatVenueList, PREVIEW_REASON_WORDS } from '@/lib/collective-area/copy';
import {
  affectedRefusal,
  attentionLabel,
  bulkFailure,
  bulkOps,
  calendarWillOffer,
  CELL_LABEL,
  cellState,
  describeStaged,
  failedKeptLine,
  failureRows,
  gridCrossing,
  gridRows,
  gridVenueName,
  groupAffected,
  hiddenPillVenue,
  inverseOps,
  isAffectedRefusal,
  isHiddenAt,
  isOnPage,
  isSwitchedOff,
  keyOf,
  pageChangeable,
  pageStaged,
  selectionLabel,
  stagedCalendarOps,
  stagedCountFor,
  stageOps,
  toBulkOps,
  toggleCalendar,
  UNDO_WINDOW_MS,
  unsavedSummary,
  valueChips,
  valuesNotRestoredLine,
  venueWarnings,
  type AffectedRefusal,
  type AreaService,
  type BulkFailure,
  type BulkOp,
  type BulkOpResult,
  type CellState,
  type CollectiveCalendarGroup,
  type GridFilter,
  type PageOpKind,
  type PickerResult,
  type PreviewVenue,
  type StagedOp,
} from '@/lib/collective-area/model';
import { offerDoneSummary } from '@/lib/collective-area/offer-summary';
import { useCollectiveBulkPreview, useCollectiveBulkSave, useSwitchServiceOn } from '@/lib/queries/useCollectiveArea';
import { useOfferServiceOnPage, useTakeServiceOffPage } from '@/lib/queries/useServicesManage';
import {
  calendarValueDefaults,
  calendarValueFlags,
  calendarValuesTarget,
  type CalendarValuesTarget,
} from '@/lib/services/calendar-values';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const CELL_TONE: Record<CellState, BadgeTone> = { all: 'success', some: 'warning', none: 'neutral' };

/** What one save did: what went through, what did not (and why), and what waits on bookings. */
interface CommitOutcome {
  succeeded: StagedOp[];
  failed: BulkFailure[];
  affected: AffectedRefusal[];
  /** Calendars put back by an Undo whose own values could not be put back with them (CQ-11). */
  valuesNotRestored: BulkOp[];
}

interface CommitOptions {
  /** Removals the host has been shown the bookings for (CQ-04). */
  acknowledgeAffected?: boolean;
  /** Stage again what can still go through, so the bar's Save sends it again. The picker keeps its own. */
  restage?: boolean;
  /** Keep the failures already listed for other changes: a bookings follow-up adds to them. */
  merge?: boolean;
  /** Which save this belongs to (CQ-11): a bookings follow-up shares it, so one Undo puts back both. */
  session?: number;
  /** An Undo: what is staged is left alone, and nothing new is offered to undo. */
  undo?: boolean;
}

/** The bookings step: where it was asked from, and the removals waiting on the host's answer (CQ-04). */
export interface BookingsStep {
  where: 'sheet' | 'picker' | 'bar';
  refusals: AffectedRefusal[];
  /** Everything else in that save went through, which the step says first. */
  othersSaved: boolean;
  session?: number;
  /** The removals are part of an Undo: a guest booked inside the minute. */
  fromUndo?: boolean;
}

/** The last save, while it can still be undone (CQ-11): one save only, for 60 seconds. */
interface LastSave {
  inverse: BulkOp[];
  count: number;
  expiresAt: number;
  session: number;
}

/** What the last Undo did, said over the list. */
export interface UndoNote {
  tone: 'ok' | 'warn' | 'error';
  text: string;
  rows: string[];
}

/** A service sheet's page change (CQ-10.8): the ask before it, then what it did. */
interface PageAsk {
  serviceId: string;
  kind: PageOpKind;
}
interface PageNote {
  serviceId: string;
  tone: 'ok' | 'error';
  lines: string[];
}

export function useServicesGrid(input: {
  collectiveId: string;
  collectiveName: string;
  services: AreaService[];
  groups: CollectiveCalendarGroup[];
}) {
  const { collectiveId, collectiveName, services, groups } = input;
  const [filter, setFilter] = useState<GridFilter>('all');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<StagedOp[]>([]);
  const [failures, setFailures] = useState<BulkFailure[]>([]);
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<{ state: 'loading' | 'ready' | 'failed'; venues: PreviewVenue[] } | null>(
    null,
  );
  /** "Choose calendars" for the services and venues picked. */
  const [choosing, setChoosing] = useState(false);
  /** Opened from "What needs you": the venue it picked is let go again when it closes (CQ-10.7). */
  const [chooserFromFocus, setChooserFromFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  /** "Saved." for a few seconds after a save with nothing to undo, so a save is never silent. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** The last save, for 60 seconds (CQ-11). Its countdown ticks in the bar, not here. */
  const [lastSave, setLastSave] = useState<LastSave | null>(null);
  const sessionSeq = useRef(0);
  const [undoNote, setUndoNote] = useState<UndoNote | null>(null);
  /** Removals held back for upcoming bookings, waiting on the host (CQ-04). */
  const [bookingsStep, setBookingsStep] = useState<BookingsStep | null>(null);
  const [pageAsk, setPageAsk] = useState<PageAsk | null>(null);
  const [pageNote, setPageNote] = useState<PageNote | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const save = useCollectiveBulkSave(collectiveId);
  const previewMutation = useCollectiveBulkPreview(collectiveId);
  /** "Switch it on" for a page service switched off at the host, and what went wrong with the last one. */
  const switchOnMutation = useSwitchServiceOn();
  const offerMutation = useOfferServiceOnPage();
  const withdrawMutation = useTakeServiceOffPage({ waitForServices: true });
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<{ serviceId: string; message: string } | null>(null);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);
  useEffect(() => {
    if (!lastSave) return;
    const timer = setTimeout(() => setLastSave(null), Math.max(0, lastSave.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lastSave]);
  useEffect(() => {
    if (undoNote?.tone !== 'ok') return;
    const timer = setTimeout(() => setUndoNote(null), 8000);
    return () => clearTimeout(timer);
  }, [undoNote]);

  const rows = useMemo(() => gridRows(services, groups, filter, search), [services, groups, filter, search]);

  // What the bulk lane works on (CQ-03): the services ticked, or with only venues picked, the
  // services on the page; page changes only ever act on the services ticked.
  const crossing = gridCrossing({ selectedServices, selectedVenues, rows, groups });
  const hasSelection = selectedServices.size > 0 || selectedVenues.size > 0;

  const toggleSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const runBulk = (kind: PageOpKind | 'retry') => {
    setStaged((prev) => stageOps(prev, bulkOps(kind, crossing, services)));
  };

  const openPreview = () => {
    setPreview({ state: 'loading', venues: [] });
    previewMutation.mutate(toBulkOps(staged), {
      onSuccess: (venues) => setPreview({ state: 'ready', venues }),
      onError: () => setPreview({ state: 'failed', venues: [] }),
    });
  };

  /**
   * The one way a save goes out (web `commit`, P3 section 0): sends these changes (200 at a time,
   * in the hook) and takes them out of what is staged. What can still go through is staged again
   * (unless the picker keeps it); what will be refused again is listed and dropped; a removal held
   * back for upcoming bookings goes to the bookings step, never listed as a plain failure.
   */
  const commit = async (batch: StagedOp[], opts: CommitOptions = {}): Promise<CommitOutcome> => {
    const outcome: CommitOutcome = { succeeded: [], failed: [], affected: [], valuesNotRestored: [] };
    if (batch.length === 0) return outcome;
    const { acknowledgeAffected = false, restage = true, merge = false, undo = false } = opts;
    // What the save started from, for its Undo: read before the services are read again.
    const groupsBefore = groups;
    const itemIdOf = (serviceId: string) => services.find((s) => s.id === serviceId)?.collective?.item_id ?? null;
    setSaving(true);
    if (!merge && !undo) setFailures([]);
    try {
      const ops = toBulkOps(batch);
      let results: BulkOpResult[];
      try {
        results = await save.mutateAsync(acknowledgeAffected ? { ops, acknowledgeAffected: true } : ops);
      } catch (err) {
        // Nothing came back, so nothing is known to have gone through: every change can be sent again.
        const message = err instanceof ApiError ? err.message : undefined;
        results = ops.map((_op, index) => ({ index, ok: false, ...(message ? { message } : {}) }));
      }
      const byIndex = new Map(results.map((result) => [result.index, result] as const));
      ops.forEach((op, index) => {
        const result = byIndex.get(index);
        if (result?.ok) {
          outcome.succeeded.push(batch[index]!);
          if (op.op === 'assign' && op.values && result.values_restored === false) outcome.valuesNotRestored.push(op);
          return;
        }
        if (result && op.op === 'unassign' && !acknowledgeAffected && isAffectedRefusal(result)) {
          outcome.affected.push(affectedRefusal(op, result));
          return;
        }
        outcome.failed.push(bulkFailure(op, result ?? {}));
      });
      if (!undo) {
        // An Undo is not what the host staged: their unsaved changes stay as they are.
        const sent = new Set(batch.map((s) => s.key));
        const retryable = new Set(outcome.failed.filter((f) => f.retryable).map((f) => f.key));
        const kept = restage ? batch.filter((s) => retryable.has(s.key)) : [];
        setStaged((prev) => [...prev.filter((s) => !sent.has(s.key)), ...kept]);
        setFailures((prev) => (merge ? [...prev.filter((f) => !sent.has(f.key)), ...outcome.failed] : outcome.failed));
        const inverse = inverseOps(toBulkOps(outcome.succeeded), groupsBefore, itemIdOf);
        if (inverse.length > 0) {
          // The last save only (owner, 2026-10-29): a new save replaces the Undo of the one before,
          // and a bookings follow-up joins the save it came from.
          const now = Date.now();
          const session = opts.session ?? ++sessionSeq.current;
          const count = outcome.succeeded.length;
          setUndoNote(null);
          setSavedAt(null);
          setLastSave((prev) =>
            prev && prev.session === session
              ? { inverse: [...inverse, ...prev.inverse], count: prev.count + count, expiresAt: now + UNDO_WINDOW_MS, session }
              : { inverse, count, expiresAt: now + UNDO_WINDOW_MS, session },
          );
        } else if (outcome.failed.length === 0 && outcome.affected.length === 0) {
          setSavedAt(Date.now());
        }
      }
      return outcome;
    } finally {
      setSaving(false);
    }
  };

  /** What a picker stops sending: what went through, and what will only be refused again. */
  const settledOf = (outcome: CommitOutcome): string[] => [
    ...outcome.succeeded.map((s) => s.key),
    ...outcome.failed.filter((f) => !f.retryable).map((f) => f.key),
  ];

  const askAboutBookings = (where: BookingsStep['where'], outcome: CommitOutcome, session: number) => {
    if (outcome.affected.length === 0) return false;
    setBookingsStep({
      where,
      refusals: outcome.affected,
      othersSaved: outcome.succeeded.length > 0 && outcome.failed.length === 0,
      session,
    });
    return true;
  };

  /** The bar's Save, once its ask has closed: a bookings step opens on its own if needed. */
  const saveBar = async () => {
    setConfirming(false);
    const session = ++sessionSeq.current;
    askAboutBookings('bar', await commit(staged, { session }), session);
  };

  const failureTexts = (list: readonly BulkFailure[]) => failureRows(list, services, groups).map((row) => row.text);

  /** What an Undo did, in words: done, or what could not be undone and why. */
  const reportUndo = (outcome: CommitOutcome) => {
    const values = outcome.valuesNotRestored.map((op) => valuesNotRestoredLine(op, services, groups));
    if (outcome.failed.length > 0) {
      setUndoNote({
        tone: 'error',
        text:
          outcome.failed.length === 1
            ? areaCopy('ov.bulk.undoFailedOne')
            : areaCopy('ov.bulk.undoFailed', { count: outcome.failed.length }),
        rows: [...failureTexts(outcome.failed), ...values],
      });
      return;
    }
    setUndoNote({ tone: values.length > 0 ? 'warn' : 'ok', text: areaCopy('ov.bulk.undone'), rows: values });
  };

  /**
   * Undo (CQ-11): the opposite of what the last save did, sent with no question, because the host
   * has just asked for exactly this. A calendar a guest booked inside the minute shows its bookings
   * first, as any removal does.
   */
  const undoLastSave = async () => {
    const last = lastSave;
    if (!last) return;
    setLastSave(null);
    setUndoNote(null);
    const session = ++sessionSeq.current;
    const outcome = await commit(
      last.inverse.map((op) => ({ ...op, key: keyOf(op) })),
      { undo: true, restage: false },
    );
    if (outcome.affected.length > 0) {
      setBookingsStep({ where: 'bar', refusals: outcome.affected, othersSaved: false, session, fromUndo: true });
      if (outcome.failed.length === 0) return;
    }
    reportUndo(outcome);
  };

  /**
   * The picker's Save: what it decided replaces anything staged for those calendars, and goes now.
   * Its own failures stay in its choice, not the grid's staging, so its Save keeps counting what
   * can go through (CQ-04). Answers with the changes it should stop sending.
   */
  const saveChosen = async ({ ops, settledKeys }: PickerResult): Promise<string[]> => {
    const batch: StagedOp[] = ops.map((op) => ({ ...op, key: keyOf(op) }));
    const replaced = new Set([...batch.map((s) => s.key), ...settledKeys]);
    setStaged((prev) => prev.filter((s) => !replaced.has(s.key)));
    const session = ++sessionSeq.current;
    const outcome = await commit(batch, { restage: false, session });
    if (!askAboutBookings('picker', outcome, session) && outcome.failed.length === 0) closeChooser();
    return settledOf(outcome);
  };

  /** A service sheet's Save: that service's calendar ticks, and nothing else staged. */
  const saveService = async (serviceId: string) => {
    const session = ++sessionSeq.current;
    const outcome = await commit(stagedCalendarOps(staged, serviceId), { session });
    if (!askAboutBookings('sheet', outcome, session) && outcome.failed.length === 0) closeService();
  };

  /** "Take it off and keep these bookings": only the removals shown, acknowledged, and nothing else. */
  const acknowledgeBookings = async (): Promise<string[]> => {
    const step = bookingsStep;
    if (!step) return [];
    const batch: StagedOp[] = step.refusals.map((r) => ({ ...r.op, key: r.key }));
    const sent = new Set(batch.map((s) => s.key));
    const outcome = await commit(batch, {
      acknowledgeAffected: true,
      merge: true,
      restage: step.where !== 'picker' && !step.fromUndo,
      session: step.session,
      undo: step.fromUndo,
    });
    setBookingsStep(null);
    if (step.fromUndo) {
      reportUndo(outcome);
      return settledOf(outcome);
    }
    const remaining = [...failures.filter((f) => !sent.has(f.key)), ...outcome.failed];
    if (step.where === 'picker' && remaining.length === 0) closeChooser();
    if (step.where === 'sheet' && openServiceId) {
      const here = remaining.some((f) => f.op.service_id === openServiceId);
      if (!here) closeService();
    }
    return settledOf(outcome);
  };

  /** "Keep offering it": nothing is sent, and the calendars keep the service. */
  const keepBookings = () => {
    const step = bookingsStep;
    setBookingsStep(null);
    if (step?.where === 'picker' && failures.length === 0) closeChooser();
  };

  /**
   * The Services screen's own switch, right on the row (web 2026-10-28): the service goes on, the
   * services are read again, and a refusal shows on that row.
   */
  const switchOn = async (serviceId: string) => {
    setSwitching(serviceId);
    setSwitchError(null);
    try {
      await switchOnMutation.mutateAsync(serviceId);
    } catch (err) {
      setSwitchError({
        serviceId,
        message: err instanceof ApiError ? err.message : 'That did not go through. Please check your connection.',
      });
    } finally {
      setSwitching(null);
    }
  };

  /**
   * A service sheet's "Put on the page" or "Take off the page", once asked (CQ-10.8): it goes now,
   * the services are read again, and the sheet stays open on the calendar ticks with what it did.
   */
  const confirmPageChange = async () => {
    const ask = pageAsk;
    const service = ask ? services.find((s) => s.id === ask.serviceId) : null;
    if (!ask || !service) {
      setPageAsk(null);
      return;
    }
    setPageBusy(true);
    setPageNote(null);
    try {
      if (ask.kind === 'offer') {
        const answer = await offerMutation.mutateAsync({ collectiveId, serviceId: service.id });
        const summary = offerDoneSummary({
          collectiveName,
          links: answer?.links ?? [],
          notReady: answer?.calendars?.not_ready ?? [],
          awaiting: answer?.pending ?? [],
          hostCalendarCount: answer?.host_calendar_count ?? null,
        });
        setPageNote({ serviceId: service.id, tone: 'ok', lines: summary.lines });
      } else {
        const itemId = service.collective?.item_id;
        if (!itemId) throw new Error('not on the page');
        await withdrawMutation.mutateAsync({ collectiveId, itemId });
        setPageNote({ serviceId: service.id, tone: 'ok', lines: [areaCopy('svc.withdraw.done', { collective: collectiveName })] });
      }
      // A page change staged for it in the bar is done now; calendar ticks for a service taken off
      // could only be refused.
      setStaged((prev) =>
        prev.filter(
          (s) =>
            s.service_id !== service.id ||
            (ask.kind === 'offer' && s.op !== 'offer' && s.op !== 'withdraw'),
        ),
      );
    } catch (err) {
      setPageNote({
        serviceId: service.id,
        tone: 'error',
        lines: [
          err instanceof ApiError
            ? err.message
            : ask.kind === 'offer'
              ? areaCopy('svc.offer.error', { service: service.name, collective: collectiveName })
              : 'That did not go through. Please try again.',
        ],
      });
    } finally {
      setPageBusy(false);
      setPageAsk(null);
    }
  };

  /** A service sheet's Cancel: its calendar ticks go, with what was said about them, and it closes. */
  const discardService = (serviceId: string) => {
    const keys = new Set(stagedCalendarOps(staged, serviceId).map((s) => s.key));
    setStaged((prev) => prev.filter((s) => !keys.has(s.key)));
    setFailures((prev) => prev.filter((f) => f.op.service_id !== serviceId));
    closeService();
  };

  function closeService() {
    setOpenServiceId(null);
    setPageAsk(null);
    setPageNote(null);
    setBookingsStep((prev) => (prev?.where === 'sheet' ? null : prev));
  }

  function closeChooser() {
    setChoosing(false);
    setBookingsStep((prev) => (prev?.where === 'picker' ? null : prev));
    if (chooserFromFocus) {
      setChooserFromFocus(false);
      setSelectedServices(new Set());
      setSelectedVenues(new Set());
    }
  }

  /**
   * "Choose calendars" from What needs you, for one venue (CQ-10.7): that venue's calendars for
   * every service on the page, in the picker straight away, never page buttons (CQ-03).
   */
  const focusVenue = (venueId: string) => {
    if (!groups.some((g) => g.venue_id === venueId)) return;
    setFilter('all');
    setSearch('');
    setSelectedServices(new Set());
    setSelectedVenues(new Set([venueId]));
    setOpenServiceId(null);
    setFailures([]);
    setBookingsStep(null);
    setChooserFromFocus(true);
    setChoosing(true);
  };

  return {
    ...input,
    filter,
    setFilter,
    attentionLabel: attentionLabel(services, groups),
    search,
    setSearch,
    selecting,
    setSelecting: (on: boolean) => {
      setSelecting(on);
      if (!on) {
        setSelectedServices(new Set());
        setSelectedVenues(new Set());
      }
    },
    selectedServices,
    toggleService: (id: string) => setSelectedServices((prev) => toggleSet(prev, id)),
    selectAllShown: () => setSelectedServices(new Set(rows.map((r) => r.id))),
    selectedVenues,
    toggleVenue: (id: string) => setSelectedVenues((prev) => toggleSet(prev, id)),
    hasSelection,
    clearSelection: () => {
      setSelectedServices(new Set());
      setSelectedVenues(new Set());
    },
    crossing,
    /** Whether "Put on the page" / "Take off the page" would change anything ticked (CQ-03). */
    canPageChange: (kind: PageOpKind) => pageChangeable(kind, [...selectedServices], services).length > 0,
    staged,
    setStaged,
    discard: () => {
      setStaged([]);
      setFailures([]);
    },
    failures,
    failureTexts,
    rows,
    runBulk,
    choosing,
    openChooser: () => {
      setFailures([]);
      setBookingsStep(null);
      setChooserFromFocus(false);
      setChoosing(true);
    },
    closeChooser,
    focusVenue,
    saveChosen,
    saveService,
    discardService,
    closeService,
    bookingsStep,
    acknowledgeBookings,
    keepBookings,
    switchOn,
    switching,
    switchError,
    pageAsk,
    askPageChange: (serviceId: string, kind: PageOpKind) => {
      setPageNote(null);
      setPageAsk({ serviceId, kind });
    },
    cancelPageChange: () => setPageAsk(null),
    confirmPageChange,
    pageNote,
    pageBusy,
    saved: savedAt !== null,
    lastSave: lastSave ? { count: lastSave.count, expiresAt: lastSave.expiresAt } : null,
    undoLastSave,
    undoNote,
    openServiceId,
    setOpenServiceId,
    confirming,
    setConfirming,
    preview,
    setPreview,
    openPreview,
    commit: () => void saveBar(),
    saving,
    // Bulk buttons only once something is picked; a pending change, a fresh "Saved." or an Undo still shows.
    showBar: hasSelection || staged.length > 0 || savedAt !== null || lastSave !== null,
  };
}

export type ServicesGridState = ReturnType<typeof useServicesGrid>;

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function ServicesGridList({ grid, currencySymbol }: { grid: ServicesGridState; currencySymbol: string }) {
  const { colors } = useTheme();
  const { groups } = grid;
  return (
    <View style={styles.list}>
      <Segmented<GridFilter>
        options={[
          { value: 'all', label: areaCopy('ov.filter.all') },
          { value: 'attention', label: grid.attentionLabel },
          { value: 'off_page', label: areaCopy('ov.filter.offPage') },
        ]}
        value={grid.filter}
        onChange={grid.setFilter}
        wrapLabels
      />
      <SearchBar
        value={grid.search}
        onChangeText={grid.setSearch}
        onClear={() => grid.setSearch('')}
        placeholder={areaCopy('ov.grid.search')}
      />
      <View style={styles.selectRow}>
        <Button
          label={grid.selecting ? 'Done selecting' : 'Select'}
          variant="secondary"
          size="sm"
          onPress={() => grid.setSelecting(!grid.selecting)}
        />
        {grid.selecting ? (
          <Button label="Select every service shown" variant="ghost" size="sm" onPress={grid.selectAllShown} />
        ) : null}
      </View>
      {grid.selecting ? (
        <View style={styles.venueChips}>
          <Text variant="caption" tone="secondary">
            Venues (none chosen means every venue)
          </Text>
          <View style={styles.chipWrap}>
            {groups.map((group) => (
              <Chip
                key={group.venue_id}
                label={gridVenueName(group)}
                selected={grid.selectedVenues.has(group.venue_id)}
                onPress={() => grid.toggleVenue(group.venue_id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* The picker lists its own while it is open. */}
      {grid.failures.length > 0 && !grid.choosing ? <FailuresBox grid={grid} list={grid.failures} /> : null}
      {grid.undoNote ? <UndoNoteBox note={grid.undoNote} /> : null}

      {grid.rows.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.empty}>
          {areaCopy('ov.grid.empty')}
        </Text>
      ) : null}

      {grid.rows.map((service) => {
        const onPage = isOnPage(service);
        // On the page but switched off at the host: nobody can book it anywhere (web 2026-10-28).
        const switchedOff = isSwitchedOff(service);
        const selected = grid.selectedServices.has(service.id);
        // A staged page change is the whole row's news, so every venue's line says it (CQ-03).
        const pageChange = pageStaged(grid.staged, service.id);
        return (
          <Pressable
            key={service.id}
            onPress={() => (grid.selecting ? grid.toggleService(service.id) : grid.setOpenServiceId(service.id))}
            accessibilityRole={grid.selecting ? 'checkbox' : 'button'}
            accessibilityState={grid.selecting ? { checked: selected } : undefined}
            accessibilityLabel={service.name}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card
              style={[
                styles.serviceCard,
                selected ? { borderColor: colors.brand, borderWidth: 2 } : null,
              ]}
            >
              <View style={styles.serviceHead}>
                {grid.selecting ? (
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: selected ? colors.brand : colors.border },
                      selected ? { backgroundColor: colors.brand } : null,
                    ]}
                  >
                    {selected ? (
                      <Text variant="caption" color={colors.onColor}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Text variant="bodyMedium" style={styles.flex1}>
                  {service.name}
                </Text>
                {!onPage ? (
                  // A parked service switched off reads "Parked, switched off" (web 2026-10-28).
                  <Badge
                    label={
                      service.is_active === false
                        ? `${areaCopy('common.pill.parked')}, ${areaCopy('ov.grid.row.off')}`
                        : areaCopy('common.pill.parked')
                    }
                  />
                ) : null}
                {!grid.selecting ? (
                  <Text variant="title" tone="muted">
                    ›
                  </Text>
                ) : null}
              </View>
              {/* Switched off on the Services screen: on the page, but nobody can book it anywhere.
                  Saying so, with the switch right here, is the whole fix (web 2026-10-28). */}
              {switchedOff ? (
                <View style={styles.switchedOff}>
                  <Text variant="caption" color={colors.warning}>
                    {areaCopy('ov.grid.row.switchedOff')}
                  </Text>
                  <Button
                    label={areaCopy('ov.grid.row.turnOn')}
                    variant="secondary"
                    size="sm"
                    style={styles.switchOn}
                    accessibilityLabel={`${areaCopy('ov.grid.row.turnOn')}: ${service.name}`}
                    loading={grid.switching === service.id}
                    disabled={grid.switching !== null}
                    onPress={() => void grid.switchOn(service.id)}
                  />
                  {grid.switchError?.serviceId === service.id ? (
                    <Text variant="caption" tone="danger" accessibilityRole="alert">
                      {grid.switchError.message}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {onPage ? (
                groups.map((group) => {
                  const state = cellState(group, service.collective?.item_id);
                  const hidden = state !== 'none' && (switchedOff || isHiddenAt(service, group.venue_id));
                  const changes = stagedCountFor(grid.staged, service.id, group.venue_id);
                  return (
                    <View key={group.venue_id} style={styles.cellLine}>
                      <Text variant="caption" tone="secondary" style={styles.flex1} numberOfLines={1}>
                        {gridVenueName(group)}
                      </Text>
                      <View style={styles.cellBadges}>
                        {pageChange === 'withdraw' ? (
                          <Badge label={areaCopy('ov.grid.cell.comingOff')} tone="brand" />
                        ) : changes > 0 ? (
                          <Badge label={areaCopy('ov.grid.cell.staged', { count: changes })} tone="brand" />
                        ) : (
                          <Badge label={CELL_LABEL[state]} tone={hidden ? 'warning' : CELL_TONE[state]} />
                        )}
                        {hidden && changes === 0 && !pageChange ? (
                          <Badge label={areaCopy('ov.grid.cell.hidden')} tone="warning" />
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : pageChange === 'offer' ? (
                <Badge label={areaCopy('ov.grid.cell.goingOn')} tone="brand" />
              ) : (
                <Text variant="caption" tone="muted">
                  {areaCopy('ov.grid.cell.offPage')}
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      <ServiceSheet grid={grid} currencySymbol={currencySymbol} />
      <BulkCalendarsSheet grid={grid} />
      <ConfirmSaveSheet grid={grid} />
      <BarBookingsSheet grid={grid} />
      <PreviewSheet grid={grid} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The bar under the list
// ---------------------------------------------------------------------------

export function ServicesGridBar({ grid }: { grid: ServicesGridState }) {
  const { colors } = useTheme();
  if (!grid.showBar) return null;
  const count = grid.staged.length;
  const venuesOnly = grid.selectedServices.size === 0 && grid.selectedVenues.size > 0;
  return (
    <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
      {/* The last save, with Undo for 60 seconds (CQ-11), from the bar, a sheet or the picker. */}
      {grid.lastSave ? (
        <View style={styles.undoRow} accessibilityLiveRegion="polite">
          <Text variant="label" tone="success" style={styles.flex1}>
            {grid.lastSave.count === 1
              ? areaCopy('ov.bulk.savedCountOne')
              : areaCopy('ov.bulk.savedCount', { count: grid.lastSave.count })}
          </Text>
          <UndoButton
            key={grid.lastSave.expiresAt}
            expiresAt={grid.lastSave.expiresAt}
            disabled={grid.saving}
            onPress={() => void grid.undoLastSave()}
          />
        </View>
      ) : grid.saved ? (
        <Text variant="label" tone="success" accessibilityLiveRegion="polite">
          {areaCopy('ov.bulk.saved')}
        </Text>
      ) : null}
      {grid.hasSelection ? (
        <>
          <Text variant="label">{selectionLabel(grid.selectedServices.size, [...grid.selectedVenues], grid.groups)}</Text>
          {venuesOnly ? (
            <Text variant="caption" tone="secondary">
              {areaCopy('ov.bulk.venuesHint')}
            </Text>
          ) : null}
          {/* Only what would change something is offered, and page changes only for the services
              ticked (CQ-03): a venue picked on its own can never empty the page. */}
          <View style={styles.barGrid}>
            <Button label={areaCopy('ov.bulk.addCalendars')} size="sm" style={styles.barCell} onPress={grid.openChooser} />
            {grid.canPageChange('offer') ? (
              <Button label={areaCopy('ov.bulk.offer')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('offer')} />
            ) : null}
            {grid.canPageChange('withdraw') ? (
              <Button label={areaCopy('ov.bulk.withdraw')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('withdraw')} />
            ) : null}
            {/* Only when a venue's copy actually failed to update: a refused change is not helped
                by bringing copies up to date (CQ-04). */}
            {grid.groups.some((g) => g.sync.failed.length > 0) ? (
              <Button label={areaCopy('ov.bulk.retry')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('retry')} />
            ) : null}
            <Button label={areaCopy('ov.bulk.clearSelection')} variant="ghost" size="sm" style={styles.barCell} onPress={grid.clearSelection} />
          </View>
        </>
      ) : count > 0 ? (
        <Text variant="label">{unsavedSummary(count)}</Text>
      ) : null}
      {count > 0 ? (
        <View style={styles.barGrid}>
          <Button label={areaCopy('ov.bulk.discard')} variant="ghost" size="sm" style={styles.barCell} disabled={grid.saving} onPress={grid.discard} />
          <Button
            label={areaCopy(count === 1 ? 'ov.bulk.saveOne' : 'ov.bulk.save', { count })}
            size="sm"
            style={styles.barCell}
            loading={grid.saving}
            onPress={() => grid.setConfirming(true)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** "Undo (42s)": its own clock, so only the button redraws each second, not the whole list. */
function UndoButton({ expiresAt, disabled, onPress }: { expiresAt: number; disabled: boolean; onPress: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return (
    <Button
      label={areaCopy('ov.bulk.undo', { seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) })}
      variant="secondary"
      size="sm"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

// ---------------------------------------------------------------------------
// One service at every venue
// ---------------------------------------------------------------------------

function ServiceSheet({ grid, currencySymbol }: { grid: ServicesGridState; currencySymbol: string }) {
  const { colors } = useTheme();
  /**
   * One calendar's own price and times (web grid cell's Edit values, 2026-10-28): a step of this
   * sheet, never a second sheet over it ([[ios-no-stacked-modals]]). Saved at once, not staged.
   */
  const [valuesTarget, setValuesTarget] = useState<CalendarValuesTarget | null>(null);
  const service = grid.services.find((s) => s.id === grid.openServiceId) ?? null;
  const busy = grid.saving || grid.pageBusy;
  const close = () => {
    if (busy) return;
    setValuesTarget(null);
    grid.closeService();
  };
  if (!service) return <Sheet visible={false} onClose={close}>{null}</Sheet>;
  const onPage = isOnPage(service);
  const itemId = service.collective?.item_id ?? null;
  const hiddenVenue = service.collective?.status === 'hidden' ? hiddenPillVenue(service.collective.hidden_reasons) : null;
  /** Calendar ticks not saved yet: the sheet saves them itself, so nobody hunts for a second Save. */
  const unsavedTicks = stagedCalendarOps(grid.staged, service.id).length > 0;
  const failures = grid.failures.filter((f) => f.op.service_id === service.id);
  const note = grid.pageNote?.serviceId === service.id ? grid.pageNote : null;

  // A removal of this service's calendars held back for upcoming bookings (CQ-04): asked here.
  if (grid.bookingsStep?.where === 'sheet') {
    return (
      <Sheet
        visible
        onClose={() => {
          // Closing the bookings step sends nothing: the calendar keeps the service.
          if (grid.saving) return;
          grid.keepBookings();
          close();
        }}
        maxHeight="92%"
        fill
      >
        <AffectedBookingsStep
          items={groupAffected(grid.bookingsStep.refusals, grid.services, grid.groups)}
          othersSaved={grid.bookingsStep.othersSaved}
          busy={grid.saving}
          onKeep={grid.keepBookings}
          onConfirm={() => void grid.acknowledgeBookings()}
        />
      </Sheet>
    );
  }

  // Put on the page or take off the page asks first, here, and goes straight away (CQ-10.8).
  if (grid.pageAsk?.serviceId === service.id) {
    const members = formatVenueList(grid.groups.filter((g) => !g.is_host).map((g) => g.venue_name));
    const offer = grid.pageAsk.kind === 'offer';
    const params = { service: service.name, collective: grid.collectiveName, venueList: members };
    return (
      <Sheet visible onClose={close}>
        <View style={styles.confirmBody}>
          <Text variant="subheading">{areaCopy(offer ? 'svc.offer.title' : 'svc.withdraw.title', params)}</Text>
          <Text variant="bodySmall" tone="secondary">
            {offer
              ? areaCopy(service.collective?.was_on_page ? 'svc.offer.messageAgain' : 'svc.offer.message', params)
              : areaCopy('svc.withdraw.message', params)}
          </Text>
          <View style={styles.footerRow}>
            <Button
              label={areaCopy('ov.bulk.confirm.back')}
              variant="secondary"
              style={styles.flex1}
              disabled={grid.pageBusy}
              onPress={grid.cancelPageChange}
            />
            <Button
              label={areaCopy(offer ? 'svc.offer.confirm' : 'svc.withdraw.confirm')}
              variant={offer ? 'primary' : 'danger'}
              style={styles.flex1}
              loading={grid.pageBusy}
              disabled={grid.pageBusy}
              onPress={() => void grid.confirmPageChange()}
            />
          </View>
        </View>
      </Sheet>
    );
  }

  if (valuesTarget) {
    return (
      <Sheet visible onClose={close} maxHeight="92%" fill>
        <CalendarValuesStep
          key={valuesTarget.calendarId}
          mode="host"
          collectiveId={grid.collectiveId}
          serviceName={service.name}
          target={valuesTarget}
          flags={calendarValueFlags(service)}
          defaults={calendarValueDefaults(service)}
          currencySymbol={currencySymbol}
          hasOptions={(service.variants ?? []).some((v) => v.is_active !== false)}
          onSaved={() => setValuesTarget(null)}
          onBack={() => setValuesTarget(null)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={close} maxHeight="92%" fill>
      <View style={styles.sheetHeader}>
        <Text variant="subheading" style={styles.flex1}>
          {service.name}
        </Text>
        {service.collective && onPage ? (
          <SyncBadge
            status={service.collective.status}
            label={hiddenVenue ? areaCopy('svc.card.hiddenAt', { venue: hiddenVenue }) : null}
          />
        ) : null}
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.sheetContent}>
        {/* Shown here too: the list behind the sheet cannot be seen while it is open. */}
        {failures.length > 0 ? <FailuresBox grid={grid} list={failures} /> : null}
        {note ? (
          <View
            accessibilityRole={note.tone === 'error' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            style={[
              styles.notice,
              note.tone === 'error'
                ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
                : { backgroundColor: colors.successSurface, borderColor: colors.success },
            ]}
          >
            {note.lines.map((line) => (
              <Text key={line} variant="bodySmall" tone={note.tone === 'error' ? 'danger' : 'default'}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <Button
          label={onPage ? areaCopy('ov.bulk.withdraw') : areaCopy('ov.bulk.offer')}
          variant="secondary"
          fullWidth
          disabled={busy || unsavedTicks}
          onPress={() => grid.askPageChange(service.id, onPage ? 'withdraw' : 'offer')}
        />
        {!onPage ? (
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('ov.grid.sheet.offPage')}
          </Text>
        ) : (
          <>
            <Text variant="label">{areaCopy('svc.cal.heading')}</Text>
            {grid.groups.map((group) => {
              const active = group.calendars.filter((c) => c.is_active);
              const warnings = venueWarnings(group, service.collective?.hidden_reasons ?? [], grid.collectiveName, service.collective?.item_id ?? null);
              return (
                <View key={group.venue_id} style={[styles.venueBlock, { borderColor: colors.border }]}>
                  <Text variant="label">{gridVenueName(group)}</Text>
                  {warnings.map((warning) => (
                    <Text key={warning} variant="caption" color={colors.warning}>
                      {warning}
                    </Text>
                  ))}
                  {active.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {areaCopy('svc.cal.noCalendars', { venue: group.venue_name })}
                    </Text>
                  ) : null}
                  {active.map((calendar) => {
                    const on = calendarWillOffer(grid.staged, service.id, group.venue_id, calendar, itemId);
                    const assignedNow = Boolean(itemId && calendar.assigned.some((a) => a.item_id === itemId));
                    const chips = valueChips(
                      calendar.assigned.find((a) => a.item_id === itemId),
                      currencySymbol,
                    );
                    return (
                      <View key={calendar.id} style={styles.calendarRow}>
                        <View style={styles.flex1}>
                          <Text variant="bodySmall">{calendar.name}</Text>
                          {on !== assignedNow ? (
                            <Text variant="caption" tone="brand">
                              {areaCopy(on ? 'svc.cal.notSaved.add' : 'svc.cal.notSaved.remove')}
                            </Text>
                          ) : null}
                          {chips.length > 0 ? (
                            <Text variant="caption" tone="muted">
                              {chips.join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        {/* The host's grid: a value for a setting not yet on turns it on. */}
                        {assignedNow && service.collective?.role === 'master' ? (
                          <Button
                            label={areaCopy('svc.cal.editValues')}
                            variant="ghost"
                            size="sm"
                            accessibilityLabel={areaCopy('svc.member.view.editValuesFor', { calendar: calendar.name })}
                            onPress={() => setValuesTarget(calendarValuesTarget(grid.groups, itemId, group.venue_id, calendar.id))}
                          />
                        ) : null}
                        <Switch
                          value={on}
                          accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                          disabled={busy}
                          onValueChange={(next) =>
                            grid.setStaged(toggleCalendar(grid.staged, service.id, group.venue_id, calendar, itemId, next))
                          }
                          trackColor={{ true: colors.brand, false: colors.border }}
                          thumbColor={colors.surfaceRaised}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <View style={[styles.sheetFooter, styles.footerRow]}>
        {unsavedTicks ? (
          <>
            <Button
              label={areaCopy('ov.bulk.choose.cancel')}
              variant="ghost"
              style={styles.flex1}
              disabled={grid.saving}
              onPress={() => grid.discardService(service.id)}
            />
            <Button
              label={areaCopy('ov.bulk.choose.save')}
              style={styles.flex1}
              loading={grid.saving}
              disabled={grid.saving}
              onPress={() => void grid.saveService(service.id)}
            />
          </>
        ) : (
          <Button label={areaCopy('ov.grid.done')} fullWidth disabled={busy} onPress={close} />
        )}
      </View>
    </Sheet>
  );
}

/** "{count} changes did not go through:", a row per change, and whether any is kept (CQ-04). */
function FailuresBox({ grid, list }: { grid: ServicesGridState; list: BulkFailure[] }) {
  const { colors } = useTheme();
  const kept = failedKeptLine(list);
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}
    >
      <Text variant="bodySmall" tone="danger">
        {list.length === 1 ? areaCopy('ov.bulk.someFailedOne') : areaCopy('ov.bulk.someFailed', { count: list.length })}
      </Text>
      {grid.failureTexts(list).map((text, index) => (
        <Text key={`${list[index]?.key ?? index}`} variant="caption" tone="danger">
          {`• ${text}`}
        </Text>
      ))}
      {kept ? (
        <Text variant="caption" tone="danger">
          {kept}
        </Text>
      ) : null}
    </View>
  );
}

function UndoNoteBox({ note }: { note: UndoNote }) {
  const { colors } = useTheme();
  const tone =
    note.tone === 'error'
      ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
      : note.tone === 'warn'
        ? { backgroundColor: colors.warningSurface, borderColor: colors.warning }
        : { backgroundColor: colors.successSurface, borderColor: colors.success };
  return (
    <View
      accessibilityRole={note.tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.notice, tone]}
    >
      <Text variant="bodySmall" tone={note.tone === 'error' ? 'danger' : 'default'}>
        {note.text}
      </Text>
      {note.rows.map((row, index) => (
        <Text key={index} variant="caption" tone={note.tone === 'error' ? 'danger' : 'default'}>
          {`• ${row}`}
        </Text>
      ))}
    </View>
  );
}

/** The ask before the bar's Save: each service and what happens to it, red when one comes off the page. */
function ConfirmSaveSheet({ grid }: { grid: ServicesGridState }) {
  const described = grid.confirming ? describeStaged(toBulkOps(grid.staged), grid.services, grid.groups) : null;
  return (
    <Sheet visible={grid.confirming} onClose={() => grid.setConfirming(false)}>
      {described ? (
        <View style={styles.confirmBody}>
          <Text variant="subheading">{described.title}</Text>
          {described.lines.map((line, index) => (
            // Two services can share a name, so the position is the key.
            <Text key={index} variant="bodySmall" tone="secondary">
              {line}
            </Text>
          ))}
          <Button
            label={areaCopy('ov.preview.button')}
            variant="ghost"
            size="sm"
            style={styles.previewLink}
            onPress={() => {
              grid.setConfirming(false);
              grid.openPreview();
            }}
          />
          <View style={styles.footerRow}>
            <Button
              label={areaCopy('ov.bulk.confirm.back')}
              variant="secondary"
              style={styles.flex1}
              onPress={() => grid.setConfirming(false)}
            />
            <Button
              label={described.confirmLabel}
              variant={described.destructive ? 'danger' : 'primary'}
              style={styles.flex1}
              onPress={grid.commit}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** The bookings step after the bar's Save or an Undo, in its own sheet once the ask has closed (CQ-04). */
function BarBookingsSheet({ grid }: { grid: ServicesGridState }) {
  const step = grid.bookingsStep?.where === 'bar' ? grid.bookingsStep : null;
  return (
    <Sheet visible={step !== null} onClose={() => (grid.saving ? undefined : grid.keepBookings())} maxHeight="92%" fill>
      {step ? (
        <AffectedBookingsStep
          items={groupAffected(step.refusals, grid.services, grid.groups)}
          othersSaved={step.othersSaved}
          busy={grid.saving}
          onKeep={grid.keepBookings}
          onConfirm={() => void grid.acknowledgeBookings()}
        />
      ) : null}
    </Sheet>
  );
}

function PreviewSheet({ grid }: { grid: ServicesGridState }) {
  const { colors } = useTheme();
  const preview = grid.preview;
  const close = () => grid.setPreview(null);
  return (
    <Sheet visible={preview !== null} onClose={close} maxHeight="92%" fill>
      <View style={styles.sheetHeader}>
        <Text variant="subheading">{areaCopy('ov.preview.title')}</Text>
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.sheetContent}>
        {preview?.state === 'loading' ? (
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('ov.preview.loading')}
          </Text>
        ) : preview?.state === 'failed' ? (
          <Text variant="bodySmall" tone="danger">
            {areaCopy('ov.preview.failed')}
          </Text>
        ) : (
          (preview?.venues ?? []).map((venue) => (
            <View key={venue.venue_id} style={styles.previewVenue}>
              <Text variant="label">{gridVenueName(venue)}</Text>
              <Text variant="bodySmall" tone="secondary">
                {venue.shows.length > 0
                  ? areaCopy('ov.preview.shows', { services: venue.shows.map((s) => s.name).join(', ') })
                  : areaCopy('ov.preview.nothing', { venue: venue.venue_name })}
              </Text>
              {venue.hides.map((hidden) => (
                <Text key={hidden.service_id} variant="bodySmall" color={colors.warning}>
                  {`${hidden.name}: ${areaCopy('ov.preview.willHide', {
                    venue: venue.venue_name,
                    reason: PREVIEW_REASON_WORDS[hidden.reason] ?? hidden.reason,
                  })}`}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.sheetFooter}>
        <Button label={areaCopy('ov.grid.done')} fullWidth onPress={close} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  venueChips: { gap: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
  serviceCard: { gap: spacing.xs },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cellBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xxs, flexShrink: 1 },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  undoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  barCell: { flexGrow: 1, flexBasis: '45%' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sheetContent: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  switchedOff: { gap: spacing.xs },
  switchOn: { alignSelf: 'flex-start' },
  venueBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
  calendarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  confirmBody: { gap: spacing.md },
  previewLink: { alignSelf: 'flex-start' },
  previewVenue: { gap: spacing.xxs },
});
