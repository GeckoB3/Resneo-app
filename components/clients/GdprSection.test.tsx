/**
 * The GDPR card's data export follows "Can export client data" (web roles plan A2, §5.5): an owner
 * can switch it off for an admin, the button goes, and `gdpr/export-guest` refuses with 403
 * EXPORT_NOT_ALLOWED if it is tapped from a screen loaded before the change. Erasing stays.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockExport = jest.fn();
jest.mock('@/lib/queries/useContactsBulk', () => ({
  fetchGuestGdprExport: (...args: unknown[]) => mockExport(...args),
}));
const mockErase = jest.fn();
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useEraseGuest: () => ({ mutateAsync: (...args: unknown[]) => mockErase(...args), isPending: false }),
}));
// What erasing also removes (treatment records TR17): records and alerts mean a reason is needed.
let mockHeld: { treatment_records: number; client_alerts: number } | null = null;
jest.mock('@/lib/queries/useTreatmentRecords', () => ({
  useEraseHeldCounts: () => ({ data: mockHeld, isLoading: false }),
}));

import { GdprSection } from './GdprSection';
import { ApiError } from '@/lib/api/client';
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

async function renderAs(access: ViewerAccess) {
  await render(
    <ViewerAccessProvider value={access}>
      <GdprSection guestId="g1" guestName="Ada Lovelace" onErased={jest.fn()} />
    </ViewerAccessProvider>,
  );
}

beforeEach(() => {
  mockExport.mockReset();
  mockToast.error.mockClear();
});

describe('GdprSection and "Can export client data"', () => {
  it('offers no data export without the switch, and keeps Erase', async () => {
    await renderAs({ ...FULL_VIEWER_ACCESS, canExportClients: false });
    expect(screen.queryByText('Export data (JSON)')).toBeNull();
    expect(screen.getByText('Erase data')).toBeTruthy();
  });

  it("offers the export with the switch, and shows the server's words if it is refused", async () => {
    const message = 'Exporting client data is switched off for you.';
    mockExport.mockRejectedValue(new ApiError(message, 403, { error: message, code: 'EXPORT_NOT_ALLOWED' }));
    await renderAs(FULL_VIEWER_ACCESS);
    await act(async () => {
      fireEvent.press(screen.getByText('Export data (JSON)'));
    });
    expect(mockToast.error).toHaveBeenCalledWith(message);
  });
});

describe('GdprSection and treatment records (TR17)', () => {
  beforeEach(() => {
    mockErase.mockReset();
    mockHeld = null;
  });

  async function openErase() {
    await renderAs(FULL_VIEWER_ACCESS);
    await act(async () => {
      fireEvent.press(screen.getByText('Erase data'));
    });
  }

  it('warns about the records and needs a reason, which it sends', async () => {
    mockHeld = { treatment_records: 2, client_alerts: 1 };
    mockErase.mockResolvedValue({ ok: true });
    await openErase();
    expect(screen.getByText(/Ada Lovelace has 2 treatment records\. Clinical records are usually kept for 8 years/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    expect(screen.queryByText('Final confirmation')).toBeNull();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Why are you erasing this client?'), '  Client asked  ');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Yes, erase permanently'));
    });
    expect(mockErase).toHaveBeenCalledWith({ guestId: 'g1', reason: 'Client asked' });
  });

  it('names alerts alone when there are no records', async () => {
    mockHeld = { treatment_records: 0, client_alerts: 2 };
    await openErase();
    expect(screen.getByText('Ada Lovelace has alerts on file. Erasing removes them permanently.')).toBeTruthy();
  });

  it('asks nothing extra for a client with neither', async () => {
    mockHeld = { treatment_records: 0, client_alerts: 0 };
    mockErase.mockResolvedValue({ ok: true });
    await openErase();
    expect(screen.queryByLabelText('Why are you erasing this client?')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Yes, erase permanently'));
    });
    expect(mockErase).toHaveBeenCalledWith({ guestId: 'g1', reason: null });
  });

  it('asks for the reason when the server says one is needed', async () => {
    const message = 'This client has treatment records, so we need a reason before erasing them.';
    mockErase.mockRejectedValue(new ApiError(message, 400, { error: message, code: 'ERASE_REASON_REQUIRED' }));
    await openErase();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Yes, erase permanently'));
    });
    expect(mockToast.error).toHaveBeenCalledWith(message);
    expect(screen.getByLabelText('Why are you erasing this client?')).toBeTruthy();
  });
});
