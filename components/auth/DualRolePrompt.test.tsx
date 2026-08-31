/**
 * The dual-role choice, offered after landing rather than before routing.
 *
 * The web asks at login on `/auth/choose-destination`, because one URL serves
 * both surfaces and the server must pick a redirect. This asks a beat later, so
 * that `hasGuest` never becomes a third asynchronous input to the guard
 * sequence: getting that wrong mounts a navigator and fires queries, which is
 * the bug the 1.1.0 preview build hit. Getting THIS wrong means a prompt does
 * not appear.
 */
import { render, act, fireEvent } from '@testing-library/react-native';
import React from 'react';

const mockState = {
  isAlsoCustomer: false,
  asked: false,
  askedLoadResolves: true,
  switched: null as string | null,
  markedAsked: false,
};

/*
  The sheet's drag-to-dismiss needs reanimated's worklet runtime, which is not
  initialised under jest-expo, so `GestureDetector` throws. Same mocks as
  `Sheet.test.tsx`, and they are not optional here: without them the sheet
  never renders at all and every "shows nothing" assertion below passes by
  finding nothing, which is no test.
*/
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  for (const m of ['activeOffsetY', 'failOffsetY', 'onChange', 'onEnd']) {
    builder[m] = () => builder;
  }
  return {
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/providers/AppLockProvider', () => ({ AppLockCover: () => null }));

jest.mock('@/lib/queries/useIsAlsoCustomer', () => ({
  useIsAlsoCustomer: () => ({
    isAlsoCustomer: mockState.isAlsoCustomer,
    isResolved: true,
  }),
}));
jest.mock('@/lib/mode/app-mode-store', () => ({
  hasBeenAskedDualRole: () => mockState.asked,
  subscribeDualRoleAsked: () => () => {},
  loadDualRoleAsked: async () => {
    if (!mockState.askedLoadResolves) await new Promise(() => {});
    return mockState.asked;
  },
  markDualRoleAsked: () => {
    mockState.markedAsked = true;
    mockState.asked = true;
  },
  switchAppMode: (m: string) => {
    mockState.switched = m;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DualRolePrompt } = require('./DualRolePrompt') as typeof import('./DualRolePrompt');

beforeEach(() => {
  mockState.isAlsoCustomer = false;
  mockState.asked = false;
  mockState.askedLoadResolves = true;
  mockState.switched = null;
  mockState.markedAsked = false;
});

/**
 * Mount and let the stored-flag read settle.
 *
 * The component only shows anything once `loadDualRoleAsked()` has resolved,
 * and that lands on a microtask the awaited render does not flush by itself.
 * Without this every assertion here would pass by finding nothing, which is no
 * test at all.
 */
async function mount() {
  const result = await render(<DualRolePrompt />);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

describe('who gets asked', () => {
  it('asks somebody who is staff AND a customer', async () => {
    mockState.isAlsoCustomer = true;
    const { queryByText } = await mount();
    expect(queryByText('Where would you like to go?')).toBeTruthy();
  });

  it('says nothing to staff who are not a customer anywhere', async () => {
    // The common case by far, and a prompt here would be an interruption
    // offering a door to an empty room.
    mockState.isAlsoCustomer = false;
    const { queryByText } = await mount();
    expect(queryByText('Where would you like to go?')).toBeNull();
  });

  it('says nothing to somebody already asked', async () => {
    mockState.isAlsoCustomer = true;
    mockState.asked = true;
    const { queryByText } = await mount();
    expect(queryByText('Where would you like to go?')).toBeNull();
  });

  it('says nothing until the disk read lands', async () => {
    /*
      Otherwise the sheet flashes up at somebody who answered on a previous
      launch, before the stored flag has been read back.
    */
    mockState.isAlsoCustomer = true;
    mockState.askedLoadResolves = false;
    const { queryByText } = await mount();
    expect(queryByText('Where would you like to go?')).toBeNull();
  });
});

describe('what each answer does', () => {
  it('records staff as a PREFERENCE, not merely a dismissal', async () => {
    /*
      Somebody who picked this side meant it. The mode store is what the
      switchers read, so recording only "asked" would leave them with no
      preference and a question that never returns.
    */
    mockState.isAlsoCustomer = true;
    const { getByText } = await mount();
    await act(async () => {
      fireEvent.press(getByText('My venue'));
    });
    expect(mockState.switched).toBe('staff');
    expect(mockState.markedAsked).toBe(true);
  });

  it('switches sides when they choose their own bookings', async () => {
    mockState.isAlsoCustomer = true;
    const { getByText } = await mount();
    await act(async () => {
      fireEvent.press(getByText('My own bookings'));
    });
    expect(mockState.switched).toBe('customer');
    expect(mockState.markedAsked).toBe(true);
  });
});
