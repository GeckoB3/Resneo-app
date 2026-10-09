import { formatComplianceAnswer, formatComplianceDate } from '@/lib/compliance/record-format';
import type { ComplianceFormField } from '@/types/compliance';

const OPTIONS = [
  { value: 'box_dye', label: 'Box dye' },
  { value: 'henna', label: 'Henna' },
  { value: 'none', label: 'None of these' },
];
const multiselect: ComplianceFormField = { id: 'history', type: 'multiselect', label: 'Colour history', options: OPTIONS };
const select: ComplianceFormField = { id: 'history', type: 'select', label: 'Colour history', options: OPTIONS };

describe('formatComplianceAnswer', () => {
  it('shows a Checkboxes answer as its option labels, not the stored values', () => {
    expect(formatComplianceAnswer(multiselect, ['box_dye'])).toBe('Box dye');
    expect(formatComplianceAnswer(multiselect, ['box_dye', 'henna'])).toBe('Box dye, Henna');
  });

  it('keeps a Checkboxes value whose option has since been removed', () => {
    expect(formatComplianceAnswer(multiselect, ['box_dye', 'bleach'])).toBe('Box dye, bleach');
  });

  it('labels a single stored Checkboxes value that is not an array', () => {
    expect(formatComplianceAnswer(multiselect, 'henna')).toBe('Henna');
  });

  it('shows a dash for an empty Checkboxes answer', () => {
    expect(formatComplianceAnswer(multiselect, [])).toBe('Not set');
    expect(formatComplianceAnswer(multiselect, undefined)).toBe('Not set');
  });

  it('shows a Dropdown answer as its option label', () => {
    expect(formatComplianceAnswer(select, 'none')).toBe('None of these');
    expect(formatComplianceAnswer(select, 'bleach')).toBe('bleach');
  });

  it('copes with a field that carries no options', () => {
    expect(formatComplianceAnswer({ id: 'x', type: 'multiselect', label: 'X' }, ['a'])).toBe('a');
  });
});

describe('formatComplianceDate', () => {
  it('formats a bare calendar date as DD/MM/YYYY (no timezone shift)', () => {
    expect(formatComplianceDate('2026-06-01')).toBe('01/06/2026');
  });

  it('returns a dash for empty or invalid input', () => {
    expect(formatComplianceDate(null)).toBe('Not set');
    expect(formatComplianceDate('not-a-date')).toBe('Not set');
  });
});
