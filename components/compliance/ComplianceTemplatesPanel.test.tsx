/**
 * ComplianceTemplatesPanel: the Forms list in Compliance settings (spec 2026-11-07).
 *
 * "Form" is the word a user reads; the empty list says what to do next; Duplicate opens the copy
 * in the editor; the editor learns how many services ask for the open form, so archiving one
 * in use confirms first; and Choose services opens from an active row, from the editor, and
 * straight after a create, once the editor has closed.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ComplianceTemplatesPanel } from '@/components/compliance/ComplianceTemplatesPanel';
import { ApiError } from '@/lib/api/client';
import type { ComplianceTemplateListRow } from '@/lib/queries/useComplianceTypeManage';

const mockToastSuccess = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn(), info: jest.fn() }),
}));

const mockStaff = { role: 'admin' };
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: mockStaff.role } } }),
}));

const mockList: { rows: ComplianceTemplateListRow[]; error: unknown } = { rows: [], error: null };
const mockDuplicate = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/lib/queries/useComplianceTypeManage', () => ({
  useComplianceTemplatesList: () => ({
    data: mockList.error ? undefined : { types: mockList.rows },
    isLoading: false,
    isError: Boolean(mockList.error),
    error: mockList.error,
    refetch: mockRefetch,
  }),
  useDuplicateComplianceType: () => ({ mutate: mockDuplicate, isPending: false }),
}));

// The editor and library sheets have their own tests; here we only see what the panel hands them.
// The editor's two ways on to Choose services are a tap away, as if its create or button fired.
type ChooseForm = { id: string; name: string; clientOnline: boolean };
jest.mock('@/components/compliance/ComplianceTypeEditorSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ComplianceTypeEditorSheet: (props: {
      visible: boolean;
      typeId: string | null;
      mode: string;
      serviceCount?: number;
      onCreated?: (form: ChooseForm) => void;
      onChooseServices?: (form: ChooseForm) => void;
    }) =>
      props.visible
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              RNText,
              { testID: 'editor' },
              JSON.stringify({ typeId: props.typeId, mode: props.mode, serviceCount: props.serviceCount }),
            ),
            React.createElement(
              RNText,
              {
                testID: 'editor-created',
                onPress: () => props.onCreated?.({ id: 'type-9', name: 'Intake', clientOnline: false }),
              },
              'created',
            ),
            React.createElement(
              RNText,
              {
                testID: 'editor-choose',
                onPress: () =>
                  props.onChooseServices?.({ id: 'type-1', name: 'PPD Patch Test', clientOnline: false }),
              },
              'choose',
            ),
          )
        : null,
  };
});
jest.mock('@/components/compliance/ComplianceLibrarySheet', () => ({
  ComplianceLibrarySheet: () => null,
}));
const mockChooseSaved = { fire: null as null | (() => void) };
jest.mock('@/components/compliance/ComplianceChooseServicesSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ComplianceChooseServicesSheet: (props: {
      visible: boolean;
      form: ChooseForm | null;
      justCreated?: boolean;
      onClose: () => void;
      onSaved?: () => void;
    }) => {
      mockChooseSaved.fire = props.onSaved ?? null;
      return props.visible
        ? React.createElement(
            RNText,
            { testID: 'choose', onPress: props.onClose },
            JSON.stringify({ form: props.form, justCreated: props.justCreated }),
          )
        : null;
    },
  };
});

const row = (overrides: Partial<ComplianceTemplateListRow> = {}): ComplianceTemplateListRow => ({
  id: 'type-1',
  name: 'PPD Patch Test',
  category: 'test',
  result_type: 'pass_fail',
  validity_period_days: 180,
  capture_methods: ['staff_in_venue'],
  form_link_expiry_days: null,
  is_active: true,
  current_version_number: 1,
  service_requirement_count: 3,
  record_count: 1,
  ...overrides,
});

function chooseProps() {
  return JSON.parse(String(screen.getByTestId('choose').props.children)) as {
    form: ChooseForm;
    justCreated?: boolean;
  };
}

function editorProps() {
  return JSON.parse(String(screen.getByTestId('editor').props.children)) as {
    typeId: string | null;
    mode: string;
    serviceCount?: number;
  };
}

beforeEach(() => {
  mockStaff.role = 'admin';
  mockList.rows = [row()];
  mockList.error = null;
  mockDuplicate.mockReset();
  mockToastSuccess.mockReset();
  mockRefetch.mockReset();
});

describe('ComplianceTemplatesPanel', () => {
  it('calls them forms', async () => {
    await render(<ComplianceTemplatesPanel />);
    expect(
      screen.getByText('The forms your business collects: patch tests, consent forms, intake questionnaires.'),
    ).toBeTruthy();
    expect(screen.getByText('Create a form')).toBeTruthy();
    expect(screen.getByText('Forms')).toBeTruthy();
    expect(screen.getByText('3 services · 1 record')).toBeTruthy();
  });

  it('tells a non-admin only admins can edit forms', async () => {
    mockStaff.role = 'staff';
    await render(<ComplianceTemplatesPanel />);
    expect(
      screen.getByText(
        'The forms your business collects: patch tests, consent forms, intake questionnaires. Only admins can edit forms.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Create a form')).toBeNull();
  });

  it('says what to do when there are no forms yet', async () => {
    mockList.rows = [];
    await render(<ComplianceTemplatesPanel />);
    expect(screen.getByTestId('forms-empty')).toHaveTextContent(
      'No forms yet. Add one from the library or create your own.',
    );
  });

  it('says every form is archived, and how to see them', async () => {
    mockList.rows = [row({ is_active: false })];
    await render(<ComplianceTemplatesPanel />);
    expect(screen.getByTestId('forms-empty')).toHaveTextContent(
      'Every form is archived. Turn on Show archived to see them, or add a new one.',
    );
  });

  it('points an admin at the General tab when compliance is off', async () => {
    mockList.error = new ApiError('Compliance is not enabled', 403);
    await render(<ComplianceTemplatesPanel />);
    expect(screen.getByText('Turn on compliance records in the General tab to manage forms.')).toBeTruthy();
  });

  it('opens a form with how many services ask for it', async () => {
    await render(<ComplianceTemplatesPanel />);
    await fireEvent.press(screen.getByLabelText('Edit PPD Patch Test'));
    expect(editorProps()).toEqual({ typeId: 'type-1', mode: 'edit', serviceCount: 3 });
  });

  it('opens the copy in the editor after Duplicate', async () => {
    mockDuplicate.mockImplementation(
      (_id: string, opts: { onSuccess: (copy: unknown) => void }) =>
        opts.onSuccess({ type: { id: 'type-2', name: 'PPD Patch Test (copy)' }, version: null }),
    );
    await render(<ComplianceTemplatesPanel />);
    expect(screen.queryByTestId('editor')).toBeNull();
    await fireEvent.press(screen.getByText('Duplicate'));
    expect(mockDuplicate.mock.calls[0]![0]).toBe('type-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Copy made. Change anything you like.');
    // The copy is not in the (mocked) list yet, so it has no services: archiving it never confirms.
    expect(editorProps()).toEqual({ typeId: 'type-2', mode: 'edit', serviceCount: 0 });
  });
});

describe('ComplianceTemplatesPanel: Choose services (spec 2026-11-07 §13)', () => {
  it('offers it on every active form, and opens it on that form', async () => {
    mockList.rows = [
      row({ capture_methods: ['staff_in_venue', 'client_online'] }),
      row({ id: 'type-2', name: 'Old consent', is_active: false }),
    ];
    await render(<ComplianceTemplatesPanel />);
    await fireEvent(screen.getByRole('switch', { name: 'Show archived' }), 'valueChange', true);
    // Two forms listed, one of them archived: Duplicate on both, Choose services on the active one.
    expect(screen.getAllByText('Duplicate')).toHaveLength(2);
    expect(screen.getAllByText('Choose services')).toHaveLength(1);
    expect(screen.queryByTestId('choose')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Choose services for PPD Patch Test'));
    expect(chooseProps()).toEqual({
      form: { id: 'type-1', name: 'PPD Patch Test', clientOnline: true },
      justCreated: false,
    });
  });

  it('tells the sheet whether clients fill the form in online', async () => {
    mockList.rows = [row({ capture_methods: ['staff_in_venue'] })];
    await render(<ComplianceTemplatesPanel />);
    await fireEvent.press(screen.getByText('Choose services'));
    expect(chooseProps().form.clientOnline).toBe(false);
  });

  it('refreshes the forms list counts after a save, and closes', async () => {
    await render(<ComplianceTemplatesPanel />);
    await fireEvent.press(screen.getByText('Choose services'));
    mockChooseSaved.fire?.();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('choose'));
    expect(screen.queryByTestId('choose')).toBeNull();
  });

  it('is not offered to a non-admin', async () => {
    mockStaff.role = 'staff';
    await render(<ComplianceTemplatesPanel />);
    expect(screen.queryByText('Choose services')).toBeNull();
  });

  it('asks which services need a form straight after it is created, once the editor has gone', async () => {
    await render(<ComplianceTemplatesPanel />);
    await fireEvent.press(screen.getByText('Create a form'));
    expect(editorProps()).toMatchObject({ typeId: null, mode: 'create' });

    await fireEvent.press(screen.getByTestId('editor-created'));
    // The editor closes first; one sheet cannot open over another.
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.queryByTestId('choose')).toBeNull();
    expect(await screen.findByTestId('choose')).toBeTruthy();
    expect(chooseProps()).toEqual({
      form: { id: 'type-9', name: 'Intake', clientOnline: false },
      justCreated: true,
    });
  });

  it("opens it from the editor's Choose services the same way", async () => {
    await render(<ComplianceTemplatesPanel />);
    await fireEvent.press(screen.getByLabelText('Edit PPD Patch Test'));
    await fireEvent.press(screen.getByTestId('editor-choose'));
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(await screen.findByTestId('choose')).toBeTruthy();
    expect(chooseProps()).toEqual({
      form: { id: 'type-1', name: 'PPD Patch Test', clientOnline: false },
      justCreated: false,
    });
  });
});
