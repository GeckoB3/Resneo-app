import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StatusLine } from '@/components/pos/setup/parts';
import { setupT } from '@/lib/pos/setup/copy';
import type { CollectDeviceKind } from '@/lib/pos/setup/phone';
import { useCollectPhones } from '@/lib/queries/usePosSetup';
import { spacing } from '@/theme/index';
import type { PosSetupStatus } from '@/types/pos-setup';

/** "iPhone", "Android phone" or "card reader", for "Sam's iPhone is ready to take cards". */
export function deviceWord(kinds: readonly CollectDeviceKind[]): string {
  const kind = kinds[0];
  if (kind === 'iphone') return setupT('setup.cards.device.iphone');
  if (kind === 'android') return setupT('setup.cards.device.android');
  if (kind === 'wisepad') return setupT('app.setup.cards.device.wisepad');
  return setupT('setup.cards.device.other');
}

/**
 * W3's live list (design 6.3, drawn as B4): each team member whose phone can take cards now, ticked
 * off as it registers (`GET /api/venue/pos/collect-phones`, read every five seconds while this
 * screen is on top), the phones whose ResNeo app is too old for Checkout (from the set-up status),
 * and "Waiting for a phone" until the first one is ready.
 */
export function TeamPhones({ status, poll }: { status: Pick<PosSetupStatus, 'phones'>; poll: boolean }) {
  const focused = useIsFocused();
  const query = useCollectPhones({ enabled: poll, poll: poll && focused });
  const ready = query.data?.can_take_cards ? query.data.phones : [];
  const needsUpdate = status.phones?.needs_update ?? [];
  return (
    <View style={styles.list} accessibilityLiveRegion="polite">
      {ready.map((phone) => (
        <StatusLine key={`ready-${phone.staff_id}`} tone="done">
          {setupT('setup.cards.phone.ready', { name: phone.name, device: deviceWord(phone.devices) })}
        </StatusLine>
      ))}
      {needsUpdate.map((phone, i) => (
        <StatusLine key={`update-${phone.name}-${i}`} tone="warn">
          {setupT('setup.cards.phone.update', { name: phone.name })}
        </StatusLine>
      ))}
      {ready.length === 0 ? <StatusLine tone="wait">{setupT('setup.cards.phone.waiting')}</StatusLine> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});
