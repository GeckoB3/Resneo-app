/**
 * "Send to a phone" from a device that can't take cards (a tablet without NFC, an iPad), as the web
 * till's panel does it (UX spec §23; plan §4.36):
 * - who can take it: any phone first, then each person with their devices, the person serving
 *   preselected, and a phone not seen for a while says so;
 * - the request: `card_app` with `collect_on`, the amount and a request id, through the sale write;
 * - following it in the deck's words: waiting with the countdown, taken with a tip, paid (handed
 *   back once), cancelled from the desk, expired with Send again;
 * - nobody to send it to, and a payment already waiting on the sale.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { PosCardPhone, PosCollectState } from '@/types/pos';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
const mockInvalidate = jest.fn();
// One client for the whole run, as the app's provider gives: a new one each render would restart the polling.
const mockQueryClient = { invalidateQueries: (...args: unknown[]) => mockInvalidate(...args) };
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));
let mockPhones: PosCardPhone[] | null = [];
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  useCollectPhones: () => ({
    data: mockPhones ? { phones: mockPhones, can_take_cards: true } : undefined,
    isError: false,
    refetch: jest.fn(),
  }),
}));
const mockPosFetch = jest.fn();
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

import { SendToPhonePanel } from '@/components/pos/SendToPhonePanel';
import { ApiError } from '@/lib/api/client';
import { makeLine, makeSale } from '@/lib/pos/test-sale';

const sale = makeSale({
  id: 'sale-1',
  version: 4,
  total_pence: 3550,
  balance_due_pence: 3550,
  lines: [makeLine({ total_pence: 3550 })],
  operator: { staff_id: 'st-2', calendar_id: null, name: 'Sam' },
});

function collect(over: Partial<PosCollectState> = {}): PosCollectState {
  return {
    payment_id: 'pay-1',
    sale_id: 'sale-1',
    status: 'pending',
    collect_state: 'awaiting_device',
    screen: 'waiting',
    for_anyone: false,
    target_staff_id: 'st-1',
    target_name: 'Jess',
    claimed_by_staff_id: null,
    claimed_by_name: null,
    reader_type: null,
    amount_pence: 3550,
    tip_pence: 0,
    card_brand: null,
    card_last4: null,
    failure_code: null,
    failure_message: null,
    expires_at: '2026-10-21T12:02:00Z',
    seconds_left: 120,
    claimed_at: null,
    created_at: '2026-10-21T12:00:00Z',
    ...over,
  };
}

/** What the payment's state route answers on each poll. */
function polls(...states: PosCollectState[]) {
  let i = 0;
  mockPosFetch.mockImplementation(async () => {
    const state = states[Math.min(i, states.length - 1)]!;
    i += 1;
    return { collect: state, sale_version: 5, sale_status: 'open' };
  });
}

async function renderPanel(props: Partial<Parameters<typeof SendToPhonePanel>[0]> = {}) {
  const send = jest.fn().mockResolvedValue({ sale, collect: collect(), replayed: false });
  const onPaid = jest.fn();
  const onBack = jest.fn();
  await render(<SendToPhonePanel sale={sale} send={send} amountPence={3550} onPaid={onPaid} onBack={onBack} {...props} />);
  return { send, onPaid, onBack };
}

async function press(text: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockInvalidate.mockReset();
  mockPosFetch.mockReset();
  polls(collect());
  mockPhones = [
    { staff_id: 'st-1', name: 'Jess', devices: ['iphone'], last_seen_at: new Date().toISOString() },
    {
      staff_id: 'st-2',
      name: 'Sam',
      devices: ['android', 'wisepad'],
      last_seen_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
});

describe('SendToPhonePanel', () => {
  it('lists any phone first, then each person with their phones, the person serving preselected', async () => {
    await renderPanel();
    expect(screen.getByText('Who should take it?')).toBeTruthy();
    const rows = screen.getAllByRole('button').map((b) => b.props.accessibilityState);
    const labels = ['Any phone that can take cards', 'Jess', 'Sam'].map((name) => screen.getByRole('button', { name: new RegExp(name) }));
    expect(labels[0]!.props.accessibilityState).toMatchObject({ selected: false });
    expect(labels[2]!.props.accessibilityState).toMatchObject({ selected: true });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('iPhone')).toBeTruthy();
    expect(screen.getByText('Android phone, Card reader (Bluetooth). Last seen 3 days ago')).toBeTruthy();
    expect(screen.getByText('Only people signed in to the ResNeo app on a phone that can take cards are shown.')).toBeTruthy();
  });

  it('sends the amount to the chosen phone with a request id, then counts down while it waits', async () => {
    const { send } = await renderPanel();
    await press('Jess');
    await press('Send £35.50');
    expect(send).toHaveBeenCalledWith({
      action: 'payments',
      money: true,
      body: {
        version: 4,
        client_request_id: expect.any(String),
        method: 'card_app',
        amount_pence: 3550,
        collect_on: { staff_id: 'st-1' },
      },
    });
    expect(screen.getByText('Waiting for Jess to take it')).toBeTruthy();
    expect(screen.getByText('120 seconds left')).toBeTruthy();
    expect(mockPosFetch).toHaveBeenCalledWith('/api/venue/pos/payments/pay-1/collect', { accessToken: 'tok' });
  });

  it('sends to any phone when that is chosen', async () => {
    const { send } = await renderPanel();
    await press('Any phone that can take cards');
    await press('Send £35.50');
    expect(send.mock.calls[0]![0].body.collect_on).toEqual({ any: true });
  });

  it('shows who took it and their tip, then hands back once when the server says it is paid', async () => {
    polls(collect({ screen: 'paid', status: 'succeeded', claimed_by_name: 'Jess', tip_pence: 450 }));
    const { onPaid } = await renderPanel();
    await press('Send £35.50');
    expect(screen.getByText("Paid on Jess's phone")).toBeTruthy();
    expect(screen.getByText('With a £4.50 tip')).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('cancels from the desk through the collect cancel route', async () => {
    const { send } = await renderPanel();
    await press('Send £35.50');
    send.mockResolvedValueOnce({ collect: collect({ screen: 'cancelled', status: 'cancelled', collect_state: 'cancelled' }) });
    await press('Cancel');
    expect(send).toHaveBeenLastCalledWith({
      action: 'cancel',
      path: '/api/venue/pos/payments/pay-1/cancel',
      money: true,
      body: { reason: 'desk' },
    });
    expect(screen.getByText('Cancelled. Nothing was taken.')).toBeTruthy();
  });

  it('shows a payment that went through while it was being cancelled as paid', async () => {
    const { send, onPaid } = await renderPanel();
    await press('Send £35.50');
    send.mockRejectedValueOnce(
      new ApiError('Already paid', 409, {
        error: 'Already paid',
        code: 'POS_PAYMENT_NOT_PENDING',
        collect: collect({ screen: 'paid', status: 'succeeded', claimed_by_name: 'Jess' }),
      }),
    );
    await press('Cancel');
    expect(screen.getByText("Paid on Jess's phone")).toBeTruthy();
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('offers to send again with a new request after nobody took it', async () => {
    polls(collect({ screen: 'expired', status: 'cancelled', collect_state: 'expired' }));
    const { send } = await renderPanel();
    await press('Jess');
    await press('Send £35.50');
    expect(screen.getByText('Nobody took it within 2 minutes, so it was cancelled. Nothing was taken.')).toBeTruthy();
    polls(collect());
    await press('Send again');
    expect(send).toHaveBeenCalledTimes(2);
    const [first, second] = send.mock.calls.map((c) => c[0].body);
    expect(second.collect_on).toEqual({ staff_id: 'st-1' });
    expect(second.client_request_id).not.toBe(first.client_request_id);
    expect(screen.getByText('Waiting for Jess to take it')).toBeTruthy();
  });

  it('says nobody can take it, and offers a pay link, when no phone can take cards', async () => {
    mockPhones = [];
    const onUseLink = jest.fn();
    await renderPanel({ onUseLink });
    expect(screen.getByText('No phone can take cards right now')).toBeTruthy();
    expect(screen.getByText('No phone here can take cards. Send a pay link instead.')).toBeTruthy();
    await press('Send a pay link instead');
    expect(onUseLink).toHaveBeenCalled();
  });

  it('says the same when the server finds no phone for the request', async () => {
    const { send } = await renderPanel();
    send.mockRejectedValueOnce(
      new ApiError('No phone here can take cards.', 409, { error: 'No phone here can take cards.', code: 'POS_NO_CARD_DEVICE' }),
    );
    await press('Send £35.50');
    expect(screen.getByText('No phone can take cards right now')).toBeTruthy();
  });

  it('keeps the request id after a dropped connection, so trying again sends it once', async () => {
    const { send } = await renderPanel();
    send.mockRejectedValueOnce(new Error('Network request failed'));
    await press('Send £35.50');
    expect(screen.getByText('Network request failed')).toBeTruthy();
    await press('Try again');
    const [first, second] = send.mock.calls.map((c) => c[0].body);
    expect(second.collect_on).toEqual({ staff_id: 'st-2' });
    expect(second.client_request_id).toBe(first.client_request_id);
    expect(screen.getByText('Waiting for Jess to take it')).toBeTruthy();
  });

  it('starts a new request after a refusal, and offers no Try again', async () => {
    const { send } = await renderPanel();
    send.mockRejectedValueOnce(new ApiError('Card payments in person are switched off.', 409, { error: 'Card payments in person are switched off.', code: 'CONFLICT' }));
    await press('Send £35.50');
    expect(screen.getByText('Card payments in person are switched off.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    await press('Choose another phone');
    await press('Send £35.50');
    const [first, second] = send.mock.calls.map((c) => c[0].body);
    expect(second.client_request_id).not.toBe(first.client_request_id);
  });

  it('follows a payment already waiting on the sale without sending another', async () => {
    polls(collect({ payment_id: 'pay-9', screen: 'claimed', collect_state: 'claimed', claimed_by_name: 'Priya', tip_pence: 450 }));
    const { send } = await renderPanel({ pendingPaymentId: 'pay-9' });
    expect(screen.getByText('Priya has it on their phone')).toBeTruthy();
    expect(screen.getByText('With a £4.50 tip')).toBeTruthy();
    expect(mockPosFetch).toHaveBeenCalledWith('/api/venue/pos/payments/pay-9/collect', { accessToken: 'tok' });
    expect(send).not.toHaveBeenCalled();
  });
});
