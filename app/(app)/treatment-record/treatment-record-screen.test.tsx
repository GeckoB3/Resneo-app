/**
 * The treatment record editor screen (web plan §9): lazy creation with the service's starter text,
 * one save at a time against the version it edited, Copy from last record, a conflict that keeps
 * the person's text, the late entry and edited lines with See changes, the forms panel, and delete
 * with a reason. The data calls are stubbed.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { TreatmentEditorContext, TreatmentRecordDetail, TreatmentVersionsResponse } from '@/types/treatment-records';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/compliance/ComplianceCaptureSheet', () => ({ ComplianceCaptureSheet: () => null }));
jest.mock('@/lib/security/useScreenCaptureProtection', () => ({ useScreenCaptureProtection: () => undefined }));

let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockNavigation = { addListener: jest.fn(() => () => undefined), dispatch: jest.fn() };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { timezone: 'Europe/London' } }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));

let mockDetail: TreatmentRecordDetail | undefined;
let mockContext: TreatmentEditorContext;
let mockVersions: TreatmentVersionsResponse | undefined;
const mockCreate = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/queries/useTreatmentRecords', () => ({
  useTreatmentRecord: (id: string | null) => ({ data: id ? mockDetail : undefined, error: null }),
  useTreatmentContext: () => ({ data: mockContext, error: null, refetch: jest.fn() }),
  useTreatmentSuggestions: () => ({ data: { product_names: [], batches: [], from_your_products: [] } }),
  useTreatmentVersions: () => ({ data: mockVersions, isError: false }),
  useClientAlerts: () => ({ data: [] }),
  useAddClientAlert: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveClientAlert: () => ({ mutate: jest.fn(), isPending: false }),
  createTreatmentRecord: (...args: unknown[]) => mockCreate(...args),
  saveTreatmentRecord: (...args: unknown[]) => mockSave(...args),
  deleteTreatmentRecord: (...args: unknown[]) => mockDelete(...args),
  fetchTreatmentRecord: jest.fn(),
  fetchTreatmentPhotoUrl: jest.fn(),
  labelTreatmentPhoto: jest.fn(),
  removeTreatmentPhoto: jest.fn(),
  uploadTreatmentPhoto: jest.fn(),
  shareTreatmentPdf: jest.fn(),
}));

import TreatmentRecordScreen from './[id]';

function context(overrides: Partial<TreatmentEditorContext> = {}): TreatmentEditorContext {
  return {
    client: { guest_id: 'g-1', name: 'Jo Client' },
    alerts: [],
    service: { service_item_id: 's-1', name: 'Lip filler', template_text: 'Areas treated:' },
    practitioner: { calendar_id: 'c-1', name: 'Sam' },
    treated_at: '2026-10-22T13:00:00Z',
    last_record: { id: 'r-0', treated_at: '2026-09-01T10:00:00Z', service_name: 'Lip filler' },
    forms: {
      requirements: [{ compliance_type_id: 't-1', name: 'Medical history', state: 'missing', completed_at: null }],
      photo_consent: { state: 'missing', completed_at: null, compliance_type_id: 't-2', name: 'Photo consent' },
    },
    practitioners: [],
    services: [],
    linked: false,
    owner_venue_id: 'v-1',
    ...overrides,
  };
}

function detail(overrides: Partial<TreatmentRecordDetail['record']> = {}, rest: Partial<TreatmentRecordDetail> = {}): TreatmentRecordDetail {
  return {
    record: {
      id: 'r-1',
      treated_at: '2026-10-22T13:00:00Z',
      created_at: '2026-10-22T13:40:00Z',
      service_item_id: 's-1',
      service_name: 'Lip filler',
      booking_id: 'b-1',
      practitioner_calendar_id: 'c-1',
      practitioner_name: 'Sam',
      author_name: 'Sam',
      author_venue_id: 'v-1',
      author_venue_name: null,
      last_edited_by_name: 'Sam',
      last_edited_at: '2026-10-22T13:40:00Z',
      version_count: 0,
      product_count: 0,
      photo_count: 0,
      first_photo_preview_url: null,
      note: 'Areas treated: top lip',
      version: 3,
      copied_from_record_id: null,
      updated_at: '2026-10-22T13:40:00Z',
      deleted_at: null,
      deleted_by_name: null,
      deleted_reason: null,
      ...overrides,
    },
    products: [],
    photos: [],
    alerts: [],
    can_edit: true,
    can_delete: true,
    can_restore: false,
    can_see_views: false,
    ...rest,
  };
}

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <TreatmentRecordScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockParams = {};
  mockDetail = undefined;
  mockVersions = undefined;
  mockContext = context();
  mockCreate.mockReset();
  mockSave.mockReset();
  mockDelete.mockReset();
  mockRouter.back.mockClear();
  mockToast.error.mockClear();
});

describe('TreatmentRecordScreen', () => {
  it('starts a new record from the booking with the starter text, and creates it on the first change', async () => {
    mockParams = { id: 'new', guestId: 'g-1', bookingId: 'b-1' };
    mockCreate.mockImplementation(async (_tok: string, input: { note: string }) => detail({ id: 'r-new', note: input.note, version: 1 }));
    mockSave.mockResolvedValue({ version: 2 });
    await renderScreen();

    expect(screen.getByDisplayValue('Areas treated:')).toBeTruthy();
    expect(screen.getByText('22 Oct 2026 at 14:00 · Lip filler · Sam')).toBeTruthy();
    // Opening the screen creates nothing.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockCreate).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Areas treated:'), 'Areas treated: top lip');
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockCreate).toHaveBeenCalledWith('tok', {
      guest_id: 'g-1',
      booking_id: 'b-1',
      note: 'Areas treated: top lip',
      practitioner_calendar_id: 'c-1',
      products: [],
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Areas treated: top lip'), 'Areas treated: top lip, 1 ml');
    });
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockSave).toHaveBeenCalledWith('tok', 'r-new', { version: 1, note: 'Areas treated: top lip, 1 ml' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('shows the forms for the treatment with Capture now', async () => {
    mockParams = { id: 'new', guestId: 'g-1', bookingId: 'b-1' };
    await renderScreen();
    expect(screen.getByText('Forms for this treatment')).toBeTruthy();
    expect(screen.getByText('Missing')).toBeTruthy();
    expect(screen.getByText('No photo consent on file')).toBeTruthy();
    expect(screen.getAllByText('Capture now')).toHaveLength(2);
  });

  it('copies from the last record at once, with the check-every-line banner', async () => {
    mockParams = { id: 'new', guestId: 'g-1' };
    mockContext = context({ service: null });
    mockCreate.mockResolvedValue(
      detail(
        { id: 'r-copy', note: 'Lip filler, 1 ml', version: 1, copied_from_record_id: 'r-0' },
        { products: [{ product_name: 'Juvederm', batch_number: null, expiry_date: null, amount: 1, unit: 'ml', area: 'Lips' }] },
      ),
    );
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('Copy from last record'));
    });
    expect(mockCreate).toHaveBeenCalledWith('tok', expect.objectContaining({ guest_id: 'g-1', copy_from_record_id: 'r-0' }));
    expect(screen.getByText(/^Copied from the record of 1 Sep.* 2026\. Batch numbers and expiry dates are left blank\. Check every line\.$/)).toBeTruthy();
    expect(screen.getByDisplayValue('Lip filler, 1 ml')).toBeTruthy();
    expect(screen.getByDisplayValue('Juvederm')).toBeTruthy();
    expect(screen.queryByText('Copy from last record')).toBeNull();
  });

  it('hides Copy from last record once something is typed', async () => {
    mockParams = { id: 'new', guestId: 'g-1' };
    mockContext = context({ service: null });
    await renderScreen();
    expect(screen.getByText('Copy from last record')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText(/What you did/), 'Top lip');
    });
    expect(screen.queryByText('Copy from last record')).toBeNull();
  });

  it('stops on a conflict, keeps the person’s text and offers Reload', async () => {
    mockParams = { id: 'r-1', guestId: 'g-1' };
    mockDetail = detail();
    mockSave.mockRejectedValue(new ApiError('Changed', 409, { error: 'Changed', code: 'TREATMENT_RECORD_CHANGED', changed_by: 'Ali' }));
    await renderScreen();
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Areas treated: top lip'), 'Areas treated: top lip, swelling');
    });
    await waitFor(
      () => expect(screen.getByText('Ali changed this record just now. Reload to see their changes. Your text is still below to copy.')).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(mockSave).toHaveBeenCalledWith('tok', 'r-1', { version: 3, note: 'Areas treated: top lip, swelling' });
    expect(screen.getByLabelText('Your text').props.value).toBe('Areas treated: top lip, swelling');
    expect(screen.getByText('Reload')).toBeTruthy();
  });

  it('marks a late entry, shows who edited it, and opens See changes', async () => {
    mockParams = { id: 'r-1', guestId: 'g-1' };
    mockDetail = detail({
      treated_at: '2026-10-20T10:00:00Z',
      created_at: '2026-10-23T09:00:00Z',
      version_count: 1,
      last_edited_by_name: 'Ali',
      last_edited_at: '2026-10-23T11:00:00Z',
    });
    mockVersions = {
      current: { version: 4, edited_by_name: 'Ali', edited_at: '2026-10-23T11:00:00Z', changed_fields: ['note'] },
      versions: [
        {
          id: 'v-1',
          captured_version: 3,
          edited_by_name: 'Sam',
          edited_by_venue_name: null,
          edited_at: '2026-10-23T09:00:00Z',
          changed_fields: [],
          note: 'Areas treated:',
          treated_at: '2026-10-20T10:00:00Z',
          service_name: 'Lip filler',
          practitioner_name: 'Sam',
          products: [{ product_name: 'Juvederm', batch_number: 'JV-1', expiry_date: '2027-03-31', amount: 1, unit: 'ml', area: 'Lips' }],
          photos: [],
        },
      ],
    };
    await renderScreen();
    expect(screen.getByText('Written by Sam on 23 Oct 2026 at 10:00')).toBeTruthy();
    expect(screen.getByText('Written on 23 Oct 2026, after the treatment')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('See changes'));
    });
    expect(screen.getByText('Changes to this record')).toBeTruthy();
    expect(screen.getByText(/Ali, 23 Oct 2026 at 12:00\. Changed: Notes/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sam, 23 Oct 2026 at 10:00. First written'));
    });
    expect(screen.getByText('• Juvederm, batch JV-1, expires 31 Mar 2027, 1 ml, Lips')).toBeTruthy();
  });

  it('holds a save while offline, says so, and saves on reconnecting', async () => {
    mockParams = { id: 'r-1', guestId: 'g-1' };
    mockDetail = detail();
    mockSave.mockResolvedValue({ version: 4 });
    onlineManager.setOnline(false);
    try {
      await renderScreen();
      await act(async () => {
        fireEvent.changeText(screen.getByDisplayValue('Areas treated: top lip'), 'Areas treated: top lip, offline');
      });
      await waitFor(() => expect(screen.getByText('Not saved yet. You’re offline.')).toBeTruthy(), { timeout: 3000 });
      expect(mockSave).not.toHaveBeenCalled();

      await act(async () => {
        onlineManager.setOnline(true);
      });
      await waitFor(() => expect(mockSave).toHaveBeenCalledWith('tok', 'r-1', { version: 3, note: 'Areas treated: top lip, offline' }));
      await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    } finally {
      onlineManager.setOnline(true);
    }
  }, 10_000);

  it('deletes with a reason, then goes back', async () => {
    mockParams = { id: 'r-1', guestId: 'g-1' };
    mockDetail = detail();
    mockDelete.mockResolvedValue(undefined);
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText('Delete record'));
    });
    expect(screen.getByText('It will disappear from Jo Client’s history. An admin can still see it and restore it.')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Reason (optional)'), ' Wrong client ');
    });
    const buttons = screen.getAllByText('Delete record');
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]!);
    });
    expect(mockDelete).toHaveBeenCalledWith('tok', 'r-1', 'Wrong client');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows a deleted record read only, with who deleted it', async () => {
    mockParams = { id: 'r-1', guestId: 'g-1' };
    mockDetail = detail({ deleted_at: '2026-10-23T09:00:00Z', deleted_by_name: 'Ali', deleted_reason: 'Wrong client' });
    await renderScreen();
    expect(screen.getByText('Deleted by Ali on 23 Oct 2026: Wrong client')).toBeTruthy();
    expect(screen.getByDisplayValue('Areas treated: top lip').props.editable).toBe(false);
    expect(screen.queryByText('Delete record')).toBeNull();
  });
});
