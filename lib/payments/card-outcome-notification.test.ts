const mockSchedule = jest.fn(async () => 'id');
jest.mock('@/lib/push/notificationsModule', () => ({
  Notifications: { scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...(a as [])) },
}));

import { notifyCardPaymentNotApproved } from '@/lib/payments/card-outcome-notification';

beforeEach(() => mockSchedule.mockClear());

describe('notifyCardPaymentNotApproved (Apple 5.12)', () => {
  it('posts when the app is no longer on screen', async () => {
    const posted = await notifyCardPaymentNotApproved({
      outcome: 'declined',
      amountPence: 2500,
      guestName: 'Ada',
      appState: 'background',
    });

    expect(posted).toBe(true);
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: 'Payment declined' }),
        trigger: null,
      }),
    );
  });

  it('stays quiet while the payment sheet can show it', async () => {
    const posted = await notifyCardPaymentNotApproved({
      outcome: 'declined',
      amountPence: 2500,
      guestName: 'Ada',
      appState: 'active',
    });

    expect(posted).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
