/**
 * MergeContactDetailSheet — admin-only 4-step merge wizard launched from the
 * contact detail screen.
 *
 * Step 1: Search & pick the duplicate to merge with the current contact.
 * Step 2: Choose which record is the surviving (target) contact.
 * Step 3: Field-by-field conflict resolution.
 * Step 4: Confirm summary + submit.
 *
 * On success: the survivor's id is surfaced via `onMerged(survivorId)`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useMergeGuests } from '@/lib/queries/useContactsBulk';
import { useGuests } from '@/lib/queries/useGuests';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestDetailProfile } from '@/types/guest-detail';
import type { GuestListItem } from '@/types/guest-list';
import type { MergeFieldMap, MergedProfile } from '@/types/guest-merge';

// ─── types ────────────────────────────────────────────────────────────────────

type FieldSource = 'target' | 'source';
type TagsMode = 'union' | 'target' | 'source';
type MergeStep = 1 | 2 | 3 | 4;

interface FieldChoices {
  first_name: FieldSource;
  last_name: FieldSource;
  email: FieldSource;
  phone: FieldSource;
  customer_profile_notes: FieldSource;
  tags: TagsMode;
  marketing: FieldSource;
}

function defaultChoices(): FieldChoices {
  return {
    first_name: 'target',
    last_name: 'target',
    email: 'target',
    phone: 'target',
    customer_profile_notes: 'target',
    tags: 'union',
    marketing: 'target',
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function displayVal(v: string | null | undefined): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : '—';
}

function guestName(g: GuestDetailProfile | GuestListItem | null | undefined): string {
  if (!g) return 'Unnamed';
  const parts = [g.first_name, g.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

function marketingLabel(optOut: boolean, consent: boolean): string {
  if (optOut) return 'Opted out';
  if (consent) return 'Subscribed';
  return 'No record';
}

function buildMergedProfile(
  target: GuestDetailProfile,
  source: GuestDetailProfile,
  c: FieldChoices,
): MergedProfile {
  const pick = (which: FieldSource, t: string | null, s: string | null): string =>
    (which === 'target' ? t ?? '' : s ?? '').trim();

  let tags: string[];
  if (c.tags === 'union') {
    tags = [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])].sort((a, b) =>
      a.localeCompare(b),
    );
  } else if (c.tags === 'target') {
    tags = [...(target.tags ?? [])];
  } else {
    tags = [...(source.tags ?? [])];
  }

  const notesRaw = pick(c.customer_profile_notes, target.customer_profile_notes, source.customer_profile_notes);
  const customer_profile_notes = notesRaw.length > 0 ? notesRaw : null;

  return {
    first_name: pick(c.first_name, target.first_name, source.first_name) || null,
    last_name: pick(c.last_name, target.last_name, source.last_name) || null,
    email: pick(c.email, target.email, source.email) || null,
    phone: pick(c.phone, target.phone, source.phone) || null,
    customer_profile_notes,
    tags,
    marketing_consent: c.marketing === 'target' ? target.marketing_consent : source.marketing_consent,
    marketing_opt_out: c.marketing === 'target' ? target.marketing_opt_out : source.marketing_opt_out,
  };
}

function buildFieldMap(c: FieldChoices): MergeFieldMap {
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    customer_profile_notes: c.customer_profile_notes,
    tags: c.tags,
    marketing_consent: c.marketing,
  };
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** A radio-style card for picking between two contact values. */
function FieldPickRow({
  label,
  targetLabel,
  sourceLabel,
  targetValue,
  sourceValue,
  picked,
  onChange,
}: {
  label: string;
  targetLabel: string;
  sourceLabel: string;
  targetValue: string;
  sourceValue: string;
  picked: FieldSource;
  onChange: (next: FieldSource) => void;
}) {
  const { colors } = useTheme();
  const valuesMatch = targetValue === sourceValue;

  return (
    <View style={styles.fieldSection}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      {valuesMatch ? (
        <View
          style={[
            styles.radioCard,
            { borderColor: colors.brand, backgroundColor: colors.surfaceRaised },
          ]}>
          <Text variant="bodySmall">{targetValue}</Text>
          <Text variant="caption" tone="muted">
            Same on both records
          </Text>
        </View>
      ) : (
        <View style={styles.radioRow}>
          <RadioCard
            isSelected={picked === 'target'}
            onPress={() => onChange('target')}
            title={targetLabel}
            value={targetValue}
          />
          <RadioCard
            isSelected={picked === 'source'}
            onPress={() => onChange('source')}
            title={sourceLabel}
            value={sourceValue}
          />
        </View>
      )}
    </View>
  );
}

function RadioCard({
  isSelected,
  onPress,
  title,
  value,
}: {
  isSelected: boolean;
  onPress: () => void;
  title: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[
        styles.radioCard,
        styles.radioCardHalf,
        {
          borderColor: isSelected ? colors.brand : colors.border,
          backgroundColor: isSelected ? colors.brandSubtle : colors.surfaceRaised,
        },
      ]}>
      <View style={styles.radioIndicatorRow}>
        <View
          style={[
            styles.radioOuter,
            { borderColor: isSelected ? colors.brand : colors.borderStrong },
          ]}>
          {isSelected ? (
            <View style={[styles.radioInner, { backgroundColor: colors.brand }]} />
          ) : null}
        </View>
        <Text variant="label" numberOfLines={1} style={styles.flex1}>
          {title}
        </Text>
      </View>
      <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
        {value}
      </Text>
    </Pressable>
  );
}

/** A compact contact summary card. */
function ContactCard({
  guest,
  role,
  isSelected,
  onPress,
}: {
  guest: GuestDetailProfile;
  role: string;
  isSelected: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const name = guestName(guest);

  const inner = (
    <View
      style={[
        styles.contactCard,
        {
          borderColor: isSelected ? colors.brand : colors.border,
          backgroundColor: isSelected ? colors.brandSubtle : colors.surfaceRaised,
        },
      ]}>
      <View style={styles.contactCardHeader}>
        <Avatar name={name} size={40} />
        <View style={styles.flex1}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {guest.visit_count} visit{guest.visit_count === 1 ? '' : 's'}
            {guest.email ? ` · ${guest.email}` : ''}
          </Text>
        </View>
        {isSelected ? (
          <View style={[styles.keepPill, { backgroundColor: colors.brand }]}>
            <Text variant="caption" color={colors.onBrand}>
              Keep
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" tone="brand">
        {role}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/** A result row in the search list. */
function SearchResultRow({
  item,
  isSelected,
  onPress,
}: {
  item: GuestListItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const name = guestName(item);
  const sub = [item.email, item.phone].filter(Boolean).join(' · ') || 'No email or phone';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.searchRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: isSelected
            ? colors.brandSubtle
            : pressed
              ? colors.surface
              : colors.surfaceRaised,
        },
      ]}>
      <Avatar name={name} size={36} />
      <View style={styles.flex1}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.visit_count} visit{item.visit_count === 1 ? '' : 's'} · {sub}
        </Text>
      </View>
      {isSelected ? (
        <Text variant="caption" tone="brand">
          Selected
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── step headers ─────────────────────────────────────────────────────────────

function StepHeader({ step, total = 4 }: { step: MergeStep; total?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepDots}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              {
                backgroundColor:
                  i + 1 === step
                    ? colors.brand
                    : i + 1 < step
                      ? colors.accent
                      : colors.border,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        Step {step} of {total}
      </Text>
    </View>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

export interface MergeContactDetailSheetProps {
  /** The contact currently open on the detail screen — always one side of the merge. */
  currentGuestId: string;
  /** Pre-loaded profile for the current contact. */
  currentGuest: GuestDetailProfile;
  visible: boolean;
  onClose: () => void;
  /** Called with the surviving guest id after a successful merge. */
  onMerged: (survivorId: string) => void;
}

/**
 * Admin-only bottom sheet wizard for merging two contact records.
 *
 * The sheet uses the `fill` tall-scroll mode so all four steps render inside a
 * single scrollable sheet body without overflowing.
 */
export function MergeContactDetailSheet({
  currentGuestId,
  currentGuest,
  visible,
  onClose,
  onMerged,
}: MergeContactDetailSheetProps) {
  const { colors } = useTheme();
  const mergeMutation = useMergeGuests();

  // ── step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<MergeStep>(1);

  // ── step 1: search ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedListItem, setSelectedListItem] = useState<GuestListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const searchQuery = useGuests({
    search: debouncedSearch,
    filter: 'all',
    page: 0,
    limit: 25,
  });

  const searchResults: GuestListItem[] = useMemo(
    () => (searchQuery.data?.guests ?? []).filter((g) => g.id !== currentGuestId),
    [searchQuery.data, currentGuestId],
  );

  // ── source guest detail ─────────────────────────────────────────────────────
  const sourceDetailQuery = useGuestDetail(selectedListItem?.id ?? null);
  const sourceGuest = sourceDetailQuery.data?.guest ?? null;

  // ── step 2: target selection ─────────────────────────────────────────────────
  // 'current' means the already-open contact is the keeper; 'source' means the
  // found contact is the keeper.
  const [keepSide, setKeepSide] = useState<'current' | 'source'>('current');

  // ── step 3: field choices ───────────────────────────────────────────────────
  const [choices, setChoices] = useState<FieldChoices>(defaultChoices());

  // When the user enters step 3 we know who is target and who is source.
  // `target` is always whichever profile survives; `source` is deleted.
  const targetGuest: GuestDetailProfile | null =
    keepSide === 'current' ? currentGuest : sourceGuest;
  const mergeFromGuest: GuestDetailProfile | null =
    keepSide === 'current' ? sourceGuest : currentGuest;

  const targetId = keepSide === 'current' ? currentGuestId : (selectedListItem?.id ?? '');
  const sourceId = keepSide === 'current' ? (selectedListItem?.id ?? '') : currentGuestId;

  // ── step 4: merged preview ──────────────────────────────────────────────────
  const mergedProfile = useMemo((): MergedProfile | null => {
    if (!targetGuest || !mergeFromGuest) return null;
    return buildMergedProfile(targetGuest, mergeFromGuest, choices);
  }, [targetGuest, mergeFromGuest, choices]);

  // ── submission ──────────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!mergedProfile || !targetId || !sourceId) return;
    setSubmitError(null);
    try {
      await mergeMutation.mutateAsync({
        target_guest_id: targetId,
        source_guest_ids: [sourceId],
        merged_profile: mergedProfile,
        field_map: buildFieldMap(choices),
      });
      hapticSuccess();
      Alert.alert(
        'Contacts merged',
        `Booking history now lives on ${guestName(targetGuest ?? undefined)}.`,
        [{ text: 'OK', onPress: () => onMerged(targetId) }],
      );
    } catch (e) {
      hapticWarning();
      const msg = e instanceof ApiError ? e.message : 'Merge failed. Please try again.';
      setSubmitError(msg);
    }
  }

  // ── reset on close ──────────────────────────────────────────────────────────
  function handleClose() {
    if (mergeMutation.isPending) return;
    setStep(1);
    setSearch('');
    setDebouncedSearch('');
    setSelectedListItem(null);
    setKeepSide('current');
    setChoices(defaultChoices());
    setSubmitError(null);
    onClose();
  }

  // ── navigation ──────────────────────────────────────────────────────────────
  function goBack() {
    setSubmitError(null);
    if (step === 1) { handleClose(); return; }
    if (step === 2) { setStep(1); return; }
    if (step === 3) { setStep(2); return; }
    setStep(3);
  }

  function goNext() {
    if (step === 1 && selectedListItem && sourceGuest) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  }

  const canGoNextStep1 = Boolean(selectedListItem && sourceGuest && !sourceDetailQuery.isLoading);
  const canGoNextStep3 = Boolean(targetGuest && mergeFromGuest);

  // Labels depend on which side the user chose to keep
  const targetLabel = keepSide === 'current' ? 'This contact (kept)' : 'Other contact (kept)';
  const sourceLabel = keepSide === 'current' ? 'Other contact (removed)' : 'This contact (removed)';

  return (
    <Sheet visible={visible} onClose={handleClose} fill maxHeight="92%">
      {/* Scrollable body */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.titleRow}>
          <View style={styles.flex1}>
            <Text variant="heading">Merge duplicate</Text>
            <Text variant="bodySmall" tone="muted">
              Admin only · Cannot be undone
            </Text>
          </View>
          <StepHeader step={step} />
        </View>

        {/* ── STEP 1: Search & pick duplicate ─────────────────────────────── */}
        {step === 1 ? (
          <View style={styles.stepBody}>
            <Text variant="bodySmall" tone="secondary">
              Search for the duplicate profile to merge. That record will be removed; its history moves to the kept contact.
            </Text>

            <Input
              label="Search by name, email, or phone"
              value={search}
              onChangeText={setSearch}
              placeholder="At least 2 characters…"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            {/* Results list */}
            <View
              style={[
                styles.resultsList,
                { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
              ]}>
              {searchQuery.isFetching ? (
                <View style={styles.centeredRow}>
                  <ActivityIndicator color={colors.brand} />
                  <Text variant="bodySmall" tone="muted">
                    Searching…
                  </Text>
                </View>
              ) : debouncedSearch.length === 0 ? (
                <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                  Start typing to search contacts.
                </Text>
              ) : debouncedSearch.length < 2 ? (
                <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                  Type at least 2 characters.
                </Text>
              ) : searchResults.length === 0 ? (
                <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                  No matches found.
                </Text>
              ) : (
                searchResults.map((item) => (
                  <SearchResultRow
                    key={item.id}
                    item={item}
                    isSelected={selectedListItem?.id === item.id}
                    onPress={() => setSelectedListItem(item)}
                  />
                ))
              )}
            </View>

            {/* Loading the source detail */}
            {selectedListItem && sourceDetailQuery.isLoading ? (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} size="small" />
                <Text variant="bodySmall" tone="muted">
                  Loading contact details…
                </Text>
              </View>
            ) : null}

            {selectedListItem && sourceDetailQuery.isError ? (
              <Text variant="bodySmall" tone="danger">
                Could not load that contact. Please try another.
              </Text>
            ) : null}

            {selectedListItem && sourceGuest ? (
              <View
                style={[
                  styles.selectedBanner,
                  { backgroundColor: colors.successSurface, borderColor: colors.success },
                ]}>
                <Text variant="label" tone="success">
                  Selected: {guestName(sourceGuest)}
                </Text>
                <Text variant="caption" tone="secondary">
                  {sourceGuest.email ?? sourceGuest.phone ?? 'No contact info'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── STEP 2: Choose surviving record ──────────────────────────────── */}
        {step === 2 && sourceGuest ? (
          <View style={styles.stepBody}>
            <Text variant="bodySmall" tone="secondary">
              Choose which record to keep. The other contact is permanently deleted — its bookings, history and loyalty move to the keeper.
            </Text>

            <ContactCard
              guest={currentGuest}
              role="Currently open contact"
              isSelected={keepSide === 'current'}
              onPress={() => setKeepSide('current')}
            />
            <ContactCard
              guest={sourceGuest}
              role="Found via search"
              isSelected={keepSide === 'source'}
              onPress={() => setKeepSide('source')}
            />

            <View
              style={[
                styles.warningBox,
                { backgroundColor: colors.warningSurface, borderColor: colors.warning },
              ]}>
              <Text variant="caption" tone="secondary">
                Booking guest snapshots (names on past confirmations) are not rewritten — only the linked guest record changes.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── STEP 3: Field-level conflict resolution ──────────────────────── */}
        {step === 3 && targetGuest && mergeFromGuest ? (
          <View style={styles.stepBody}>
            <Text variant="bodySmall" tone="secondary">
              Choose which values to keep on the surviving profile. Tags can be combined automatically.
            </Text>

            <FieldPickRow
              label="First name"
              targetLabel={targetLabel}
              sourceLabel={sourceLabel}
              targetValue={displayVal(targetGuest.first_name)}
              sourceValue={displayVal(mergeFromGuest.first_name)}
              picked={choices.first_name}
              onChange={(v) => setChoices((c) => ({ ...c, first_name: v }))}
            />

            <FieldPickRow
              label="Last name"
              targetLabel={targetLabel}
              sourceLabel={sourceLabel}
              targetValue={displayVal(targetGuest.last_name)}
              sourceValue={displayVal(mergeFromGuest.last_name)}
              picked={choices.last_name}
              onChange={(v) => setChoices((c) => ({ ...c, last_name: v }))}
            />

            <FieldPickRow
              label="Email"
              targetLabel={targetLabel}
              sourceLabel={sourceLabel}
              targetValue={displayVal(targetGuest.email)}
              sourceValue={displayVal(mergeFromGuest.email)}
              picked={choices.email}
              onChange={(v) => setChoices((c) => ({ ...c, email: v }))}
            />

            <FieldPickRow
              label="Phone"
              targetLabel={targetLabel}
              sourceLabel={sourceLabel}
              targetValue={displayVal(targetGuest.phone)}
              sourceValue={displayVal(mergeFromGuest.phone)}
              picked={choices.phone}
              onChange={(v) => setChoices((c) => ({ ...c, phone: v }))}
            />

            <FieldPickRow
              label="Profile notes (staff-visible)"
              targetLabel={targetLabel}
              sourceLabel={sourceLabel}
              targetValue={displayVal(targetGuest.customer_profile_notes)}
              sourceValue={displayVal(mergeFromGuest.customer_profile_notes)}
              picked={choices.customer_profile_notes}
              onChange={(v) => setChoices((c) => ({ ...c, customer_profile_notes: v }))}
            />

            {/* Tags */}
            <View style={styles.fieldSection}>
              <Text variant="label" tone="secondary">
                Tags
              </Text>
              <View style={styles.tagsOptions}>
                {(
                  [
                    {
                      id: 'union' as const,
                      title: 'Combine both',
                      sub: 'Union of tags from both profiles (sorted A–Z)',
                    },
                    {
                      id: 'target' as const,
                      title: `${keepSide === 'current' ? 'This contact only' : 'Other contact only'}`,
                      sub: displayVal((targetGuest.tags ?? []).join(', ') || undefined),
                    },
                    {
                      id: 'source' as const,
                      title: `${keepSide === 'current' ? 'Other contact only' : 'This contact only'}`,
                      sub: displayVal((mergeFromGuest.tags ?? []).join(', ') || undefined),
                    },
                  ] satisfies { id: TagsMode; title: string; sub: string }[]
                ).map((opt) => (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: choices.tags === opt.id }}
                    onPress={() => setChoices((c) => ({ ...c, tags: opt.id }))}
                    style={[
                      styles.radioCard,
                      {
                        borderColor: choices.tags === opt.id ? colors.brand : colors.border,
                        backgroundColor:
                          choices.tags === opt.id ? colors.brandSubtle : colors.surfaceRaised,
                      },
                    ]}>
                    <View style={styles.radioIndicatorRow}>
                      <View
                        style={[
                          styles.radioOuter,
                          {
                            borderColor:
                              choices.tags === opt.id ? colors.brand : colors.borderStrong,
                          },
                        ]}>
                        {choices.tags === opt.id ? (
                          <View style={[styles.radioInner, { backgroundColor: colors.brand }]} />
                        ) : null}
                      </View>
                      <Text variant="label" style={styles.flex1}>
                        {opt.title}
                      </Text>
                    </View>
                    <Text variant="caption" tone="muted">
                      {opt.sub}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Marketing */}
            <View style={styles.fieldSection}>
              <Text variant="label" tone="secondary">
                Marketing preferences
              </Text>
              <View style={styles.radioRow}>
                <RadioCard
                  isSelected={choices.marketing === 'target'}
                  onPress={() => setChoices((c) => ({ ...c, marketing: 'target' }))}
                  title={targetLabel}
                  value={marketingLabel(targetGuest.marketing_opt_out, targetGuest.marketing_consent)}
                />
                <RadioCard
                  isSelected={choices.marketing === 'source'}
                  onPress={() => setChoices((c) => ({ ...c, marketing: 'source' }))}
                  title={sourceLabel}
                  value={marketingLabel(mergeFromGuest.marketing_opt_out, mergeFromGuest.marketing_consent)}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* ── STEP 4: Confirm summary ───────────────────────────────────────── */}
        {step === 4 && mergedProfile && targetGuest && mergeFromGuest ? (
          <View style={styles.stepBody}>
            <Text variant="bodySmall" tone="secondary">
              Review the merged profile before confirming. This action cannot be undone.
            </Text>

            {/* Side-by-side identities */}
            <View style={styles.summaryIdentities}>
              <View
                style={[
                  styles.summaryIdentityChip,
                  { backgroundColor: colors.successSurface, borderColor: colors.success },
                ]}>
                <Avatar name={guestName(targetGuest)} size={28} />
                <View style={styles.flex1}>
                  <Text variant="label" numberOfLines={1}>
                    {guestName(targetGuest)}
                  </Text>
                  <Text variant="caption" tone="success">
                    Kept
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.summaryIdentityChip,
                  { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
                ]}>
                <Avatar name={guestName(mergeFromGuest)} size={28} />
                <View style={styles.flex1}>
                  <Text variant="label" numberOfLines={1}>
                    {guestName(mergeFromGuest)}
                  </Text>
                  <Text variant="caption" tone="danger">
                    Removed
                  </Text>
                </View>
              </View>
            </View>

            {/* Merged profile preview */}
            <Card>
              <Text variant="label" style={styles.previewTitle}>
                Merged profile
              </Text>
              <View style={styles.previewGrid}>
                <PreviewRow label="First name" value={displayVal(mergedProfile.first_name)} />
                <PreviewRow label="Last name" value={displayVal(mergedProfile.last_name)} />
                <PreviewRow label="Email" value={displayVal(mergedProfile.email)} />
                <PreviewRow label="Phone" value={displayVal(mergedProfile.phone)} />
                <PreviewRow
                  label="Notes"
                  value={displayVal(mergedProfile.customer_profile_notes)}
                />
                <PreviewRow
                  label="Tags"
                  value={
                    mergedProfile.tags && mergedProfile.tags.length > 0
                      ? mergedProfile.tags.join(', ')
                      : '—'
                  }
                />
                <PreviewRow
                  label="Marketing"
                  value={marketingLabel(
                    Boolean(mergedProfile.marketing_opt_out),
                    Boolean(mergedProfile.marketing_consent),
                  )}
                />
              </View>
            </Card>

            {submitError ? (
              <Text variant="bodySmall" tone="danger">
                {submitError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Fixed bottom actions */}
      <View
        style={[
          styles.actions,
          { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised },
        ]}>
        <Button
          label={step === 1 ? 'Cancel' : 'Back'}
          variant="secondary"
          style={styles.actionFlex}
          disabled={mergeMutation.isPending}
          onPress={goBack}
        />

        {step === 1 ? (
          <Button
            label="Continue"
            style={styles.actionFlex}
            disabled={!canGoNextStep1}
            onPress={goNext}
          />
        ) : null}

        {step === 2 ? (
          <Button
            label="Resolve fields"
            style={styles.actionFlex}
            onPress={goNext}
          />
        ) : null}

        {step === 3 ? (
          <Button
            label="Review"
            style={styles.actionFlex}
            disabled={!canGoNextStep3}
            onPress={goNext}
          />
        ) : null}

        {step === 4 ? (
          <Button
            label={mergeMutation.isPending ? 'Merging…' : 'Merge now'}
            variant="danger"
            style={styles.actionFlex}
            loading={mergeMutation.isPending}
            disabled={mergeMutation.isPending}
            onPress={() => void handleSubmit()}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

// ─── tiny helper sub-component ────────────────────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text variant="caption" tone="muted" style={styles.previewLabel}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.previewValue}>
        {value}
      </Text>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.base,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  stepHeader: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  stepDots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  stepBody: {
    gap: spacing.base,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },

  // search results
  resultsList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyHint: {
    padding: spacing.base,
    textAlign: 'center',
  },
  centeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.base,
  },
  selectedBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },

  // contact cards (step 2)
  contactCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  contactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  keepPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },

  // radio cards (step 3)
  fieldSection: {
    gap: spacing.sm,
  },
  radioRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  radioCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  radioCardHalf: {
    flex: 1,
    minWidth: 0,
  },
  radioIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  tagsOptions: {
    gap: spacing.sm,
  },

  // warning / info boxes
  warningBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },

  // step 4 summary
  summaryIdentities: {
    gap: spacing.sm,
  },
  summaryIdentityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  previewTitle: {
    marginBottom: spacing.md,
  },
  previewGrid: {
    gap: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewLabel: {
    width: 96,
    flexShrink: 0,
  },
  previewValue: {
    flex: 1,
    minWidth: 0,
  },

  // bottom action bar
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionFlex: {
    flex: 1,
  },
});
