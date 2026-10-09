/**
 * The import wizard's smaller rules: the hub's status words, the Undo summary, the references
 * step, the Validate step's labels and approval rule, the Import step's clock, value maps and
 * the Upload step's file checks. Ports of the web's helpers; the copy is checked for the rules
 * the app's copy follows (no em-dash, no country names).
 */
import { elapsedLabel, etaLabel, formatElapsed, formatEta, notStartedStep } from '@/lib/import/progress';
import {
  bulkCreateOperations,
  bulkRowsFor,
  createLabelForReference,
  createReferenceBody,
  currencySymbolFor,
  defaultCreateDraft,
  entityTypeForReference,
  optionsForReference,
  OTHER_TAB,
  parsePriceMinor,
  referencesForTab,
  referenceTabs,
  servicesLookFresh,
} from '@/lib/import/references';
import {
  canContinue,
  canResume,
  importedCountsLine,
  importStepRoute,
  IMPORT_STEPS,
  statusLabel,
  statusTone,
} from '@/lib/import/session-status';
import type { BookingReference, ImportProgress, ReferenceCatalog, ValidationIssue } from '@/lib/import/types';
import { describeImportUndoKept } from '@/lib/import/undo-summary';
import { canContinueUpload, importFileAllowed, importFileMimeType, sampleCsv } from '@/lib/import/upload';
import {
  canApproveImport,
  DATE_FORMAT_OPTIONS,
  decisionsForIssue,
  groupIssues,
  issueTypeLabel,
  isSyntheticReferenceIssue,
} from '@/lib/import/validate-step';
import { valueMapFromRows, valueMapRows } from '@/lib/import/value-map';

describe('hub status', () => {
  const s = (status: string, undone_at: string | null = null) => ({ status, undone_at });
  it('shows "Undone" over the status, and the web tones', () => {
    expect(statusLabel(s('complete', '2026-01-01'))).toBe('Undone');
    expect(statusTone(s('complete', '2026-01-01'))).toBe('danger');
    expect(statusLabel(s('validating'))).toBe('Checking');
    expect(statusTone(s('complete'))).toBe('success');
    expect(statusTone(s('importing'))).toBe('brand');
  });
  it('offers Continue while setting up and Resume while importing', () => {
    expect(['uploading', 'mapping', 'validating', 'ready'].every((st) => canContinue(s(st)))).toBe(true);
    expect(canContinue(s('importing'))).toBe(false);
    expect(canResume(s('importing'))).toBe(true);
  });
  it('counts in the venue word and routes to each step', () => {
    expect(importedCountsLine({ imported_clients: 1, imported_bookings: 2 }, 'Member')).toBe('1 member, 2 bookings');
    expect(importStepRoute('a b', 'map')).toBe('/import/a%20b/map');
    expect(IMPORT_STEPS.map((x) => x.key)).toEqual(['upload', 'map', 'review', 'references', 'validate', 'importing']);
  });
});

describe('undo summary', () => {
  it('says who was kept and why, in the venue word', () => {
    const lines = describeImportUndoKept(
      { kept_clients: 2, kept_client_names: ['Ann Lee', 'Bo Chan'], kept_items: 1, kept_item_names: ['Cut'], kept_bookings: 1 },
      'Member',
    );
    expect(lines[0]).toMatch(/^2 members were kept.*Ann Lee, Bo Chan/);
    expect(lines[1]).toMatch(/^1 booking was kept, because money was taken/);
    expect(lines[2]).toMatch(/^1 service or calendar was kept.*Cut\.$/);
    expect(describeImportUndoKept(null, 'Client')).toEqual([]);
  });
});

const catalog = (over: Partial<ReferenceCatalog> = {}): ReferenceCatalog => ({
  bookingModel: 'unified_scheduling',
  serviceItems: [{ id: 'svc-1', name: 'Cut' }],
  calendars: [{ id: 'cal-1', name: 'Emma' }],
  practitioners: [{ id: 'pr-1', name: 'Dr Lee' }],
  appointmentServices: [{ id: 'as-1', name: 'Consult' }],
  ...over,
});
const ref = (over: Partial<BookingReference>): BookingReference => ({
  id: 'r1',
  reference_type: 'service',
  raw_value: 'Haircut',
  is_resolved: false,
  ...over,
});

describe('references step', () => {
  it('builds tabs in order with Other for unknown types', () => {
    const refs = [ref({ id: 'a', reference_type: 'staff' }), ref({ id: 'b' }), ref({ id: 'c', reference_type: 'room' })];
    expect(referenceTabs(refs)).toEqual(['service', 'staff', OTHER_TAB]);
    expect(referencesForTab(refs, OTHER_TAB, 3).map((r) => r.id)).toEqual(['c']);
  });

  it('matches against the right catalogue for the booking model', () => {
    expect(entityTypeForReference(ref({}), catalog())).toBe('service_item');
    expect(optionsForReference(ref({ reference_type: 'staff' }), catalog())[0]?.name).toBe('Emma');
    const pa = catalog({ bookingModel: 'practitioner_appointment' });
    expect(entityTypeForReference(ref({ reference_type: 'staff' }), pa)).toBe('practitioner');
    expect(optionsForReference(ref({}), pa)[0]?.name).toBe('Consult');
    expect(createLabelForReference(ref({ reference_type: 'staff' }), pa)).toBe('Add as new practitioner');
    expect(createLabelForReference(ref({ reference_type: 'event' }), pa)).toBeNull();
  });

  it('seeds the create form from the booking data, 60 minutes by default', () => {
    expect(defaultCreateDraft(ref({}), undefined)).toEqual({ name: 'Haircut', duration: '60', price: '' });
    expect(
      defaultCreateDraft(ref({}), { reference_id: 'r1', suggested_duration_minutes: 45, suggested_price_pence: 3500, sample_count: 3 }),
    ).toEqual({ name: 'Haircut', duration: '45', price: '35.00' });
  });

  it('reads prices with any symbol, a decimal comma or a thousands comma', () => {
    expect(parsePriceMinor('£35.00')).toBe(3500);
    expect(parsePriceMinor('12,50')).toBe(1250);
    expect(parsePriceMinor('1,200')).toBe(120000);
    expect(parsePriceMinor('')).toBeNull();
    expect(parsePriceMinor('abc')).toBeNull();
    expect(currencySymbolFor('EUR')).toBe('€');
  });

  it('sends the create body and the bulk operations the server takes', () => {
    expect(createReferenceBody(ref({}), { name: ' Cut ', duration: '30', price: '20' })).toEqual({
      resolution_action: 'create',
      create_label: 'Cut',
      create_duration_minutes: 30,
      create_price_pence: 2000,
    });
    expect(createReferenceBody(ref({ reference_type: 'staff', raw_value: 'Emma' }), { name: '', duration: '30', price: '20' })).toEqual({
      resolution_action: 'create',
      create_label: 'Emma',
    });
    const rows = bulkRowsFor([ref({}), ref({ id: 'r2', raw_value: 'Colour' }), ref({ id: 'r3', is_resolved: true })], 'service', {});
    rows[1]!.selected = false;
    expect(bulkCreateOperations(rows, 'service', catalog())).toEqual([
      { reference_id: 'r1', action: 'create', resolved_entity_type: 'service_item', create_label: 'Haircut', create_duration_minutes: 60, create_price_pence: null },
    ]);
  });

  it('leads with the build-from-bookings offer for a venue with few services', () => {
    const three = [ref({ id: 'a' }), ref({ id: 'b' }), ref({ id: 'c' })];
    expect(servicesLookFresh(three, catalog())).toBe(true);
    expect(servicesLookFresh(three.slice(0, 2), catalog())).toBe(false);
  });
});

const issue = (over: Partial<ValidationIssue>): ValidationIssue => ({
  id: 'i1',
  file_id: 'f1',
  row_number: 2,
  severity: 'warning',
  issue_type: 'existing_client',
  message: 'Matches Ann Lee',
  user_decision: null,
  ...over,
});

describe('validate step', () => {
  it('approves only when checked, decided and not yet run', () => {
    const base = { jobError: null, busy: false, started: false };
    expect(canApproveImport({ ...base, issues: [issue({})] })).toBe(false);
    expect(canApproveImport({ ...base, issues: [issue({ user_decision: 'skip' })] })).toBe(true);
    expect(canApproveImport({ ...base, issues: [issue({ issue_type: 'booking_defaults_missing' })] })).toBe(false);
    expect(canApproveImport({ ...base, started: true, issues: [] })).toBe(false);
  });

  it('labels, groups and offers decisions as the web does', () => {
    expect(issueTypeLabel('existing_client', 'Member')).toBe('Members that already exist in ResNeo');
    expect(groupIssues([issue({ issue_type: 'b' }), issue({ id: 'x', issue_type: 'a' })]).map(([t]) => t)).toEqual(['a', 'b']);
    expect(decisionsForIssue('email_invalid')).toEqual(['import_anyway', 'skip']);
    expect(isSyntheticReferenceIssue(issue({ row_number: 800_001 }))).toBe(true);
  });

  it('names the two date formats without a country', () => {
    const labels = DATE_FORMAT_OPTIONS.map((o) => o.label).join(' ');
    expect(labels).not.toMatch(/\b(UK|US|American|British)\b/);
  });
});

describe('import clock', () => {
  const p = (over: Partial<ImportProgress>): ImportProgress => ({
    status: 'importing',
    percent: 50,
    progress_processed: 50,
    progress_total: 100,
    imported_clients: 0,
    imported_bookings: 0,
    skipped_rows: 0,
    ...over,
  });
  it('formats elapsed time and time left', () => {
    expect(formatElapsed(75)).toBe('1m 15s');
    expect(formatEta(30)).toBe('about 30s');
    expect(elapsedLabel(p({}), 1000, 61_000)).toBe('1m');
    expect(etaLabel(p({}), 1000, 11_000)).toBe('about 10s');
    expect(etaLabel(p({ status: 'complete' }), 1000, 11_000)).toBeNull();
  });
  it('sends an unapproved import back to the right step', () => {
    expect(notStartedStep('mapping')).toEqual({ step: 'map', label: 'Back to Map' });
    expect(notStartedStep('ready').step).toBe('validate');
  });
});

describe('value maps', () => {
  it('drops blanks, trims and lets the last row win', () => {
    expect(valueMapFromRows([{ from: ' CXL ', to: 'Cancelled' }, { from: '', to: 'Booked' }, { from: 'CXL', to: 'No-Show' }])).toEqual({ CXL: 'No-Show' });
    expect(valueMapFromRows([])).toBeNull();
    expect(valueMapRows({ value_map: { NS: 'No-Show' } })).toEqual([{ from: 'NS', to: 'No-Show' }]);
  });
});

describe('upload checks', () => {
  it('takes the files the server takes', () => {
    expect(['a.csv', 'b.XLSX', 'c.xls', 'd.tsv', 'e.txt'].every(importFileAllowed)).toBe(true);
    expect(importFileAllowed('f.pdf')).toBe(false);
    expect(importFileMimeType('a.xlsx', 'application/octet-stream')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(importFileMimeType('a.csv', 'text/comma-separated-values')).toBe('text/comma-separated-values');
  });
  it('unlocks Continue once every file is labelled and nothing is reorganising', () => {
    expect(canContinueUpload([], 0)).toBe(false);
    expect(canContinueUpload([{ file_type: 'clients' }], 0)).toBe(true);
    expect(canContinueUpload([{ file_type: 'unknown' }], 0)).toBe(false);
    expect(canContinueUpload([{ file_type: 'bookings', reshape_status: 'pending' }], 0)).toBe(false);
    expect(canContinueUpload([{ file_type: 'bookings' }], 1)).toBe(false);
  });
  it('builds the example files as CSV', () => {
    const { filename, body } = sampleCsv('bookings');
    expect(filename).toBe('sample-bookings.csv');
    expect(body.split('\r\n')[0]).toBe('Date,Time,Client name,Email,Phone,Service,Staff,Price,Status');
    expect(body).toContain('Colour & cut');
  });
});
