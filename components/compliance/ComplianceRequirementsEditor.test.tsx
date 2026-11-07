/**
 * ComplianceRequirementsEditor: a result only the team can record (web QA 2026-11-07).
 *
 * A patch test whose "Result" is for staff only can never be met by a form the client fills in,
 * so a blocking requirement set to be completed online can never let a client book. The web
 * marks such a row `compliance_type_client_form_can_meet: false`; the editor warns, as the web
 * settings do. An older web build sends no flag, which must show nothing.
 */
import { render, screen } from '@testing-library/react-native';

import { ComplianceRequirementsEditor } from '@/components/compliance/ComplianceRequirementsEditor';
import type { ComplianceRequirementRow } from '@/lib/queries/useComplianceRequirements';

jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockRequirements: { rows: ComplianceRequirementRow[] } = { rows: [] };
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false });

jest.mock('@/lib/queries/useComplianceRequirements', () => ({
  ...jest.requireActual('@/lib/queries/useComplianceRequirements'),
  useComplianceRequirements: () => ({ data: { requirements: mockRequirements.rows }, isLoading: false }),
  useVenueWideComplianceRequirements: () => ({ data: { requirements: [] }, isLoading: false }),
  useAddComplianceRequirement: () => mutation(),
  useUpdateComplianceRequirement: () => mutation(),
  useDeleteComplianceRequirement: () => mutation(),
}));

jest.mock('@/lib/queries/useComplianceTypeManage', () => ({
  useComplianceTemplatesList: () => ({
    data: {
      types: [
        {
          id: 'type-1',
          name: 'PPD Patch Test',
          category: 'test',
          result_type: 'pass_fail',
          is_active: true,
          capture_methods: ['staff_in_venue', 'client_online'],
        },
      ],
    },
  }),
}));

const row = (overrides: Partial<ComplianceRequirementRow> = {}): ComplianceRequirementRow => ({
  id: 'req-1',
  scope: 'service',
  compliance_type_id: 'type-1',
  enforcement: 'block_online',
  lock_period_hours: null,
  online_collection: 'inline',
  appointment_service_id: null,
  service_item_id: 'svc-1',
  compliance_type_name: 'PPD Patch Test',
  compliance_type_category: 'test',
  compliance_type_is_active: true,
  compliance_type_client_form_can_meet: false,
  ...overrides,
});

async function show(r: ComplianceRequirementRow) {
  mockRequirements.rows = [r];
  await render(<ComplianceRequirementsEditor serviceId="svc-1" complianceEnabled />);
}

describe('ComplianceRequirementsEditor: a result only the team can record', () => {
  it('warns that a blocking patch test shown in the booking flow can never let a client book', async () => {
    await show(row());
    expect(screen.getByTestId('compliance-team-records-result')).toHaveTextContent(
      /Only your team can record a result for this, so a form the client fills in\s+online can never let them book\./,
    );
  });

  it('says nothing when the requirement only warns, since the booking goes ahead anyway', async () => {
    await show(row({ enforcement: 'warn_staff' }));
    expect(screen.queryByTestId('compliance-team-records-result')).toBeNull();
  });

  it('says nothing when the client can answer the result, or an older web build sends no flag', async () => {
    await show(row({ compliance_type_client_form_can_meet: true }));
    expect(screen.queryByTestId('compliance-team-records-result')).toBeNull();
    await show(row({ compliance_type_client_form_can_meet: undefined }));
    expect(screen.queryByTestId('compliance-team-records-result')).toBeNull();
  });
});

describe('ComplianceRequirementsEditor: wording (spec 2026-11-07)', () => {
  it('says an archived form is no longer asked for', async () => {
    await show(row({ compliance_type_is_active: false }));
    expect(screen.getByText('Archived, not asked for')).toBeTruthy();
    expect(screen.queryByText(/\(archived\)/)).toBeNull();
  });

  it('shows no archived label for an active form', async () => {
    await show(row());
    expect(screen.queryByText('Archived, not asked for')).toBeNull();
  });

  it('labels and explains Block all in the new words', async () => {
    await show(row({ enforcement: 'block_all' }));
    expect(screen.getByText('Block online, required for staff')).toBeTruthy();
    expect(
      screen.getByText(
        'Clients cannot book this service online until a valid record is on file. Your team can still book it, and sees a red Required flag until the record is collected.',
      ),
    ).toBeTruthy();
  });

  it('explains Warn staff in the new words', async () => {
    await show(row({ enforcement: 'warn_staff' }));
    expect(
      screen.getByText(
        'The booking still goes through. Your team sees an outstanding-form flag on the calendar and booking. Whether the client is asked for it online depends on Online booking below.',
      ),
    ).toBeTruthy();
  });
});
