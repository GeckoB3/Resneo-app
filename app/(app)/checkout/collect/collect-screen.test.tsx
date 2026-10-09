/**
 * The collect screen for a sale sent from the web till to this phone (POS plan §4.36; UX spec
 * §23.5; test plan TTP-09). The card screen itself (`CardCollectPanel`, Apple's rules, the warm-up
 * and the education) is shared with the app's own sale payments and is stubbed here; this pins what
 * the collect screen decides:
 * - who sent it, from which till, for which client;
 * - the app's tip screen first when the venue takes tips, and that tip goes into the claim;
 * - the reader the person chose becomes the claim's `reader_type`;
 * - the outcomes in the deck's words: timed out, declined, chip and PIN with a pay link, the desk
 *   cancelled, another phone took it, and a request that has ended;
 * - nothing without the POS switch, and nothing on a phone that cannot take cards here.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { PosBootstrap, PosCollectState } from '@/types/pos';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/payments/TapToPayEducation', () => ({ TapToPayEducationSheet: () => null }));
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ paymentId: 'pay-7' }),
  useRouter: () => mockRouter,
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' }, venue: null }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' } }) }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { id: 'staff-1' } } }) }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getStripePublishableKey: () => 'pk_test',
}));
let mockSdk = true;
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>('@/lib/payments/terminal-sdk'),
  isTerminalSdkAvailable: () => mockSdk,
}));

let mockPosOn = true;
let mockCollect: PosCollectState;
let mockBoot: PosBootstrap;
jest.mock('@/lib/queries/usePos', () => {
  const { makeSale, makeLine } = jest.requireActual<typeof import('@/lib/pos/test-sale')>('@/lib/pos/test-sale');
  const sale = makeSale({
    id: 'sale-1',
    number_label: 'R-1042',
    till_id: 'till-1',
    total_pence: 4500,
    guest: { id: 'g-1', name: 'Ada Lovelace', email: null, phone: null },
    lines: [makeLine({ total_pence: 4500 })],
  });
  return {
    usePosEnabled: () => mockPosOn,
    usePosBootstrap: () => ({ data: mockBoot, isLoading: false }),
    useCollectState: () => ({ data: { collect: mockCollect, sale_version: 3, sale_status: 'open' }, isLoading: false }),
    usePosSale: () => ({ data: sale, isLoading: false }),
    useCollectRequests: () => ({
      data: { requests: [{ payment_id: 'pay-7', till_name: 'Front desk', sent_by_name: 'Sam', client_name: 'Ada Lovelace' }] },
    }),
    useSaleWrite: () => ({ mutateAsync: jest.fn() }),
  };
});

jest.mock('@/lib/pos/collect-device', () => ({ collectDeviceId: async () => 'dev-1' }));
const mockClaim = jest.fn();
const mockCancel = jest.fn(async () => 'cancelled');
jest.mock('@/lib/payments/useCollectPayment', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/useCollectPayment')>('@/lib/payments/useCollectPayment'),
  useCollectClaimPayment: () => ({ mutateAsync: mockClaim }),
  cancelCollectPayment: (...args: unknown[]) => mockCancel(...(args as [])),
}));

let mockPanel: Record<string, unknown> = {};
jest.mock('@/components/pos/SaleCardCollect', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CardCollectPanel: (props: Record<string, unknown>) => {
      mockPanel = props;
      return (
        <>
          <Text>card-panel</Text>
          {props.extra as never}
        </>
      );
    },
  };
});
jest.mock('@/components/pos/PayLinkPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PayLinkPanel: (props: { amountPence: number }) => <Text>{`pay-link ${props.amountPence}`}</Text> };
});
jest.mock('@/components/pos/ReaderPayPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ReaderPayPanel: () => <Text>reader-panel</Text> };
});

import CollectScreen from '@/app/(app)/checkout/collect/[paymentId]';
import { ApiError } from '@/lib/api/client';
import { CollectEndedError } from '@/lib/payments/useCollectPayment';
import { SaleCardError } from '@/lib/payments/useSaleCardPayment';

function collect(over: Partial<PosCollectState> = {}): PosCollectState {
  return {
    payment_id: 'pay-7',
    sale_id: 'sale-1',
    status: 'pending',
    collect_state: 'awaiting_device',
    screen: 'waiting',
    for_anyone: false,
    target_staff_id: 'staff-1',
    target_name: 'Jess',
    claimed_by_staff_id: null,
    claimed_by_name: null,
    reader_type: null,
    amount_pence: 4500,
    tip_pence: 0,
    card_brand: null,
    card_last4: null,
    failure_code: null,
    failure_message: null,
    expires_at: '2026-10-09T10:02:00Z',
    seconds_left: 90,
    claimed_at: null,
    created_at: '2026-10-09T10:00:00Z',
    ...over,
  };
}

function boot(over: Partial<PosBootstrap> = {}): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000 },
    capabilities: { take_payment: true },
    role: 'staff',
    tills: [{ id: 'till-1', name: 'Front desk' }],
    payment_types: [],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: true, pay_link: true, card_reader: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    me: { staff_id: 'staff-1', name: 'Jess', calendar_ids: [] },
    ...over,
  };
}

beforeEach(() => {
  mockPosOn = true;
  mockSdk = true;
  mockCollect = collect();
  mockBoot = boot();
  mockPanel = {};
  mockClaim.mockReset();
  mockCancel.mockClear();
  mockRouter.back.mockReset();
});

type Panel = {
  pay: (kind: string, hooks: Record<string, unknown>) => Promise<unknown>;
  describeError: (e: unknown) => string | null;
  onFailure: (e: unknown) => void;
  onDone: (r: unknown) => void;
  tipPence: number;
  processingLabel: string;
};
const panel = () => mockPanel as unknown as Panel;

describe('CollectScreen', () => {
  it('says what it is, who sent it and for whom, then goes to the card when tips are off', async () => {
    await render(<CollectScreen />);
    expect(screen.getByText('Take £45.00')).toBeTruthy();
    expect(screen.getByText('Sale R-1042 at Front desk, sent by Sam')).toBeTruthy();
    expect(screen.getByText('For Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('card-panel')).toBeTruthy();
    expect(panel().processingLabel).toBe('Processing');
  });

  it('asks for the tip first, and claims with it and the chosen reader', async () => {
    mockBoot = boot({ tip_settings: { tipping_enabled: true, tip_percent_presets: [10, 15, 20], smart_tip_threshold_pence: 1000 } });
    await render(<CollectScreen />);
    expect(screen.getByText('Would you like to add a tip?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('10% (£4.50)'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Charge £49.50'));
    });
    expect(panel().tipPence).toBe(450);
    mockClaim.mockResolvedValue({ paymentId: 'pay-7' });
    await act(async () => {
      await panel().pay('bluetooth', { shouldStop: () => false });
    });
    expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ readerType: 'wisepad', tipPence: 450 }));
  });

  it("words the outcomes as the deck does", async () => {
    await render(<CollectScreen />);
    const d = panel().describeError;
    expect(d(new SaleCardError('x', 'timed_out', 'pay-7'))).toBe(
      "The card wasn't tapped within 5 minutes, so this stopped. Nothing was taken.",
    );
    expect(d(new SaleCardError('x', 'declined', 'pay-7'))).toBe('The card was declined. Try again, or ask for another card.');
    expect(d(new SaleCardError('x', 'declined', 'pay-7', { code: null, declineCode: 'offline_pin_required' }))).toBe(
      "This card needs to be inserted with a PIN, and a phone can't do that. Send a pay link, or try another card.",
    );
    expect(d(new CollectEndedError(collect({ status: 'cancelled', screen: 'cancelled' })))).toBe(
      'This payment has ended. Nothing more to do here.',
    );
    // A refusal from the server (another phone took it, sent to someone else) keeps its own words.
    expect(d(new ApiError('Jess has already taken this payment on their phone.', 409, {}))).toBeNull();
  });

  it('offers a pay link for a card that wants chip and PIN, cancelling this payment first', async () => {
    await render(<CollectScreen />);
    await act(async () => {
      panel().onFailure(new SaleCardError('x', 'declined', 'pay-7', { code: null, declineCode: 'offline_pin_required' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Send a pay link'));
    });
    expect(mockCancel).toHaveBeenCalledWith('tok', 'pay-7');
    expect(screen.getByText('pay-link 4500')).toBeTruthy();
  });

  it('says another phone has it', async () => {
    mockCollect = collect({ collect_state: 'claimed', screen: 'claimed', claimed_by_staff_id: 'staff-2', claimed_by_name: 'Priya' });
    await render(<CollectScreen />);
    expect(screen.getByText('Priya has already taken this payment on their phone.')).toBeTruthy();
    expect(screen.queryByText('card-panel')).toBeNull();
  });

  it('says a request nobody took in time has ended', async () => {
    mockCollect = collect({ status: 'cancelled', collect_state: 'expired', screen: 'expired' });
    await render(<CollectScreen />);
    expect(screen.getByText('Nobody took this payment in time, so it was cancelled. Nothing was taken.')).toBeTruthy();
  });

  it('says the desk cancelled one this phone had claimed', async () => {
    mockCollect = collect({ status: 'cancelled', collect_state: 'cancelled', screen: 'cancelled', claimed_by_staff_id: 'staff-1' });
    await render(<CollectScreen />);
    expect(screen.getByText('The desk cancelled this payment. Nothing was taken.')).toBeTruthy();
  });

  it('shows the paid line once the card went through', async () => {
    await render(<CollectScreen />);
    await act(async () => {
      panel().onDone({ paymentId: 'pay-7', amountPence: 4500, tipPence: 0, card: null, alreadyPaid: false, cardSave: null });
    });
    expect(screen.getByText('Paid. The desk can see it.')).toBeTruthy();
  });

  it('shows nothing of it without the POS switch, or on a phone that cannot take cards', async () => {
    mockPosOn = false;
    await render(<CollectScreen />);
    expect(screen.queryByText('card-panel')).toBeNull();
    mockPosOn = true;
    mockSdk = false;
    await render(<CollectScreen />);
    expect(screen.queryByText('card-panel')).toBeNull();
  });
});
