import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { ColumnMapper } from '@/components/import/ColumnMapper';
import { ImportBanner, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { SplitEditorSheet } from '@/components/import/SplitEditorSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import { computeAllFileRequirements } from '@/lib/import/map-requirements';
import {
  DATA_FILE_TYPES,
  dedupeMappings,
  defaultSplitDraft,
  filesNeedingAutoMap,
  firstSampleValue,
  readAutoMappedFileIds,
  withCustomField,
  withoutSplit,
  withSplit,
  type SplitDraft,
} from '@/lib/import/mapping-edits';
import { targetFieldsForFileType } from '@/lib/import/schema-fields';
import { importStepRoute } from '@/lib/import/session-status';
import type { ImportFile, MappingRow } from '@/lib/import/types';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Step 2, Map columns (web `MapStepClient`). Columns are matched to ResNeo fields automatically
 * on arrival (once per file, filling only what nothing maps yet); you check the result, change
 * anything, split a combined column or keep one as a custom field. Notes for the AI re-run the
 * matching on every file. Continue saves the mappings and needs every file's essentials.
 */
export default function MapStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Map columns" sessionId={sessionId} step="map">
      <MapStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

function MapStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const api = useImportApi();
  const { terminology } = useVenueContext();
  const clientLabel = terminology.client;
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<SplitDraft | null>(null);
  const [instructions, setInstructions] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsBusy, setInstructionsBusy] = useState(false);
  const autoMapAttempted = useRef(false);

  const load = useCallback(async () => {
    const data = await api.getSession(sessionId);
    const loadedFiles = data.files ?? [];
    setFiles(loadedFiles);
    setMappings(data.mappings ?? []);
    if (loadedFiles[0]?.id) setActiveFileId((prev) => prev ?? loadedFiles[0]!.id);
    const saved = data.session?.session_settings?.ai_instructions;
    if (typeof saved === 'string') {
      setInstructions((prev) => (prev ? prev : saved));
      if (saved.trim()) setInstructionsOpen(true);
    }
    if (data.session?.ai_mapping_used) {
      setBanner('We filled in the mappings from your column names. Check them below before you continue.');
    }
    return {
      files: loadedFiles,
      mappings: data.mappings ?? [],
      autoMappedFileIds: readAutoMappedFileIds(data.session?.session_settings ?? null),
    };
  }, [api, sessionId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const loaded = await load();
        if (!autoMapAttempted.current) {
          autoMapAttempted.current = true;
          const toMap = filesNeedingAutoMap(
            loaded.files.filter((f) => DATA_FILE_TYPES.has(f.file_type)),
            loaded.mappings,
            loaded.autoMappedFileIds,
          );
          if (toMap.length > 0) {
            setAiBusy(true);
            setBanner('Mapping your columns automatically…');
            setLoading(false);
            let anyMapped = false;
            for (const f of toMap) {
              try {
                const j = await api.aiMapFile(sessionId, f.id, 'fill');
                if (j.ok) anyMapped = true;
              } catch {
                // One file's failure leaves its columns for the owner to map.
              }
            }
            await load();
            setBanner(
              anyMapped
                ? 'We mapped your columns automatically. Check them below; anything marked as a guess or not yet mapped needs you.'
                : 'Automatic mapping is not available right now. Map your columns below.',
            );
            setAiBusy(false);
          }
        }
      } catch (e) {
        setError(importErrorMessage(e, 'This import could not be loaded.'));
        setAiBusy(false);
      }
      setLoading(false);
    })();
  }, [api, load, sessionId]);

  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0] ?? null;
  const fields = useMemo(() => (activeFile ? targetFieldsForFileType(activeFile.file_type) : []), [activeFile]);
  const requirements = useMemo(() => computeAllFileRequirements(files, mappings, clientLabel), [files, mappings, clientLabel]);
  const activeRequirements = requirements.find((r) => r.fileId === activeFile?.id) ?? null;
  const blockedFiles = requirements.filter((r) => !r.satisfied);
  const continueOpen = files.length > 0 && blockedFiles.length === 0;

  async function rerunForFile(fileId: string) {
    setAiBusy(true);
    setError(null);
    try {
      const j = await api.aiMapFile(sessionId, fileId);
      await load();
      if (j.message) setBanner(j.message);
    } catch (e) {
      setError(importErrorMessage(e, 'The AI mapping did not finish. Please try again.'));
    }
    setAiBusy(false);
  }

  async function saveInstructionsAndRerun() {
    setInstructionsBusy(true);
    setError(null);
    try {
      await api.patchSettings(sessionId, { ai_instructions: instructions.trim() || null });
      setAiBusy(true);
      setBanner('Mapping your columns again with your notes…');
      for (const f of files.filter((x) => DATA_FILE_TYPES.has(x.file_type))) {
        try {
          await api.aiMapFile(sessionId, f.id);
        } catch {
          // Keep going: the other files still benefit.
        }
      }
      await load();
      setBanner('Columns mapped again using your notes. Check the result below.');
    } catch (e) {
      setError(importErrorMessage(e, 'Your notes could not be saved. Please try again.'));
    }
    setAiBusy(false);
    setInstructionsBusy(false);
  }

  async function saveAndContinue() {
    setSaving(true);
    setError(null);
    try {
      await api.saveMappings(sessionId, dedupeMappings(mappings));
      router.push(importStepRoute(sessionId, 'review'));
    } catch (e) {
      setError(importErrorMessage(e, 'Your mappings could not be saved. Please try again.'));
    }
    setSaving(false);
  }

  if (loading) return <ListSkeleton />;

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Map columns</Text>
        <Text variant="bodySmall" tone="secondary">
          We matched your columns to ResNeo fields automatically. Your job is to check the result. Choose a different
          field for any column, or split a combined column (like a full name) into parts.
        </Text>
      </View>

      {banner ? <ImportBanner tone="info">{banner}</ImportBanner> : null}
      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}

      <Card padded>
        <View style={importStyles.stack}>
          <Button
            label={instructionsOpen ? 'Hide notes for the AI' : 'Tell the AI about your data (optional)'}
            variant="ghost"
            onPress={() => setInstructionsOpen((v) => !v)}
          />
          {instructionsOpen ? (
            <>
              <Input
                value={instructions}
                onChangeText={setInstructions}
                multiline
                maxLength={2000}
                placeholder={'Anything that helps us map your file, like "the No. column is our client ID", "dates are month first" or "ignore the Balance column".'}
                accessibilityLabel="Notes for the AI"
              />
              <Button
                label={instructionsBusy ? 'Applying…' : 'Save and map again'}
                loading={instructionsBusy}
                disabled={instructionsBusy || aiBusy}
                onPress={() => void saveInstructionsAndRerun()}
              />
            </>
          ) : null}
        </View>
      </Card>

      <View style={importStyles.row}>
        {files.map((f) => {
          const ok = requirements.find((r) => r.fileId === f.id)?.satisfied !== false;
          return (
            <Chip
              key={f.id}
              label={`${ok ? '✓' : '!'} ${f.filename}`}
              selected={activeFile?.id === f.id}
              onPress={() => setActiveFileId(f.id)}
            />
          );
        })}
      </View>

      {activeFile && activeRequirements ? (
        <ImportBanner
          tone={activeRequirements.satisfied ? 'success' : 'warning'}
          title={activeRequirements.satisfied ? 'This file has everything it needs.' : 'Before you can continue, this file needs:'}>
          {activeRequirements.items.map((item) => (
            <View key={item.key} style={importStyles.tight}>
              <Text variant="bodySmall">{`${item.satisfied ? '✓' : '✗'} ${item.label}`}</Text>
              {item.hint ? (
                <Text variant="caption" tone="secondary">
                  {item.hint}
                </Text>
              ) : null}
            </View>
          ))}
        </ImportBanner>
      ) : null}

      {activeFile ? (
        <>
          <View style={importStyles.between}>
            <Text variant="label">{activeFile.filename}</Text>
            <Button
              label={aiBusy ? 'Running the AI…' : 'Map again with AI'}
              size="sm"
              variant="secondary"
              loading={aiBusy}
              disabled={aiBusy}
              onPress={() => void rerunForFile(activeFile.id)}
            />
          </View>
          <ColumnMapper
            file={activeFile}
            mappings={mappings}
            fields={fields}
            clientLabel={clientLabel}
            onChange={setMappings}
            onRequestSplit={(source) => setSplitDraft(defaultSplitDraft(mappings, activeFile, source))}
            onRemoveSplit={(source) => setMappings((prev) => withoutSplit(prev, activeFile.id, source))}
            onCreateCustomField={(source) => setMappings((prev) => withCustomField(prev, activeFile.id, source))}
          />
        </>
      ) : null}

      <View style={importStyles.between}>
        <Button label="Back" variant="secondary" onPress={() => router.replace(importStepRoute(sessionId, 'upload'))} />
        <Button label={saving ? 'Saving…' : 'Continue'} loading={saving} disabled={saving || !continueOpen} onPress={() => void saveAndContinue()} />
      </View>
      {!continueOpen && blockedFiles.length > 0 ? (
        <ImportBanner tone="warning" title="Almost there. These files still need something:">
          {blockedFiles.map((bf) => (
            <Button
              key={bf.fileId}
              variant="ghost"
              size="sm"
              label={`${bf.filename}: ${bf.items.filter((i) => !i.satisfied).map((i) => i.label).join(', ')}`}
              onPress={() => setActiveFileId(bf.fileId)}
            />
          ))}
        </ImportBanner>
      ) : null}

      <SplitEditorSheet
        visible={splitDraft !== null}
        draft={splitDraft}
        fields={fields}
        sample={splitDraft ? firstSampleValue(activeFile, splitDraft.source) : ''}
        onChange={setSplitDraft}
        onApply={() => {
          if (activeFile && splitDraft) setMappings((prev) => withSplit(prev, activeFile.id, splitDraft));
          setSplitDraft(null);
        }}
        onClose={() => setSplitDraft(null)}
      />
    </View>
  );
}
