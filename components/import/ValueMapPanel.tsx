import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ImportBanner, OptionPickerSheet, SelectField, importStyles } from '@/components/import/ImportParts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { canonicalValuesForTarget, VALUE_MAP_TARGETS, type ValueMapEntry } from '@/lib/import/value-map';

/**
 * How a column's own values map to ResNeo's (the web Review step's `ValueMapPanel`): change a
 * value, remove a row, add one the AI missed, then save. The parent owns the rows.
 */
export function ValueMapPanel({
  target,
  sourceColumn,
  rows,
  saving,
  saved,
  onChangeRow,
  onRemoveRow,
  onAddRow,
  onSave,
}: {
  target: string;
  sourceColumn: string;
  rows: ValueMapEntry[];
  saving: boolean;
  saved: boolean;
  onChangeRow: (idx: number, to: string) => void;
  onRemoveRow: (idx: number) => void;
  onAddRow: (from: string, to: string) => void;
  onSave: () => void;
}) {
  const label = VALUE_MAP_TARGETS[target]?.label ?? 'standard values';
  const choices = canonicalValuesForTarget(target);
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  /** Which row's value is being chosen: a row index, 'new' for the add row, or null. */
  const [picking, setPicking] = useState<number | 'new' | null>(null);

  function handleAdd() {
    const from = newFrom.trim();
    if (!from || !newTo) return;
    onAddRow(from, newTo);
    setNewFrom('');
    setNewTo('');
  }

  return (
    <ImportBanner tone="info" title={`How your "${sourceColumn}" values map to ${label.toLowerCase()}`}>
      <Text variant="caption" tone="secondary">
        We matched these values automatically. Change any that look wrong. Values not listed here are matched
        automatically.
      </Text>
      {rows.map((row, idx) => (
        <View key={`${row.from}-${idx}`} style={importStyles.tight}>
          <Text variant="bodySmall">{`"${row.from}" becomes`}</Text>
          <View style={importStyles.row}>
            <View style={styles.flex}>
              <SelectField
                value={choices.includes(row.to) ? row.to : null}
                placeholder="Choose a value"
                accessibilityLabel={`${label} for "${row.from}"`}
                onPress={() => setPicking(idx)}
              />
            </View>
            <Button label="Remove" size="sm" variant="ghost" accessibilityLabel={`Remove the mapping for "${row.from}"`} onPress={() => onRemoveRow(idx)} />
          </View>
        </View>
      ))}
      <Text variant="label">Add a value</Text>
      <Input placeholder="Value in your file" value={newFrom} onChangeText={setNewFrom} accessibilityLabel="Value from your file" autoCapitalize="none" />
      <SelectField
        value={newTo || null}
        placeholder="Choose a value"
        accessibilityLabel={`Maps to ${label.toLowerCase()}`}
        onPress={() => setPicking('new')}
      />
      <View style={importStyles.row}>
        <Button label="Add" size="sm" variant="secondary" disabled={!newFrom.trim() || !newTo} onPress={handleAdd} />
        <Button label={saving ? 'Saving…' : 'Save value mapping'} size="sm" loading={saving} disabled={saving} onPress={onSave} />
        {saved && !saving ? (
          <Text variant="caption" tone="success">
            Saved
          </Text>
        ) : null}
      </View>
      <OptionPickerSheet
        visible={picking !== null}
        title={label}
        options={choices.map((c) => ({ value: c, label: c }))}
        selected={picking === 'new' ? newTo : picking !== null ? rows[picking]?.to : null}
        onPick={(value) => {
          if (picking === 'new') setNewTo(value);
          else if (picking !== null && value) onChangeRow(picking, value);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </ImportBanner>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
