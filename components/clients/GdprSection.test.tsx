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
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useEraseGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
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
