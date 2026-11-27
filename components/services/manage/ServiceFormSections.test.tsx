import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  ServiceBookingRulesSection,
  type ServiceBookingRulesSectionProps,
} from '@/components/services/manage/ServiceBookingRulesSection';
import {
  ServicePaymentSection,
  type ServicePaymentSectionProps,
} from '@/components/services/manage/ServicePaymentSection';
import {
  ServiceStaffMaySection,
  type ServiceStaffMaySectionProps,
} from '@/components/services/manage/ServiceStaffMaySection';

/** The three parts of the service form moved out of the Services screen (P5.2). */

function paymentProps(extra: Partial<ServicePaymentSectionProps> = {}): ServicePaymentSectionProps {
  return {
    paymentReq: 'none',
    setPaymentReq: jest.fn(),
    isCardHoldSelected: false,
    holdFeeMode: 'fixed',
    setHoldFeeMode: jest.fn(),
    usesVariants: false,
    holdFeeIsPercent: false,
    price: '45.00',
    setPrice: jest.fn(),
    deposit: '',
    setDeposit: jest.fn(),
    holdFeePercent: '',
    setHoldFeePercent: jest.fn(),
    holdPercentExample: null,
    stripeConnected: true,
    ...extra,
  };
}

describe('ServicePaymentSection', () => {
  it('picks a payment option', async () => {
    const p = paymentProps();
    await render(<ServicePaymentSection {...p} />);
    await fireEvent.press(screen.getByText('Card hold'));
    expect(p.setPaymentReq).toHaveBeenCalledWith('card_hold');
    expect(screen.queryByText('No-show fee')).toBeNull();
  });

  it('asks for the deposit with a custom deposit', async () => {
    const p = paymentProps({ paymentReq: 'deposit' });
    await render(<ServicePaymentSection {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Deposit (£)'), '10');
    expect(p.setDeposit).toHaveBeenCalledWith('10');
  });

  it('takes a card hold fee as a percentage, with its example', async () => {
    const p = paymentProps({
      paymentReq: 'card_hold',
      isCardHoldSelected: true,
      holdFeeMode: 'percent',
      holdFeeIsPercent: true,
      holdPercentExample: 'On a £90.00 booking: £45.00',
    });
    await render(<ServicePaymentSection {...p} />);
    expect(screen.getByText('No-show fee')).toBeTruthy();
    expect(screen.getByText('On a £90.00 booking: £45.00')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('No-show fee (%)'), '50');
    expect(p.setHoldFeePercent).toHaveBeenCalledWith('50');
  });

  it('warns when Stripe is not connected and money is taken online', async () => {
    await render(<ServicePaymentSection {...paymentProps({ paymentReq: 'full_payment', stripeConnected: false })} />);
    expect(screen.getByText(/Stripe is not connected/)).toBeTruthy();
  });
});

function rulesProps(extra: Partial<ServiceBookingRulesSectionProps> = {}): ServiceBookingRulesSectionProps {
  return {
    bookingRulesSummary: '90d ahead · 1h notice',
    advanceDays: '90',
    setAdvanceDays: jest.fn(),
    noticeHours: '1',
    setNoticeHours: jest.fn(),
    cancelHours: '48',
    setCancelHours: jest.fn(),
    sameDay: true,
    setSameDay: jest.fn(),
    ...extra,
  };
}

describe('ServiceBookingRulesSection', () => {
  it('opens to the rules and changes them', async () => {
    const p = rulesProps();
    await render(<ServiceBookingRulesSection {...p} />);
    expect(screen.getByText('90d ahead · 1h notice')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Client booking rules'));
    await fireEvent.changeText(screen.getByLabelText('Book ahead (days)'), '30');
    expect(p.setAdvanceDays).toHaveBeenCalledWith('30');
    await fireEvent.changeText(screen.getByLabelText('Cancellation notice (hours)'), '24');
    expect(p.setCancelHours).toHaveBeenCalledWith('24');
  });
});

function mayProps(extra: Partial<ServiceStaffMaySectionProps> = {}): ServiceStaffMaySectionProps {
  return {
    staffMaySummary: 'None',
    showMemberValues: false,
    optionsLocked: false,
    holdFeeIsPercent: false,
    staffMayLocked: () => false,
    staffMaySends: () => false,
    setStaffMay: jest.fn(),
    nameLocked: false,
    editingService: null,
    serviceCollective: null,
    memberVenueWords: 'the other businesses',
    memberValuesAllowed: true,
    setMemberValuesAllowed: jest.fn(),
    ...extra,
  };
}

describe('ServiceStaffMaySection', () => {
  it('lets staff change a field', async () => {
    const p = mayProps();
    await render(<ServiceStaffMaySection {...p} />);
    await fireEvent.press(screen.getByLabelText('Staff override permissions'));
    await fireEvent(screen.getByLabelText('Staff may change: Price'), 'valueChange', true);
    const update = (p.setStaffMay as jest.Mock).mock.calls[0][0];
    expect(update({ price: false, name: false })).toEqual({ price: true, name: false });
  });

  it('holds a locked field off', async () => {
    await render(
      <ServiceStaffMaySection {...mayProps({ staffMayLocked: (key) => key === 'name' })} />,
    );
    await fireEvent.press(screen.getByLabelText('Staff override permissions'));
    expect(screen.getByLabelText('Staff may change: Display name').props.disabled).toBe(true);
    expect(screen.getByLabelText('Staff may change: Price').props.disabled).toBe(false);
  });
});
