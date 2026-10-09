/**
 * The Validate step's words and rules. Port of the web's `ValidateStepClient` helpers: the
 * plain name of each issue type, the decision labels, which issues can be opened as a row,
 * and when the import may be approved.
 */
import type { ValidationIssue } from '@/lib/import/types';

export type IssueDecision = 'skip' | 'update_existing' | 'import_anyway';
export type DateFormatChoice = 'dd/MM/yyyy' | 'MM/dd/yyyy';

/** The two ways to read 03/04/2025, named without a country. */
export const DATE_FORMAT_OPTIONS: { value: DateFormatChoice; label: string }[] = [
  { value: 'dd/MM/yyyy', label: 'Day first (DD/MM/YYYY)' },
  { value: 'MM/dd/yyyy', label: 'Month first (MM/DD/YYYY)' },
];

export function issueTypeLabel(t: string, clientLabel = 'Client'): string {
  const plural = `${clientLabel}s`;
  const labels: Record<string, string> = {
    reference_skipped: 'Services or staff you chose to skip',
    booking_defaults_missing: 'Venue setup needed before bookings can import',
    no_contact_details: `Rows with no way to identify the ${clientLabel.toLowerCase()}`,
    skipped_at_execute: 'Rows skipped during import',
    imported_with_note: 'Rows imported with a note',
    missing_required: 'Rows missing required information',
    email_invalid: 'Email addresses that look wrong',
    duplicate_email: 'Duplicate email addresses in your file',
    duplicate_phone: 'Duplicate phone numbers in your file',
    existing_client: `${plural} that already exist in ResNeo`,
    date_format_ambiguous: 'Dates that could be read two ways',
    duplicate_external_client_id: `Duplicate ${clientLabel.toLowerCase()} IDs in your file`,
    duplicate_external_appointment_id: 'Duplicate appointment IDs',
    duplicate_booking_row: 'Rows that repeat an earlier row (these are skipped)',
    booking_overlap: 'Upcoming appointments that overlap',
    phone_invalid: 'Phone numbers that look wrong',
  };
  return labels[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function decisionLabel(d: string): string {
  if (d === 'update_existing') return 'Update existing';
  if (d === 'import_anyway') return 'Import anyway';
  if (d === 'skip') return 'Skip row';
  return d.replace(/_/g, ' ');
}

/** The choices offered per issue, for the two issue types that take one. */
export function decisionsForIssue(issueType: string): IssueDecision[] {
  if (issueType === 'existing_client') return ['update_existing', 'skip'];
  if (issueType === 'email_invalid') return ['import_anyway', 'skip'];
  return [];
}

/** Issues that are about the file as a whole (a skipped service, venue setup), not a row. */
export function isSyntheticReferenceIssue(i: Pick<ValidationIssue, 'issue_type' | 'row_number'>): boolean {
  return i.issue_type === 'reference_skipped' || i.issue_type === 'booking_defaults_missing' || i.row_number >= 800_000;
}

/** Issues grouped by type, the groups in alphabetical order of type as on the web. */
export function groupIssues(issues: ValidationIssue[]): [string, ValidationIssue[]][] {
  const m = new Map<string, ValidationIssue[]>();
  for (const i of issues) {
    const list = m.get(i.issue_type) ?? [];
    list.push(i);
    m.set(i.issue_type, list);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function issueCounts(issues: ValidationIssue[]): { errorCount: number; warningCount: number } {
  return {
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
  };
}

export function unresolvedExistingClients(issues: ValidationIssue[]): number {
  return issues.filter((i) => i.issue_type === 'existing_client' && !i.user_decision).length;
}

export function bookingDefaultsBlocking(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.issue_type === 'booking_defaults_missing');
}

/** Whether "Review and approve" is open: checked, nothing undecided, and not already run. */
export function canApproveImport(state: {
  jobError: string | null;
  busy: boolean;
  started: boolean;
  issues: ValidationIssue[];
}): boolean {
  return (
    !state.jobError &&
    !state.busy &&
    !state.started &&
    unresolvedExistingClients(state.issues) === 0 &&
    !bookingDefaultsBlocking(state.issues)
  );
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
