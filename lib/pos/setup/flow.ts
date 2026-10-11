import {
  POS_SETUP_SCREENS,
  POS_SETUP_STEPS,
  type PosSetupAnswers,
  type PosSetupScreen,
  type PosSetupStatus,
  type PosSetupStepId,
  type PosSetupStepView,
} from '@/types/pos-setup';

/**
 * Which of the wizard's screens a venue sees, in what order, and where each one leads (design 6.2
 * and 6.5). Pure, so the flow is tested without rendering. The app's wizard is a stack of native
 * screens, one route per screen (`app/(app)/checkout-setup/[step].tsx`), plus "Get this phone ready"
 * (`checkout-setup/phone.tsx`).
 */

/** Where the wizard lives in the app. */
export const SETUP_BASE = '/checkout-setup';
/** "Get this phone ready" (design 6.6, drawn as C4). */
export const SETUP_PHONE_HREF = `${SETUP_BASE}/phone`;
/** W12. The practice sale's "Finish practice" comes back here (as the web's `?step=done`). */
export const SETUP_DONE_HREF = `${SETUP_BASE}/done`;
/** W0, where switching Checkout on lands. */
export const SETUP_WELCOME_HREF = `${SETUP_BASE}/welcome`;

/** The route of one screen. */
export function setupHref(screen: PosSetupScreen): string {
  return `${SETUP_BASE}/${screen}`;
}

/** True for a screen name (`?step=` on the web, the route segment here). */
export function isSetupScreen(value: unknown): value is PosSetupScreen {
  return typeof value === 'string' && (POS_SETUP_SCREENS as readonly string[]).includes(value);
}

/** True for a route of the wizard's own stack (`checkout-setup/[step]`, `checkout-setup/phone`). */
export function isSetupRouteName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith('checkout-setup/');
}

/** The card step a screen answers, or null for the screens that are not steps (W0 to W2, W12). */
export function stepForScreen(screen: PosSetupScreen): PosSetupStepId | null {
  return (POS_SETUP_STEPS as readonly string[]).includes(screen) ? (screen as PosSetupStepId) : null;
}

/** What decides which screens show, read from the status, the POS settings and the venue. */
export interface SetupFlowFacts {
  answers: PosSetupAnswers;
  steps: readonly PosSetupStepView[];
  /** `settings.sell_products_enabled`; a server before OB3 sends nothing, which reads as on. */
  sellProducts: boolean;
  /** The extras switched on now (W8 to W10 write to their routes, which answer only while on). */
  extras: { vouchers: boolean; loyalty: boolean; shop: boolean };
}

function applies(steps: readonly PosSetupStepView[], id: PosSetupStepId): boolean {
  return steps.find((s) => s.id === id)?.applies === true;
}

/**
 * The screens this venue sees, in order (design 6.2): W3 only when Card was ticked (or W2 not yet
 * answered), W6 only for a team (the status says so, from calendars and logins), W7 only while
 * "Sell products" is on, W8 to W10 only for an extra that is on. A one-person salon that takes
 * cards and cash and sells products sees welcome, use, pay, cards, tips, details, products,
 * practice and done.
 */
export function setupScreens(facts: SetupFlowFacts): PosSetupScreen[] {
  const list: PosSetupScreen[] = ['welcome', 'use', 'pay'];
  if (facts.answers.pay?.card !== false) list.push('cards');
  list.push('tips', 'details');
  if (applies(facts.steps, 'team')) list.push('team');
  if (facts.sellProducts) list.push('products');
  if (facts.extras.vouchers) list.push('vouchers');
  if (facts.extras.loyalty) list.push('loyalty');
  if (facts.extras.shop) list.push('shop');
  list.push('practice', 'done');
  return list;
}

const ORDER = (screen: PosSetupScreen) => POS_SETUP_SCREENS.indexOf(screen);

/** The screen after `current` in this venue's flow (W12 after the last). */
export function nextScreen(current: PosSetupScreen, list: readonly PosSetupScreen[]): PosSetupScreen {
  return list.find((s) => ORDER(s) > ORDER(current)) ?? 'done';
}

/**
 * "Step 3 of 9" for the screen on show. A screen opened directly that the flow would leave out (a
 * link from the set-up card, say) still counts, in its own place.
 */
export function stepCount(current: PosSetupScreen, list: readonly PosSetupScreen[]): { n: number; total: number } {
  const all = list.includes(current) ? [...list] : [...list, current].sort((a, b) => ORDER(a) - ORDER(b));
  return { n: all.indexOf(current) + 1, total: all.length };
}

/** The steps the card still lists: those that apply and are not done, in order (skipped included). */
export function openSteps(status: Pick<PosSetupStatus, 'steps'> | null | undefined): PosSetupStepView[] {
  return (status?.steps ?? []).filter((s) => s.applies && s.state !== 'done');
}

/** The steps that apply and are done, for W12's "Here's what's set up". */
export function doneSteps(status: Pick<PosSetupStatus, 'steps'> | null | undefined): PosSetupStepView[] {
  return (status?.steps ?? []).filter((s) => s.applies && s.state === 'done');
}

/** One step's state, or null when the status does not list it. */
export function stepState(status: Pick<PosSetupStatus, 'steps'> | null | undefined, id: PosSetupStepId) {
  return status?.steps?.find((s) => s.id === id)?.state ?? null;
}

/**
 * Where a line of the set-up card opens. "Take cards on your phone" opens "Get this phone ready"
 * (design 6.6), unless the owner chose a counter reader or payment links only, which W3 handles;
 * every other line opens its own question screen.
 */
export function cardLineHref(id: PosSetupStepId, answers: PosSetupAnswers | null | undefined): string {
  if (id === 'cards') {
    const cards = answers?.cards ?? null;
    return cards === 'reader' || cards === 'links' ? setupHref('cards') : SETUP_PHONE_HREF;
  }
  return setupHref(id);
}

/**
 * Where "Continue" on the card opens: the status's `next_screen`, the first screen neither done nor
 * skipped. A value the app does not know (a newer server) opens the welcome.
 */
export function continueHref(status: Pick<PosSetupStatus, 'next_screen'> | null | undefined): string {
  const next = status?.next_screen;
  return isSetupScreen(next) ? setupHref(next) : SETUP_WELCOME_HREF;
}

/**
 * How many of the wizard's own screens sit on top of the stack, so "Save and finish later" can take
 * the owner back to where set-up was opened from in one go. Every route of the wizard counts, from
 * the top down, until the first route that is not one.
 */
export function setupRoutesOnTop(routes: readonly { name?: string | null }[] | null | undefined): number {
  const list = routes ?? [];
  let count = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!isSetupRouteName(list[i]?.name)) break;
    count += 1;
  }
  return count;
}
