import { ScrollView, StyleSheet, View } from 'react-native';

import { ImportBanner, TickRow } from '@/components/import/ImportParts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import type { BulkRow } from '@/lib/import/references';
import { spacing } from '@/theme/index';

export type BulkResult = { created: number; errors: { reference_id: string; error: string }[] };

/**
 * Create every unmatched service or team member in one go (the web's `BulkCreatePanel`): each
 * row can be renamed, given a length and price (services), or unticked. After a run, only the
 * rows that failed stay, each with its reason, so they can be fixed and tried again.
 */
export function BulkCreateSheet({
  visible,
  type,
  rows,
  running,
  result,
  currencySymbol,
  staffNoun,
  onPatchRow,
  onToggleAll,
  onRun,
  onClose,
}: {
  visible: boolean;
  type: 'service' | 'staff';
  rows: BulkRow[];
  running: boolean;
  result: BulkResult | null;
  currencySymbol: string;
  staffNoun: string;
  onPatchRow: (refId: string, patch: Partial<BulkRow>) => void;
  onToggleAll: (selected: boolean) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const isService = type === 'service';
  const noun = isService ? 'service' : staffNoun;
  const nounPlural = isService ? 'services' : `${staffNoun}s`;
  const selectedCount = rows.filter((r) => r.selected && r.name.trim()).length;
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const succeeded = Boolean(result && result.errors.length === 0);
  const close = () => {
    if (!running) onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} fill maxHeight="92%" keyboardAvoidance="overlay">
      <View style={styles.header}>
        <Text variant="heading">{isService ? 'Create your services' : `Add your ${nounPlural}`}</Text>
        {!succeeded ? (
          <Text variant="bodySmall" tone="muted">
            {isService
              ? 'We filled in a suggested length and price from your bookings. Change anything, untick any you do not want, then create them all.'
              : `Check the ${nounPlural} found in your bookings. Untick anyone you do not want, then add them all.`}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {succeeded && result ? (
          <ImportBanner tone="success" title={`Created ${result.created} ${result.created === 1 ? noun : nounPlural}`}>
            They are matched to your bookings and ready to go.
          </ImportBanner>
        ) : (
          <>
            <TickRow
              label={`Select all (${selectedCount} of ${rows.length} selected)`}
              checked={allSelected}
              onChange={onToggleAll}
            />
            {result && result.errors.length > 0 ? (
              <ImportBanner tone="warning">
                {`Created ${result.created} of ${result.created + result.errors.length}. ${result.errors.length} could not be created. Fix the ${nounPlural} below and try again.`}
              </ImportBanner>
            ) : null}
            {rows.map((row) => {
              const rowError = result?.errors.find((e) => e.reference_id === row.reference_id)?.error;
              return (
                <View key={row.reference_id} style={[styles.row, !row.selected && styles.dim]}>
                  <TickRow
                    label={row.name || 'No name'}
                    checked={row.selected}
                    onChange={(selected) => onPatchRow(row.reference_id, { selected })}
                  />
                  <Input label="Name" value={row.name} onChangeText={(name) => onPatchRow(row.reference_id, { name })} />
                  {isService ? (
                    <View style={styles.pair}>
                      <Input
                        label="Length (minutes)"
                        value={row.duration}
                        keyboardType="number-pad"
                        placeholder="60"
                        containerStyle={styles.flex}
                        onChangeText={(duration) => onPatchRow(row.reference_id, { duration })}
                      />
                      <Input
                        label={`Price (${currencySymbol})`}
                        value={row.price}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        containerStyle={styles.flex}
                        onChangeText={(price) => onPatchRow(row.reference_id, { price })}
                      />
                    </View>
                  ) : null}
                  {rowError ? (
                    <Text variant="caption" tone="danger">
                      {rowError}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {succeeded ? (
          <Button label="Done" onPress={onClose} fullWidth />
        ) : (
          <>
            <Button label="Cancel" variant="secondary" onPress={close} disabled={running} style={styles.flex} />
            <Button
              label={running ? 'Creating…' : `Create ${selectedCount} ${selectedCount === 1 ? noun : nounPlural}`}
              loading={running}
              disabled={running || selectedCount === 0}
              onPress={onRun}
              style={styles.flex}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  row: { gap: spacing.sm, paddingBottom: spacing.md },
  dim: { opacity: 0.55 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
