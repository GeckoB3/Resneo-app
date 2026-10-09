import { usePosT } from '@/components/pos/parts';
import { useOpenCheckout } from '@/components/pos/useOpenCheckout';
import { Button } from '@/components/ui/Button';
import { ACTION_COLORS } from '@/lib/booking/booking-action-colors';
import { canPos } from '@/lib/pos/pos-enabled';
import { usePosBootstrap } from '@/lib/queries/usePos';

/**
 * "Check out" on the booking detail (UX spec §13.3, `bk.checkout`): opens the sale the booking is
 * on, or starts one from the booking with the rest of its visit. Rendered only at POS venues; the
 * booking detail decides that (`isPosEnabled`). Hidden for a login that can start no sale.
 */
export function PosCheckoutButton({ bookingId, onOpened }: { bookingId: string; onOpened?: () => void }) {
  const t = usePosT();
  const boot = usePosBootstrap();
  const { open, openingKey } = useOpenCheckout();
  if (boot.data && !canPos(boot.data, 'create_sale')) return null;
  const opening = openingKey === bookingId;
  return (
    <Button
      label={opening ? t('bk.checkout.opening') : t('bk.checkout')}
      variant="secondary"
      // The same colour as Confirm beside it on the booking detail.
      customColors={ACTION_COLORS.confirm}
      size="sm"
      fullWidth
      loading={opening}
      onPress={() => void open({ bookingId }, { onOpened })}
    />
  );
}
