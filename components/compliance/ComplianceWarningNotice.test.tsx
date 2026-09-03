/**
 * ComplianceWarningNotice (R23-1). Staff are never blocked by compliance on the
 * web since 2026-09-01, so a venue's block_all rule reaches the confirmation as a
 * `required` warning instead of a 409. The notice has to say so in the venue's
 * words, not as a reminder, and it has to offer the way to capture the record.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  ComplianceWarningNotice,
  splitComplianceWarnings,
} from '@/components/compliance/ComplianceWarningNotice';
import type { ComplianceBookingWarning } from '@/lib/queries/useCreateBooking';

const warning = (
  name: string,
  severity?: ComplianceBookingWarning['severity'],
): ComplianceBookingWarning => ({
  compliance_type_id: `type-${name}`,
  compliance_type_name: name,
  enforcement: severity === 'required' ? 'block_all' : 'warn_staff',
  state: 'missing',
  ...(severity ? { severity } : {}),
});

describe('splitComplianceWarnings', () => {
  it('puts block_all rules under required and everything else under advisory', () => {
    const { required, advisory } = splitComplianceWarnings([
      warning('Consent form', 'required'),
      warning('Patch test', 'advisory'),
    ]);
    expect(required).toEqual(['Consent form']);
    expect(advisory).toEqual(['Patch test']);
  });

  it('treats a warning with no severity (older server) as advisory', () => {
    const { required, advisory } = splitComplianceWarnings([warning('Patch test')]);
    expect(required).toEqual([]);
    expect(advisory).toEqual(['Patch test']);
  });

  it('names each type once, even when several segments repeat it', () => {
    const { required } = splitComplianceWarnings([
      warning('Consent form', 'required'),
      warning('Consent form', 'required'),
    ]);
    expect(required).toEqual(['Consent form']);
  });

  it('is empty for no warnings', () => {
    expect(splitComplianceWarnings(undefined)).toEqual({ required: [], advisory: [] });
  });
});

describe('ComplianceWarningNotice', () => {
  it('renders nothing without warnings', async () => {
    await render(<ComplianceWarningNotice warnings={[]} />);
    expect(screen.queryByText('Outstanding compliance forms')).toBeNull();
  });

  it("states a required record as the venue's requirement, and offers capture", async () => {
    const onCapture = jest.fn();
    await render(
      <ComplianceWarningNotice
        warnings={[warning('Consent form', 'required'), warning('Patch test', 'advisory')]}
        onCapture={onCapture}
      />,
    );
    expect(screen.getByText('Outstanding compliance forms')).toBeTruthy();
    expect(
      screen.getByText(/this venue requires Consent form for this booking and it is not on file/),
    ).toBeTruthy();
    expect(screen.getByText(/Patch test is not on file yet/)).toBeTruthy();
    fireEvent.press(screen.getByText('Capture in venue'));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('joins several required names and uses the plural', async () => {
    await render(
      <ComplianceWarningNotice
        warnings={[warning('Consent form', 'required'), warning('Medical history', 'required')]}
      />,
    );
    expect(
      screen.getByText(/requires Consent form and Medical history for this booking and they are not on file/),
    ).toBeTruthy();
    expect(screen.queryByText('Capture in venue')).toBeNull();
  });

  it('keeps the softer reminder copy for advisory-only warnings', async () => {
    await render(<ComplianceWarningNotice warnings={[warning('Patch test')]} />);
    expect(screen.getByText(/Patch test is not on file yet/)).toBeTruthy();
    expect(screen.queryByText(/this venue requires/)).toBeNull();
  });
});
