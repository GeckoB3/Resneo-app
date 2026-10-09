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

describe('StripeConnectCard for a team member (web Payments tab, read only)', () => {
  const staff = { ...active, isAdmin: false, accountId: 'acct_123' };

  it('shows an active account and its id, with nothing to do', async () => {
    await render(<StripeConnectCard {...staff} />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Account: acct_123')).toBeTruthy();
    expect(screen.queryByText(/Ask an admin/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tells them who finishes each step, as the web does', async () => {
    await render(<StripeConnectCard {...staff} chargesEnabled={false} detailsSubmitted={false} />);
    expect(screen.getByText('Ask an admin to complete Stripe setup.')).toBeTruthy();
    expect(screen.queryByText('Continue setup')).toBeNull();

    await render(<StripeConnectCard {...staff} chargesEnabled={false} />);
    expect(screen.getByText('Ask an admin to complete identity verification.')).toBeTruthy();

    await render(<StripeConnectCard {...staff} hasAccountId={false} accountId={null} />);
    expect(screen.getByText('Ask an admin to connect Stripe.')).toBeTruthy();
    expect(screen.queryByText(/Account:/)).toBeNull();
  });

  it('does not guess a step while the status loads', async () => {
    await render(<StripeConnectCard {...staff} chargesEnabled={false} detailsSubmitted={false} loading />);
    expect(screen.getByText('Checking your Stripe status…')).toBeTruthy();
    expect(screen.queryByText('Setup incomplete')).toBeNull();
  });

  it('shows a failed read with Retry', async () => {
    const onRetry = jest.fn();
    await render(<StripeConnectCard {...staff} statusError="Failed to check Stripe status" onRetry={onRetry} />);
    expect(screen.getByText('Failed to check Stripe status')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
