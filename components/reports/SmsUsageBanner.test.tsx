/**
 * The Reports SMS usage card (web `SmsUsageBanner.tsx`): a placeholder while loading, nothing for
 * a venue without SMS tracking, and the overage note once the allowance is used up.
 */
import { render, screen } from '@testing-library/react-native';

import type { SmsUsageDisplay } from '@/lib/queries/useSmsUsage';

let mockSms: { data: SmsUsageDisplay | null | undefined; isLoading: boolean };
const mockUseSmsUsage = jest.fn((_enabled?: boolean) => mockSms);
jest.mock('@/lib/queries/useSmsUsage', () => ({
  useSmsUsage: (enabled?: boolean) => mockUseSmsUsage(enabled),
}));

import { SmsUsageBanner } from '@/components/reports/SmsUsageBanner';

const usage = (over: Partial<SmsUsageDisplay> = {}): SmsUsageDisplay => ({
  messages_sent: 40,
  messages_included: 200,
  remaining: 160,
  overage_count: 0,
  overage_amount_pence: 0,
  billing_mode: 'bundle_allowance',
  billable_unit_gbp: 0.05,
  ...over,
});

beforeEach(() => {
  mockUseSmsUsage.mockClear();
});

describe('SmsUsageBanner', () => {
  it('holds the space while loading', async () => {
    mockSms = { data: undefined, isLoading: true };
    await render(<SmsUsageBanner />);
    expect(screen.getByTestId('sms-usage-loading')).toBeTruthy();
    expect(screen.getByText('SMS segments this period')).toBeTruthy();
  });

  it('shows nothing for a venue without SMS tracking', async () => {
    mockSms = { data: null, isLoading: false };
    await render(<SmsUsageBanner />);
    expect(screen.queryByText('SMS segments this period')).toBeNull();
  });

  it('shows the count, the allowance and what is left', async () => {
    mockSms = { data: usage(), isLoading: false };
    await render(<SmsUsageBanner />);
    expect(screen.getByTestId('sms-usage-banner')).toBeTruthy();
    expect(screen.getByText(/200 included/)).toBeTruthy();
    expect(screen.getByText(/160 left/)).toBeTruthy();
    expect(screen.queryByText('Overage')).toBeNull();
  });

  it('adds the overage note past the allowance', async () => {
    mockSms = {
      data: usage({ messages_sent: 212, remaining: 0, overage_count: 12, overage_amount_pence: 60 }),
      isLoading: false,
    };
    await render(<SmsUsageBanner />);
    expect(screen.getByText('Overage')).toBeTruthy();
    expect(screen.getByText(/12 SMS segments beyond your included allowance, about £0.60 at £0.05 each/)).toBeTruthy();
  });

  it('stays off, and does not ask, when not enabled', async () => {
    mockSms = { data: usage(), isLoading: false };
    await render(<SmsUsageBanner enabled={false} />);
    expect(screen.queryByTestId('sms-usage-banner')).toBeNull();
    expect(mockUseSmsUsage).toHaveBeenCalledWith(false);
  });
});
