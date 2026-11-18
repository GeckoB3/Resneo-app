import { Badge } from '@/components/ui/Badge';
import { rowCardPill } from '@/lib/booking/card-list';

/**
 * The card-on-file pill on list, roster and day-sheet rows (web Docs/card-on-file-plan.md §6.1):
 * "Protected", "Waiting for card", "Card not needed" or "Fee charged", in words, never colour
 * alone. Nothing for a booking without a card hold. A row from an older server (no `card_state`)
 * falls back to its deposit status.
 */
export function CardStatePill({ row }: { row: { card_state?: unknown; deposit_status?: string | null } }) {
  const pill = rowCardPill(row);
  if (!pill) return null;
  return <Badge label={pill.label} tone={pill.tone} />;
}
