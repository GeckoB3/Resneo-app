/**
 * The Stripe card on Plan & payments: once payments are active, an admin gets the web's
 * "Open Stripe dashboard" button (payouts, balance, transactions); nobody else does.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StripeConnectCard } from '@/components/plan/StripeConnectCard';

const active = {
  hasAccountId: true,
  chargesEnabled: true,
  detailsSubmitted: true,
  connecting: false,
  onConnect: jest.fn(),
};

describe('StripeConnectCard dashboard button', () => {
  it('offers an active admin the Stripe dashboard', async () => {
    const onOpenDashboard = jest.fn();
    await render(<StripeConnectCard {...active} isAdmin onOpenDashboard={onOpenDashboard} />);
    await fireEvent.press(screen.getByText('Open Stripe dashboard'));
    expect(onOpenDashboard).toHaveBeenCalledTimes(1);
    expect(screen.getByText('View payouts, balance and transactions in your Stripe dashboard.')).toBeTruthy();
  });

  it('shows a spinner while opening, and a failure', async () => {
    await render(
      <StripeConnectCard
        {...active}
        isAdmin
        onOpenDashboard={jest.fn()}
        openingDashboard
        dashboardErrorText="Could not open the Stripe dashboard."
      />,
    );
    expect(screen.getByRole('button', { busy: true })).toBeTruthy();
    expect(screen.getByText('Could not open the Stripe dashboard.')).toBeTruthy();
  });

  it('is not offered to staff', async () => {
    await render(<StripeConnectCard {...active} isAdmin={false} onOpenDashboard={jest.fn()} />);
    expect(screen.queryByText('Open Stripe dashboard')).toBeNull();
  });

  it('is not offered before payments are active', async () => {
    await render(
      <StripeConnectCard {...active} chargesEnabled={false} isAdmin onOpenDashboard={jest.fn()} />,
    );
    expect(screen.queryByText('Open Stripe dashboard')).toBeNull();
    expect(screen.getByText('Complete verification')).toBeTruthy();
  });
});
