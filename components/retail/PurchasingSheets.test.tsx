/**
 * Deliveries and "Use stock" in the app (POS app step 4b, UX spec §6.13, §6.14; test plan USE-01):
 * a scan adds one to its line, something not on the order is offered as an extra, the receipt goes
 * with the order's version and one request id; use is recorded for a booking.
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
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useBookingsList', () => ({ useBookingsList: () => ({ data: { bookings: [] } }) }));

const mockReceive = jest.fn();
const mockRecord = jest.fn();
let mockPicker: unknown[] = [];
jest.mock('@/lib/queries/usePurchasing', () => ({
  useReceivePurchaseOrder: () => ({ mutateAsync: mockReceive, isPending: false }),
  useRecordUse: () => ({ mutateAsync: mockRecord, isPending: false }),
  useCreatePurchaseOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSuppliers: () => ({ data: [] }),
  useVariantPicker: () => ({ data: mockPicker, isLoading: false, isError: false }),
}));
const mockPosFetch = jest.fn();
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

import { ReceiveSheet, UseStockSheet } from '@/components/retail/PurchasingSheets';
import type { PurchaseOrderDetail } from '@/types/retail';

const DETAIL: PurchaseOrderDetail = {
  order: {
    id: 'po1',
    number: 12,
    status: 'sent',
    supplier_id: 's1',
    expected_on: null,
    notes: null,
    sent_at: '2026-10-08T10:00:00Z',
    sent_to_email: 'orders@wella.test',
    sent_count: 1,
    total_cost_pence: 2700,
    created_by_name: 'Sam',
    created_at: '2026-10-08T09:00:00Z',
    received_at: null,
    cancelled_at: null,
    cancelled_by_name: null,
    version: 3,
  },
  supplier: { id: 's1', name: 'Wella', contact_name: null, email: 'orders@wella.test', phone: null, lead_time_days: 3, min_order_pence: null },
  lines: [
    {
      id: 'l1',
      variant_id: 'v1',
      product_id: 'p1',
      name: 'Shampoo, 250ml',
      sku: 'SH-250',
      quantity_ordered: 6,
      quantity_received: 0,
      unit_cost_pence: 450,
      line_total_pence: 2700,
      added_at_receipt: false,
      exists: true,
      track_stock: true,
      pack_size: 6,
      on_hand: 1,
      cost_pence: 450,
      barcodes: ['5012345678900'],
    },
  ],
  receipts: [],
  sender: { venue_name: 'Studio', reply_to: 'hello@studio.test' },
  can_manage: true,
  can_receive: true,
};

beforeEach(() => {
  mockReceive.mockReset();
  mockRecord.mockReset();
  mockPosFetch.mockReset();
  mockPicker = [];
});

describe('receiving a delivery', () => {
  it('adds one to the line a scan names, then receives with the version and one request id', async () => {
    mockReceive.mockResolvedValue({ units: 2, status: 'part_received', over_received: [] });
    await render(<ReceiveSheet visible detail={DETAIL} onClose={jest.fn()} />);
    const field = screen.getByLabelText('Scan items as you unpack them');
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        fireEvent.changeText(field, '5012345678900');
      });
      await act(async () => {
        fireEvent(field, 'submitEditing');
      });
    }
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByText('+1 Shampoo, 250ml')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add 2 items to stock'));
    });
    expect(mockReceive).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, lines: [{ line_id: 'l1', quantity: 2 }], extras: [], deliveryRef: null }),
    );
    expect(String(mockReceive.mock.calls[0][0].clientRequestId).length).toBeGreaterThanOrEqual(8);
  });

  it('offers something not on the order as an extra', async () => {
    mockPosFetch.mockResolvedValue({
      items: [
        {
          variant_id: 'v9',
          product_id: 'p9',
          product_name: 'Gloves',
          option_name: null,
          sku: 'GL',
          usage: 'professional',
          supplier_id: 's1',
          supplier_name: 'Wella',
          brand_name: null,
          on_hand: 0,
          cost_pence: 300,
          pack_size: null,
          reorder_level: null,
          barcodes: ['4000000000006'],
        },
      ],
    });
    await render(<ReceiveSheet visible detail={DETAIL} onClose={jest.fn()} />);
    const field = screen.getByLabelText('Scan items as you unpack them');
    await act(async () => {
      fireEvent.changeText(field, '4000000000006');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
    });
    expect(screen.getByText("Gloves isn't on this order. Add it as something that wasn't ordered?")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add it'));
    });
    expect(screen.getByText('Gloves')).toBeTruthy();
    expect(screen.getByText('Add 1 item to stock')).toBeTruthy();
  });
});

describe('Use stock', () => {
  it('records whole units for the booking it was opened from', async () => {
    mockRecord.mockResolvedValue({ movement: {} });
    mockPicker = [
      {
        variant_id: 'v5',
        product_id: 'p5',
        product_name: 'Colour 6N',
        option_name: null,
        sku: null,
        usage: 'professional',
        supplier_id: null,
        supplier_name: null,
        brand_name: null,
        on_hand: 8,
        cost_pence: 300,
        pack_size: null,
        reorder_level: null,
        barcodes: [],
      },
    ];
    const onClose = jest.fn();
    await render(<UseStockSheet visible booking={{ id: 'bk1', label: '10:00, Ana' }} timeZone="Europe/London" onClose={onClose} />);
    expect(screen.getByText('10:00, Ana')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Colour 6N'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('How many'), '2');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Record use'));
    });
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'v5', quantity: 2, bookingId: 'bk1', note: null }));
    expect(onClose).toHaveBeenCalled();
  });
});
