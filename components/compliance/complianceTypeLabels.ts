/**
 * Human labels for the compliance-template domain. Port of the label maps in
 * _reference/Resneo/src/components/dashboard/compliance/shared.ts and
 * ComplianceFormBuilder.tsx — keep wording in sync with the web dashboard.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  test: 'Test',
  consent: 'Consent',
  intake: 'Intake',
  declaration: 'Declaration',
  certificate: 'Certificate',
};

export const RESULT_TYPE_LABELS: Record<string, string> = {
  pass_fail: 'Pass / fail',
  signed: 'Signed',
  completed: 'Completed',
  file_uploaded: 'File upload',
};

/** Longer result-type descriptions used by the web form builder. */
export const RESULT_TYPE_DESCRIPTIONS: Record<string, string> = {
  pass_fail: 'Staff decide a pass or fail result',
  signed: 'Requires a signature',
  completed: 'Completed — no result recorded',
  file_uploaded: 'Requires a file upload',
};

export const CAPTURE_METHOD_LABELS: Record<string, string> = {
  staff_in_venue: 'Staff in venue',
  client_online: 'Client online',
};

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Dropdown',
  multiselect: 'Checkboxes',
  date: 'Date',
  signature: 'Signature',
  file: 'File upload',
};

/** Human label for a validity period (days): null = lifetime, 0 = per visit. */
export function validityLabel(days: number | null | undefined): string {
  if (days == null) return 'No expiry';
  if (days === 0) return 'Per visit';
  if (days % 365 === 0) return `${days / 365} year${days / 365 > 1 ? 's' : ''}`;
  return `${days} days`;
}
