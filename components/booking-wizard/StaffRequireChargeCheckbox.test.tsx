/**
 * The "Require deposit" line on a staff booking: it promises to send the pay link only when the
 * client has an email or mobile to send it to (QA round 25 Nov 2026).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticTap: jest.fn() }));

import { StaffRequireChargeCheckbox } from '@/components/booking-wizard/StaffChargeControls';

describe('StaffRequireChargeCheckbox', () => {
  it('says the link is sent when the client can be reached', async () => {
    await render(<StaffRequireChargeCheckbox checked onChange={() => {}} chargeLabel="deposit" amountPence={2000} />);
    expect(screen.getByText('We will send a payment link and hold the booking until the client pays.')).toBeTruthy();
  });

  it('says to share the link when the client has no email or mobile', async () => {
    await render(
      <StaffRequireChargeCheckbox checked onChange={() => {}} chargeLabel="deposit" amountPence={2000} hasContact={false} />,
    );
    expect(screen.queryByText(/We will send a payment link/)).toBeNull();
    expect(screen.getByText(/share the payment link yourself/)).toBeTruthy();
  });

  it('offers "Cancel if not paid by ..." under a ticked deposit, on by default (deposit-handling plan DH1)', async () => {
    const onCancel = jest.fn();
    await render(
      <StaffRequireChargeCheckbox
        checked
        onChange={() => {}}
        chargeLabel="deposit"
        amountPence={2000}
        cancelIfUnpaid
        onCancelIfUnpaidChange={onCancel}
        cancelDeadlineText="Wed 2 Dec, 13:00"
      />,
    );
    expect(screen.getByText('We will send the client a payment link.')).toBeTruthy();
    expect(screen.getByText('Cancel if not paid by Wed 2 Dec, 13:00')).toBeTruthy();
    expect(screen.getByLabelText('Cancel if not paid by Wed 2 Dec, 13:00').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('The booking waits until the client pays, and is cancelled if they do not.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Cancel if not paid by Wed 2 Dec, 13:00'));
    expect(onCancel).toHaveBeenCalledWith(false);
  });

  it('says the booking is confirmed now when the choice is off, with payment for a full payment', async () => {
    await render(
      <StaffRequireChargeCheckbox
        checked
        onChange={() => {}}
        chargeLabel="full_payment"
        amountPence={3000}
        cancelIfUnpaid={false}
        onCancelIfUnpaidChange={() => {}}
        cancelDeadlineText="Wed 2 Dec, 13:00"
      />,
    );
    expect(screen.getByText('The booking is confirmed now and the payment stays due.')).toBeTruthy();
  });

  it('offers no choice under 2 hours to go', async () => {
    await render(
      <StaffRequireChargeCheckbox
        checked
        onChange={() => {}}
        chargeLabel="deposit"
        amountPence={2000}
        onCancelIfUnpaidChange={() => {}}
        cancelDeadlineText={null}
      />,
    );
    expect(screen.queryByText(/Cancel if not paid/)).toBeNull();
    expect(
      screen.getByText('The appointment is less than 2 hours away, so the booking is confirmed now and the deposit stays due.'),
    ).toBeTruthy();
  });

  it('offers no choice when the client cannot be sent the link', async () => {
    await render(
      <StaffRequireChargeCheckbox
        checked
        onChange={() => {}}
        chargeLabel="deposit"
        amountPence={2000}
        hasContact={false}
        onCancelIfUnpaidChange={() => {}}
        cancelDeadlineText="Wed 2 Dec, 13:00"
      />,
    );
    // No tick to change: only the line that asks for an email or mobile.
    expect(screen.queryByText(/^Cancel if not paid by/)).toBeNull();
    expect(
      screen.getByText(
        "Cancel if not paid needs the client's email or mobile to send the link. Without them, the booking is confirmed now with the deposit still due, and you can share the payment link from the booking.",
      ),
    ).toBeTruthy();
  });

  it('offers no choice while unticked', async () => {
    await render(
      <StaffRequireChargeCheckbox
        checked={false}
        onChange={() => {}}
        chargeLabel="deposit"
        amountPence={2000}
        onCancelIfUnpaidChange={() => {}}
        cancelDeadlineText="Wed 2 Dec, 13:00"
      />,
    );
    expect(screen.queryByText(/Cancel if not paid/)).toBeNull();
  });

  it('is unchanged while unticked', async () => {
    await render(
      <StaffRequireChargeCheckbox checked={false} onChange={() => {}} chargeLabel="full_payment" amountPence={3000} hasContact={false} />,
    );
    expect(screen.getByText('Leave unchecked to confirm now and take the payment in person.')).toBeTruthy();
  });
});
