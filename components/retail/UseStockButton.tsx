import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { usePosT } from '@/components/pos/parts';
import { UseStockSheet } from '@/components/retail/PurchasingSheets';
import { Button } from '@/components/ui/Button';
import { canPos, isTrackStockOn } from '@/lib/pos/pos-enabled';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';

/**
 * "Record products used" on a booking (`bk.useStock`, UX spec §6.14, §13.6): products used in the
 * treatment, tied to this booking. Only at POS venues with Track stock on, for logins with
 * `record_professional_use`; otherwise nothing is drawn and no POS request is made.
 */
export function UseStockButton({
  bookingId,
  label,
  containerStyle,
}: {
  bookingId: string;
  label: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const t = usePosT();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap({ enabled: posEnabled });
  const [open, setOpen] = useState(false);
  if (!posEnabled || !isTrackStockOn(boot.data) || !canPos(boot.data, 'record_professional_use')) return null;
  return (
    <View style={containerStyle}>
      <Button label={t('bk.useStock')} variant="secondary" size="sm" fullWidth onPress={() => setOpen(true)} />
      <UseStockSheet
        visible={open}
        booking={{ id: bookingId, label }}
        timeZone={boot.data?.venue?.timezone ?? 'Europe/London'}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
