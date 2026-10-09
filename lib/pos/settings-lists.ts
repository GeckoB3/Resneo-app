/**
 * Pure helpers for the Checkout settings lists (web `PaymentTypesCard.tsx`, `TillsCard.tsx`).
 */

/** The payment types most venues start with (web `SUGGESTIONS`), as the names they are saved with. */
export const PAYMENT_TYPE_SUGGESTIONS = ['Card (another terminal)', 'Bank transfer', 'Paper voucher'] as const;

/**
 * The suggestions the venue does not have yet (any case). "Paper voucher" only while gift vouchers
 * are off: with them on, vouchers are taken as vouchers.
 */
export function missingPaymentTypeSuggestions(types: readonly { name: string }[], vouchersEnabled: boolean): string[] {
  return PAYMENT_TYPE_SUGGESTIONS.filter((s) => !(vouchersEnabled && s === 'Paper voucher')).filter(
    (s) => !types.some((t) => t.name.toLowerCase() === s.toLowerCase()),
  );
}

/**
 * Moving the row at `index` by `delta`: the writes that renumber the list 0, 1, 2... in the new
 * order, so the two swap even when their sort orders were equal. Only rows whose number changes are
 * written, each with its own version.
 */
export function reorderWrites<T extends { id: string; sort_order: number; version: number }>(
  rows: readonly T[],
  index: number,
  delta: -1 | 1,
): { id: string; version: number; sort_order: number }[] {
  const a = rows[index];
  const b = rows[index + delta];
  if (!a || !b) return [];
  const order = rows.map((r) => r.id);
  order[index] = b.id;
  order[index + delta] = a.id;
  return rows
    .map((r) => ({ id: r.id, version: r.version, sort_order: order.indexOf(r.id), was: r.sort_order }))
    .filter((r) => r.sort_order !== r.was)
    .map(({ id, version, sort_order }) => ({ id, version, sort_order }));
}
