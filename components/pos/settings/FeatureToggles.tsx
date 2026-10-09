import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MessageLine, SwitchRow, useCheckoutSettingsCtx } from '@/components/pos/settings/SettingsParts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { settingsPaths, useSettingsWrite } from '@/lib/queries/useCheckoutSettings';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosCheckoutSettings } from '@/types/pos-settings';

/**
 * The Features switches (web `SimpleCards.tsx` `FeaturesCard`, `TrackStockToggle.tsx` and
 * `CashSettingsCard.tsx` `CashCountToggle`; UX spec §9.16). Each saves on its own through the
 * versioned settings PATCH with only its key; turning one off asks first and deletes nothing. The
 * server's refusals (a stocktake in progress, a till still open, more than one till in use, no
 * legacy cash till chosen) show under the switch word for word, and the switch stays as it was.
 */

type Message = { kind: 'ok' | 'error'; text: string } | null;
type FeatureKey = 'track_stock_enabled' | 'cash_management_enabled' | 'multiple_tills_enabled';

/** A switch that saves one feature key, asking before it goes off. */
function FeatureSwitch({
  settingKey,
  feature,
  help,
}: {
  settingKey: Exclude<FeatureKey, 'track_stock_enabled'>;
  feature: string;
  help: string;
}) {
  const { data, t, save, canEdit } = useCheckoutSettingsCtx();
  const [busy, setBusy] = useState(false);
  const [askOff, setAskOff] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const on = data.settings[settingKey] === true;

  const change = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    const r = await save({ [settingKey]: next } as Partial<PosCheckoutSettings>);
    setBusy(false);
    if (!r.ok) setMessage({ kind: 'error', text: r.message });
    else if (next) setMessage({ kind: 'ok', text: t('feat.on.done', { feature }) });
  };

  return (
    <View style={styles.block}>
      <SwitchRow
        label={feature}
        help={help}
        value={on}
        disabled={!canEdit || busy}
        onChange={(next) => (next ? void change(true) : setAskOff(true))}
      />
      <MessageLine message={message} />
      <ConfirmSheet
        visible={askOff}
        title={t('feat.off.title', { feature })}
        message={t('feat.off.body')}
        confirmLabel={t('feat.off.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => {
          setAskOff(false);
          void change(false);
        }}
        onClose={() => setAskOff(false)}
      />
    </View>
  );
}

/** Count cash in till sessions (in Features, and again at the top of Cash with the Cash help). */
export function CashCountToggle({ showHelp = true }: { showHelp?: boolean }) {
  const { t } = useCheckoutSettingsCtx();
  return (
    <FeatureSwitch
      settingKey="cash_management_enabled"
      feature={t('feat.cash')}
      help={showHelp ? t('feat.cash.help') : t('set.cash.enabled.help')}
    />
  );
}

/** Use more than one till. */
export function TillsToggle() {
  const { t } = useCheckoutSettingsCtx();
  return <FeatureSwitch settingKey="multiple_tills_enabled" feature={t('feat.tills')} help={t('feat.tills.help')} />;
}

/**
 * Track stock: turning it on asks where to start, every existing product from zero (saves the
 * switch, then `POST /api/venue/retail/stock/track-all`) or only products added from now on.
 */
export function TrackStockToggle() {
  const { data, t, save, canEdit } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const write = useSettingsWrite();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<'all' | 'new' | 'off' | null>(null);
  const [askOff, setAskOff] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const on = data.settings.track_stock_enabled === true;
  const feature = t('feat.stock');
  const done = t('feat.on.done', { feature });

  const turnOff = async () => {
    setBusy('off');
    setMessage(null);
    const r = await save({ track_stock_enabled: false });
    setBusy(null);
    if (!r.ok) setMessage({ kind: 'error', text: r.message });
  };

  const turnOn = async (mode: 'all' | 'new') => {
    setBusy(mode);
    setMessage(null);
    const r = await save({ track_stock_enabled: true });
    if (!r.ok) {
      setBusy(null);
      setChoosing(false);
      setMessage({ kind: 'error', text: r.message });
      return;
    }
    if (mode === 'all') {
      const all = await write(settingsPaths.trackAll, 'POST');
      if (!all.ok) {
        setBusy(null);
        setChoosing(false);
        setMessage({ kind: 'error', text: all.message });
        return;
      }
    }
    setBusy(null);
    setChoosing(false);
    setMessage({ kind: 'ok', text: done });
  };

  return (
    <View style={styles.block}>
      <SwitchRow
        label={feature}
        help={t('feat.stock.help')}
        value={on}
        disabled={!canEdit || busy !== null || choosing}
        onChange={(next) => {
          if (next) {
            setMessage(null);
            setChoosing(true);
          } else setAskOff(true);
        }}
      />
      {choosing && !on ? (
        <View style={[styles.choice, { borderColor: colors.border, backgroundColor: colors.brandSubtle }]}>
          <Text variant="label">{t('feat.stock.on.title')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t('feat.stock.on.body')}
          </Text>
          <Button label={t('feat.stock.on.all')} onPress={() => void turnOn('all')} loading={busy === 'all'} disabled={busy !== null} />
          <Button
            label={t('feat.stock.on.new')}
            variant="secondary"
            onPress={() => void turnOn('new')}
            loading={busy === 'new'}
            disabled={busy !== null}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setChoosing(false)} disabled={busy !== null} />
        </View>
      ) : null}
      <MessageLine message={message} />
      <ConfirmSheet
        visible={askOff}
        title={t('feat.off.title', { feature })}
        message={t('feat.off.body')}
        confirmLabel={t('feat.off.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => {
          setAskOff(false);
          void turnOff();
        }}
        onClose={() => setAskOff(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  choice: { gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
