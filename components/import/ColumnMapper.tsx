import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfidenceBadge, OptionPickerSheet, importStyles } from '@/components/import/ImportParts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import {
  columnSections,
  confirmMapping,
  fieldForSource,
  firstSampleValue,
  isMappingConfirmed,
  replacedSourceFor,
  setMappingForSource,
  sourceForField,
} from '@/lib/import/mapping-edits';
import { FIELD_TYPE_LABELS, fieldDisplayLabel, type SchemaField } from '@/lib/import/schema-fields';
import type { ImportFile, MappingRow } from '@/lib/import/types';
import { spacing } from '@/theme/index';

type View_ = 'columns' | 'fields';

/**
 * The phone's version of the web's drag-and-drop map view (`ImportMapDndView`). Every move the
 * web offers is a tap here: choose a field for a column (dragging a column onto a field), choose
 * a column for a field (the field's dropdown), Don't import (the "unmap" drop zone), Keep as a
 * custom field (the custom drop zone), Split, Confirm and Clear. Taking a field another column
 * holds asks first, as the web does. Two views: by column, and by ResNeo field.
 */
export function ColumnMapper({
  file,
  mappings,
  fields,
  clientLabel,
  onChange,
  onRequestSplit,
  onRemoveSplit,
  onCreateCustomField,
}: {
  file: ImportFile;
  mappings: MappingRow[];
  fields: SchemaField[];
  clientLabel: string;
  onChange: (next: MappingRow[]) => void;
  onRequestSplit: (source: string) => void;
  onRemoveSplit: (source: string) => void;
  onCreateCustomField: (source: string) => void;
}) {
  const [view, setView] = useState<View_>('columns');
  const [pickFieldFor, setPickFieldFor] = useState<string | null>(null);
  const [pickColumnFor, setPickColumnFor] = useState<SchemaField | null>(null);
  const [replace, setReplace] = useState<{ source: string; target: string; previous: string } | null>(null);

  const sections = useMemo(() => columnSections(file, mappings), [file, mappings]);
  const labelOf = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f ? fieldDisplayLabel(f, clientLabel) : key;
  };

  function assign(source: string, target: string) {
    const previous = replacedSourceFor(mappings, file.id, source, target);
    if (previous) {
      setReplace({ source, target, previous });
      return;
    }
    onChange(setMappingForSource(mappings, file.id, source, target));
  }

  const rowFor = (source: string) => mappings.find((m) => m.file_id === file.id && m.source_column === source);

  return (
    <View style={importStyles.stack}>
      <Segmented<View_>
        options={[
          { value: 'columns', label: 'Your columns' },
          { value: 'fields', label: 'ResNeo fields' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'columns' ? (
        sections.map((sec) => (
          <View key={sec.key} style={importStyles.stack}>
            <View style={importStyles.tight}>
              <Text variant="label">{sec.title}</Text>
              <Text variant="caption" tone="muted">
                {sec.hint}
              </Text>
            </View>
            {sec.columns.map((h) => {
              const row = rowFor(h);
              const sample = firstSampleValue(file, h);
              const mapped = fieldForSource(mappings, file.id, h);
              const isSplit = row?.action === 'split';
              const isCustom = row?.action === 'custom';
              const splitSummary = isSplit
                ? (row?.split_config?.parts ?? []).filter((p) => p.field).map((p) => labelOf(p.field)).join(' + ')
                : null;
              return (
                <Card key={h} padded testID={`import-column-${h}`}>
                  <View style={importStyles.tight}>
                    <View style={importStyles.between}>
                      <Text variant="bodyMedium" style={styles.flex}>
                        {h}
                      </Text>
                      {mapped ? <ConfidenceBadge confidence={row?.ai_confidence} /> : null}
                      {isSplit ? <Badge label="Split" tone="brand" /> : null}
                      {isCustom ? <Badge label="Custom field" tone="accent" /> : null}
                    </View>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {sample ? `For example: ${sample}` : 'No example value'}
                    </Text>
                    {mapped ? (
                      <Text variant="caption" tone="brand">{`Goes to ${labelOf(mapped)}`}</Text>
                    ) : null}
                    {splitSummary ? <Text variant="caption" tone="brand">{`Goes to ${splitSummary}`}</Text> : null}
                    {isCustom ? (
                      <Text variant="caption" tone="secondary">
                        {`Kept on the ${clientLabel.toLowerCase()} profile as "${row?.custom_field_name ?? h}". Adjust its name and type on the Review step.`}
                      </Text>
                    ) : null}
                    {row?.action === 'ignore' ? (
                      <Text variant="caption" tone="secondary">
                        Not imported.
                      </Text>
                    ) : null}
                  </View>
                  <View style={[importStyles.row, styles.actions]}>
                    {isSplit ? (
                      <>
                        <Button label="Edit split" size="sm" variant="secondary" onPress={() => onRequestSplit(h)} />
                        <Button label="Remove split" size="sm" variant="ghost" onPress={() => onRemoveSplit(h)} />
                      </>
                    ) : (
                      <>
                        <Button
                          label={mapped ? 'Change field' : 'Choose a field'}
                          size="sm"
                          variant="secondary"
                          onPress={() => setPickFieldFor(h)}
                        />
                        <Button label="Split" size="sm" variant="ghost" onPress={() => onRequestSplit(h)} />
                        {!isCustom ? (
                          <Button label="Custom field" size="sm" variant="ghost" onPress={() => onCreateCustomField(h)} />
                        ) : null}
                        {row?.action !== 'ignore' ? (
                          <Button label="Don't import" size="sm" variant="ghost" onPress={() => onChange(setMappingForSource(mappings, file.id, h, ''))} />
                        ) : null}
                      </>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        ))
      ) : (
        fields.map((field) => {
          const mapped = sourceForField(mappings, file.id, field.key);
          const confirmed = isMappingConfirmed(mappings, file.id, field.key);
          return (
            <Card key={field.key} padded testID={`import-field-${field.key}`}>
              <View style={importStyles.tight}>
                <View style={importStyles.between}>
                  <Text variant="bodyMedium" style={styles.flex}>
                    {`${fieldDisplayLabel(field, clientLabel)}${field.required ? ' *' : ''}`}
                  </Text>
                  {mapped ? <Badge label={confirmed ? 'Confirmed' : 'Suggested'} tone={confirmed ? 'success' : 'warning'} /> : null}
                </View>
                <Text variant="caption" tone="muted">
                  {FIELD_TYPE_LABELS[field.type]}
                </Text>
                <Text variant="caption" tone={mapped ? 'brand' : 'muted'}>
                  {mapped ? `From your column "${mapped}"` : 'No column yet'}
                </Text>
              </View>
              <View style={[importStyles.row, styles.actions]}>
                <Button label={mapped ? 'Change column' : 'Choose a column'} size="sm" variant="secondary" onPress={() => setPickColumnFor(field)} />
                {mapped && !confirmed ? (
                  <Button label="Confirm" size="sm" onPress={() => onChange(confirmMapping(mappings, file.id, mapped, field.key))} />
                ) : null}
                {mapped ? (
                  <Button label="Clear" size="sm" variant="ghost" onPress={() => onChange(setMappingForSource(mappings, file.id, mapped, ''))} />
                ) : null}
              </View>
            </Card>
          );
        })
      )}

      <OptionPickerSheet
        visible={pickFieldFor !== null}
        title={pickFieldFor ? `Where does "${pickFieldFor}" go?` : ''}
        subtitle={pickFieldFor ? firstSampleValue(file, pickFieldFor) || null : null}
        options={fields.map((f) => {
          const holder = sourceForField(mappings, file.id, f.key);
          return {
            value: f.key,
            label: `${fieldDisplayLabel(f, clientLabel)}${f.required ? ' *' : ''}`,
            detail: holder && holder !== pickFieldFor ? `Now from "${holder}"` : null,
          };
        })}
        selected={pickFieldFor ? fieldForSource(mappings, file.id, pickFieldFor) : null}
        noneLabel="Don't import this column"
        onPick={(value) => {
          const source = pickFieldFor;
          setPickFieldFor(null);
          if (source) {
            if (value) assign(source, value);
            else onChange(setMappingForSource(mappings, file.id, source, ''));
          }
        }}
        onClose={() => setPickFieldFor(null)}
      />

      <OptionPickerSheet
        visible={pickColumnFor !== null}
        title={pickColumnFor ? `Which column is ${fieldDisplayLabel(pickColumnFor, clientLabel)}?` : ''}
        options={(file.headers ?? []).map((h) => ({ value: h, label: h, detail: firstSampleValue(file, h) || null }))}
        selected={pickColumnFor ? sourceForField(mappings, file.id, pickColumnFor.key) : null}
        noneLabel="No column"
        onPick={(value) => {
          const field = pickColumnFor;
          setPickColumnFor(null);
          if (!field) return;
          if (value) assign(value, field.key);
          else {
            const mapped = sourceForField(mappings, file.id, field.key);
            if (mapped) onChange(setMappingForSource(mappings, file.id, mapped, ''));
          }
        }}
        onClose={() => setPickColumnFor(null)}
      />

      <ConfirmSheet
        visible={replace !== null}
        title="Replace this mapping?"
        message={
          replace
            ? `${labelOf(replace.target)} already comes from "${replace.previous}". Take it from "${replace.source}" instead? "${replace.previous}" will no longer be mapped.`
            : undefined
        }
        confirmLabel="Replace"
        destructive={false}
        onConfirm={() => {
          if (replace) onChange(setMappingForSource(mappings, file.id, replace.source, replace.target));
          setReplace(null);
        }}
        onClose={() => setReplace(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { marginTop: spacing.sm },
});
