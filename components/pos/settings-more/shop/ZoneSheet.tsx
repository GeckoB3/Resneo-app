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
import { postcodeEntries, shT, zoneKind, zoneKindName, type ZoneKind } from '@/lib/pos/settings-more/shop-copy';
import type { FieldError, ShopZone } from '@/lib/pos/settings-more/types';
import { spacing } from '@/theme/index';

/**
 * Add or edit one delivery zone (the web's `ZoneDialog` in ShopSettingsCard): the name customers
 * see, where it delivers (the whole UK, local postcodes, the Highlands and islands list, or the
 * Republic of Ireland), the postcodes for a postcode zone, the price, the optional free-over
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
  highlands,
  importNote,
  onClose,
  onSaved,
  onStale,
}: {
  visible: boolean;
  zone: ShopZone | null;
  /** The Highlands and islands list the editor starts from (`zone_presets.highlands`). */
  highlands: string[];
  /** Whether a parcel to Ireland leaves the single market for goods, so the sheet warns about customs. */
  importNote: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** A stale edit: the screen reloads its view. */
  onStale?: () => void;
}) {
  const send = useSettingsSend();
  const [name, setName] = useState(zone?.name ?? '');
  const [kind, setKind] = useState<ZoneKind>(zone ? zoneKind(zone, highlands) : 'uk');
  const [postcodes, setPostcodes] = useState(zone?.area === 'postcodes' ? (zone.include_postcode_prefixes ?? []).join(', ') : '');
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
  const byPostcode = kind === 'local' || kind === 'highlands';

  const choose = (next: ZoneKind) => {
    // A new zone takes the kind's name until the venue writes its own; the Highlands list fills in.
    if (!zone && (['uk', 'ie', 'local', 'highlands'] as const).some((k) => zoneKindName(k) === name.trim())) setName(zoneKindName(next));
    if (next === 'highlands') setPostcodes(highlands.join(', '));
    if (next === 'local' && kind === 'highlands') setPostcodes('');
    setKind(next);
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim() || price == null) {
      setError(shT('set.shop.rate.missing'));
      setStale(false);
      return;
    }
    if (byPostcode && postcodeEntries(postcodes).length === 0) {
      setError(shT('set.shop.rate.postcodes.missing'));
      setStale(false);
      return;
    }
    setBusy(true);
    setError(null);
    setStale(false);
    setFields([]);
    const body = {
      name: name.trim(),
      area: byPostcode ? 'postcodes' : kind,
      ...(byPostcode ? { postcodes: postcodeEntries(postcodes) } : {}),
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
        <OptionList
          label={shT('set.shop.rate.area')}
          value={kind}
          options={(['uk', 'local', 'highlands', 'ie'] as const).map((k) => ({ value: k, label: shT(`set.shop.rate.kind.${k}`) }))}
          onChange={choose}
        />
        {byPostcode ? (
          <FieldBlock
            label={shT('set.shop.rate.postcodes')}
            help={kind === 'highlands' ? shT('set.shop.rate.highlands.note') : shT('set.shop.rate.postcodes.help')}
            error={fieldErrorFor(fields, 'postcodes')}>
            <Input
              value={postcodes}
              onChangeText={setPostcodes}
              placeholder="LS6, LS7, LS16"
              accessibilityLabel={shT('set.shop.rate.postcodes')}
              autoCapitalize="characters"
              autoCorrect={false}
              multiline
            />
          </FieldBlock>
        ) : null}
        {kind === 'ie' && importNote ? (
          <Text variant="bodySmall" tone="secondary">
            {shT('set.shop.rate.ie.note')}
          </Text>
        ) : null}
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
