import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, Notice, PosSheet } from '@/components/pos/parts';
import { TextLink, TickRow } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { readSwitchRefusal, switchKeepsRequestId } from '@/lib/pos/switches/api';
import { swT, switchName } from '@/lib/pos/switches/copy';
import {
  canConfirmOff,
  leavesSomethingToFinish,
  offRefusal,
  offSheetCopy,
  offSheetModel,
  switchRefusalSentence,
  type OffWarningKey,
} from '@/lib/pos/switches/model';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { downloadVouchersList, useFeatureSwitches, useSetFeatureSwitch } from '@/lib/queries/useFeatureSwitches';
import { useVoucherSettings } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { PosSwitchBlockingItem, PosSwitchKey } from '@/types/pos-switches';

/** Where each warning's link goes (the web's off dialog links the till, open sales and Orders). */
const WARNING_LINKS: Partial<Record<OffWarningKey, { label: 'sw.off.link.till' | 'sw.off.link.sales' | 'sw.off.link.orders'; href: string }>> = {
  till: { label: 'sw.off.link.till', href: '/checkout/till' },
  partPaid: { label: 'sw.off.link.sales', href: '/checkout' },
  orders: { label: 'sw.off.link.orders', href: '/orders' },
};

/**
 * "Switch off Checkout?" (design section 14 step 7, drawn as A6) and the same sheet for an extra
 * (section 7.3), with the web's `SwitchOffDialog` words. Read fresh each time it opens, so the
 * counts are the counts now.
 *
 * Refused only while money is moving (a card payment in progress, a sale waiting on a phone): the
 * sale is named with a link and "Switch off" stays disabled. Everything else is a warning with its
 * count and a link: the open till, open and part-paid sales, pay links still payable until a date,
 * online orders still to hand over, loyalty rewards waiting (with "Pause the loyalty card instead"
 * while the card is on). Gift vouchers and credit with money left need "We'll still honour these
 * gift vouchers." ticked, with the list to download. Switching vouchers off says when the voucher
 * page will stop selling; switching the shop off says closing it is the gentler choice. Nothing is
 * deleted.
 */
export function SwitchOffSheet(props: SwitchOffSheetProps) {
  // Mounted only while open, so every opening starts from a clean form and fresh counts.
  return props.visible ? <SwitchOffSheetBody {...props} /> : null;
}

interface SwitchOffSheetProps {
  feature: PosSwitchKey;
  visible: boolean;
  onClose: () => void;
  timeZone: string;
}

function SwitchOffSheetBody({ feature, visible, onClose, timeZone }: SwitchOffSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const accessToken = useAccessToken();
  const query = useFeatureSwitches();
  const set = useSetFeatureSwitch();
  const isCheckout = feature === 'pos_enabled';
  // Section 7.3: switching vouchers off says so when they are on sale online.
  const voucherSettings = useVoucherSettings({ enabled: feature === 'pos_gift_vouchers_enabled' });
  const [honoured, setHonoured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<PosSwitchBlockingItem[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef<string | null>(null);
  const { refetch } = query;

  // The counts as they are now, read when the sheet opens.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  const res = query.data ?? null;
  const venueName = res?.venue?.name?.trim() || 'your business';
  const model = offSheetModel(feature, res?.in_use, {
    timeZone,
    loyaltyOn: res?.switches?.pos_loyalty_enabled?.effective === true,
  });
  // A refusal names the sales that block it at once; the next read of the counts takes over.
  if (blocking) model.refusals = blocking.map(offRefusal);
  const copy = offSheetCopy(feature);
  const onlineSale = voucherSettings.data?.settings?.online_sale_enabled === true;
  const busy = set.isPending;
  const ready = Boolean(res) && !query.isFetching;

  function go(href: string) {
    onClose();
    router.push(href as Href);
  }

  async function download() {
    if (!accessToken) return;
    setDownloading(true);
    try {
      const result = await downloadVouchersList(accessToken, swT('sw.off.vouchers.download'));
      if (!result.ok) toast.error(result.message ?? swT('app.sw.error.download'));
    } finally {
      setDownloading(false);
    }
  }

  async function switchOff() {
    if (!res || !canConfirmOff(model, honoured)) return;
    setError(null);
    const id = requestId.current ?? newPaymentAttemptId();
    requestId.current = id;
    const leftToFinish = leavesSomethingToFinish(res.in_use);
    try {
      await set.mutateAsync({
        feature,
        on: false,
        ...(model.storedValue && honoured ? { acknowledge: ['stored_value_outstanding' as const] } : {}),
        client_request_id: id,
        version: res.switches[feature]?.version ?? 0,
      });
      requestId.current = null;
      onClose();
      if (isCheckout) toast.success(leftToFinish ? swT('sw.off.done') : swT('sw.off.done.nothingLeft'));
      else toast.success(swT('app.sw.extra.offDone', { extra: switchName(feature) }));
    } catch (e) {
      if (!switchKeepsRequestId(e)) requestId.current = null;
      const refusal = readSwitchRefusal(e);
      if (refusal.kind === 'in_use') {
        setBlocking(refusal.blocking);
        return;
      }
      if (refusal.kind === 'needs_ack') setHonoured(false);
      setError(switchRefusalSentence(refusal, venueName));
    }
  }

  const footer = (
    <View style={styles.footer}>
      {error ? <ErrorLine message={error} /> : null}
      <Button label={swT(copy.keep)} onPress={onClose} disabled={busy} fullWidth />
      <Button
        label={swT('sw.off.confirm')}
        variant="danger"
        onPress={() => void switchOff()}
        loading={busy}
        disabled={busy || !ready || !canConfirmOff(model, honoured)}
        fullWidth
      />
    </View>
  );

  return (
    <PosSheet visible={visible} onClose={busy ? () => undefined : onClose} title={swT(copy.title)} footer={footer}>
      <Text variant="bodySmall" tone="secondary">
        {swT(copy.body)}
      </Text>
      {feature === 'pos_gift_vouchers_enabled' && onlineSale ? (
        <Text variant="bodySmall" tone="secondary">
          {swT('sw.extraOff.vouchers.online')}
        </Text>
      ) : null}
      {feature === 'pos_online_shop_enabled' ? (
        <View style={styles.group}>
          <Text variant="bodySmall" tone="secondary">
            {swT('sw.extraOff.shop.break')}
          </Text>
          <TextLink label={swT('app.sw.extraOff.openShopSettings')} onPress={() => go('/checkout-settings/shop')} />
        </View>
      ) : null}

      {!res && query.isError ? (
        <Notice tone="warning" action={{ label: swT('sw.error.tryAgain'), onPress: () => void refetch() }}>
          {swT('sw.error.load')}
        </Notice>
      ) : null}

      {model.refusals.map((refusal) => (
        <View key={`${refusal.kind}-${refusal.saleId}`} style={styles.group}>
          <Notice tone="warning">{refusal.text}</Notice>
          <TextLink label={refusal.linkLabel} onPress={() => go(`/checkout/${refusal.saleId}`)} />
        </View>
      ))}

      {model.warnings.map((warning) => {
        const link = WARNING_LINKS[warning.key];
        return (
          <View key={warning.key} style={styles.group}>
            <Notice tone={warning.key === 'till' ? 'warning' : 'info'}>{warning.text}</Notice>
            {link ? <TextLink label={swT(link.label)} onPress={() => go(link.href)} /> : null}
            {warning.key === 'rewards' && model.offerPauseLoyalty ? (
              <TextLink label={swT('sw.off.pauseInstead')} onPress={() => go('/checkout-settings/loyalty')} />
            ) : null}
          </View>
        );
      })}

      {model.storedValue ? (
        <View style={styles.group}>
          <Notice tone="warning">{model.storedValue}</Notice>
          <Button
            label={swT('sw.off.vouchers.download')}
            variant="secondary"
            size="sm"
            loading={downloading}
            onPress={() => void download()}
          />
          <TickRow title={swT('sw.off.vouchers.ack')} checked={honoured} onChange={setHonoured} disabled={busy} />
        </View>
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, paddingBottom: spacing.sm },
  group: { gap: spacing.sm },
});
