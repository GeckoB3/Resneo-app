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

/** Friendly label for a record's derived `result` value (never render the raw token). */
export const RESULT_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  inconclusive: 'Inconclusive',
  completed: 'Completed',
  signed: 'Signed',
};

/** Audit event type → human label (mirrors web AUDIT_EVENT_LABELS in shared.ts). */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  'type.created': 'Type created',
  'type.updated': 'Type updated',
  'type.archived': 'Type archived',
  'type.restored': 'Type restored',
  'version.created': 'New form version',
  'requirement.added': 'Requirement added',
  'requirement.removed': 'Requirement removed',
  'requirement.updated': 'Requirement updated',
  'record.captured': 'Record captured',
  'record.updated': 'Record updated',
  'record.voided': 'Record voided',
  'record.viewed': 'Record viewed',
  'guest.compliance_erased': 'Compliance data erased',
  'link.issued': 'Form link issued',
  'link.sent': 'Form link sent',
  'link.consumed': 'Form submitted',
  'link.expired': 'Form link expired',
  'link.revoked': 'Form link revoked',
};

export function auditEventLabel(eventType: string): string {
  return AUDIT_EVENT_LABELS[eventType] ?? eventType;
}

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
