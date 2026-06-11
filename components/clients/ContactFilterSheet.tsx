import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';

const SEGMENT_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'new', label: 'New this period' },
  { value: 'upcoming', label: 'Upcoming visit' },
  { value: 'visit', label: 'By last visit' },
  { value: 'marketing', label: 'Marketing consent' },
  { value: 'tag', label: 'By tag' },
] as const;

const IDENTITY_OPTIONS = [
  { value: 'identified', label: 'With contact details' },
  { value: 'all', label: 'All' },
  { value: 'anonymous', label: 'Anonymous only' },
] as const;

const MARKETING_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'opted_in', label: 'Opted in' },
  { value: 'opted_out', label: 'Opted out' },
  { value: 'no_record', label: 'No record' },
] as const;

export type ContactFilterState = {
  segment: string;
  segmentTag: string;
  filter: string;
  date_from: string;
  date_to: string;
  marketing: string;
};

export const DEFAULT_FILTER_STATE: ContactFilterState = {
  segment: 'all',
  segmentTag: '',
  filter: 'identified',
  date_from: '',
  date_to: '',
  marketing: '',
};

type ContactFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: ContactFilterState;
  onApply: (state: ContactFilterState) => void;
  availableTags?: string[];
};

/**
 * Advanced filter sheet — Smart-list segments, identity scope, date range.
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
  // The previous code used `void handleVisible` which never called the function —
  // it only discarded the function reference, so the draft was never refreshed.
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleApply() {
    onApply(draft);
    onClose();
  }

  function handleReset() {
    const reset = { ...DEFAULT_FILTER_STATE };
    setDraft(reset);
    onApply(reset);
    onClose();
  }

  const segmentNeedsDateRange = ['new', 'upcoming', 'visit', 'marketing'].includes(draft.segment);
  const segmentNeedsMarketing = draft.segment === 'marketing';
  const segmentNeedsTag = draft.segment === 'tag';

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
                onPress={() => {
                  hapticSelect();
                  setDraft((d) => ({ ...d, filter: opt.value }));
                }}
              />
            ))}
          </View>
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
                onPress={() => {
                  hapticSelect();
                  setDraft((d) => ({
                    ...d,
                    segment: opt.value,
                    segmentTag: '',
                    date_from: '',
                    date_to: '',
                    marketing: '',
                  }));
                }}
              />
            ))}
          </View>
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
                    onPress={() => {
                      hapticSelect();
                      setDraft((d) => ({ ...d, segmentTag: tag }));
                    }}
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

        {/* Date range */}
        {segmentNeedsDateRange ? (
          <View style={styles.section}>
            <Text variant="label">Date range</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Input
                  label="From (YYYY-MM-DD)"
                  value={draft.date_from}
                  onChangeText={(v) => setDraft((d) => ({ ...d, date_from: v }))}
                  placeholder="2025-01-01"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.dateField}>
                <Input
                  label="To (YYYY-MM-DD)"
                  value={draft.date_to}
                  onChangeText={(v) => setDraft((d) => ({ ...d, date_to: v }))}
                  placeholder="2025-12-31"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* Marketing consent sub-filter */}
        {segmentNeedsMarketing ? (
          <View style={styles.section}>
            <Text variant="label">Consent status</Text>
            <Segmented
              options={MARKETING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={draft.marketing}
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
        <Button label="Apply" style={styles.flex2} onPress={handleApply} />
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
