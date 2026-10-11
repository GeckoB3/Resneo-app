/**
 * The wizard's flow (design 6.2 and 6.5): which screens a venue sees and in what order, where each
 * leads, the step count, the card's lines and where they open, and how many of the wizard's screens
 * "Save and finish later" leaves at once.
 */
import {
  cardLineHref,
  continueHref,
  doneSteps,
  isSetupRouteName,
  isSetupScreen,
  nextScreen,
  openSteps,
  setupHref,
  setupRoutesOnTop,
  setupScreens,
  stepCount,
  stepForScreen,
  SETUP_DONE_HREF,
  SETUP_PHONE_HREF,
  SETUP_WELCOME_HREF,
  type SetupFlowFacts,
} from '@/lib/pos/setup/flow';
import type { PosSetupStepView } from '@/types/pos-setup';

function steps(overrides: Partial<Record<PosSetupStepView['id'], Partial<PosSetupStepView>>> = {}): PosSetupStepView[] {
  return (['cards', 'tips', 'details', 'team', 'products', 'vouchers', 'loyalty', 'shop', 'practice'] as const).map((id) => ({
    id,
    applies: !['team', 'vouchers', 'loyalty', 'shop'].includes(id),
    state: 'todo',
    ...overrides[id],
  }));
}

function facts(over: Partial<SetupFlowFacts> = {}): SetupFlowFacts {
  return {
    answers: {},
    steps: steps(),
    sellProducts: true,
    extras: { vouchers: false, loyalty: false, shop: false },
    ...over,
  };
}

describe('setupScreens', () => {
  it("shows a one-person salon that takes cards and sells products the design's nine screens", () => {
    expect(setupScreens(facts())).toEqual(['welcome', 'use', 'pay', 'cards', 'tips', 'details', 'products', 'practice', 'done']);
  });

  it('leaves out taking cards once Card was not ticked', () => {
    const list = setupScreens(facts({ answers: { pay: { card: false, cash: true, transfer: false, other_machine: false, count_cash: null, float_pence: null } } }));
    expect(list).not.toContain('cards');
  });

  it('adds the team for a team, and each extra that is on', () => {
    const list = setupScreens(
      facts({ steps: steps({ team: { applies: true } }), extras: { vouchers: true, loyalty: true, shop: true } }),
    );
    expect(list).toEqual([
      'welcome',
      'use',
      'pay',
      'cards',
      'tips',
      'details',
      'team',
      'products',
      'vouchers',
      'loyalty',
      'shop',
      'practice',
      'done',
    ]);
  });

  it('leaves out products while "Sell products" is off', () => {
    expect(setupScreens(facts({ sellProducts: false }))).not.toContain('products');
  });
});

describe('moving through', () => {
  it('goes to the next screen of this flow, and to W12 after the last', () => {
    const list = setupScreens(facts());
    expect(nextScreen('welcome', list)).toBe('use');
    expect(nextScreen('pay', list)).toBe('cards');
    expect(nextScreen('details', list)).toBe('products');
    expect(nextScreen('practice', list)).toBe('done');
    expect(nextScreen('done', list)).toBe('done');
  });

  it('carries on from a screen the flow leaves out (opened from the card)', () => {
    const list = setupScreens(facts());
    expect(nextScreen('team', list)).toBe('products');
    expect(stepCount('team', list)).toEqual({ n: 7, total: 10 });
  });

  it('counts the steps', () => {
    const list = setupScreens(facts());
    expect(stepCount('welcome', list)).toEqual({ n: 1, total: 9 });
    expect(stepCount('done', list)).toEqual({ n: 9, total: 9 });
  });

  it('knows its screens and routes', () => {
    expect(isSetupScreen('vouchers')).toBe(true);
    expect(isSetupScreen('phone')).toBe(false);
    expect(isSetupScreen(undefined)).toBe(false);
    expect(setupHref('tips')).toBe('/checkout-setup/tips');
    expect(SETUP_WELCOME_HREF).toBe('/checkout-setup/welcome');
    expect(SETUP_DONE_HREF).toBe('/checkout-setup/done');
    expect(SETUP_PHONE_HREF).toBe('/checkout-setup/phone');
    expect(stepForScreen('details')).toBe('details');
    expect(stepForScreen('use')).toBeNull();
    expect(stepForScreen('done')).toBeNull();
  });
});

describe('the card', () => {
  it('lists what applies and is not done, skipped included, and what is done', () => {
    const status = { steps: steps({ cards: { state: 'done' }, tips: { state: 'skipped' }, team: { applies: false, state: 'todo' } }) };
    expect(openSteps(status).map((s) => s.id)).toEqual(['tips', 'details', 'products', 'practice']);
    expect(doneSteps(status).map((s) => s.id)).toEqual(['cards']);
    expect(openSteps(null)).toEqual([]);
  });

  it('opens "Get this phone ready" for taking cards, unless a reader or links were chosen', () => {
    expect(cardLineHref('cards', {})).toBe('/checkout-setup/phone');
    expect(cardLineHref('cards', { cards: 'both' })).toBe('/checkout-setup/phone');
    expect(cardLineHref('cards', { cards: 'reader' })).toBe('/checkout-setup/cards');
    expect(cardLineHref('cards', { cards: 'links' })).toBe('/checkout-setup/cards');
    expect(cardLineHref('products', {})).toBe('/checkout-setup/products');
  });

  it('continues at the next screen, or the welcome for one it does not know', () => {
    expect(continueHref({ next_screen: 'details' })).toBe('/checkout-setup/details');
    expect(continueHref({ next_screen: 'somewhere-new' as never })).toBe('/checkout-setup/welcome');
    expect(continueHref(null)).toBe('/checkout-setup/welcome');
  });
});

describe('leaving', () => {
  it("counts the wizard's screens on top of the stack", () => {
    expect(isSetupRouteName('checkout-setup/[step]')).toBe(true);
    expect(isSetupRouteName('checkout-setup/phone')).toBe(true);
    expect(isSetupRouteName('checkout/index')).toBe(false);
    expect(
      setupRoutesOnTop([{ name: '(tabs)' }, { name: 'today' }, { name: 'checkout-setup/[step]' }, { name: 'checkout-setup/[step]' }]),
    ).toBe(2);
    expect(setupRoutesOnTop([{ name: '(tabs)' }, { name: 'checkout-setup/[step]' }, { name: 'checkout/[id]' }])).toBe(0);
    expect(setupRoutesOnTop(undefined)).toBe(0);
  });
});
