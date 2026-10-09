import { useState } from 'react';
import { View } from 'react-native';

import {
  MessageBox,
  SaveBar,
  SettingsCard,
  SettingsScreen,
  SettingsScroll,
  SwitchRow,
  settingsStyles,
  useLeaveGuard,
} from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { useToast } from '@/providers/ToastProvider';
import { settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { usePosSettings, usePosSettingsSave, useSettingsDraft, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import { stockT } from '@/lib/pos/settings-more/stock-copy';
import type { PosSettingsResponse } from '@/lib/pos/settings-more/types';

/**
 * Settings, Checkout: Stock in the app (web `TrackStockToggle` from the Features card, UX spec
 * §9.16, and `StockSettingsCard`, §9.11; plan §4.37, Pass 4).
 *
 * - Track stock: turning it on asks where to start, every existing option from zero (saves the
 *   switch, then `POST /api/venue/retail/stock/track-all`) or only products added from now on.
 *   Turning it off asks first and deletes nothing; while a stocktake is open the server refuses
 *   (409 `POS_FEATURE_IN_USE`) and its sentence shows under the switch, which stays on.
 * - With Track stock on: whether the till may sell more than the count says (D15; online orders
 *   never can) and the daily low-stock email to admins, saved together at the loaded version.
 *
 * Changing either needs `manage_settings` (admins always); everyone else sees them read only.
 */

const STOCK_KEYS = ['allow_negative_stock_at_till', 'low_stock_digest'] as const;

export default function StockSettingsScreen() {
  return <SettingsScreen title={stockT('screen.title')}>{(data) => <StockBody data={data} />}</SettingsScreen>;
}

function StockBody({ data }: { data: PosSettingsResponse }) {
  const query = usePosSettings();
  const canEdit = data.can.is_admin || data.can.manage_settings;
  const trackOn = data.settings.track_stock_enabled === true;
  return (
    <SettingsScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TrackStockCard on={trackOn} canEdit={canEdit} />
      {trackOn ? <StockOptionsCard data={data} canEdit={canEdit} /> : null}
    </SettingsScroll>
  );
}

type Message = { kind: 'ok' | 'error' | 'stale'; text: string };

/** The Track stock switch (web `TrackStockToggle`). */
function TrackStockCard({ on, canEdit }: { on: boolean; canEdit: boolean }) {
  const save = usePosSettingsSave();
  const send = useSettingsSend();
  const [choosing, setChoosing] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState<'all' | 'new' | 'off' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const feature = stockT('feat.stock');
  const done = stockT('feat.on.done', { feature });

  const turnOff = async () => {
    setConfirmOff(false);
    setBusy('off');
    setMessage(null);
    const r = await save({ track_stock_enabled: false });
    setBusy(null);
    if (!r.ok) setMessage({ kind: r.stale ? 'stale' : 'error', text: r.message });
    else setMessage({ kind: 'ok', text: stockT('feat.off.done', { feature }) });
  };

  const turnOn = async (mode: 'all' | 'new') => {
    setBusy(mode);
    setMessage(null);
    const r = await save({ track_stock_enabled: true });
    if (!r.ok) {
      setBusy(null);
      setChoosing(false);
      setMessage({ kind: r.stale ? 'stale' : 'error', text: r.message });
      return;
    }
    if (mode === 'all') {
      try {
        await send<{ options: number; products?: number }>(settingsMorePaths.trackAll, 'POST');
      } catch (e) {
        setBusy(null);
        setChoosing(false);
        setMessage({ kind: 'error', text: settingsErrorMessage(e) });
        return;
      }
    }
    setBusy(null);
    setChoosing(false);
    setMessage({ kind: 'ok', text: done });
  };

  return (
    <SettingsCard>
      <SwitchRow
        label={feature}
        help={stockT('feat.stock.help')}
        value={on}
        disabled={!canEdit || busy !== null || choosing}
        onChange={(next) => {
          if (next) {
            setMessage(null);
            setChoosing(true);
          } else {
            setConfirmOff(true);
          }
        }}
      />
      {choosing && !on ? (
        <View style={settingsStyles.stack} accessibilityRole="none" testID="track-stock-choice">
          <Text variant="label">{stockT('feat.stock.on.title')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {stockT('feat.stock.on.body')}
          </Text>
          <Button
            label={stockT('feat.stock.on.all')}
            onPress={() => void turnOn('all')}
            loading={busy === 'all'}
            disabled={busy !== null}
            fullWidth
          />
          <Button
            label={stockT('feat.stock.on.new')}
            variant="secondary"
            onPress={() => void turnOn('new')}
            loading={busy === 'new'}
            disabled={busy !== null}
            fullWidth
          />
          <Button label={stockT('common.cancel')} variant="ghost" onPress={() => setChoosing(false)} disabled={busy !== null} fullWidth />
        </View>
      ) : null}
      {message ? (
        <MessageBox
          tone={message.kind === 'ok' ? 'success' : message.kind === 'stale' ? 'warning' : 'danger'}
          role={message.kind === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </MessageBox>
      ) : null}
      <ConfirmSheet
        visible={confirmOff}
        title={stockT('feat.off.title', { feature })}
        message={stockT('feat.off.body')}
        confirmLabel={stockT('feat.off.confirm')}
        cancelLabel={stockT('common.cancel')}
        destructive={false}
        loading={busy === 'off'}
        onConfirm={() => void turnOff()}
        onClose={() => setConfirmOff(false)}
      />
    </SettingsCard>
  );
}

/** Stock options, only with Track stock on (web `StockSettingsCard`). */
function StockOptionsCard({ data, canEdit }: { data: PosSettingsResponse; canEdit: boolean }) {
  const toast = useToast();
  const f = useSettingsDraft(data.settings, STOCK_KEYS);
  const guard = useLeaveGuard(f.dirty);
  return (
    <SettingsCard title={stockT('set.stock.title')}>
      <SwitchRow
        label={stockT('set.stock.negative')}
        help={stockT('set.stock.negative.help')}
        value={f.value.allow_negative_stock_at_till === true}
        disabled={!canEdit}
        onChange={(v) => f.set('allow_negative_stock_at_till', v)}
      />
      <SwitchRow
        label={stockT('set.stock.digest')}
        help={stockT('set.stock.digest.help')}
        value={f.value.low_stock_digest === true}
        disabled={!canEdit}
        onChange={(v) => f.set('low_stock_digest', v)}
      />
      {canEdit ? (
        <SaveBar
          dirty={f.dirty}
          saving={f.saving}
          error={f.error}
          stale={f.stale}
          onSave={() =>
            void f.submit().then((ok) => {
              if (ok) toast.success(stockT('set.stock.saved'));
            })
          }
          onDiscard={f.discard}
        />
      ) : null}
      {guard}
    </SettingsCard>
  );
}
