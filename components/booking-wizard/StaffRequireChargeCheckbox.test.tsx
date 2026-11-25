/**
 * The "Require deposit" line on a staff booking: it promises to send the pay link only when the
 * client has an email or mobile to send it to (QA round 25 Nov 2026).
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticTap: jest.fn() }));

import { StaffRequireChargeCheckbox } from '@/components/booking-wizard/StaffChargeControls';

describe('StaffRequireChargeCheckbox', () => {
  it('says the link is sent when the client can be reached', async () => {
    await render(<StaffRequireChargeCheckbox checked onChange={() => {}} chargeLabel="deposit" amountPence={2000} />);
    expect(screen.getByText('We will send a payment link and hold the booking until the deposit is paid.')).toBeTruthy();
  });

  it('says to share the link when the client has no email or mobile', async () => {
    await render(
      <StaffRequireChargeCheckbox checked onChange={() => {}} chargeLabel="deposit" amountPence={2000} hasContact={false} />,
    );
    expect(screen.queryByText(/We will send a payment link/)).toBeNull();
    expect(screen.getByText(/share the payment link yourself/)).toBeTruthy();
  });

  it('is unchanged while unticked', async () => {
    await render(
      <StaffRequireChargeCheckbox checked={false} onChange={() => {}} chargeLabel="full_payment" amountPence={3000} hasContact={false} />,
    );
    expect(screen.getByText('Leave unchecked to confirm now and take the payment in person.')).toBeTruthy();
  });
});
