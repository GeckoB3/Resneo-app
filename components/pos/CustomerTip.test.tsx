/**
 * The customer-facing tip screen (UX spec §3.18, §13.3; owner 2026-10-10): the client sees the
 * total and the venue's suggestions as buttons of one size with "No tip" among them and nothing
 * chosen for them, then pays the total with their tip. Staff's hand-over line comes first.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));

import { CustomerTipScreen, useCustomerTipPrompt, type CustomerTipInput } from '@/components/pos/CustomerTip';
import { makeLine, makeSale } from '@/lib/pos/test-sale';

const sale = makeSale({ total_pence: 3550, balance_due_pence: 3550, lines: [makeLine({ total_pence: 3550 })] });

function input(over: Partial<CustomerTipInput> = {}): CustomerTipInput {
  return {
    sale,
    tipSettings: { tipping_enabled: true, tip_percent_presets: [10, 15, 20], smart_tip_threshold_pence: 1000, tip_base: 'total' },
    amountPence: 3550,
    balancePence: 3550,
    maxPaymentPence: 1_000_000,
    venueName: 'Studio',
    clientName: 'Ada',
    ...over,
  };
}

describe('CustomerTipScreen', () => {
  it('shows the total and the suggestions with No tip, chooses nothing for the client, then pays with their tip', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    expect(screen.getByText('Would you like to add a tip?')).toBeTruthy();
    expect(screen.getByText('Total £35.50')).toBeTruthy();
    for (const label of ['10% (£3.55)', '15% (£5.33)', '20% (£7.10)', 'No tip']) expect(screen.getByText(label)).toBeTruthy();
    // Nothing is chosen for them: Pay waits for a choice.
    fireEvent.press(screen.getByText('Pay £35.50'));
    expect(onChoose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText('10% (£3.55)'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Pay £39.05'));
    });
    expect(onChoose).toHaveBeenCalledWith(355);
  });

  it('pays with no tip, or with an amount the client types when the venue allows one', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('No tip'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Pay £35.50'));
    });
    expect(onChoose).toHaveBeenLastCalledWith(0);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Another amount'), '4');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Pay £39.50'));
    });
    expect(onChoose).toHaveBeenLastCalledWith(400);
  });

  it('refuses a tip that takes the payment over the venue ceiling', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input({ maxPaymentPence: 3600 })} onChoose={onChoose} onCancel={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('10% (£3.55)'));
    });
    fireEvent.press(screen.getByText('Pay £39.05'));
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('useCustomerTipPrompt', () => {
  let mockResult: number | null | undefined;

  function Harness({ tipInput }: { tipInput: CustomerTipInput }) {
    const prompt = useCustomerTipPrompt(tipInput);
    useEffect(() => {
      void prompt.ask().then((tip) => {
        mockResult = tip;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once
    }, []);
    return (
      <>
        {prompt.view}
        <Text>{prompt.facing ? 'facing' : 'staff'}</Text>
      </>
    );
  }

  beforeEach(() => {
    mockResult = undefined;
  });

  it('tells staff to hand the phone over, then shows the client their screen and resolves their tip', async () => {
    await render(<Harness tipInput={input()} />);
    expect(screen.getByText('Hand the phone to Ada so they can choose a tip.')).toBeTruthy();
    expect(screen.getByText('staff')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('I have handed it over'));
    });
    // The client's screen is modal for screen readers, so what is behind it is hidden from them.
    expect(screen.getByText('facing', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('15% (£5.33)'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Pay £40.83'));
    });
    expect(mockResult).toBe(533);
    expect(screen.queryByText('Would you like to add a tip?')).toBeNull();
  });

  it('names no one for a sale without a client, and resolves nothing when cancelled', async () => {
    await render(<Harness tipInput={input({ clientName: null })} />);
    expect(screen.getByText('Hand the phone to your client so they can choose a tip.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });
    expect(mockResult).toBeNull();
  });
});
