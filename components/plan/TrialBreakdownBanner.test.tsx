/**
 * The Plan screen's trial banner (web `TrialBreakdownBanner`): countdown, first charge date and
 * the breakdown, with the referral bonus when the server names one.
 */
import { render, screen } from '@testing-library/react-native';

import { TrialBreakdownBanner } from '@/components/plan/TrialBreakdownBanner';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-09T12:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TrialBreakdownBanner', () => {
  it('shows the countdown, first charge and the referral bonus', async () => {
    await render(
      <TrialBreakdownBanner
        planStatus="trialing"
        periodStart="2026-09-30T12:00:00Z"
        periodEnd="2026-11-13T12:00:00Z"
        server={{
          isTrialing: true,
          trialStartIso: '2026-09-30T12:00:00Z',
          trialEndIso: '2026-11-13T12:00:00Z',
          daysRemaining: 35,
          totalDays: 44,
          standardDays: 14,
          referralBonusDays: 30,
          referrerVenueName: 'Bright Cuts',
          hasReferralAttached: true,
        }}
      />,
    );
    expect(screen.getByText('35 days of free trial remaining.')).toBeTruthy();
    expect(screen.getByText('First charge on 13 November 2026.')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    expect(screen.getByText('Bright Cuts')).toBeTruthy();
    expect(screen.getByText('44 days')).toBeTruthy();
  });

  it('shows the standard trial on its own', async () => {
    await render(
      <TrialBreakdownBanner planStatus="trialing" periodStart="2026-10-01T12:00:00Z" periodEnd="2026-10-15T12:00:00Z" />,
    );
    expect(screen.getByText('6 days of free trial remaining.')).toBeTruthy();
    expect(screen.getAllByText('14 days')).toHaveLength(2);
    expect(screen.queryByText(/from referral by/)).toBeNull();
  });

  it('is not shown outside a trial', async () => {
    await render(<TrialBreakdownBanner planStatus="active" periodStart={null} periodEnd="2026-11-01T00:00:00Z" />);
    expect(screen.queryByTestId('trial-breakdown')).toBeNull();
  });
});
