/**
 * ComplianceTypeEditorSheet: the form builder sheet.
 *
 * The result type (web 2026-11-07): every record is judged by its form's current result type, so
 * the web lets it change only until the first record is saved with the form, and says so on the
 * type (`result_type_locked`). The sheet offers the choice while it is free, shows it read-only
 * after, and sends it on save only while free. An older web build sends no flag, which reads as
 * locked, as before.
 *
 * Set-up parity (spec 2026-11-07): one "Clients can fill this in online" switch, the archive
 * confirmation, Duplicate opening the copy, friendlier errors, question settings the app has
 * no control for (a date's `sets_record_date`) surviving an edit and save, and the ways on to
 * Choose services (a button beside Duplicate, and straight after a create).
 */
import type { ComponentProps } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ComplianceTypeEditorSheet } from '@/components/compliance/ComplianceTypeEditorSheet';

jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockToastSuccess = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn(), info: jest.fn() }),
}));

const NOTES_FIELD = { id: 'f_notes', type: 'text', label: 'Anything we should know', required: false };

const mockDetail: {
  locked: boolean | undefined;
  captureMethods: string[];
  fields: Record<string, unknown>[];
  active: boolean;
} = { locked: undefined, captureMethods: [], fields: [], active: true };
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockDuplicate = jest.fn();
const mockArchive = jest.fn();
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false });

jest.mock('@/lib/queries/useComplianceTypeManage', () => ({
  ...jest.requireActual('@/lib/queries/useComplianceTypeManage'),
  useComplianceTemplateDetail: () => ({
    data: {
      type: {
        id: 'type-1',
        name: 'Treatment consent',
        category: 'consent',
        result_type: 'completed',
        validity_period_days: null,
        capture_methods: mockDetail.captureMethods,
        form_link_expiry_days: null,
        online_unmet_message: null,
        is_active: mockDetail.active,
      },
      version: {
        id: 'v1',
        version_number: 1,
        form_schema: {
          schema_version: '1.0',
          title: 'Treatment consent',
          fields: mockDetail.fields,
        },
      },
      ...(mockDetail.locked === undefined ? {} : { result_type_locked: mockDetail.locked }),
    },
    isLoading: false,
  }),
  useUpdateComplianceTemplate: () => ({ mutate: mockUpdate, isPending: false }),
  useCreateComplianceTemplate: () => ({ mutate: mockCreate, isPending: false }),
  useComplianceTypeVersions: () => ({ data: { versions: [] }, isLoading: false }),
  useRestoreComplianceVersion: () => mutation(),
  useDuplicateComplianceType: () => ({ mutate: mockDuplicate, isPending: false }),
  useArchiveComplianceType: () => ({ mutate: mockArchive, isPending: false }),
  useRestoreComplianceType: () => mutation(),
}));

beforeEach(() => {
  mockDetail.locked = undefined;
  mockDetail.captureMethods = ['staff_in_venue', 'client_online'];
  mockDetail.fields = [NOTES_FIELD];
  mockDetail.active = true;
  for (const fn of [mockUpdate, mockCreate, mockDuplicate, mockArchive, mockToastSuccess]) fn.mockReset();
});

async function open(
  locked: boolean | undefined,
  props: Partial<ComponentProps<typeof ComplianceTypeEditorSheet>> = {},
) {
  mockDetail.locked = locked;
  await render(
    <ComplianceTypeEditorSheet visible canEdit typeId="type-1" mode="edit" onClose={jest.fn()} {...props} />,
  );
}

/** The `patch` the one save sent. */
function savedPatch() {
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  return mockUpdate.mock.calls[0]![0].patch;
}

describe('ComplianceTypeEditorSheet: the result type', () => {
  it('can change until the first record is saved, and the save sends it', async () => {
    await open(false);
    expect(screen.getByTestId('result-type-hint')).toHaveTextContent(
      'You can change this until the first record is saved with this form.',
    );
    await fireEvent.press(screen.getByText('Signed (requires a signature)'));
    // A signed form needs a signature, so switch back to one this form suits before saving.
    await fireEvent.press(screen.getByText('Completed (no result)'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![0]).toMatchObject({ typeId: 'type-1', patch: { result_type: 'completed' } });
  });

  it('is shown read-only once records have been saved, and the save leaves it out', async () => {
    await open(true);
    expect(screen.queryByText('Signed (requires a signature)')).toBeNull();
    expect(screen.getByTestId('result-type-hint')).toHaveTextContent(
      /^This cannot change now that records have been saved with this form, because it decides whether they count\./,
    );
    await fireEvent.press(screen.getByText('Save changes'));
    expect(savedPatch()).not.toHaveProperty('result_type');
  });

  it('stays read-only when an older web build does not say', async () => {
    await open(undefined);
    expect(screen.queryByText('Signed (requires a signature)')).toBeNull();
  });
});

describe('ComplianceTypeEditorSheet: who fills the form in', () => {
  it('is one switch, on for a form clients can complete, and staff capture is always sent', async () => {
    await open(true);
    const online = screen.getByRole('switch', { name: 'Clients can fill this in online' });
    expect(online).toHaveProp('value', true);
    expect(
      screen.getByText('Your team can always fill it in at your business or send the client a link.'),
    ).toBeTruthy();
    // The old pair of "Captured by" choices is gone.
    expect(screen.queryByText('Staff in venue')).toBeNull();

    await fireEvent(online, 'valueChange', false);
    await fireEvent.press(screen.getByText('Save changes'));
    expect(savedPatch().capture_methods).toEqual(['staff_in_venue']);
  });

  it('turns online completion back on', async () => {
    mockDetail.captureMethods = ['staff_in_venue'];
    await open(true);
    const online = screen.getByRole('switch', { name: 'Clients can fill this in online' });
    expect(online).toHaveProp('value', false);
    await fireEvent(online, 'valueChange', true);
    await fireEvent.press(screen.getByText('Save changes'));
    expect(savedPatch().capture_methods).toEqual(['staff_in_venue', 'client_online']);
  });

  it('is on by default for a new form', async () => {
    await render(
      <ComplianceTypeEditorSheet visible canEdit typeId={null} mode="create" onClose={jest.fn()} />,
    );
    expect(screen.getByText('New form')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Intake');
    await fireEvent.press(screen.getByText('+ Short text'));
    await fireEvent.press(screen.getByText('Create form'));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      name: 'Intake',
      capture_methods: ['staff_in_venue', 'client_online'],
    });
  });
});

describe('ComplianceTypeEditorSheet: friendlier errors', () => {
  it('asks for a name and a question before creating', async () => {
    await render(
      <ComplianceTypeEditorSheet visible canEdit typeId={null} mode="create" onClose={jest.fn()} />,
    );
    await fireEvent.press(screen.getByText('Create form'));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Give the form a name.')).toBeTruthy();
    expect(screen.getByText('Add at least one question.')).toBeTruthy();
  });

  it('shows the schema check in plain words', async () => {
    await open(false);
    await fireEvent.press(screen.getByText('Pass / fail (staff decide a result)'));
    // The staff Result question picking pass/fail added: remove it, and the mapping goes with it.
    const removes = screen.getAllByText('Remove');
    await fireEvent.press(removes[removes.length - 1]!);
    await fireEvent.press(screen.getByText('Save changes'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Choose the question your team uses to record pass or fail.')).toBeTruthy();
  });
});

describe('ComplianceTypeEditorSheet: small copy', () => {
  it('says what a validity change does to records already held, when editing', async () => {
    await open(true);
    expect(screen.getByTestId('validity-edit-hint')).toHaveTextContent(
      'Changes apply to records collected from now on. Records you already hold keep their expiry date.',
    );
    expect(screen.getByText('Expires after a number of days')).toBeTruthy();
    expect(screen.getByText('Only used to group your forms.')).toBeTruthy();
    expect(screen.getByText(/^Shown when a client can't book online because this form is missing/)).toBeTruthy();
  });

  it('has no validity hint on a new form', async () => {
    await render(
      <ComplianceTypeEditorSheet visible canEdit typeId={null} mode="create" onClose={jest.fn()} />,
    );
    expect(screen.queryByTestId('validity-edit-hint')).toBeNull();
  });
});

describe('ComplianceTypeEditorSheet: archive', () => {
  it('confirms first when services ask for the form', async () => {
    await open(true, { serviceCount: 2 });
    await fireEvent.press(screen.getByText('Archive'));
    expect(mockArchive).not.toHaveBeenCalled();
    const confirm = within(screen.getByTestId('archive-confirm'));
    expect(confirm.getByText('Archive Treatment consent?')).toBeTruthy();
    expect(
      confirm.getByText(
        'It is asked for on 2 services. Archiving stops it being asked for. Records are kept, and you can restore it at any time.',
      ),
    ).toBeTruthy();

    await fireEvent.press(confirm.getByText('Cancel'));
    expect(screen.queryByTestId('archive-confirm')).toBeNull();
    expect(mockArchive).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Archive'));
    await fireEvent.press(within(screen.getByTestId('archive-confirm')).getByText('Archive'));
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(mockArchive.mock.calls[0]![0]).toBe('type-1');
  });

  it('says "1 service" for one (the All bookings row counts as one)', async () => {
    await open(true, { serviceCount: 1 });
    await fireEvent.press(screen.getByText('Archive'));
    expect(within(screen.getByTestId('archive-confirm')).getByText(/^It is asked for on 1 service\./)).toBeTruthy();
  });

  it('archives at once when no service asks for the form', async () => {
    await open(true, { serviceCount: 0 });
    await fireEvent.press(screen.getByText('Archive'));
    expect(screen.queryByTestId('archive-confirm')).toBeNull();
    expect(mockArchive).toHaveBeenCalledTimes(1);
  });
});

describe('ComplianceTypeEditorSheet: duplicate', () => {
  it('opens the copy in the editor and says so', async () => {
    mockDuplicate.mockImplementation(
      (_id: string, opts: { onSuccess: (copy: unknown) => void }) =>
        opts.onSuccess({ type: { id: 'type-2', name: 'Treatment consent (copy)' }, version: null }),
    );
    const onOpenType = jest.fn();
    const onClose = jest.fn();
    await open(true, { onOpenType, onClose });
    await fireEvent.press(screen.getByText('Duplicate'));
    expect(mockDuplicate.mock.calls[0]![0]).toBe('type-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Copy made. Change anything you like.');
    expect(onOpenType).toHaveBeenCalledWith('type-2');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ComplianceTypeEditorSheet: Choose services (spec 2026-11-07 §13)', () => {
  it('is offered beside Duplicate for an active form, and hands the form on', async () => {
    const onChooseServices = jest.fn();
    const onClose = jest.fn();
    await open(true, { onChooseServices, onClose });
    await fireEvent.press(screen.getByText('Choose services'));
    expect(onChooseServices).toHaveBeenCalledWith({
      id: 'type-1',
      name: 'Treatment consent',
      clientOnline: true,
    });
    // The panel closes the editor itself before it opens the next sheet.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says whether clients fill the form in online, as saved', async () => {
    mockDetail.captureMethods = ['staff_in_venue'];
    const onChooseServices = jest.fn();
    await open(true, { onChooseServices });
    await fireEvent.press(screen.getByText('Choose services'));
    expect(onChooseServices.mock.calls[0]![0]).toMatchObject({ clientOnline: false });
  });

  it('is not offered for an archived form', async () => {
    mockDetail.active = false;
    await open(true, { onChooseServices: jest.fn() });
    expect(screen.getByText('Duplicate')).toBeTruthy();
    expect(screen.queryByText('Choose services')).toBeNull();
  });

  it('goes straight on to it after a create, with what was just sent', async () => {
    mockCreate.mockImplementation(
      (_input: unknown, opts: { onSuccess: (created: unknown) => void }) =>
        opts.onSuccess({ type: { id: 'new-type', name: 'Intake' }, version: null }),
    );
    const onCreated = jest.fn();
    const onClose = jest.fn();
    const onSaved = jest.fn();
    await render(
      <ComplianceTypeEditorSheet
        visible
        canEdit
        typeId={null}
        mode="create"
        onClose={onClose}
        onSaved={onSaved}
        onCreated={onCreated}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Intake');
    await fireEvent(screen.getByRole('switch', { name: 'Clients can fill this in online' }), 'valueChange', false);
    await fireEvent.press(screen.getByText('+ Short text'));
    await fireEvent.press(screen.getByText('Create form'));
    expect(onCreated).toHaveBeenCalledWith({ id: 'new-type', name: 'Intake', clientOnline: false });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // The next sheet's title says the form is ready.
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('just closes and says so after a create when nothing asks which services need it', async () => {
    mockCreate.mockImplementation(
      (_input: unknown, opts: { onSuccess: (created: unknown) => void }) =>
        opts.onSuccess({ type: { id: 'new-type', name: 'Intake' }, version: null }),
    );
    const onClose = jest.fn();
    await render(
      <ComplianceTypeEditorSheet visible canEdit typeId={null} mode="create" onClose={onClose} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Intake');
    await fireEvent.press(screen.getByText('+ Short text'));
    await fireEvent.press(screen.getByText('Create form'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Intake created.');
  });
});

describe('ComplianceTypeEditorSheet: settings the builder does not show', () => {
  it("keeps a date question's sets_record_date (and unknown keys) through an edit and save", async () => {
    mockDetail.fields = [
      {
        id: 'f_test_date',
        type: 'date',
        label: 'Date of patch test',
        required: true,
        sets_record_date: true,
        later_setting: 'kept',
      },
      NOTES_FIELD,
    ];
    await open(true);
    await fireEvent.changeText(screen.getByDisplayValue('Anything we should know'), 'Anything else?');
    await fireEvent.press(screen.getByText('Save changes'));
    const fields = savedPatch().form_schema.fields;
    expect(fields[0]).toMatchObject({
      id: 'f_test_date',
      type: 'date',
      sets_record_date: true,
      later_setting: 'kept',
    });
    expect(fields[1]).toMatchObject({ id: 'f_notes', label: 'Anything else?' });
  });
});
