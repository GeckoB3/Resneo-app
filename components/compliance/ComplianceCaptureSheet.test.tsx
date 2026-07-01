/**
 * ComplianceCaptureSheet QC (Domain 13). Two server-confirmed 400s are guarded
 * here:
 *
 *  1. `file` fields let staff upload a document via the staff records/upload
 *     endpoint; when none is picked the field contributes NO value to `responses`,
 *     and a REQUIRED file field with no upload blocks submit ("This field is
 *     required.") rather than POSTing an invalid payload.
 *
 *  2. Drawn signatures are wrapped as `{ method:'drawn', data:<png url>, signed_at }`
 *     — the PNG comes from SignaturePad (covered in SignaturePad.test.tsx); here
 *     we pin the wrapping the sheet applies around whatever the pad emits.
 *
 * jest hoists mock factories above imports, so factory-closed vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// Stand in for the gesture/SVG-backed pad: a button that emits a PNG data URL,
// exactly as the real pad does after rasterising via toDataURL.
const FAKE_PNG_URL = 'data:image/png;base64,iVBORw0KGgoFAKE==';
jest.mock('@/components/compliance/SignaturePad', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SignaturePad: ({ onChange }: { onChange: (url: string | null) => void }) =>
      React.createElement(
        Pressable,
        { accessibilityLabel: 'emit-drawn', onPress: () => onChange(FAKE_PNG_URL) },
        React.createElement(Text, null, 'draw'),
      ),
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// File picker — default to "cancelled" so no upload runs unless a test overrides it.
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

// Controlled compliance type + capture mutation.
let mockSchema: any = null;
const mockMutate = jest.fn();
jest.mock('@/lib/queries/useCompliance', () => ({
  useComplianceType: () => ({
    data: mockSchema ? { type: { id: 't1', name: 'T' }, version: { form_schema: mockSchema } } : null,
    isLoading: false,
    isError: false,
  }),
  useCaptureComplianceRecord: () => ({ mutate: mockMutate, isPending: false }),
  useUploadComplianceRecordFile: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { ComplianceCaptureSheet } from '@/components/compliance/ComplianceCaptureSheet';

function renderSheet() {
  return render(
    <ComplianceCaptureSheet
      visible
      onClose={jest.fn()}
      guestId="g1"
      complianceTypeId="t1"
      complianceTypeName="Patch test"
    />,
  );
}

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockMutate.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockSchema = null;
});

describe('ComplianceCaptureSheet — file fields', () => {
  it('renders a file field with an upload control and submits NO value when none is picked', async () => {
    mockSchema = {
      schema_version: '1.0',
      title: 'T',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'doc', type: 'file', label: 'ID document', required: false },
      ],
    };
    await renderSheet();

    // An upload affordance is offered (not a disabled hint).
    expect(screen.getByText('Choose file')).toBeTruthy();

    // Fill the required text field, then save without picking a file.
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Name'), 'Jane');
    });
    await press(() => screen.getByText('Save record'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0];
    // The (optional, un-picked) file field contributes nothing to responses.
    expect('doc' in payload.responses).toBe(false);
    expect(payload.responses).toEqual({ name: 'Jane' });
  });

  it('blocks submit for a REQUIRED file field with no uploaded file', async () => {
    mockSchema = {
      schema_version: '1.0',
      title: 'T',
      fields: [{ id: 'doc', type: 'file', label: 'ID document', required: true }],
    };
    await renderSheet();

    await press(() => screen.getByText('Save record'));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('This field is required.')).toBeTruthy();
  });
});

describe('ComplianceCaptureSheet — drawn signature', () => {
  it('wraps the pad PNG as { method:"drawn", data:<png url>, signed_at }', async () => {
    mockSchema = {
      schema_version: '1.0',
      title: 'T',
      fields: [{ id: 'sig', type: 'signature', label: 'Sign', required: true }],
    };
    await renderSheet();

    // Emit a drawn signature from the (mocked) pad, then save.
    await press(() => screen.getByLabelText('emit-drawn'));
    await press(() => screen.getByText('Save record'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const sig = mockMutate.mock.calls[0]![0].responses.sig;
    expect(sig.method).toBe('drawn');
    expect(sig.data).toBe(FAKE_PNG_URL);
    expect(typeof sig.signed_at).toBe('string');
    expect(sig.data).toMatch(/^data:image\/png;base64,/);
  });
});
