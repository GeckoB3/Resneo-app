/**
 * The unpaid-promotion guard — the app's answer to the server's
 * `DEPOSIT_UNPAID` 409 (web deposit-payment-robustness-plan 6.1/6.2).
 *
 * Before this, all four app promotion paths (detail Accept, list swipe,
 * calendar tray, attendance toggle) could only show the error text: there was
 * no way to accept an unpaid booking from the app at all, and the nearest
 * in-app move was Waive, which forgives the money instead of keeping it
 * collectable. Pinned here: the intercept fires on the guard 409 and NOTHING
 * else, and each action does what it says.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text as RNText } from 'react-native';

import { useAcceptUnpaidGuard } from './AcceptUnpaidSheet';
import { ApiError } from '@/lib/api/client';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockSendLink = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useSendDepositPaymentLinkById: () => ({ mutate: mockSendLink, isPending: false }),
}));

const mockRetry = jest.fn();

/** A minimal host: a button that "fails" with `error`, wired through the guard. */
function Host({ error }: { error: unknown }) {
  const guard = useAcceptUnpaidGuard();
  return (
    <>
      <Pressable
        onPress={() => {
          const handled = guard.intercept('bk-1', error, mockRetry);
          if (!handled) mockFallback();
        }}>
        <RNText>Accept</RNText>
      </Pressable>
      {guard.sheet}
    </>
  );
}

const mockFallback = jest.fn();

function guard409(body: Record<string, unknown>) {
  return new ApiError('The deposit for this booking has not been paid.', 409, {
    error: 'The deposit for this booking has not been paid.',
    code: 'DEPOSIT_UNPAID',
    ...body,
  });
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  mockSendLink.mockReset();
  mockRetry.mockReset();
  mockFallback.mockReset();
});

describe('useAcceptUnpaidGuard', () => {
  it('leaves every other failure to the caller', async () => {
    // An over-eager intercept would hide a real error behind a deposit dialog.
    await render(<Host error={new ApiError('Slot taken', 409, { error: 'Slot taken' })} />);
    await press('Accept');

    expect(mockFallback).toHaveBeenCalled();
    expect(screen.queryByText('Deposit not paid')).toBeNull();
  });

  it('opens on the guard 409 and names the amount', async () => {
    await render(
      <Host error={guard409({ deposit_status: 'Failed', deposit_amount_pence: 2000 })} />,
    );
    await press('Accept');

    expect(mockFallback).not.toHaveBeenCalled();
    expect(screen.getByText('Deposit not paid')).toBeTruthy();
    expect(
      screen.getByText(
        'The £20.00 deposit for this booking has not been paid. The last payment attempt failed.',
      ),
    ).toBeTruthy();
  });

  it('replays the promotion with accept_unpaid, and closes first', async () => {
    await render(
      <Host error={guard409({ deposit_status: 'Pending', deposit_amount_pence: 2000 })} />,
    );
    await press('Accept');
    await press('Accept without payment');

    // The caller owns the flag; the guard just re-runs what it was handed.
    expect(mockRetry).toHaveBeenCalledTimes(1);
    // Closed, so a second failure can reopen it with fresh state.
    expect(screen.queryByText('Deposit not paid')).toBeNull();
  });

  it('sends the payment link for the booking that tripped the guard', async () => {
    mockSendLink.mockImplementation((_input, opts) => opts?.onSuccess?.());
    await render(
      <Host error={guard409({ deposit_status: 'Failed', deposit_amount_pence: 2000 })} />,
    );
    await press('Accept');
    await press('Send payment link');

    expect(mockSendLink).toHaveBeenCalledWith(
      { bookingId: 'bk-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText('Payment link sent to the customer.')).toBeTruthy();
    // Still open: sending a link is not a decision about the promotion.
    expect(screen.getByText('Accept without payment')).toBeTruthy();
  });

  it('surfaces a failed send without closing or accepting anything', async () => {
    mockSendLink.mockImplementation((_input, opts) =>
      opts?.onError?.(new ApiError('This booking has no deposit to collect.', 409, {})),
    );
    await render(<Host error={guard409({ deposit_amount_pence: 2000 })} />);
    await press('Accept');
    await press('Send payment link');

    expect(screen.getByText('This booking has no deposit to collect.')).toBeTruthy();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('"Go back" leaves the booking exactly as it was', async () => {
    await render(<Host error={guard409({ deposit_amount_pence: 2000 })} />);
    await press('Accept');
    await press('Go back');

    expect(mockRetry).not.toHaveBeenCalled();
    expect(screen.queryByText('Deposit not paid')).toBeNull();
  });

  it('describes a card hold as a card save, not a deposit', async () => {
    await render(
      <Host error={guard409({ deposit_status: 'Pending', card_hold_fee_pence: 3500 })} />,
    );
    await press('Accept');

    expect(
      screen.getByText(
        'Card details have not been saved for this booking yet. The no-show fee is £35.00.',
      ),
    ).toBeTruthy();
  });
});
