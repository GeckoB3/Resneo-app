import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PosSheet } from '@/components/pos/parts';
import { FieldBlock, MessageBox, MoneyField, OptionList, SwitchRow } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import {
  errorBody,
  fieldErrorFor,
  fieldErrorsFrom,
  isNetworkFailure,
  isStaleWrite,
  settingsErrorMessage,
  settingsMorePaths,
} from '@/lib/pos/settings-more/api';
import { smT } from '@/lib/pos/settings-more/copy';
import { useSettingsSend } from '@/lib/pos/settings-more/hooks';
import { areaName, shT } from '@/lib/pos/settings-more/shop-copy';
import type { FieldError, ShopZone } from '@/lib/pos/settings-more/types';
import { spacing } from '@/theme/index';

/**
 * Add or edit one delivery zone (the web's `ZoneDialog` in ShopSettingsCard): the name customers
 * see, the country when the venue may deliver to more than one, the price, the optional free-over
 * amount, the delivery time and "Offer this zone". A new zone carries a `client_request_id` minted
 * once per attempt (kept through a network failure so a retry cannot add it twice); an edit sends
 * the zone's `version`, and a 412 takes the fresh version, keeps the edits and says so. Any other
 * refusal (409 `SHOP_DELIVERY_AREA` included) is the server's sentence, word for word.
 *
 * Render it with a fresh `key` for each opening so its fields start from the zone.
 */
export function ZoneSheet({
  visible,
  zone,
  allowedAreas,
  onClose,
  onSaved,
  onStale,
}: {
  visible: boolean;
  zone: ShopZone | null;
  allowedAreas: ('gb' | 'ni')[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** A stale edit: the screen reloads its view. */
  onStale?: () => void;
}) {
  const send = useSettingsSend();
  const [name, setName] = useState(zone?.name ?? '');
  const [area, setArea] = useState<'gb' | 'ni'>(zone && zone.area !== 'custom' ? zone.area : (allowedAreas[0] ?? 'gb'));
  const [price, setPrice] = useState<number | null>(zone?.price_pence ?? null);
  const [freeOver, setFreeOver] = useState<number | null>(zone?.free_over_pence ?? null);
  const [estimate, setEstimate] = useState(zone?.estimate_text ?? '');
  const [active, setActive] = useState(zone?.is_active ?? true);
  const [version, setVersion] = useState(zone?.version ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string>(newPaymentAttemptId());

  const save = async () => {
    if (busy) return;
    if (!name.trim() || price == null) {
      setError(shT('set.shop.rate.missing'));
      setStale(false);
      return;
    }
    setBusy(true);
    setError(null);
    setStale(false);
    setFields([]);
    const body = {
      name: name.trim(),
      area,
      price_pence: price,
      free_over_pence: freeOver,
      estimate_text: estimate.trim() || null,
      is_active: active,
    };
    try {
      if (zone) {
        await send(settingsMorePaths.deliveryZones, 'PATCH', { ...body, id: zone.id, version });
      } else {
        await send(settingsMorePaths.deliveryZones, 'POST', { ...body, client_request_id: requestId.current });
      }
      setBusy(false);
      await onSaved();
    } catch (e) {
      setBusy(false);
      if (zone && isStaleWrite(e)) {
        const fresh = errorBody<{ zones?: ShopZone[] }>(e)?.zones?.find((z) => z.id === zone.id);
        if (fresh) setVersion(fresh.version);
        setStale(true);
        setError(smT('err.POS_SETTINGS_STALE'));
        onStale?.();
        return;
      }
      if (!zone && !isNetworkFailure(e)) requestId.current = newPaymentAttemptId();
      setError(settingsErrorMessage(e));
      setFields(fieldErrorsFrom(e));
    }
  };

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={zone ? zone.name : shT('set.shop.rate.add')}
      footer={<Button label={shT('set.shop.rate.save')} onPress={() => void save()} loading={busy} fullWidth />}>
      <View style={styles.stack}>
        <FieldBlock label={shT('set.shop.rate.name')} error={fieldErrorFor(fields, 'name')}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder={shT('set.shop.rate.name.placeholder')}
            accessibilityLabel={shT('set.shop.rate.name')}
            maxLength={60}
          />
        </FieldBlock>
        {allowedAreas.length > 1 ? (
          <OptionList
            label={shT('set.shop.rate.area')}
            value={area}
            options={allowedAreas.map((a) => ({ value: a, label: areaName(a) }))}
            onChange={setArea}
          />
        ) : (
          <Text variant="bodySmall" tone="secondary">
            {`${shT('set.shop.rate.area')}: ${shT('area.gb')} (${shT('set.shop.rate.area.country').toLowerCase()})`}
          </Text>
        )}
        <FieldBlock label={shT('set.shop.rate.price')} error={fieldErrorFor(fields, 'price_pence')}>
          <MoneyField value={price} onChange={setPrice} accessibilityLabel={shT('set.shop.rate.price')} />
        </FieldBlock>
        <FieldBlock label={shT('set.shop.rate.freeOver')} error={fieldErrorFor(fields, 'free_over_pence')}>
          <MoneyField value={freeOver} onChange={setFreeOver} accessibilityLabel={shT('set.shop.rate.freeOver')} placeholder="" />
        </FieldBlock>
        <FieldBlock label={shT('set.shop.rate.estimate')} help={shT('sco.rate.defaultEstimate')} error={fieldErrorFor(fields, 'estimate_text')}>
          <Input
            value={estimate}
            onChangeText={setEstimate}
            placeholder={shT('set.shop.rate.estimate.placeholder')}
            accessibilityLabel={shT('set.shop.rate.estimate')}
            maxLength={80}
          />
        </FieldBlock>
        <SwitchRow label={shT('set.shop.rate.active')} value={active} onChange={setActive} />
        {error ? (
          <MessageBox tone={stale ? 'warning' : 'danger'} role="alert">
            {error}
          </MessageBox>
        ) : null}
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
