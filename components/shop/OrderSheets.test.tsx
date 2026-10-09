/**
 * Online orders in the app (POS app step 5, UX spec §8.4 to §8.7; test plan ORD-01, ORD-02): the
 * pickup code (a wrong one shows the server's sentence; without one, staff tick that they checked),
 * dispatch with a known carrier's tracking link, cancel and refund with one request id, and a part
 * refund of chosen items.
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
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null, cameraScanAvailable: false }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));

import { CancelOrderSheet, DispatchSheet, OrderRefundSheet, PickupSheet } from '@/components/shop/OrderSheets';
import { ApiError } from '@/lib/api/client';
import type { ShopOrderDetail } from '@/types/shop';

const mockWrite = jest.fn();
beforeEach(() => mockWrite.mockReset());

describe('checking the pickup code', () => {
  it('sends the code in its stored form, and shows the server sentence when it is wrong', async () => {
    mockWrite.mockRejectedValueOnce(
      new ApiError("That code doesn't match this order. Check it and try again.", 409, {
        error: "That code doesn't match this order. Check it and try again.",
        code: 'SHOP_PICKUP_CODE_MISMATCH',
      }),
    );
    const onDone = jest.fn();
    await render(<PickupSheet visible customerName="Ana" write={mockWrite} onClose={jest.fn()} onDone={onDone} />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Pickup code'), 'acd-479');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm collection'));
    });
    expect(mockWrite).toHaveBeenCalledWith({ kind: 'status', body: { status: 'collected', pickup_code: 'ACD479', without_code: false } });
    expect(screen.getByText("That code doesn't match this order. Check it and try again.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('marks collected without a code only once staff say they checked who it is', async () => {
    mockWrite.mockResolvedValue({});
    const onDone = jest.fn();
    await render(<PickupSheet visible customerName="Ana" write={mockWrite} onClose={jest.fn()} onDone={onDone} />);
    await act(async () => {
      fireEvent.press(screen.getByText("They don't have the code"));
    });
    expect(screen.getByText('Check their name matches Ana, and ask for the email address they ordered with.')).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText("I've checked who they are"), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Mark collected without a code'));
    });
    expect(mockWrite).toHaveBeenCalledWith({ kind: 'status', body: { status: 'collected', pickup_code: null, without_code: true } });
    expect(onDone).toHaveBeenCalled();
  });
});

describe('dispatching', () => {
  it("fills a known carrier's tracking link and tells who will be emailed", async () => {
    mockWrite.mockResolvedValue({});
    await render(
      <DispatchSheet
        visible
        update={false}
        customerName="Ana"
        initial={{ carrier: null, tracking_number: null, tracking_url: null }}
        write={mockWrite}
        onClose={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText("Without a tracking number, Ana can't follow their parcel. You can still mark it dispatched.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('DPD'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Tracking number'), '1234');
    });
    expect(screen.getByText("We'll email Ana with these details.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Mark dispatched'));
    });
    expect(mockWrite).toHaveBeenCalledWith({
      kind: 'status',
      body: {
        status: 'dispatched',
        carrier: 'DPD',
        tracking_number: '1234',
        tracking_url: 'https://track.dpd.co.uk/parcels/1234',
        tracking_only: false,
      },
    });
  });
});

describe('cancel and refund', () => {
  it('asks for a reason and sends one request id', async () => {
    mockWrite.mockResolvedValue({});
    await render(<CancelOrderSheet visible orderNo={42} amountPence={3600} write={mockWrite} onClose={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText('Cancel Order 42 and refund £36.00?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('The customer asked to cancel'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel and refund'));
    });
    const call = mockWrite.mock.calls[0][0];
    expect(call).toMatchObject({ kind: 'cancel', body: { reason: 'customer' } });
    expect(String(call.body.client_request_id).length).toBeGreaterThanOrEqual(8);
  });
});

describe('refund or return', () => {
  const detail = {
    order: { number: 42, contact_name: 'Ana' },
    lines: [
      {
        id: 'l1',
        line_type: 'product',
        name: 'Shampoo',
        option_name: null,
        quantity: 3,
        total_pence: 3600,
        refunded_quantity: 0,
        refunded_pence: 0,
        track_stock: true,
      },
      { id: 'd1', line_type: 'delivery', name: 'Delivery', option_name: null, quantity: 1, total_pence: 395, refunded_quantity: 0, refunded_pence: 0, track_stock: false },
    ],
    settings: { refund_reasons: ['Product returned', 'Faulty'], vat_registered: true },
  } as unknown as ShopOrderDetail;

  it('refunds the items from a recorded return, put back in stock when ticked', async () => {
    mockWrite.mockResolvedValue({});
    const onDone = jest.fn();
    await render(
      <OrderRefundSheet
        visible
        detail={detail}
        returnRequest={{ id: 'r1', lines: [{ line_id: 'l1', quantity: 2 }] } as ShopOrderDetail['returns'][number]}
        pastWindow="Thursday 9 October"
        write={mockWrite}
        onClose={jest.fn()}
        onDone={onDone}
      />,
    );
    expect(screen.getByText(/The return window for this order ended on Thursday 9 October\./)).toBeTruthy();
    expect(screen.getByText('Refund £24.00 to the card they paid with')).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText('Put back in stock'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Refund £24.00'));
    });
    expect(mockWrite.mock.calls[0][0]).toMatchObject({
      kind: 'refund',
      body: { lines: [{ line_id: 'l1', quantity: 2, restock: true }], reason: 'Product returned', return_request_id: 'r1' },
    });
    expect(onDone).toHaveBeenCalledWith("Refund sent. It usually reaches Ana's account in 5 to 10 working days.");
  });
});
