/**
 * The customer-facing tip (UX spec §3.18, §13.3; owner 2026-10-10; client mode from the POS test
 * round 2026-10-11): staff see the hand-over card with a preview, then the client sees the bill,
 * the venue's suggestions in ascending order with "No tip" among them, all the same size and none
 * chosen for them, "Another amount" on our own keypad, and "Pay {total}".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));

import { ClientTip } from '@/components/pos/client-mode/ClientTip';
import { CustomerTipScreen, useCustomerTipPrompt, type CustomerTipInput } from '@/components/pos/CustomerTip';
import { makeLine, makeSale } from '@/lib/pos/test-sale';

const sale = makeSale({ total_pence: 3550, balance_due_pence: 3550, lines: [makeLine({ total_pence: 3550 })] });

function input(over: Partial<CustomerTipInput> = {}): CustomerTipInput {
  return {
    sale,
    tipSettings: { tipping_enabled: true, tip_percent_presets: [20, 10, 15], smart_tip_threshold_pence: 1000, tip_base: 'total' },
    amountPence: 3550,
    balancePence: 3550,
    maxPaymentPence: 1_000_000,
    venueName: 'Studio',
    clientName: 'Ada',
    ...over,
  };
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

describe('ClientTip (the client tip screen)', () => {
  it('shows the bill and the suggestions in ascending order with No tip, chooses nothing, then pays with the tip', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    expect(screen.getByText('Would you like to add a tip?')).toBeTruthy();
    expect(screen.getByText('Tips are always optional.')).toBeTruthy();
    expect(screen.getByText('Your bill £35.50')).toBeTruthy();
    // Venue presets arrive as 20, 10, 15: the client sees them lowest first.
    const labels = screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel);
    expect(labels).toEqual(['10 percent tip, £3.55', '15 percent tip, £5.33', '20 percent tip, £7.10', 'No tip']);
    // Nothing is chosen for them: the button asks for a choice and does nothing.
    await press('Choose an option');
    expect(onChoose).not.toHaveBeenCalled();
    await press('15%');
    expect(screen.getByText('£35.50 + £5.33 tip')).toBeTruthy();
    await press('Pay £40.83');
    expect(onChoose).toHaveBeenCalledWith(533);
  });

  it('pays with no tip', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    await press('No tip');
    expect(screen.getByText('No tip added')).toBeTruthy();
    await press('Pay £35.50');
    expect(onChoose).toHaveBeenCalledWith(0);
  });

  it('takes another amount on its own keypad, typed as on a till', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    await press('Another amount');
    expect(screen.getByText('Add a tip')).toBeTruthy();
    await press('4');
    await press('0');
    await press('0');
    expect(screen.getByTestId('client-tip-custom-amount').props.children).toBe('£4.00');
    expect(screen.getByText('Total £39.50')).toBeTruthy();
    await press('Add £4.00 tip');
    expect(screen.getByText('£4.00 tip')).toBeTruthy();
    await press('Pay £39.50');
    expect(onChoose).toHaveBeenCalledWith(400);
  });

  it('asks the client to confirm a tip over half the bill', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={onChoose} onCancel={jest.fn()} />);
    await press('Another amount');
    for (const key of ['2', '0', '0', '0']) await press(key);
    await press('Add £20.00 tip');
    expect(screen.getByText("That's a £20.00 tip on a £35.50 bill. Is that right?")).toBeTruthy();
    await press("Yes, that's right");
    await press('Pay £55.50');
    expect(onChoose).toHaveBeenCalledWith(2000);
  });

  it('refuses a tip that takes the payment over the venue ceiling', async () => {
    const onChoose = jest.fn();
    await render(<CustomerTipScreen input={input({ maxPaymentPence: 3600 })} onChoose={onChoose} onCancel={jest.fn()} />);
    await press('10%');
    await press('Pay £39.05');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('offers small fixed amounts on a small bill', async () => {
    const small = makeSale({ total_pence: 800, balance_due_pence: 800, lines: [makeLine({ total_pence: 800 })] });
    await render(
      <CustomerTipScreen input={input({ sale: small, amountPence: 800, balancePence: 800 })} onChoose={jest.fn()} onCancel={jest.fn()} />,
    );
    for (const amount of ['£1.00', '£2.00', '£3.00']) expect(screen.getByText(amount)).toBeTruthy();
  });

  it('shows a tip chosen before as selected when the client changes it', async () => {
    await render(<ClientTip input={input()} initialTip={355} onChoose={jest.fn()} onStaffClose={jest.fn()} />);
    expect(screen.getByText('Pay £39.05')).toBeTruthy();
  });

  it("gives staff the corner close, with a label for the team", async () => {
    const onStaffClose = jest.fn();
    await render(<CustomerTipScreen input={input()} onChoose={jest.fn()} onCancel={onStaffClose} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop the card payment, for the team'));
    });
    expect(onStaffClose).toHaveBeenCalled();
  });
});

describe('useCustomerTipPrompt', () => {
  let mockResult: number | null | undefined;

  function Harness({ tipInput, clientHolds = false }: { tipInput: CustomerTipInput; clientHolds?: boolean }) {
    const prompt = useCustomerTipPrompt(tipInput);
    useEffect(() => {
      void prompt.ask({ clientHolds }).then((tip) => {
        mockResult = tip;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once
    }, []);
    return (
      <>
        {prompt.handToView}
        {prompt.stage === 'choose' ? <ClientTip input={tipInput} onChoose={prompt.choose} onStaffClose={prompt.reset} /> : null}
        <Text>{prompt.facing ? 'facing' : 'staff'}</Text>
      </>
    );
  }

  beforeEach(() => {
    mockResult = undefined;
  });

  it('shows staff the hand-over card with a preview, then the client screen, and resolves their tip', async () => {
    await render(<Harness tipInput={input()} />);
    expect(screen.getByText('Hand the phone to Ada so they can choose a tip.')).toBeTruthy();
    expect(screen.getByText("They'll choose a tip, then tap their card.")).toBeTruthy();
    expect(screen.getByText('staff')).toBeTruthy();
    await press('Hand over');
    // The client's screen is modal for screen readers, so what is behind it is hidden from them.
    expect(screen.getByText('facing', { includeHiddenElements: true })).toBeTruthy();
    await press('15%');
    await press('Pay £40.83');
    expect(mockResult).toBe(533);
    expect(screen.queryByText('Would you like to add a tip?')).toBeNull();
  });

  it('names no one for a sale without a client, and resolves nothing when cancelled', async () => {
    await render(<Harness tipInput={input({ clientName: null })} />);
    expect(screen.getByText('Hand the phone to your client so they can choose a tip.')).toBeTruthy();
    await press('Cancel');
    expect(mockResult).toBeNull();
  });

  it('goes straight to the client when they already hold the phone', async () => {
    await render(<Harness tipInput={input()} clientHolds />);
    expect(screen.queryByText('Hand over')).toBeNull();
    expect(screen.getByText('Would you like to add a tip?')).toBeTruthy();
  });
});
