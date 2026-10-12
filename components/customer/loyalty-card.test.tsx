/**
 * The customer's "Loyalty card" on Home (UX spec §21.4), the web account's card in the same words:
 * the circles under one label that a screen reader hears once, a reward with and without its
 * use-by date, one card per venue, and nothing at all while the first read is in flight, when
 * there are no cards, or when the read fails.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react-native';

import { LoyaltyCard } from '@/components/customer/LoyaltyCard';
import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import type { CustomerLoyaltyCard } from '@/lib/queries/useCustomerLoyalty';
import { darkColors, lightColors } from '@/theme/index';

const mockApiFetch = jest.fn();
let mockScheme: 'light' | 'dark' = 'light';

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('@/components/useColorScheme', () => ({ useColorScheme: () => mockScheme }));

let client: QueryClient;

function card(over: Partial<CustomerLoyaltyCard> = {}): CustomerLoyaltyCard {
  return { venue_id: 'v-1', venue_name: 'Studio', stamps: 3, needed: 10, rewards: [], ...over };
}

async function renderCard() {
  await render(
    <QueryClientProvider client={client}>
      <LoyaltyCard />
    </QueryClientProvider>,
  );
}

/** Waits for the read to answer and the answer to reach the card, so "nothing" is about the answer. */
async function settled(status: 'success' | 'error') {
  await waitFor(() => expect(client.getQueryState(queryKeys.customer.loyalty('token-A'))?.status).toBe(status));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockScheme = 'light';
  mockApiFetch.mockReset().mockResolvedValue({ venues: [card()] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe('a card with stamps', () => {
  it('draws the circles under one label carrying the progress', async () => {
    await renderCard();
    const row = await screen.findByLabelText('3 of 10 visits at Studio');
    expect(within(row).getAllByTestId('stamp-filled')).toHaveLength(3);
    expect(within(row).getAllByTestId('stamp-empty')).toHaveLength(7);
    // One label for the row, so a screen reader says the progress once rather than every circle.
    expect(screen.getAllByLabelText('3 of 10 visits at Studio')).toHaveLength(1);
  });

  it('writes the progress for the eye without a screen reader hearing it twice', async () => {
    await renderCard();
    await screen.findByLabelText('3 of 10 visits at Studio');
    expect(screen.getByText('3 of 10 visits at Studio', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('3 of 10 visits at Studio')).toBeNull();
  });

  it("carries the heading and how stamps are earned, in the web's words", async () => {
    await renderCard();
    expect(await screen.findByRole('header', { name: 'Loyalty card' })).toBeTruthy();
    expect(screen.getByText('You get a stamp each day you visit Studio.')).toBeTruthy();
    // Nothing waiting, so no reward line.
    expect(screen.queryByText(/Your reward is ready/)).toBeNull();
  });

  it('draws at most 20 circles, the most a card can need', async () => {
    mockApiFetch.mockResolvedValue({ venues: [card({ stamps: 4, needed: 25 })] });
    await renderCard();
    const row = await screen.findByLabelText('4 of 25 visits at Studio');
    expect(within(row).getAllByTestId('stamp-filled')).toHaveLength(4);
    expect(within(row).getAllByTestId('stamp-empty')).toHaveLength(16);
  });
});

describe('a reward ready', () => {
  it('says the reward and the day to use it by', async () => {
    mockApiFetch.mockResolvedValue({
      venues: [
        card({
          stamps: 0,
          needed: 6,
          rewards: [{ id: 'r-1', text: 'a free Cut', expires_text: 'Use it by 3 October 2026.' }],
        }),
      ],
    });
    await renderCard();
    expect(await screen.findByText('Your reward is ready: a free Cut. Just mention it when you pay.')).toBeTruthy();
    expect(screen.getByText('Use it by 3 October 2026.')).toBeTruthy();
    // A full card starts again, so its circles are empty while the reward waits.
    const row = screen.getByLabelText('0 of 6 visits at Studio');
    expect(within(row).queryAllByTestId('stamp-filled')).toHaveLength(0);
  });

  it('has no use-by line when the reward never runs out', async () => {
    mockApiFetch.mockResolvedValue({
      venues: [card({ rewards: [{ id: 'r-1', text: '£5.00 off', expires_text: null }] })],
    });
    await renderCard();
    expect(await screen.findByText('Your reward is ready: £5.00 off. Just mention it when you pay.')).toBeTruthy();
    expect(screen.queryByText(/Use it by/)).toBeNull();
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('takes its colours from the %s theme', async (scheme, colors) => {
    mockScheme = scheme;
    mockApiFetch.mockResolvedValue({
      venues: [card({ rewards: [{ id: 'r-1', text: 'a free Cut', expires_text: null }] })],
    });
    await renderCard();
    expect(await screen.findByTestId('loyalty-reward')).toHaveStyle({
      backgroundColor: colors.successSurface,
      borderColor: colors.success,
    });
    expect(screen.getByText('Your reward is ready: a free Cut. Just mention it when you pay.')).toHaveStyle({
      color: colors.text,
    });
  });
});

describe('several venues', () => {
  it('stacks one card per venue', async () => {
    mockApiFetch.mockResolvedValue({
      venues: [
        card({ venue_id: 'v-1', venue_name: 'Barber', stamps: 2, needed: 6 }),
        card({ venue_id: 'v-2', venue_name: 'Studio', stamps: 5, needed: 8 }),
      ],
    });
    await renderCard();
    expect(await screen.findAllByRole('header', { name: 'Loyalty card' })).toHaveLength(2);
    expect(screen.getByLabelText('2 of 6 visits at Barber')).toBeTruthy();
    expect(screen.getByLabelText('5 of 8 visits at Studio')).toBeTruthy();
  });

  it('keeps two cards at one venue apart', async () => {
    // A customer can be two client records at one venue, and each record has its own card.
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApiFetch.mockResolvedValue({ venues: [card({ stamps: 1 }), card({ stamps: 2 })] });
    await renderCard();
    expect(await screen.findAllByRole('header', { name: 'Loyalty card' })).toHaveLength(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    error.mockRestore();
  });
});

describe('when there is nothing to show', () => {
  it('renders nothing while the first read is in flight', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => undefined));
    await renderCard();
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing when the customer has no cards', async () => {
    mockApiFetch.mockResolvedValue({ venues: [] });
    await renderCard();
    await settled('success');
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing when the read fails, rather than a broken card', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Internal error', 500));
    await renderCard();
    await settled('error');
    expect(screen.toJSON()).toBeNull();
  });
});
