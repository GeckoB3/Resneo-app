/**
 * Text formatting for a captured compliance record's answers. Mirrors
 * `formatComplianceDate` / `formatComplianceAnswer` in the web dashboard's
 * src/components/dashboard/compliance/shared.ts; keep the two in step.
 */

import type { ComplianceFormField } from '@/types/compliance';

/** DD/MM/YYYY. Handles both full ISO timestamps and bare YYYY-MM-DD dates. */
export function formatComplianceDate(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  // A bare calendar date: format the parts directly so it never shifts a day across a timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** An option's label for a stored option value; falls back to the value if the option is gone. */
function optionLabel(options: ComplianceFormField['options'], value: unknown): string {
  return options?.find((o) => o.value === value)?.label ?? String(value);
}

/** Render a stored form answer as text for the record view (option values become their labels). */
export function formatComplianceAnswer(field: ComplianceFormField, value: unknown): string {
  if (value == null || value === '') return 'Not set';
  switch (field.type) {
    case 'signature': {
      const v = value as { method?: string };
      return v && typeof v === 'object' ? (v.method === 'typed' ? 'Signed (typed)' : 'Signature on file') : String(value);
    }
    case 'file': {
      const v = value as { file_name?: string };
      return (v && typeof v === 'object' && v.file_name) ? v.file_name : 'File uploaded';
    }
    case 'multiselect': {
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0) return 'Not set';
      return values.map((v) => optionLabel(field.options, v)).join(', ');
    }
    case 'select':
      return optionLabel(field.options, value);
    case 'date':
      return formatComplianceDate(String(value));
    default:
      return String(value);
  }
}
