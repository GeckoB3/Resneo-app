/**
 * The Suppliers tab in the app (UX spec §6.12; web `SuppliersTab.tsx`): the list with open orders,
 * read only without `manage_suppliers`, adding one, editing at its version (a 412 loads the other
 * person's version and says so) and archiving after asking.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockSave = jest.fn();
const mockRows = [
  {
    id: 's1',
    name: 'Wella',
    contact_name: 'Ana',
    email: 'orders@wella.test',
    phone: null,
    account_number: 'AC1',
    lead_time_days: 3,
    min_order_pence: 10000,
    notes: null,
    archived_at: null,
    version: 4,
  },
];
jest.mock('@/lib/queries/useStockSetup', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/useStockSetup')>('@/lib/queries/useStockSetup'),
  useSupplierRows: () => ({ data: mockRows, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
  useSupplierOpenOrders: () => ({ data: { s1: 2 }, refetch: jest.fn() }),
  useSaveSupplier: () => ({ mutateAsync: mockSave, isPending: false }),
}));

import { SuppliersTab } from '@/components/retail/SuppliersTab';
import { SupplierStaleError } from '@/lib/queries/useStockSetup';

beforeEach(() => {
  mockSave.mockReset();
  mockToast.success.mockReset();
});

describe('the Suppliers tab', () => {
  it('lists suppliers with their delivery time and open orders, read only without the capability', async () => {
    await render(<SuppliersTab canManage={false} />);
    expect(screen.getByText('Wella')).toBeTruthy();
    expect(screen.getByText('Ana · orders@wella.test')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('An admin can let you add and edit suppliers.')).toBeTruthy();
    expect(screen.queryByText('Add supplier')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('adds a supplier, asking for a name first', async () => {
    mockSave.mockResolvedValue({ id: 's2', name: 'Loreal' });
    await render(<SuppliersTab canManage />);
    await act(async () => {
      fireEvent.press(screen.getByText('Add supplier'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(screen.getByText('Give the supplier a name.')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Name'), 'Loreal');
      fireEvent.changeText(screen.getByLabelText('Delivery time in days'), '5');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(mockSave).toHaveBeenCalledWith({
      kind: 'create',
      body: expect.objectContaining({ name: 'Loreal', lead_time_days: 5, min_order_pence: null }),
    });
    expect(mockToast.success).toHaveBeenCalledWith('Supplier saved.');
  });

  it("edits at the supplier's version, and loads the other person's version on a 412", async () => {
    mockSave.mockRejectedValueOnce(
      new SupplierStaleError("Someone else changed this while you were editing. We've loaded their changes. Check them, then try again.", {
        ...mockRows[0]!,
        name: 'Wella UK',
        version: 5,
      }),
    );
    await render(<SuppliersTab canManage />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Edit Wella'));
    });
    expect(screen.getByDisplayValue('100.00')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update', id: 's1', version: 4 }));
    expect(screen.getByText(/Someone else changed this/)).toBeTruthy();
    expect(screen.getByDisplayValue('Wella UK')).toBeTruthy();
    mockSave.mockResolvedValueOnce({ ...mockRows[0]!, version: 6 });
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'update', version: 5 }));
  });

  it('archives a supplier after asking', async () => {
    mockSave.mockResolvedValue({ ...mockRows[0]!, archived_at: '2026-10-09T10:00:00Z' });
    await render(<SuppliersTab canManage />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Edit Wella'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Archive supplier'));
    });
    expect(screen.getByText('Archive Wella?')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getAllByText('Archive supplier')).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByText('Archive supplier'));
    });
    expect(mockSave).toHaveBeenCalledWith({ kind: 'archive', id: 's1', version: 4 });
    expect(mockToast.success).toHaveBeenCalledWith('Supplier archived.');
  });
});
