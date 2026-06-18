import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { spacing } from '@/theme/index';

// Per-option helper hints mirror the web `CONTACTS_SEGMENT_OPTIONS` descriptions
// (src/lib/guests/contacts-constants.ts) so the mobile filter explains each
// smart list the same way the dashboard does. Shown under the selected option.
const SEGMENT_OPTIONS = [
  { value: 'all', label: 'Everyone', hint: 'No extra rules. Show everyone allowed by Who to include above.' },
  {
    value: 'new',
    label: 'New this period',
    hint: 'Added within your dates below. Leave dates blank to use this calendar month through today.',
  },
  {
    value: 'upcoming',
    label: 'Upcoming visit',
    hint: 'Must have a future booking in the date range below. Leave dates blank to look one year ahead from today.',
  },
  {
    value: 'visit',
    label: 'By last visit',
    hint: 'Only contacts with a saved last visit date in the range below (completed visits through today). Set at least one date.',
  },
  {
    value: 'marketing',
    label: 'Marketing consent',
    hint: 'Filter by subscribed or not. Optionally narrow by when consent was recorded.',
  },
  {
    value: 'last_staff',
    label: 'By last staff',
    hint: 'Their latest booking used this staff member. Optionally narrow by when that booking happened.',
  },
  {
    value: 'last_service',
    label: 'By last service',
    hint: 'Their latest booking included this service. Optionally narrow by when that booking happened.',
  },
  {
    value: 'tag',
    label: 'By tag',
    hint: 'Show contacts who have a specific tag. Pick a suggestion or type any tag; matching is not case sensitive.',
  },
] as const;

// Identity-scope hints mirror the web `CONTACT_SHOW_OPTIONS` hint copy
// (ContactsDashboard.tsx) — labels stay app-native, hints are at parity.
const IDENTITY_OPTIONS = [
  {
    value: 'identified',
    label: 'With contact details',
    hint: 'People with a name plus email or phone you can reach.',
  },
  { value: 'all', label: 'All', hint: 'Everyone we can recognise. Anonymous walk-ins stay hidden.' },
  {
    value: 'anonymous',
    label: 'Anonymous only',
    hint: 'Guests without saved contact details (useful for reviewing anonymous visits).',
  },
] as const;

/** Resolve the hint copy for the currently-selected option in an option list. */
function selectedHint(
  options: ReadonlyArray<{ value: string; hint: string }>,
  value: string,
): string | null {
  return options.find((o) => o.value === value)?.hint ?? null;
}

// The backend only accepts `subscribed | not_subscribed` and silently defaults
// to `subscribed` for anything else — so the previous opted_in/opted_out/no_record
// options returned WRONG contacts. These two values are the only valid ones.
const MARKETING_OPTIONS = [
  { value: 'subscribed', label: 'Subscribed' },
  { value: 'not_subscribed', label: 'Not subscribed' },
] as const;

/** Migrate persisted/legacy marketing values onto the backend's two accepted ones. */
function normaliseMarketing(value: string): string {
  if (value === 'not_subscribed' || value === 'opted_out' || value === 'no_record') {
    return 'not_subscribed';
  }
  // '' | 'subscribed' | 'opted_in' (and anything unknown) → subscribed default.
  return 'subscribed';
}

/** Today as YYYY-MM-DD — the picker's starting position when a bound is unset. */
function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type ContactFilterState = {
  segment: string;
  segmentTag: string;
  filter: string;
  date_from: string;
  date_to: string;
  marketing: string;
  last_staff_id: string;
  last_service_id: string;
};

export const DEFAULT_FILTER_STATE: ContactFilterState = {
  segment: 'all',
  segmentTag: '',
  filter: 'identified',
  date_from: '',
  date_to: '',
  marketing: '',
  last_staff_id: '',
  last_service_id: '',
};

type ContactFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: ContactFilterState;
  onApply: (state: ContactFilterState) => void;
  availableTags?: string[];
};

/**
 * Advanced filter sheet — Smart-list segments, identity scope, date range,
 * marketing consent, and last-staff / last-service pickers.
 */
export function ContactFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  availableTags = [],
}: ContactFilterSheetProps) {
  const [draft, setDraft] = useState<ContactFilterState>(value);

  // Sync draft to the committed value whenever the sheet is opened.
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const segmentNeedsDateRange = ['new', 'upcoming', 'visit', 'marketing'].includes(draft.segment);
  const segmentNeedsMarketing = draft.segment === 'marketing';
  const segmentNeedsTag = draft.segment === 'tag';
  const segmentNeedsStaff = draft.segment === 'last_staff';
  const segmentNeedsService = draft.segment === 'last_service';

  // Picker's starting position when a bound is unset; recomputed each open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayIso = useMemo(() => todayIsoDate(), [visible]);

  // Roster + service catalog only fetched while a picker is on screen.
  const practitionersQuery = usePractitioners({ enabled: visible && segmentNeedsStaff });
  const servicesQuery = useManagedServices();
  const practitioners = practitionersQuery.data?.practitioners ?? [];
  const services = useMemo(
    () => (servicesQuery.data?.services ?? []).filter((s) => s.is_active !== false),
    [servicesQuery.data],
  );

  // The native date picker can only emit a valid YYYY-MM-DD, so the only range
  // problem left to guard is an inverted From/To — block Apply on that.
  const rangeError =
    draft.date_from && draft.date_to && draft.date_from > draft.date_to
      ? 'From date is after To date'
      : null;
  const dateValid = segmentNeedsDateRange ? !rangeError : true;

  function handleApply() {
    if (!dateValid) return;
    onApply(draft);
    onClose();
  }

  function handleReset() {
    const reset = { ...DEFAULT_FILTER_STATE };
    setDraft(reset);
    onApply(reset);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="92%">
      <View style={styles.header}>
        <Text variant="subheading">Filter contacts</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Identity scope */}
        <View style={styles.section}>
          <Text variant="label">Who to include</Text>
          <View style={styles.chipRow}>
            {IDENTITY_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={draft.filter === opt.value}
                onPress={() => setDraft((d) => ({ ...d, filter: opt.value }))}
              />
            ))}
          </View>
          {selectedHint(IDENTITY_OPTIONS, draft.filter) ? (
            <Text variant="caption" tone="muted">
              {selectedHint(IDENTITY_OPTIONS, draft.filter)}
            </Text>
          ) : null}
        </View>

        {/* Smart-list segment */}
        <View style={styles.section}>
          <Text variant="label">Smart list</Text>
          <View style={styles.chipRow}>
            {SEGMENT_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={draft.segment === opt.value}
                onPress={() =>
                  setDraft((d) => ({
                    ...d,
                    segment: opt.value,
                    segmentTag: '',
                    date_from: '',
                    date_to: '',
                    // Default marketing to the backend's `subscribed` when the
                    // marketing segment is chosen (web parity).
                    marketing: opt.value === 'marketing' ? 'subscribed' : '',
                    last_staff_id: '',
                    last_service_id: '',
                  }))
                }
              />
            ))}
          </View>
          {selectedHint(SEGMENT_OPTIONS, draft.segment) ? (
            <Text variant="caption" tone="muted">
              {selectedHint(SEGMENT_OPTIONS, draft.segment)}
            </Text>
          ) : null}
        </View>

        {/* Tag picker for tag segment */}
        {segmentNeedsTag ? (
          <View style={styles.section}>
            <Text variant="label">Tag</Text>
            {availableTags.length > 0 ? (
              <View style={styles.chipRow}>
                {availableTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    selected={draft.segmentTag === tag}
                    onPress={() => setDraft((d) => ({ ...d, segmentTag: tag }))}
                  />
                ))}
              </View>
            ) : null}
            <Input
              label="Tag (type any)"
              value={draft.segmentTag}
              onChangeText={(v) => setDraft((d) => ({ ...d, segmentTag: v }))}
              autoCapitalize="none"
              placeholder="e.g. vip"
            />
          </View>
        ) : null}

        {/* Last staff picker */}
        {segmentNeedsStaff ? (
          <View style={styles.section}>
            <Text variant="label">Last seen by</Text>
            {practitionersQuery.isLoading ? (
              <Text variant="caption" tone="muted">
                Loading team…
              </Text>
            ) : practitioners.length === 0 ? (
              <Text variant="caption" tone="muted">
                No staff to filter by.
              </Text>
            ) : (
              <View style={styles.chipRow}>
                {practitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={draft.last_staff_id === p.id}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        last_staff_id: d.last_staff_id === p.id ? '' : p.id,
                      }))
                    }
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Last service picker */}
        {segmentNeedsService ? (
          <View style={styles.section}>
            <Text variant="label">Last service booked</Text>
            {servicesQuery.isLoading ? (
              <Text variant="caption" tone="muted">
                Loading services…
              </Text>
            ) : services.length === 0 ? (
              <Text variant="caption" tone="muted">
                No services to filter by.
              </Text>
            ) : (
              <View style={styles.chipRow}>
                {services.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={draft.last_service_id === s.id}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        last_service_id: d.last_service_id === s.id ? '' : s.id,
                      }))
                    }
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Date range */}
        {segmentNeedsDateRange ? (
          <View style={styles.section}>
            <Text variant="label">Date range</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text variant="caption" tone="muted">
                  From
                </Text>
                <DatePickerField
                  value={draft.date_from || todayIso}
                  onChange={(iso) => setDraft((d) => ({ ...d, date_from: iso }))}
                  accessibilityLabel="Filter from date"
                />
              </View>
              <View style={styles.dateField}>
                <Text variant="caption" tone="muted">
                  To
                </Text>
                <DatePickerField
                  value={draft.date_to || todayIso}
                  onChange={(iso) => setDraft((d) => ({ ...d, date_to: iso }))}
                  accessibilityLabel="Filter to date"
                />
              </View>
            </View>
            {rangeError ? (
              <Text variant="caption" tone="danger">
                {rangeError}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Marketing consent sub-filter */}
        {segmentNeedsMarketing ? (
          <View style={styles.section}>
            <Text variant="label">Consent status</Text>
            <Segmented
              options={MARKETING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={normaliseMarketing(draft.marketing)}
              onChange={(v) => {
                hapticSelect();
                setDraft((d) => ({ ...d, marketing: v }));
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Reset" variant="ghost" style={styles.flex1} onPress={handleReset} />
        <Button label="Apply" style={styles.flex2} disabled={!dateValid} onPress={handleApply} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: '75%',
  },
  scrollBody: {
    gap: spacing.base,
    paddingBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
});
