import type { PaidOutcome } from '@/components/pos/PaySheet';
import { SETUP_DONE_HREF } from '@/lib/pos/setup/flow';
import type { PosSale } from '@/types/pos';
import { POS_PRACTICE_VOID_REASON } from '@/types/pos-setup';

import { practiceT, type PracticeCopyId } from './copy';

/** The sale DTO with the server's `practice` flag (web contract `src/lib/pos/setup/types.ts`). */
export type PosSaleWithPractice = PosSale & { practice?: boolean | null };

/**
 * The practice sale's rules in the app (POS test round 2026-10-11, Part 4, OB4; design section
 * 6.8), kept pure so each is tested on its own.
 *
 * - A sale is practice only when the server says so (`practice: true` on the sale). A server
 *   without the flag leaves it out, and the sale is a real one, exactly as before.
 * - It offers products and one custom "Practice item" only: a service with no booking would put a
 *   walk-in in the diary.
 * - Every payment method shows what would happen and never calls the server.
 * - "Finish practice" voids it with the reason "Practice".
 */

export function isPracticeSale(sale: PosSale | null | undefined): boolean {
  return (sale as PosSaleWithPractice | null | undefined)?.practice === true;
}

/** The practice item's price: the £30.00 of design B12. */
export const PRACTICE_ITEM_PENCE = 3000;

/** The person serving, as the lines route takes a seller (exactly one of calendar or login). */
function sellerOf(sale: PosSale): { calendar_id: string; name?: string } | { staff_id: string; name?: string } | null {
  const op = sale.operator;
  if (op.calendar_id) return { calendar_id: op.calendar_id, ...(op.name ? { name: op.name } : {}) };
  if (op.staff_id) return { staff_id: op.staff_id, ...(op.name ? { name: op.name } : {}) };
  return null;
}

/**
 * The "Practice item" line: a custom item reported with services, so it carries a person for tips
 * and commission the way a service would, credited to whoever is serving.
 */
export function practiceItemLine(sale: PosSale): Record<string, unknown> {
  const seller = sellerOf(sale);
  return {
    kind: 'custom',
    name: practiceT('setup.practice.item'),
    unit_price_pence: PRACTICE_ITEM_PENCE,
    reporting_group: 'services',
    ...(seller ? { seller } : {}),
  };
}

/** The body that voids a practice sale ("Finish practice"). */
export function finishPracticeBody(sale: Pick<PosSale, 'version'>): { version: number; reason: string } {
  return { version: sale.version, reason: POS_PRACTICE_VOID_REASON };
}

// ─── Coach marks ────────────────────────────────────────────────────────────

/** The five tips of design W11, in the order the screen shows them. */
export const PRACTICE_COACH_STEPS = ['basket', 'add', 'discount', 'credit', 'pay'] as const;
export type PracticeCoachStep = (typeof PRACTICE_COACH_STEPS)[number];

/** A tip's sentence; the discount tip names the team's limit (`staff_max_discount_percent`). */
export function coachText(step: PracticeCoachStep, limitPercent: number | null | undefined): string {
  const limit = typeof limitPercent === 'number' && Number.isFinite(limitPercent) && limitPercent >= 0 ? limitPercent : 10;
  return practiceT(`setup.practice.coach.${step}` as PracticeCopyId, { limit: String(Math.round(limit * 100) / 100) });
}

/** The next tip, or null after the last. */
export function nextCoachStep(step: PracticeCoachStep): PracticeCoachStep | null {
  const i = PRACTICE_COACH_STEPS.indexOf(step);
  return i >= 0 && i < PRACTICE_COACH_STEPS.length - 1 ? PRACTICE_COACH_STEPS[i + 1]! : null;
}

// ─── Paying, shown and never run ────────────────────────────────────────────

/**
 * The ways to pay a practice shows: this phone (Tap to Pay), the counter reader, cash, a pay link,
 * and the venue's own payment types under "Other ways" (as the web's practice does).
 */
export const PRACTICE_METHODS = ['phone', 'reader', 'cash', 'link', 'other'] as const;
export type PracticeMethod = (typeof PRACTICE_METHODS)[number];

const OUTCOME_METHOD: Record<PracticeMethod, PaidOutcome['method']> = {
  phone: 'card_app',
  reader: 'card_reader',
  cash: 'cash',
  link: 'pay_link',
  other: 'external',
};

/** The pay sheet's outcome for a method a practice showed. */
export function practiceOutcome(method: PracticeMethod, changePence = 0): PaidOutcome {
  return { method: OUTCOME_METHOD[method], changePence: method === 'cash' ? Math.max(0, changePence) : 0 };
}

/** The practice method behind an outcome, or null for one a practice never shows. */
export function practiceMethodOf(outcome: PaidOutcome['method']): PracticeMethod | null {
  const found = (Object.keys(OUTCOME_METHOD) as PracticeMethod[]).find((m) => OUTCOME_METHOD[m] === outcome);
  return found ?? null;
}

/**
 * What each method would do in a real sale (design `setup.practice.sim.*`, the phone line the app's
 * own). The venue's own payment types say what they are for (the till's `other.help`, as the web).
 */
export function simulatedSentence(method: PracticeMethod, otherHelp: string): string {
  switch (method) {
    case 'phone':
      return practiceT('app.setup.practice.sim.phone');
    case 'reader':
      return practiceT('setup.practice.sim.reader');
    case 'cash':
      return practiceT('setup.practice.sim.cash');
    case 'link':
      return practiceT('setup.practice.sim.link');
    case 'other':
      return otherHelp;
  }
}

// ─── Starting and finishing ─────────────────────────────────────────────────

/** `POST /api/venue/pos/sales` for a practice sale: a blank walk-in from the app, marked practice. */
export function practiceSaleBody(clientRequestId: string): Record<string, unknown> {
  return { client_request_id: clientRequestId, source: { type: 'blank' }, channel: 'app', practice: true };
}

/**
 * Where "Finish practice" goes: the set-up wizard's done screen, W12 (the web's
 * `/dashboard/checkout/setup?step=done`), with `setup.practice.finished` said on the way.
 */
export const PRACTICE_DONE_HREF = SETUP_DONE_HREF;
