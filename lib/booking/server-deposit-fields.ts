/**
 * The deposit fields the server now works out (web codebase standards plan P4.3): GET
 * /api/venue/bookings/[id] adds `deposit_owed_line`, `can_keep_without_deposit` and
 * `keep_without_deposit`, and the `DEPOSIT_UNPAID` 409 adds `accept_unpaid`. The app shows them
 * when the server sends them, and works them out itself only for an older server that does not
 * (`deposit-owed-line.ts`, `accept-unpaid.ts`, kept as that fallback).
 */

import {
  canKeepWithoutDeposit,
  keepWithoutDepositLabel,
  keepWithoutDepositQuestion,
} from '@/lib/booking/deposit-owed-line';

/** `keep_without_deposit` on the booking detail. */
export interface ServerKeepWithoutDeposit {
  label: string;
  title: string;
  message: string;
  confirm_label: string;
}

/** The detail's deposit fields, as an older server leaves them (absent). */
export interface ServerDepositFields {
  deposit_owed_line?: string | null;
  can_keep_without_deposit?: boolean;
  keep_without_deposit?: ServerKeepWithoutDeposit | null;
}

/** Whether the server answered the owed line at all (null is an answer: nothing is owed). */
export function serverSentOwedLine(booking: ServerDepositFields): boolean {
  return booking.deposit_owed_line !== undefined;
}

/** The owed-deposit line: the server's when it sent one, else `local()` (the fallback). */
export function owedLineFrom(booking: ServerDepositFields, local: () => string | null): string | null {
  return serverSentOwedLine(booking) ? (booking.deposit_owed_line ?? null) : local();
}

/** The detail's "Keep without deposit" as the sheet reads it, or null from an older server. */
export function serverKeepFrom(
  booking: ServerDepositFields,
): { canKeep: boolean; keep: ServerKeepWithoutDeposit | null } | null {
  if (typeof booking.can_keep_without_deposit !== 'boolean') return null;
  return { canKeep: booking.can_keep_without_deposit, keep: booking.keep_without_deposit ?? null };
}

/**
 * "Keep without deposit" for the Deposit sheet: the server's answer and words when it sent them,
 * else the local rule and words.
 */
export function keepWithoutDepositView(input: {
  server: { canKeep: boolean; keep: ServerKeepWithoutDeposit | null } | null | undefined;
  local: {
    status: string | null | undefined;
    depositStatus: string | null | undefined;
    amountPence: number | null | undefined;
    linkedVisitId: string | null | undefined;
    word: 'deposit' | 'payment';
    guestName: string | null | undefined;
  };
}): { show: boolean; label: string; question: { title: string; message: string; confirmLabel: string } } {
  const { server, local } = input;
  if (server) {
    const keep = server.keep;
    const fallbackQuestion = keepWithoutDepositQuestion({ word: local.word, amountPence: local.amountPence, guestName: local.guestName });
    return {
      show: server.canKeep,
      label: keep?.label ?? keepWithoutDepositLabel(local.word),
      question: keep ? { title: keep.title, message: keep.message, confirmLabel: keep.confirm_label } : fallbackQuestion,
    };
  }
  return {
    show: canKeepWithoutDeposit({
      status: local.status,
      deposit_status: local.depositStatus,
      deposit_amount_pence: local.amountPence,
      linked_visit_id: local.linkedVisitId ?? null,
    }),
    label: keepWithoutDepositLabel(local.word),
    question: keepWithoutDepositQuestion({ word: local.word, amountPence: local.amountPence, guestName: local.guestName }),
  };
}

/** The "Deposit not paid" sheet's words from the 409 (`accept_unpaid`), or null from an older server. */
export interface ServerAcceptUnpaidCopy {
  title: string;
  body: string;
  explainer: string;
}

export function serverAcceptUnpaidCopy(body: unknown): ServerAcceptUnpaidCopy | null {
  if (typeof body !== 'object' || body === null) return null;
  const copy = (body as { accept_unpaid?: unknown }).accept_unpaid;
  if (typeof copy !== 'object' || copy === null) return null;
  const { title, body: text, explainer } = copy as Record<string, unknown>;
  return typeof title === 'string' && typeof text === 'string' && typeof explainer === 'string'
    ? { title, body: text, explainer }
    : null;
}
