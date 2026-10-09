/**
 * The Map step's edits (ports of the web's `MapStepClient` and `ImportMapDndView` handlers) and
 * the per-file requirements, so the phone writes the same mapping rows as the dashboard.
 */
import { computeAllFileRequirements, computeFileRequirements } from '@/lib/import/map-requirements';
import {
  columnSections,
  confirmMapping,
  dedupeMappings,
  defaultSplitDraft,
  fieldForSource,
  filesNeedingAutoMap,
  isMappingConfirmed,
  readAutoMappedFileIds,
  replacedSourceFor,
  setMappingForSource,
  sourceForField,
  splitPreview,
  withCustomField,
  withoutSplit,
  withSplit,
} from '@/lib/import/mapping-edits';
import { fieldDisplayLabel, labelForFieldKey, targetFieldsForFileType } from '@/lib/import/schema-fields';
import type { ImportFile, MappingRow } from '@/lib/import/types';

const F = 'file-1';

function file(over: Partial<ImportFile> = {}): ImportFile {
  return {
    id: F,
    filename: 'clients.csv',
    file_type: 'clients',
    row_count: 3,
    column_count: 3,
    headers: ['Name', 'Email', 'Mobile'],
    sample_rows: [{ Name: 'Sarah Jones', Email: 'sarah@example.com', Mobile: '07700 900123' }],
    ...over,
  };
}

const map = (source: string, target: string, over: Partial<MappingRow> = {}): MappingRow => ({
  file_id: F,
  source_column: source,
  target_field: target,
  action: 'map',
  ai_confidence: 'medium',
  ai_suggested: true,
  ...over,
});

describe('schema fields', () => {
  it('maps an unknown file like a client list, as the web does', () => {
    expect(targetFieldsForFileType('unknown')).toBe(targetFieldsForFileType('clients'));
    expect(targetFieldsForFileType('bookings').some((f) => f.key === 'booking_date')).toBe(true);
    expect(targetFieldsForFileType('staff')[0]?.key).toBe('staff_name');
  });

  it("uses the venue's word for a client on personal fields only", () => {
    const email = targetFieldsForFileType('bookings').find((f) => f.key === 'client_email')!;
    const price = targetFieldsForFileType('bookings').find((f) => f.key === 'price')!;
    expect(fieldDisplayLabel(email, 'Member')).toBe('Member Email');
    expect(fieldDisplayLabel(price, 'Member')).toBe('Price');
  });

  it('names no currency in a money field', () => {
    const labels = [...targetFieldsForFileType('clients'), ...targetFieldsForFileType('bookings')].map((f) => f.label);
    expect(labels.some((l) => /[£$€]/.test(l))).toBe(false);
    expect(labelForFieldKey('total_spent', 'clients')).toBe('Total Spent');
    expect(labelForFieldKey(null, 'clients')).toBe('Not set');
  });
});

describe('auto-map selection', () => {
  it('maps a file with no mappings, and a partly mapped file once only', () => {
    const files = [file(), file({ id: 'f2', headers: ['A', 'B'] }), file({ id: 'f3', headers: ['A'] })];
    const mappings = [
      { file_id: 'f2', source_column: 'A' },
      { file_id: 'f3', source_column: 'A' },
    ];
    expect(filesNeedingAutoMap(files, mappings, []).map((f) => f.id)).toEqual([F, 'f2']);
    expect(filesNeedingAutoMap(files, mappings, ['f2']).map((f) => f.id)).toEqual([F]);
  });

  it('reads the auto-mapped ids from the session settings', () => {
    expect(readAutoMappedFileIds({ auto_mapped_file_ids: ['a', 3, 'b'] })).toEqual(['a', 'b']);
    expect(readAutoMappedFileIds(null)).toEqual([]);
  });
});

describe('mapping edits', () => {
  it('maps a column by hand: confirmed, and the field leaves the column that held it', () => {
    const start = [map('Name', 'full_name'), map('Mobile', 'phone')];
    expect(replacedSourceFor(start, F, 'Email', 'phone')).toBe('Mobile');
    const next = setMappingForSource(start, F, 'Email', 'phone');
    expect(sourceForField(next, F, 'phone')).toBe('Email');
    expect(fieldForSource(next, F, 'Mobile')).toBeNull();
    expect(isMappingConfirmed(next, F, 'phone')).toBe(true);
    expect(next.find((m) => m.source_column === 'Email')?.ai_confidence).toBe('high');
  });

  it("ignores a column for Don't import", () => {
    const next = setMappingForSource([map('Mobile', 'phone')], F, 'Mobile', '');
    expect(next).toEqual([
      expect.objectContaining({ source_column: 'Mobile', action: 'ignore', target_field: null, user_overridden: true }),
    ]);
  });

  it('confirms an AI suggestion as it stands', () => {
    const start = [map('Name', 'full_name')];
    expect(isMappingConfirmed(start, F, 'full_name')).toBe(false);
    expect(isMappingConfirmed(confirmMapping(start, F, 'Name', 'full_name'), F, 'full_name')).toBe(true);
  });

  it('keeps a column as a custom field named after it', () => {
    const next = withCustomField([map('Notes!', 'notes')], F, 'Notes!');
    expect(next).toEqual([
      expect.objectContaining({ action: 'custom', custom_field_name: 'Notes', custom_field_type: 'text', target_field: null }),
    ]);
  });

  it('suggests split parts from the file type and the sample value', () => {
    expect(defaultSplitDraft([], file(), 'Name')).toEqual({ source: 'Name', separator: ' ', parts: ['first_name', 'last_name'] });
    const bookings = file({ file_type: 'bookings', headers: ['When'], sample_rows: [{ When: '2025-07-14 10:00' }] });
    expect(defaultSplitDraft([], bookings, 'When').parts).toEqual(['booking_date', 'booking_time']);
    const comma = file({ sample_rows: [{ Name: 'Jones,Sarah' }] });
    expect(defaultSplitDraft([], comma, 'Name').separator).toBe(',');
  });

  it('saves, previews and removes a split', () => {
    const draft = { source: 'Name', separator: ' ', parts: ['first_name', '', 'last_name'] };
    const next = withSplit([map('Name', 'full_name')], F, draft);
    expect(next).toEqual([
      expect.objectContaining({
        action: 'split',
        split_config: { separator: ' ', parts: [{ field: 'first_name' }, { field: 'last_name' }] },
      }),
    ]);
    expect(splitPreview('Mary Ann Jones', { source: 'Name', separator: ' ', parts: ['first_name', 'last_name'] })).toEqual([
      { field: 'first_name', value: 'Mary' },
      { field: 'last_name', value: 'Ann Jones' },
    ]);
    expect(withoutSplit(next, F, 'Name')).toEqual([]);
    expect(defaultSplitDraft(next, file(), 'Name').parts).toEqual(['first_name', 'last_name']);
  });

  it('sends one row per column, the last edit winning', () => {
    const rows = dedupeMappings([map('Name', 'full_name'), map('Name', 'first_name'), map('Email', 'email')]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source_column === 'Name')?.target_field).toBe('first_name');
  });

  it('groups columns as the web does', () => {
    const f = file({ headers: ['Name', 'Email', 'Mobile', 'Notes'] });
    const sections = columnSections(f, [
      map('Name', 'full_name'),
      { ...map('Email', ''), action: 'ignore', target_field: null },
      { file_id: F, source_column: 'Notes', target_field: null, action: 'custom' },
    ]);
    expect(sections.map((s) => [s.key, s.columns])).toEqual([
      ['custom', ['Notes']],
      ['mapped', ['Name']],
      ['attention', ['Mobile']],
      ['ignored', ['Email']],
    ]);
  });
});

describe('map requirements', () => {
  it('needs a name for a client list, from a split as well as a field', () => {
    expect(computeFileRequirements(file(), [], 'Client').satisfied).toBe(false);
    const split = withSplit([], F, { source: 'Name', separator: ' ', parts: ['first_name', 'last_name'] });
    expect(computeFileRequirements(file(), split, 'Client').satisfied).toBe(true);
  });

  it('takes the time from a combined date and time column', () => {
    const bookings = file({ file_type: 'bookings', headers: ['When', 'Email'], sample_rows: [{ When: '14/07/2025 10:00', Email: 'a@b.c' }] });
    const req = computeFileRequirements(bookings, [map('When', 'booking_date'), map('Email', 'client_email')], 'Client');
    expect(req.satisfied).toBe(true);
    expect(req.items.find((i) => i.key === 'booking_time')?.hint).toMatch(/taken from your combined/);
  });

  it("names the venue's client word and never uses an em-dash", () => {
    const bookings = file({ file_type: 'bookings' });
    const all = computeAllFileRequirements([bookings, file({ id: 'f2', file_type: 'staff' })], [], 'Member');
    const text = all.flatMap((r) => r.items.flatMap((i) => [i.label, i.hint ?? ''])).join(' ');
    expect(text).toContain('Member identity');
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});
