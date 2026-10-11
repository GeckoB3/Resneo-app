import { formatCommunicationLogLabel } from '@/lib/communications/display-labels';

describe('formatCommunicationLogLabel', () => {
  it('maps known message types to readable labels', () => {
    expect(formatCommunicationLogLabel('custom_message')).toBe('Custom message');
    expect(formatCommunicationLogLabel('booking_confirmation')).toBe('Booking confirmation');
    expect(formatCommunicationLogLabel('marketing_bulk')).toBe('Marketing message');
    expect(formatCommunicationLogLabel('deposit_payment_request')).toBe('Deposit payment request');
  });

  it('strips a trailing _email/_sms channel suffix before mapping', () => {
    expect(formatCommunicationLogLabel('booking_confirmation_email')).toBe('Booking confirmation');
    expect(formatCommunicationLogLabel('booking_confirmation_sms')).toBe('Booking confirmation');
  });

  it('falls back to a de-underscored label for unknown types', () => {
    expect(formatCommunicationLogLabel('some_new_event')).toBe('some new event');
  });
});

describe('checkout and shop messages', () => {
  it('names them in plain words, whatever the channel', () => {
    expect(formatCommunicationLogLabel('pos_sale_receipt_email')).toBe('Receipt');
    expect(formatCommunicationLogLabel('pos_refund_receipt_sms')).toBe('Refund receipt');
    expect(formatCommunicationLogLabel('pos_pay_link_sms')).toBe('Pay link');
    expect(formatCommunicationLogLabel('shop_order_ready_for_collection_sms')).toBe('Order ready to collect');
  });
});
