import { View } from 'react-native';

import { VoucherSummaryRow } from '@/components/pos/VoucherSheets';
import { money, posStyles, usePosT } from '@/components/pos/parts';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { isVouchersEnabled } from '@/lib/pos/pos-enabled';
import { useClientStoredValue } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';

/**
 * "Credit and vouchers" on the client profile (POS Pass V app step, UX spec §13.13, §20.8), read
 * only: the client's account credit, then the gift vouchers they bought or hold, each with its last
 * four characters, what is left, the use-by date and its status. Shown only while the venue has
 * Checkout and gift vouchers on (as the web's contact panel), and read only when opened, from
 * `GET /api/venue/guests/[guestId]/stored-value`. Adding credit and looking after a voucher stay
 * on the web.
 */
export function StoredValueSection({ guestId }: { guestId: string }) {
  const t = usePosT();
  const venue = useVenue();
  if (!isVouchersEnabled(venue.data)) return null;
  return (
    <CollapsibleCard title={t('client.sv.title')} lazy>
      <StoredValueBody guestId={guestId} timeZone={venue.data?.timezone ?? 'Europe/London'} />
    </CollapsibleCard>
  );
}

function StoredValueBody({ guestId, timeZone }: { guestId: string; timeZone: string }) {
  const t = usePosT();
  const stored = useClientStoredValue(guestId);
  if (stored.isLoading) return <Text tone="muted">{t('app.loading')}</Text>;
  if (stored.error || !stored.data) {
    return (
      <Text variant="bodySmall" tone="danger">
        {posErrorMessage(stored.error, t('common.networkError'))}
      </Text>
    );
  }
  const credit = Math.max(0, stored.data.credit.balance_pence);
  const vouchers = stored.data.vouchers ?? [];
  if (credit <= 0 && vouchers.length === 0) return <Text tone="muted">{t('client.sv.empty')}</Text>;
  return (
    <View style={posStyles.stack}>
      <Text variant="bodyMedium">{t('client.sv.credit', { amount: money(credit) })}</Text>
      {vouchers.map((v) => (
        <VoucherSummaryRow key={v.id} voucher={v} timeZone={timeZone} />
      ))}
    </View>
  );
}
