/**
 * The Map step's edits, as pure functions over the session's mapping rows. Ports of what the
 * web's `MapStepClient` and `ImportMapDndView` do on a drop, a dropdown, Confirm, Clear, a
 * custom field or a split, so the phone's tap-to-choose screen writes exactly the rows the
 * dashboard's drag and drop writes. Also the auto-map selection from `src/lib/import/auto-map.ts`.
 */
import { DATETIME_VALUE_RE } from '@/lib/import/map-requirements';
import type { ImportFile, MappingRow } from '@/lib/import/types';

/** session_settings key: ids of files that have had their automatic mapping run. */
export const AUTO_MAPPED_FILE_IDS_KEY = 'auto_mapped_file_ids';

/** File types the Map step auto-maps on arrival (every data file). */
export const DATA_FILE_TYPES = new Set(['clients', 'bookings', 'staff', 'unknown']);

export function readAutoMappedFileIds(settings: Record<string, unknown> | null | undefined): string[] {
  const raw = settings?.[AUTO_MAPPED_FILE_IDS_KEY];
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

/** Header columns with no mapping row of any kind. */
export function unmappedHeaders(headers: string[], rows: { source_column: string }[]): string[] {
  const have = new Set(rows.map((r) => r.source_column));
  return headers.filter((h) => h?.trim() && !have.has(h));
}

/**
 * Files the Map step auto-maps on arrival: any file with no mappings, and once only a file
 * whose platform template left some columns unmapped.
 */
export function filesNeedingAutoMap<F extends { id: string; headers: string[] | null }>(
  files: F[],
  mappings: { file_id: string; source_column: string }[],
  autoMappedFileIds: string[],
): F[] {
  const done = new Set(autoMappedFileIds);
  return files.filter((f) => {
    const rows = mappings.filter((m) => m.file_id === f.id);
    if (rows.length === 0) return true;
    if (done.has(f.id)) return false;
    return unmappedHeaders(f.headers ?? [], rows).length > 0;
  });
}

/** The column mapped to `fieldKey` in a file, if any. */
export function sourceForField(mappings: MappingRow[], fileId: string, fieldKey: string): string | null {
  const row = mappings.find(
    (m) => m.file_id === fileId && m.action === 'map' && m.target_field === fieldKey,
  );
  return row?.source_column ?? null;
}

/** The field a column is mapped to, if any. */
export function fieldForSource(mappings: MappingRow[], fileId: string, source: string): string | null {
  const row = mappings.find(
    (m) => m.file_id === fileId && m.source_column === source && m.action === 'map' && m.target_field,
  );
  return row?.target_field ?? null;
}

/**
 * Map `source` to `targetKey` (or ignore it when `targetKey` is empty). Any other column holding
 * that field is dropped from it, as the web does after "Replace this mapping?". A manual choice
 * counts as confirmed: high confidence, not an AI suggestion.
 */
export function setMappingForSource(
  mappings: MappingRow[],
  fileId: string,
  source: string,
  targetKey: string,
): MappingRow[] {
  const prevRow = mappings.find((m) => m.file_id === fileId && m.source_column === source);
  let next = mappings.filter((m) => !(m.file_id === fileId && m.source_column === source));
  if (targetKey) {
    next = next.filter((m) => !(m.file_id === fileId && m.action === 'map' && m.target_field === targetKey));
  }
  next.push({
    file_id: fileId,
    source_column: source,
    target_field: targetKey || null,
    action: targetKey ? 'map' : 'ignore',
    ai_confidence: targetKey ? 'high' : null,
    ai_suggested: false,
    user_overridden: prevRow ? true : undefined,
  });
  return next;
}

/**
 * The column that would lose `targetKey` if `source` took it, so the screen can ask before
 * replacing (web: "Replace this mapping?"). Null when nothing would be replaced.
 */
export function replacedSourceFor(
  mappings: MappingRow[],
  fileId: string,
  source: string,
  targetKey: string,
): string | null {
  if (!targetKey) return null;
  const existing = sourceForField(mappings, fileId, targetKey);
  return existing && existing !== source ? existing : null;
}

/** Confirm an AI suggestion as it stands (web: Confirm on a field). */
export function confirmMapping(mappings: MappingRow[], fileId: string, source: string, targetKey: string): MappingRow[] {
  return mappings.map((m) =>
    m.file_id === fileId && m.source_column === source && m.target_field === targetKey
      ? { ...m, action: 'map', ai_confidence: 'high', ai_suggested: false }
      : m,
  );
}

/** Whether the field's mapping counts as confirmed (chosen by hand, or confirmed). */
export function isMappingConfirmed(mappings: MappingRow[], fileId: string, fieldKey: string): boolean {
  const row = mappings.find((m) => m.file_id === fileId && m.action === 'map' && m.target_field === fieldKey);
  return Boolean(row && row.ai_suggested === false && row.ai_confidence === 'high');
}

/** Keep a column as a custom profile field, named after the column (web parity). */
export function withCustomField(mappings: MappingRow[], fileId: string, source: string): MappingRow[] {
  const cleanName = source.replace(/[^\w\s\-'.]/g, '').trim().slice(0, 80) || 'Custom field';
  return [
    ...mappings.filter((m) => !(m.file_id === fileId && m.source_column === source)),
    {
      file_id: fileId,
      source_column: source,
      target_field: null,
      action: 'custom',
      custom_field_name: cleanName,
      custom_field_type: 'text',
    },
  ];
}

export type SplitDraft = { source: string; separator: string; parts: string[] };

/** First non-empty sample value of a column. */
export function firstSampleValue(file: Pick<ImportFile, 'sample_rows'> | null, source: string): string {
  for (const row of file?.sample_rows ?? []) {
    const v = (row[source] ?? '').trim();
    if (v) return v;
  }
  return '';
}

/** The split editor's starting point: the saved split, or sensible parts for the file and value. */
export function defaultSplitDraft(
  mappings: MappingRow[],
  file: Pick<ImportFile, 'id' | 'file_type' | 'sample_rows'>,
  source: string,
): SplitDraft {
  const existing = mappings.find(
    (m) => m.file_id === file.id && m.source_column === source && m.action === 'split',
  );
  if (existing?.split_config?.parts?.length) {
    return {
      source,
      separator: existing.split_config.separator ?? ' ',
      parts: existing.split_config.parts.map((p) => p.field ?? ''),
    };
  }
  const sample = firstSampleValue(file, source);
  const looksDateTime = DATETIME_VALUE_RE.test(sample);
  let parts: string[];
  if (file.file_type === 'bookings') {
    parts = looksDateTime ? ['booking_date', 'booking_time'] : ['guest_first_name', 'guest_last_name'];
  } else if (file.file_type === 'staff') {
    parts = ['staff_first_name', 'staff_last_name'];
  } else {
    parts = ['first_name', 'last_name'];
  }
  const separator = !sample.includes(' ') && sample.includes(',') ? ',' : ' ';
  return { source, separator, parts };
}

/** Save a split draft as the column's mapping (empty parts are dropped). */
export function withSplit(mappings: MappingRow[], fileId: string, draft: SplitDraft): MappingRow[] {
  const parts = draft.parts.filter(Boolean);
  if (parts.length === 0) return mappings;
  return [
    ...mappings.filter((m) => !(m.file_id === fileId && m.source_column === draft.source)),
    {
      file_id: fileId,
      source_column: draft.source,
      target_field: null,
      action: 'split',
      split_config: { separator: draft.separator || ' ', parts: parts.map((field) => ({ field })) },
      user_overridden: true,
    },
  ];
}

/** Remove a column's split so it can be mapped normally again. */
export function withoutSplit(mappings: MappingRow[], fileId: string, source: string): MappingRow[] {
  return mappings.filter((m) => !(m.file_id === fileId && m.source_column === source && m.action === 'split'));
}

/** What the first sample value becomes under a split draft (the last part takes the rest). */
export function splitPreview(sample: string, draft: SplitDraft): { field: string; value: string }[] {
  if (!sample) return [];
  const sep = draft.separator || ' ';
  const segs = sample.split(sep).map((s) => s.trim()).filter(Boolean);
  const lastIdx = draft.parts.length - 1;
  return draft.parts
    .map((field, i) => ({ field, value: i === lastIdx ? segs.slice(i).join(' ') : segs[i] ?? '' }))
    .filter((p) => p.field);
}

/** One row per file and column (the last edit wins), ready for `mappings/bulk`. */
export function dedupeMappings(mappings: MappingRow[]): MappingRow[] {
  return [...new Map(mappings.map((m) => [`${m.file_id}::${m.source_column}`, m])).values()];
}

export type ColumnSection = { key: 'custom' | 'mapped' | 'attention' | 'ignored'; title: string; hint: string; columns: string[] };

/** A file's columns grouped as the web's map view groups them. */
export function columnSections(file: Pick<ImportFile, 'id' | 'headers'>, mappings: MappingRow[]): ColumnSection[] {
  const custom: string[] = [];
  const mapped: string[] = [];
  const attention: string[] = [];
  const ignored: string[] = [];
  for (const h of file.headers ?? []) {
    const row = mappings.find((m) => m.file_id === file.id && m.source_column === h);
    if (row?.action === 'custom' || row?.action === 'split') custom.push(h);
    else if (row?.action === 'ignore') ignored.push(h);
    else if (row?.action === 'map' && row.target_field) mapped.push(h);
    else attention.push(h);
  }
  const out: ColumnSection[] = [];
  if (custom.length) out.push({ key: 'custom', title: 'Custom and split', hint: 'Kept as a custom field, or split into several fields.', columns: custom });
  if (mapped.length) out.push({ key: 'mapped', title: 'Mapped', hint: 'Check any marked as a guess.', columns: mapped });
  if (attention.length) out.push({ key: 'attention', title: 'Needs attention', hint: 'Not mapped yet. Choose a field for each, or leave it out.', columns: attention });
  if (ignored.length) out.push({ key: 'ignored', title: 'Not imported', hint: 'These columns are left out.', columns: ignored });
  return out;
}
