import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ImportBanner, OptionPickerSheet, SelectField } from '@/components/import/ImportParts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { splitPreview, type SplitDraft } from '@/lib/import/mapping-edits';
import type { SchemaField } from '@/lib/import/schema-fields';
import { spacing } from '@/theme/index';

/**
 * Split one column into several fields (a full name into first and last, a date and time into
 * both). The web's split editor: a separator, a field per part, add or remove parts, and a
 * preview of the first row.
 */
export function SplitEditorSheet({
  visible,
  draft,
  fields,
  sample,
  saving,
  applyLabel = 'Apply split',
  onChange,
  onApply,
  onClose,
}: {
  visible: boolean;
  draft: SplitDraft | null;
  fields: SchemaField[];
  sample: string;
  saving?: boolean;
  applyLabel?: string;
  onChange: (next: SplitDraft) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [pickingPart, setPickingPart] = useState<number | null>(null);
  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const preview = draft ? splitPreview(sample, draft) : [];

  return (
    <>
      <Sheet visible={visible && pickingPart === null} onClose={onClose} fill maxHeight="90%" keyboardAvoidance="overlay">
        {draft ? (
          <>
            <View style={styles.header}>
              <Text variant="heading">{`Split "${draft.source}"`}</Text>
              <Text variant="bodySmall" tone="muted">
                {'Each part of the value goes to its own field. Name splits are smart: "Smith, John" and double-barrelled surnames are handled for you.'}
              </Text>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Input
                label="Separator"
                accessibilityLabel="Separator"
                helper="Leave a single space to split on spaces."
                value={draft.separator}
                onChangeText={(separator) => onChange({ ...draft, separator })}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {draft.parts.map((field, idx) => (
                <View key={`part-${idx}`} style={styles.part}>
                  <View style={styles.partField}>
                    <SelectField
                      label={`Part ${idx + 1}`}
                      value={field ? labelFor(field) : null}
                      placeholder="Choose a field"
                      onPress={() => setPickingPart(idx)}
                    />
                  </View>
                  {draft.parts.length > 2 ? (
                    <Button
                      label="Remove"
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={`Remove part ${idx + 1}`}
                      onPress={() => onChange({ ...draft, parts: draft.parts.filter((_, i) => i !== idx) })}
                    />
                  ) : null}
                </View>
              ))}
              <Button label="Add a part" variant="ghost" size="sm" onPress={() => onChange({ ...draft, parts: [...draft.parts, ''] })} style={styles.start} />
              {preview.length > 0 ? (
                <ImportBanner tone="info" title="Preview (first row)">
                  {preview.map((p, i) => (
                    <Text key={`${p.field}-${i}`} variant="bodySmall">{`${labelFor(p.field)}: ${p.value || 'empty'}`}</Text>
                  ))}
                </ImportBanner>
              ) : null}
            </ScrollView>
            <View style={styles.footer}>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex} disabled={saving} />
              <Button
                label={applyLabel}
                onPress={onApply}
                loading={saving}
                disabled={!draft.parts.some(Boolean)}
                style={styles.flex}
              />
            </View>
          </>
        ) : null}
      </Sheet>
      <OptionPickerSheet
        visible={visible && pickingPart !== null}
        title={pickingPart !== null ? `Part ${pickingPart + 1}` : ''}
        options={fields.map((f) => ({ value: f.key, label: f.label }))}
        selected={pickingPart !== null && draft ? draft.parts[pickingPart] : null}
        noneLabel="No field"
        onPick={(value) => {
          if (draft && pickingPart !== null) {
            const parts = [...draft.parts];
            parts[pickingPart] = value;
            onChange({ ...draft, parts });
          }
          setPickingPart(null);
        }}
        onClose={() => setPickingPart(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  part: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  partField: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  flex: { flex: 1 },
});
