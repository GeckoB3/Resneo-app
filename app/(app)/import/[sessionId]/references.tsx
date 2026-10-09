import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BulkCreateSheet, type BulkResult } from '@/components/import/BulkCreateSheet';
import { ImportBanner, OptionPickerSheet, SelectField, TickRow, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import {
  bulkCreateOperations,
  bulkRowsFor,
  createLabelForReference,
  createReferenceBody,
  currencySymbolFor,
  defaultCreateDraft,
  entityTypeForReference,
  optionsForReference,
  referencesForTab,
  referenceTabLabel,
  referenceTabs,
  servicesLookFresh,
  staffNounFor,
  type BulkRow,
  type CreateDraft,
} from '@/lib/import/references';
import { importStepRoute } from '@/lib/import/session-status';
import type { BookingReference, ExtractResult, ReferenceCatalog, ReferenceDefault } from '@/lib/import/types';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Step 4, Services and staff (web `ReferencesStepClient`). The services and staff your files
 * name are matched to what the venue already has (the AI suggests matches); anything else can be
 * added as new here, one at a time or all at once, or skipped. Continue unlocks once every one
 * is settled.
 */
export default function ReferencesStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Services and staff" sessionId={sessionId} step="references">
      <ReferencesStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

function ReferencesStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const api = useImportApi();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const currencySymbol = currencySymbolFor(venue?.currency);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extract, setExtract] = useState<ExtractResult | null>(null);
  const [refs, setRefs] = useState<BookingReference[]>([]);
  const [resolvedFlag, setResolvedFlag] = useState(false);
  const [fileTypeById, setFileTypeById] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<ReferenceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetrying, setCatalogRetrying] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, ReferenceDefault>>({});
  const [chosenTab, setTab] = useState('service');
  const [ack, setAck] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [selectByRef, setSelectByRef] = useState<Record<string, string>>({});
  const [pickingFor, setPickingFor] = useState<BookingReference | null>(null);
  const [createOpen, setCreateOpen] = useState<Record<string, boolean>>({});
  const [createDraft, setCreateDraft] = useState<Record<string, CreateDraft>>({});
  const [bulkType, setBulkType] = useState<'service' | 'staff' | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const loadSession = useCallback(async () => {
    const data = await api.getSession(sessionId);
    setRefs(data.booking_references ?? []);
    setResolvedFlag(data.session?.references_resolved === true);
    const ft: Record<string, string> = {};
    for (const f of data.files ?? []) ft[f.id] = f.file_type;
    setFileTypeById(ft);
    return data;
  }, [api, sessionId]);

  const loadCatalog = useCallback(async () => {
    setCatalogError(null);
    try {
      setCatalog(await api.referenceCatalog(sessionId));
    } catch (e) {
      setCatalogError(importErrorMessage(e, 'Your services and staff could not be loaded.'));
    }
  }, [api, sessionId]);

  const loadDefaults = useCallback(async () => {
    try {
      const data = await api.referenceDefaults(sessionId);
      const map: Record<string, ReferenceDefault> = {};
      for (const s of data.suggestions ?? []) map[s.reference_id] = s;
      setDefaults(map);
    } catch {
      // Suggested lengths and prices are a nicety: the forms start from 60 minutes and no price.
    }
  }, [api, sessionId]);

  // The extraction deletes and restages the booking rows, so it runs once per visit.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.extractReferences(sessionId);
        setExtract(res);
        const data = await loadSession();
        if ((data.booking_references ?? []).some((r) => !r.is_resolved)) {
          try {
            await api.aiMapReferences(sessionId);
          } catch {
            // Without suggestions every item can still be matched by hand.
          }
          await loadSession();
        }
        await Promise.all([loadCatalog(), loadDefaults()]);
      } catch (e) {
        setError(importErrorMessage(e, 'Your booking file could not be read. Please try again.'));
      }
      setLoading(false);
    })();
  }, [api, sessionId, loadSession, loadCatalog, loadDefaults]);

  const resolved = extract?.referencesResolved === true || resolvedFlag;
  const tabs = useMemo(() => referenceTabs(refs), [refs]);
  // The chosen tab, or the first one left when it has emptied (the web's effect, without a re-render).
  const tab = tabs.length && !tabs.includes(chosenTab) ? tabs[0]! : chosenTab;
  const listed = useMemo(() => referencesForTab(refs, tab, tabs.length), [refs, tab, tabs.length]);
  const unmatched = refs.filter((r) => !r.is_resolved);
  const showMapping = !extract?.requiresTableConfirmation && Boolean(catalog) && unmatched.length > 0;
  const suggestions = unmatched.filter((r) => r.ai_suggested_entity_id);
  const unmatchedServices = unmatched.filter((r) => r.reference_type === 'service').length;
  const unmatchedStaff = unmatched.filter((r) => r.reference_type === 'staff').length;
  const fresh = servicesLookFresh(refs, catalog);
  const staffNoun = staffNounFor(catalog);

  async function refreshResolved() {
    await loadSession();
  }

  async function resolveOnServer(ref: BookingReference, pick: string) {
    await api.resolveReference(sessionId, ref.id, {
      resolution_action: 'map',
      resolved_entity_id: pick,
      resolved_entity_type: entityTypeForReference(ref, catalog),
    });
  }

  async function applyMatch(ref: BookingReference) {
    const pick = selectByRef[ref.id] ?? ref.ai_suggested_entity_id ?? '';
    if (!pick) return;
    setBusyRef(ref.id);
    setError(null);
    try {
      await resolveOnServer(ref, pick);
      await refreshResolved();
    } catch (e) {
      setError(importErrorMessage(e, 'That match could not be saved. Please try again.'));
    }
    setBusyRef(null);
  }

  async function acceptAll() {
    setAcceptingAll(true);
    setError(null);
    let failures = 0;
    for (const ref of suggestions) {
      try {
        await resolveOnServer(ref, ref.ai_suggested_entity_id!);
      } catch {
        failures += 1;
      }
    }
    try {
      await refreshResolved();
    } catch {
      // The list catches up on the next change.
    }
    if (failures > 0) {
      setError(`${failures} ${failures === 1 ? 'suggestion' : 'suggestions'} could not be applied. Match ${failures === 1 ? 'it' : 'those'} below.`);
    }
    setAcceptingAll(false);
  }

  async function applySkip(ref: BookingReference) {
    setBusyRef(ref.id);
    setError(null);
    try {
      await api.resolveReference(sessionId, ref.id, { resolution_action: 'skip' });
      await refreshResolved();
    } catch (e) {
      setError(importErrorMessage(e, 'That could not be saved. Please try again.'));
    }
    setBusyRef(null);
  }

  async function applyCreate(ref: BookingReference) {
    const draft = createDraft[ref.id] ?? defaultCreateDraft(ref, defaults[ref.id]);
    setBusyRef(ref.id);
    setError(null);
    try {
      await api.resolveReference(sessionId, ref.id, createReferenceBody(ref, draft));
      setCreateOpen((prev) => ({ ...prev, [ref.id]: false }));
      await refreshResolved();
    } catch (e) {
      setError(importErrorMessage(e, 'That could not be created. Please try again.'));
    }
    setBusyRef(null);
  }

  async function confirmTable() {
    setConfirming(true);
    setError(null);
    try {
      await api.confirmTableUnassigned(sessionId);
      setExtract((prev) => (prev ? { ...prev, referencesResolved: true, requiresTableConfirmation: false } : prev));
      setResolvedFlag(true);
    } catch (e) {
      setError(importErrorMessage(e, 'That could not be saved. Please try again.'));
    }
    setConfirming(false);
  }

  function openBulk(type: 'service' | 'staff') {
    setBulkRows(bulkRowsFor(refs, type, defaults));
    setBulkResult(null);
    setBulkType(type);
  }

  async function runBulk() {
    if (!bulkType) return;
    const operations = bulkCreateOperations(bulkRows, bulkType, catalog);
    if (!operations.length) return;
    setBulkRunning(true);
    setError(null);
    try {
      const res = await api.bulkReferences(sessionId, operations);
      const errs = res.errors ?? [];
      setBulkResult({ created: res.created ?? 0, errors: errs });
      const failed = new Set(errs.map((e) => e.reference_id));
      setBulkRows((prev) => prev.filter((r) => failed.has(r.reference_id)));
      await refreshResolved();
      await loadCatalog();
    } catch (e) {
      setError(importErrorMessage(e, 'Those could not be created. Please try again.'));
    }
    setBulkRunning(false);
  }

  const bulkLabel = (type: 'service' | 'staff') => {
    if (type === 'service') return `Create ${unmatchedServices} new ${unmatchedServices === 1 ? 'service' : 'services'} from your bookings`;
    return `Add ${unmatchedStaff} new ${unmatchedStaff === 1 ? staffNoun : `${staffNoun}s`}`;
  };

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Set up services and staff</Text>
        <Text variant="bodySmall" tone="secondary">
          The services and staff named in your files are matched to what you already have on ResNeo. Anything we could
          not match can be added as new right here: a service just needs a length and a price. Finish this step before
          we check your rows.
        </Text>
      </View>
      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}

      {loading ? (
        <View style={importStyles.row} accessibilityRole="progressbar" accessibilityLabel="Reading your booking file">
          <ActivityIndicator color={colors.brand} />
          <View style={styles.flex}>
            <Text variant="bodySmall">Reading your booking file…</Text>
            <Text variant="caption" tone="muted">
              Large files can take a minute.
            </Text>
          </View>
        </View>
      ) : null}

      {!loading && extract ? (
        <Card padded>
          <View style={importStyles.stack}>
            <Text variant="bodySmall">{`Future booking rows: ${(extract.futureRowCount ?? 0).toLocaleString()}`}</Text>
            {(extract.insertedBookingRowCount ?? 0) > 0 ? (
              <Text variant="caption" tone="secondary">{`${extract.insertedBookingRowCount} rows are ready for the import.`}</Text>
            ) : null}
            {(extract.staffReferenceCount ?? 0) > 0 ? (
              <Text variant="caption" tone="secondary">
                {`We found ${extract.staffReferenceCount} staff ${extract.staffReferenceCount === 1 ? 'member' : 'members'} in your staff list. Match or add them under Staff below.`}
              </Text>
            ) : null}
            {extract.mode === 'no_future_rows' ? (
              <Text variant="caption" tone="secondary">
                No future-dated rows, so there is nothing to set up here.
              </Text>
            ) : null}
            {extract.mode === 'no_booking_date_mapping' ? (
              <Text variant="caption" tone="secondary">
                No column is mapped to Booking date, so matching was skipped. Map one on the Map step if you need it.
              </Text>
            ) : null}

            {extract.requiresTableConfirmation ? (
              <View style={importStyles.stack}>
                <Text variant="label">Table reservations</Text>
                <Text variant="bodySmall" tone="secondary">
                  Imported reservations use your default dining area. Table names in the file are not matched to your
                  floor plan; you can note them by hand after the import.
                </Text>
                <TickRow
                  label="I understand that table assignments from the file are not applied automatically."
                  checked={ack}
                  onChange={setAck}
                />
                <Button
                  label={confirming ? 'Saving…' : 'Confirm and continue'}
                  loading={confirming}
                  disabled={!ack || confirming || resolved}
                  onPress={() => void confirmTable()}
                />
              </View>
            ) : null}

            {!extract.requiresTableConfirmation && !catalog && catalogError && unmatched.length > 0 ? (
              <ImportBanner
                tone="warning"
                title="We could not load your services and staff"
                action={{
                  label: catalogRetrying ? 'Retrying…' : 'Try again',
                  loading: catalogRetrying,
                  onPress: () => {
                    setCatalogRetrying(true);
                    void loadCatalog().finally(() => setCatalogRetrying(false));
                  },
                }}>
                {`${catalogError} They are needed to match the items in your file. It is usually a brief network hiccup.`}
              </ImportBanner>
            ) : null}

            {showMapping && fresh && bulkType === null ? (
              <ImportBanner
                tone="info"
                title={`We found ${unmatchedServices} ${unmatchedServices === 1 ? 'service' : 'services'} in your bookings`}
                action={{ label: bulkLabel('service'), onPress: () => openBulk('service') }}>
                Set them all up in one step. We filled in a suggested length and price for each from your data, and you can
                change anything before they are created.
              </ImportBanner>
            ) : null}

            {showMapping ? (
              <View style={importStyles.stack}>
                {tabs.length === 0 ? (
                  <Text variant="caption" color={colors.warning}>
                    These items could not be grouped by type. Match or skip each one below.
                  </Text>
                ) : (
                  <View style={importStyles.row}>
                    {tabs.map((t) => (
                      <Chip key={t} label={referenceTabLabel(t)} selected={tab === t} onPress={() => setTab(t)} />
                    ))}
                  </View>
                )}

                {(tab === 'service' || tab === 'staff') &&
                bulkType === null &&
                (tab === 'service' ? unmatchedServices : unmatchedStaff) >= 2 &&
                !(tab === 'service' && fresh) ? (
                  <Button label={bulkLabel(tab)} variant="secondary" onPress={() => openBulk(tab)} />
                ) : null}

                <Text variant="caption" tone="secondary">
                  For each item: Match it to something you already have, Add it as new (a service asks for its length and
                  price), or Skip it to leave those bookings out of the import.
                </Text>
                {suggestions.length > 1 ? (
                  <Button
                    label={acceptingAll ? 'Accepting…' : `Accept all ${suggestions.length} suggestions`}
                    loading={acceptingAll}
                    disabled={acceptingAll}
                    onPress={() => void acceptAll()}
                  />
                ) : null}

                {listed.map((ref) => {
                  const opts = optionsForReference(ref, catalog);
                  const value = selectByRef[ref.id] ?? ref.ai_suggested_entity_id ?? '';
                  const valueName = opts.find((o) => o.id === value)?.name ?? (value === ref.ai_suggested_entity_id ? ref.ai_suggested_entity_name : null) ?? null;
                  const fromStaffList = ref.file_id ? fileTypeById[ref.file_id] === 'staff' : false;
                  const createLabel = createLabelForReference(ref, catalog);
                  const open = Boolean(createOpen[ref.id]);
                  const draft = createDraft[ref.id] ?? defaultCreateDraft(ref, defaults[ref.id]);
                  const busy = busyRef === ref.id;
                  const setDraft = (patch: Partial<CreateDraft>) => setCreateDraft((prev) => ({ ...prev, [ref.id]: { ...draft, ...patch } }));
                  return (
                    <Card key={ref.id} padded testID={`import-ref-${ref.id}`}>
                      <View style={importStyles.stack}>
                        <View style={importStyles.tight}>
                          <View style={importStyles.between}>
                            <Text variant="bodyMedium" style={styles.flex}>
                              {ref.raw_value}
                            </Text>
                            {ref.is_resolved ? <Badge label="Done" tone="success" /> : null}
                          </View>
                          <Text variant="caption" tone="muted">
                            {fromStaffList ? 'From your staff list' : `${ref.booking_count ?? 0} ${(ref.booking_count ?? 0) === 1 ? 'booking' : 'bookings'}`}
                            {ref.ai_confidence && ref.ai_suggested_entity_id
                              ? `. Suggested match: ${ref.ai_suggested_entity_name ?? 'one of yours'} (${ref.ai_confidence})`
                              : ''}
                          </Text>
                        </View>
                        {!ref.is_resolved ? (
                          <>
                            <SelectField
                              value={valueName}
                              placeholder="Choose a match"
                              accessibilityLabel={`Match "${ref.raw_value}"`}
                              disabled={busy}
                              onPress={() => setPickingFor(ref)}
                            />
                            <View style={importStyles.row}>
                              <Button label={busy && value ? 'Matching…' : 'Match'} size="sm" disabled={busy || !value} onPress={() => void applyMatch(ref)} />
                              {createLabel ? (
                                <Button
                                  label={createLabel}
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  onPress={() => {
                                    setCreateDraft((prev) => ({ ...prev, [ref.id]: prev[ref.id] ?? defaultCreateDraft(ref, defaults[ref.id]) }));
                                    setCreateOpen((prev) => ({ ...prev, [ref.id]: !prev[ref.id] }));
                                  }}
                                />
                              ) : null}
                              <Button label="Skip" size="sm" variant="ghost" disabled={busy} onPress={() => void applySkip(ref)} />
                            </View>
                            {open && createLabel ? (
                              <View style={[styles.create, { borderColor: colors.success }]}>
                                <Input label="Name" value={draft.name} onChangeText={(name) => setDraft({ name })} />
                                {ref.reference_type === 'service' ? (
                                  <View style={styles.pair}>
                                    <Input
                                      label="Length (minutes)"
                                      value={draft.duration}
                                      keyboardType="number-pad"
                                      placeholder="60"
                                      containerStyle={styles.flex}
                                      onChangeText={(duration) => setDraft({ duration })}
                                    />
                                    <Input
                                      label={`Price (${currencySymbol})`}
                                      value={draft.price}
                                      keyboardType="decimal-pad"
                                      placeholder="0.00"
                                      containerStyle={styles.flex}
                                      onChangeText={(price) => setDraft({ price })}
                                    />
                                  </View>
                                ) : null}
                                <Text variant="caption" tone="secondary">
                                  {ref.reference_type === 'service'
                                    ? 'Creates a bookable service. Online booking, categories and deposits can be set later under Services.'
                                    : 'Creates a bookable calendar with default working hours. Fine-tune it later under Calendars.'}
                                </Text>
                                <Button
                                  label={busy ? 'Creating…' : createLabel}
                                  loading={busy}
                                  disabled={busy || !draft.name.trim()}
                                  onPress={() => void applyCreate(ref)}
                                />
                              </View>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    </Card>
                  );
                })}
                {listed.length === 0 ? (
                  <Text variant="caption" tone="muted">
                    Nothing left in this list.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {resolved && !extract.requiresTableConfirmation ? (
              <ImportBanner tone="success" title="Everything is matched up">
                Your services and staff are all set for this import. Continue when you are ready.
              </ImportBanner>
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={importStyles.between}>
        <Button label="Back" variant="secondary" onPress={() => router.replace(importStepRoute(sessionId, 'review'))} />
        <Button label="Continue to Validate" disabled={!resolved} onPress={() => router.push(importStepRoute(sessionId, 'validate'))} />
      </View>

      <OptionPickerSheet
        visible={pickingFor !== null}
        title={pickingFor ? `Match "${pickingFor.raw_value}"` : ''}
        subtitle={pickingFor ? `To one of your ${referenceTabLabel(pickingFor.reference_type).toLowerCase()}` : null}
        options={(pickingFor ? optionsForReference(pickingFor, catalog) : []).map((o) => ({ value: o.id, label: o.name }))}
        selected={pickingFor ? (selectByRef[pickingFor.id] ?? pickingFor.ai_suggested_entity_id ?? null) : null}
        onPick={(value) => {
          if (pickingFor && value) setSelectByRef((prev) => ({ ...prev, [pickingFor.id]: value }));
          setPickingFor(null);
        }}
        onClose={() => setPickingFor(null)}
      />

      <BulkCreateSheet
        visible={bulkType !== null}
        type={bulkType ?? 'service'}
        rows={bulkRows}
        running={bulkRunning}
        result={bulkResult}
        currencySymbol={currencySymbol}
        staffNoun={staffNoun}
        onPatchRow={(id, patch) => setBulkRows((prev) => prev.map((r) => (r.reference_id === id ? { ...r, ...patch } : r)))}
        onToggleAll={(selected) => setBulkRows((prev) => prev.map((r) => ({ ...r, selected })))}
        onRun={() => void runBulk()}
        onClose={() => {
          setBulkType(null);
          setBulkRows([]);
          setBulkResult(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  create: { borderWidth: 1, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
});
