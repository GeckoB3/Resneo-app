/**
 * The Vouchers tab's sheets against the web: one voucher (VoucherSheet.tsx) with its actions, each
 * asking for a reason where the web does and showing the server's sentence word for word; adding
 * an existing voucher (AddExistingVoucherDialog); importing a file (VoucherImportDialog), with the
 * new codes given once and the sheet kept open until they are taken.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));
const mockReadText = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: (...args: unknown[]) => mockReadText(...args) }));
const mockShareText = jest.fn(async () => ({ ok: true }));
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: (...args: unknown[]) => mockShareText(...(args as [])) }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) => (visible ? React.createElement(View, null, children) : null),
  };
});
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
jest.mock('@/lib/queries/useGuests', () => ({ useGuests: () => ({ data: undefined }) }));
const mockDownload = jest.fn(async (_args: { path: string }) => ({ ok: true as const, filename: 'x.pdf' }));
jest.mock('@/lib/reports/pos-report-download', () => ({
  downloadReportFile: (args: { path: string }) => mockDownload(args),
}));
const mockAction = jest.fn();
const mockAdd = jest.fn();
const mockImport = jest.fn();
let mockDetail: unknown;
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useVoucherDetail: () => ({ data: mockDetail, isLoading: false, isError: false, refetch: jest.fn() }),
  useVoucherAction: () => ({ mutateAsync: mockAction, isPending: false }),
  useAddExistingVoucher: () => ({ mutateAsync: mockAdd, isPending: false }),
  useVoucherImport: () => ({ mutateAsync: mockImport, isPending: false }),
}));

import { AddExistingVoucherSheet } from '@/components/reports/vouchers/AddExistingVoucherSheet';
import { VoucherDetailSheet } from '@/components/reports/vouchers/VoucherDetailSheet';
import { VoucherImportSheet } from '@/components/reports/vouchers/VoucherImportSheet';
import { ApiError } from '@/lib/api/client';

function detail(over: Record<string, unknown> = {}) {
  return {
    account: {
      id: 'v1',
      kind: 'voucher',
      code_last4: '9HPA',
      status: 'active',
      balance_pence: 2000,
      initial_pence: 5000,
      currency: 'gbp',
      source: 'sold',
      guest_id: null,
      issued_at: '2026-10-02T10:00:00Z',
      expires_at: '2027-10-02T23:00:00Z',
      sale_id: 's1',
      buyer_name: 'Alex',
      buyer_email: 'alex@example.com',
      recipient_name: 'Jo',
      recipient_email: 'jo@example.com',
      message: 'Happy birthday',
      send_at: null,
      sent_at: '2026-10-02T10:05:00Z',
      frozen_reason: null,
      ...over,
    },
    movements: [
      { id: 'm2', kind: 'redeem', delta_pence: -3000, sale_id: 's2', sale_number: 77, staff_name: 'Sam', reason: null, business_date: '2026-10-05', created_at: '2026-10-05T10:00:00Z' },
      { id: 'm1', kind: 'issue', delta_pence: 5000, sale_id: 's1', sale_number: 70, staff_name: 'Sam', reason: null, business_date: '2026-10-02', created_at: '2026-10-02T10:00:00Z' },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDetail = detail();
});

describe('one voucher', () => {
  it('shows what the web shows, and its history', async () => {
    await render(<VoucherDetailSheet voucherId="v1" canManage timeZone="Europe/London" onClose={jest.fn()} />);
    expect(screen.getByText('Gift voucher ending 9HPA')).toBeTruthy();
    expect(screen.getByText('£20.00 left')).toBeTruthy();
    expect(screen.getByText('Started at £50.00')).toBeTruthy();
    expect(screen.getByText('For Jo')).toBeTruthy();
    expect(screen.getByText('Happy birthday')).toBeTruthy();
    expect(screen.getByText('Emailed to jo@example.com on 2 October 2026')).toBeTruthy();
    expect(screen.getByText('Used on Sale 77')).toBeTruthy();
    expect(screen.getByText('-£30.00')).toBeTruthy();
  });

  it('puts it on hold only with a reason', async () => {
    mockAction.mockResolvedValue(detail({ status: 'frozen', frozen_reason: 'Lost' }));
    await render(<VoucherDetailSheet voucherId="v1" canManage timeZone="Europe/London" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Put on hold'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Reason'), 'Lost');
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on hold').at(-1)!);
    });
    expect(mockAction).toHaveBeenCalledWith({ action: 'freeze', reason: 'Lost' });
  });

  it('cancels in two steps, and shows a refusal word for word', async () => {
    mockAction.mockRejectedValue(new ApiError("This voucher is on hold, so it can't be cancelled.", 409, { error: "This voucher is on hold, so it can't be cancelled." }));
    await render(<VoucherDetailSheet voucherId="v1" canManage timeZone="Europe/London" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel voucher'));
    });
    expect(screen.getByText("It can't be used after this. This doesn't refund anyone: to give money back, refund the sale it was bought on.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel voucher'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Reason'), 'Sold in error');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel voucher'));
    });
    expect(mockAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel', reason: 'Sold in error', client_request_id: expect.any(String) }));
    expect(screen.getByText("This voucher is on hold, so it can't be cancelled.")).toBeTruthy();
  });

  it('sends the email again to the recipient by default, and shares the PDF', async () => {
    mockAction.mockResolvedValue(detail());
    await render(<VoucherDetailSheet voucherId="v1" canManage timeZone="Europe/London" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Download the voucher'));
    });
    expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/venue/pos/vouchers/v1/pdf', mimeType: 'application/pdf' }));
    await act(async () => {
      fireEvent.press(screen.getByText('Send the email again'));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Send the email again').at(-1)!);
    });
    expect(mockAction).toHaveBeenCalledWith({ action: 'resend', to: 'jo@example.com' });
  });

  it('offers nothing to change on a cancelled voucher', async () => {
    mockDetail = detail({ status: 'cancelled' });
    await render(<VoucherDetailSheet voucherId="v1" canManage timeZone="Europe/London" onClose={jest.fn()} />);
    expect(screen.queryByText('Extend')).toBeNull();
    expect(screen.queryByText('Change the amount left')).toBeNull();
  });
});

describe('adding an existing voucher', () => {
  it('says when the code is already used', async () => {
    mockAdd.mockRejectedValue(new ApiError('taken', 409, { error: 'taken', code: 'POS_NAME_TAKEN' }));
    await render(<AddExistingVoucherSheet visible timeZone="Europe/London" currency="GBP" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Voucher code'), 'abcd1234');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount left on it'), '25');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add voucher'));
    });
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ code: 'ABCD1234', balance_pence: 2500, client_request_id: expect.any(String) }));
    expect(screen.getByText('Another voucher already uses that code.')).toBeTruthy();
  });

  it('shows a new ResNeo code once', async () => {
    mockAdd.mockResolvedValue({ voucher: { id: 'v9', code_last4: 'QRST', balance_pence: 2500 }, code: 'ABCD-EFGH-QRST' });
    await render(<AddExistingVoucherSheet visible timeZone="Europe/London" currency="GBP" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Give it a new ResNeo code'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Amount left on it'), '25');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add voucher'));
    });
    expect(mockAdd).toHaveBeenCalledWith(expect.not.objectContaining({ code: expect.anything() }));
    expect(screen.getByText('Gift voucher ending QRST added, with £25.00 on it.')).toBeTruthy();
    expect(screen.getByText('ABCD-EFGH-QRST')).toBeTruthy();
  });
});

describe('importing vouchers', () => {
  it('matches the columns, checks the file, imports it and gives the codes once', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///v.csv', size: 120, name: 'v.csv' }] });
    mockReadText.mockResolvedValue('Code,Amount left,Use by\r\nAB12CD34,25.00,31/12/2026\r\n');
    mockImport
      .mockResolvedValueOnce({ dry_run: true, rows: [{ row: 2, status: 'new', problem: null, balance_pence: 2500 }], summary: { count: 1, amount_pence: 2500, exists: 0, problems: 0 }, codes: [] })
      .mockResolvedValueOnce({ dry_run: false, rows: [], summary: { count: 1, amount_pence: 2500, exists: 0, problems: 0 }, codes: [{ row: 2, code: 'NEWCODE12345', last4: '2345' }] });
    const onClose = jest.fn();
    await render(<VoucherImportSheet visible currency="GBP" onClose={onClose} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a CSV file'));
    });
    expect(screen.getAllByText('Amount left').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(screen.getByText('Check the file'));
    });
    expect(mockImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ dry_run: true, new_codes: false, columns: { code: 'Code', balance: 'Amount left', expiry: 'Use by' } }),
    );
    expect(screen.getByText('1 vouchers to add, worth £25.00 in total. 0 rows have problems.')).toBeTruthy();
    expect(screen.getByText('Will be added')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Import vouchers'));
    });
    expect(screen.getByText('1 vouchers added, worth £25.00 in total.')).toBeTruthy();
    // Leaving before taking the codes is stopped, with the reason.
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByText('Download the new codes. You can only do this once.').length).toBe(2);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Download the new codes. You can only do this once.').at(-1)!);
    });
    expect(mockShareText).toHaveBeenCalledWith(expect.objectContaining({ filename: 'new-voucher-codes.csv', body: 'Row,Code,Ending\r\n2,NEWCODE12345,2345\r\n' }));
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses a file over 5 MB', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///big.csv', size: 6 * 1024 * 1024 }] });
    await render(<VoucherImportSheet visible currency="GBP" onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a CSV file'));
    });
    expect(screen.getByText('The file is larger than 5 MB.')).toBeTruthy();
    expect(mockReadText).not.toHaveBeenCalled();
  });
});
