import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ImportBanner, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { SplitEditorSheet } from '@/components/import/SplitEditorSheet';
import { ValueMapPanel } from '@/components/import/ValueMapPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import type { SplitDraft } from '@/lib/import/mapping-edits';
import { labelForFieldKey, targetFieldsForFileType } from '@/lib/import/schema-fields';
import { importStepRoute } from '@/lib/import/session-status';
import type { ImportFile, MappingRow } from '@/lib/import/types';
import { isValueMapTarget, valueMapFromRows, valueMapRows, type ValueMapEntry } from '@/lib/import/value-map';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Step 3, Review (web `ReviewStepClient`): how each column is used, file by file. Custom fields
 * take a name and type, split columns their parts, and a status column's own codes can be
 * matched to ResNeo's statuses. Each is saved on its own; changing which field a column goes to
 * is done on the Map step.
 */
export default function ReviewStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Review" sessionId={sessionId} step="review">
      <ReviewStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

const ACTION_LABELS: Record<string, string> = {
  map: 'Imported',
  ignore: 'Not imported',
  custom: 'Custom field',
  split: 'Split into fields',
};

const CUSTOM_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes or no' },
];

function ReviewStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const api = useImportApi();
  const { terminology } = useVenueContext();
  const clientLower = terminology.client.toLowerCase();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<Record<string, { name: string; type: string }>>({});
  const [split, setSplit] = useState<{ mappingId: string; fileType: string; sample: string; draft: SplitDraft } | null>(null);
  const [valueMapDraft, setValueMapDraft] = useState<Record<string, ValueMapEntry[]>>({});
  const [valueMapSaved, setValueMapSaved] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const data = await api.getSession(sessionId);
    setFiles(data.files ?? []);
    setMappings(data.mappings ?? []);
  }, [api, sessionId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        setError(importErrorMessage(e, 'This import could not be loaded.'));
      }
      setLoading(false);
    })();
  }, [load]);

  const byFile = useMemo(() => {
    const map = new Map<string, MappingRow[]>();
    for (const m of mappings) map.set(m.file_id, [...(map.get(m.file_id) ?? []), m]);
    return map;
  }, [mappings]);

  async function put(mappingId: string, patch: Record<string, unknown>): Promise<boolean> {
    setSavingId(mappingId);
    setError(null);
    try {
      await api.updateMapping(sessionId, mappingId, patch);
      await load();
      return true;
    } catch (e) {
      setError(importErrorMessage(e, 'That could not be saved. Please try again.'));
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function saveCustom(m: MappingRow) {
    if (!m.id) return;
    const draft = customDraft[m.id] ?? { name: m.custom_field_name ?? '', type: m.custom_field_type ?? 'text' };
    if (!draft.name.trim()) return;
    await put(m.id, { action: 'custom', custom_field_name: draft.name.trim(), custom_field_type: draft.type, user_overridden: true });
  }

  async function saveSplit() {
    if (!split) return;
    const allowed = new Set(targetFieldsForFileType(split.fileType).map((f) => f.key));
    const parts = split.draft.parts.filter((p) => p && allowed.has(p)).map((field) => ({ field }));
    if (!parts.length) return;
    const ok = await put(split.mappingId, {
      action: 'split',
      split_config: { separator: split.draft.separator || ' ', parts },
      user_overridden: true,
    });
    if (ok) setSplit(null);
  }

  const rowsFor = (m: MappingRow) => (m.id && valueMapDraft[m.id]) || valueMapRows(m);

  function editValueRows(m: MappingRow, next: (rows: ValueMapEntry[]) => ValueMapEntry[]) {
    if (!m.id) return;
    const id = m.id;
    setValueMapSaved((prev) => (prev[id] ? { ...prev, [id]: false } : prev));
    setValueMapDraft((prev) => ({ ...prev, [id]: next(prev[id] ?? valueMapRows(m)) }));
  }

  async function saveValueMap(m: MappingRow) {
    if (!m.id) return;
    const id = m.id;
    const ok = await put(id, { value_map: valueMapFromRows(rowsFor(m)) });
    if (ok) {
      setValueMapDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setValueMapSaved((prev) => ({ ...prev, [id]: true }));
    }
  }

  if (loading) return <ListSkeleton />;

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Review</Text>
        <Text variant="bodySmall" tone="secondary">
          Check how each column is used, including custom profile fields and split columns, before we check your rows.
        </Text>
      </View>
      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}

      {files.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          No files uploaded yet. Go back and add your files first.
        </Text>
      ) : (
        files.map((file) => {
          const sample0 = file.sample_rows?.[0] ?? {};
          return (
            <View key={file.id} style={importStyles.stack}>
              <View style={importStyles.tight}>
                <Text variant="subheading">{file.filename}</Text>
                <Text variant="caption" tone="muted">
                  {file.file_type === 'unknown' ? 'Not labelled' : file.file_type.replace(/_/g, ' ')}
                </Text>
              </View>
              {(byFile.get(file.id) ?? []).map((m) => {
                const key = m.id ?? `${m.file_id}-${m.source_column}`;
                const custom = (m.id && customDraft[m.id]) || { name: m.custom_field_name ?? '', type: m.custom_field_type ?? 'text' };
                const parts = (m.split_config?.parts ?? []).map((p) => p.field).filter(Boolean);
                return (
                  <Card key={key} padded testID={`import-review-${m.source_column}`}>
                    <View style={importStyles.stack}>
                      <View style={importStyles.tight}>
                        <View style={importStyles.between}>
                          <Text variant="bodyMedium">{m.source_column}</Text>
                          <Text variant="caption" tone="secondary">
                            {ACTION_LABELS[m.action] ?? m.action.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {sample0[m.source_column]?.trim() ? `For example: ${sample0[m.source_column]!.trim()}` : 'No example value'}
                        </Text>
                      </View>

                      {m.action === 'map' ? (
                        <Text variant="bodySmall">{`Goes to ${labelForFieldKey(m.target_field, file.file_type)}`}</Text>
                      ) : null}
                      {m.action === 'map' && m.target_field && isValueMapTarget(m.target_field) && m.id ? (
                        <ValueMapPanel
                          target={m.target_field}
                          sourceColumn={m.source_column}
                          rows={rowsFor(m)}
                          saving={savingId === m.id}
                          saved={Boolean(valueMapSaved[m.id])}
                          onChangeRow={(idx, to) => editValueRows(m, (rows) => rows.map((r, i) => (i === idx ? { ...r, to } : r)))}
                          onRemoveRow={(idx) => editValueRows(m, (rows) => rows.filter((_, i) => i !== idx))}
                          onAddRow={(from, to) => editValueRows(m, (rows) => [...rows, { from, to }])}
                          onSave={() => void saveValueMap(m)}
                        />
                      ) : null}

                      {m.action === 'custom' && m.id ? (
                        <View style={importStyles.stack}>
                          <Text variant="caption" tone="secondary">
                            {`Kept on the ${clientLower} profile as a custom field.`}
                          </Text>
                          <Input
                            label="Label"
                            value={custom.name}
                            onChangeText={(name) => setCustomDraft((prev) => ({ ...prev, [m.id!]: { ...custom, name } }))}
                          />
                          <View style={importStyles.row} accessibilityLabel="Type">
                            {CUSTOM_TYPES.map((t) => (
                              <Chip
                                key={t.value}
                                label={t.label}
                                selected={custom.type === t.value}
                                onPress={() => setCustomDraft((prev) => ({ ...prev, [m.id!]: { ...custom, type: t.value } }))}
                              />
                            ))}
                          </View>
                          <Button
                            label={savingId === m.id ? 'Saving…' : 'Save'}
                            size="sm"
                            loading={savingId === m.id}
                            disabled={savingId === m.id || !custom.name.trim()}
                            onPress={() => void saveCustom(m)}
                          />
                        </View>
                      ) : null}

                      {m.action === 'split' && m.id ? (
                        <View style={importStyles.stack}>
                          <Text variant="caption" tone="secondary">
                            {`One cell is split into several ${clientLower} fields: ${
                              parts.length ? parts.map((p) => labelForFieldKey(p, file.file_type)).join(' + ') : 'none chosen yet'
                            }.`}
                          </Text>
                          <Button
                            label="Edit split"
                            size="sm"
                            variant="secondary"
                            onPress={() =>
                              setSplit({
                                mappingId: m.id!,
                                fileType: file.file_type,
                                sample: sample0[m.source_column] ?? '',
                                draft: {
                                  source: m.source_column,
                                  separator: m.split_config?.separator ?? ' ',
                                  parts: parts.length ? parts : [''],
                                },
                              })
                            }
                          />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          );
        })
      )}

      <Text variant="caption" tone="muted">
        To change which field a column goes to, use the Map step. Custom and split rules you save here are used when we
        check and import your rows.
      </Text>

      <View style={importStyles.between}>
        <Button label="Back" variant="secondary" onPress={() => router.replace(importStepRoute(sessionId, 'map'))} />
        <Button label="Continue" onPress={() => router.push(importStepRoute(sessionId, 'references'))} />
      </View>

      <SplitEditorSheet
        visible={split !== null}
        draft={split?.draft ?? null}
        fields={split ? targetFieldsForFileType(split.fileType) : []}
        sample={split?.sample ?? ''}
        saving={split !== null && savingId === split.mappingId}
        applyLabel="Save split"
        onChange={(draft) => setSplit((prev) => (prev ? { ...prev, draft } : prev))}
        onApply={() => void saveSplit()}
        onClose={() => setSplit(null)}
      />
    </View>
  );
}
