import { type Href, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { SWITCH_ICONS, TextLink } from '@/components/pos/switches/parts';
import { SwitchOffSheet } from '@/components/pos/switches/SwitchOffSheet';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { readSwitchRefusal, switchKeepsRequestId } from '@/lib/pos/switches/api';
import { switchName, swT } from '@/lib/pos/switches/copy';
import {
  extraReasonSentence,
  extraRows,
  extrasForSentence,
  historyLine,
  historyWhen,
  sinceLine,
  switchRefusalSentence,
  type ExtraRow,
} from '@/lib/pos/switches/model';
import { useFeatureSwitches, useSetFeatureSwitch } from '@/lib/queries/useFeatureSwitches';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

/** Each extra's own settings, opened from "Settings" under its switch. */
export const EXTRA_SETTINGS_HREF: Record<PosSwitchExtraKey, string> = {
  pos_gift_vouchers_enabled: '/checkout-settings/gift-vouchers',
  pos_loyalty_enabled: '/checkout-settings/loyalty',
  pos_online_shop_enabled: '/checkout-settings/shop',
};

/**
 * "Checkout is on" at the top of Checkout settings, for admins (design section 14 step 6, drawn as
 * A5): who switched it on and when, the three extras with their switches (on, off, or paused by
 * ResNeo with its reason), and the History (SW9: every change is recorded here, no email). With
 * `?welcome=1` it says "Checkout is on. Let's get it ready."; switching on now opens the set-up
 * wizard instead (POS Part 4), which this line handed over to.
 *
 * Switching an extra on is one tap; switching one off opens its sheet (section 7.3). Nothing shows
 * while the switches cannot be read (a server before them, or a team member), so the hub is then
 * exactly as it was.
 */
export function CheckoutOnGroup({
  welcome,
  missed,
  timeZone,
  venueName,
}: {
  welcome: boolean;
  missed: readonly PosSwitchExtraKey[];
  timeZone: string;
  venueName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const query = useFeatureSwitches();
  const set = useSetFeatureSwitch();
  const [pending, setPending] = useState<PosSwitchExtraKey | null>(null);
  const [rowError, setRowError] = useState<{ key: PosSwitchExtraKey; text: string } | null>(null);
  const [offFeature, setOffFeature] = useState<PosSwitchExtraKey>('pos_gift_vouchers_enabled');
  const [offOpen, setOffOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const requestIds = useRef<Partial<Record<PosSwitchExtraKey, string>>>({});

  const res = query.data;
  if (!res?.switches?.pos_enabled?.effective) return null;

  const rows = extraRows(res);
  const since = sinceLine(res, timeZone);
  const stillMissed = missed.filter((key) => !res.switches[key]?.effective);

  async function switchOn(key: PosSwitchExtraKey) {
    if (!res) return;
    setPending(key);
    setRowError(null);
    const id = requestIds.current[key] ?? newPaymentAttemptId();
    requestIds.current[key] = id;
    try {
      await set.mutateAsync({ feature: key, on: true, client_request_id: id, version: res.switches[key]?.version ?? 0 });
      delete requestIds.current[key];
      toast.success(swT('app.sw.extra.onDone', { extra: switchName(key) }));
    } catch (e) {
      if (!switchKeepsRequestId(e)) delete requestIds.current[key];
      setRowError({ key, text: switchRefusalSentence(readSwitchRefusal(e), venueName) ?? swT('sw.error.save') });
    } finally {
      setPending(null);
    }
  }

  function onToggle(row: ExtraRow, next: boolean) {
    if (next) {
      void switchOn(row.key);
      return;
    }
    setRowError(null);
    setOffFeature(row.key);
    setOffOpen(true);
  }

  return (
    <View>
      <Card style={{ borderColor: colors.accent }}>
        <View style={styles.stack}>
          <View style={styles.titleRow}>
            <Text variant="subheading" accessibilityRole="header">
              {swT('sw.panel.title')}
            </Text>
            <Badge label={swT('sw.panel.extra.on')} tone="success" />
          </View>
          {since ? (
            <Text variant="caption" tone="muted">
              {since}
            </Text>
          ) : null}

          {welcome ? <Notice tone="success">{swT('sw.on.done')}</Notice> : null}
          {stillMissed.length > 0 ? (
            <Notice tone="warning">{swT('app.sw.on.extrasFailed', { extras: extrasForSentence(stillMissed) })}</Notice>
          ) : null}

          {rows.length > 0 ? (
            <View style={styles.extras}>
              <Text variant="overline" tone="muted">
                {swT('sw.panel.extras')}
              </Text>
              {rows.map((row, i) => (
                <ExtraLine
                  key={row.key}
                  row={row}
                  first={i === 0}
                  busy={pending === row.key}
                  venueName={venueName}
                  error={rowError?.key === row.key ? rowError.text : null}
                  onToggle={(next) => onToggle(row, next)}
                  onSetUp={() => router.push(EXTRA_SETTINGS_HREF[row.key] as Href)}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.historyHead}>
            <TextLink
              label={historyOpen ? swT('sw.history.hide') : swT('sw.panel.history')}
              onPress={() => setHistoryOpen((open) => !open)}
            />
          </View>
          {historyOpen ? (
            <View style={styles.history}>
              {res.history.length === 0 ? (
                <Text variant="bodySmall" tone="muted">
                  {swT('sw.history.empty')}
                </Text>
              ) : (
                res.history.map((row) => (
                  <View key={row.id} style={styles.historyRow}>
                    <Text variant="bodySmall">{historyLine(row)}</Text>
                    {row.action === 'block' && row.public_reason ? (
                      <Text variant="caption" tone="secondary">
                        {row.public_reason}
                      </Text>
                    ) : null}
                    <Text variant="caption" tone="muted">
                      {historyWhen(row, timeZone)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      </Card>

      <SwitchOffSheet feature={offFeature} visible={offOpen} onClose={() => setOffOpen(false)} timeZone={timeZone} />
    </View>
  );
}

function ExtraLine({
  row,
  first,
  busy,
  venueName,
  error,
  onToggle,
  onSetUp,
}: {
  row: ExtraRow;
  first: boolean;
  busy: boolean;
  venueName: string;
  error: string | null;
  onToggle: (next: boolean) => void;
  onSetUp: () => void;
}) {
  const { colors } = useTheme();
  const name = switchName(row.key);
  const status =
    row.status === 'paused' ? swT('sw.panel.extra.paused') : row.status === 'on' ? swT('sw.panel.extra.on') : swT('sw.panel.extra.off');
  const reason =
    row.status === 'paused'
      ? row.publicReason
      : row.status === 'off'
        ? extraReasonSentence(row.reason, venueName)
        : null;
  return (
    <View style={[styles.extra, first ? null : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.extraIcon, { backgroundColor: colors.accentSubtle }]}>
        <SymbolView name={SWITCH_ICONS[row.key]} tintColor={colors.accentPressed} size={18} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{name}</Text>
        <Text variant="caption" tone={row.status === 'paused' ? 'danger' : 'muted'}>
          {status}
        </Text>
        {reason ? (
          <Text variant="caption" tone="secondary">
            {reason}
          </Text>
        ) : null}
        {row.status === 'on' ? <TextLink label={swT('app.sw.panel.setUp')} onPress={onSetUp} /> : null}
        {error ? (
          <Text variant="caption" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
      <Switch
        value={row.value}
        onValueChange={onToggle}
        disabled={!row.canChange || busy}
        accessibilityLabel={name}
        accessibilityState={{ checked: row.value, disabled: !row.canChange || busy }}
      />
    </View>
  );
}

/**
 * "Switch off Checkout" at the bottom of Checkout settings, quiet and in red (A5), opening the off
 * sheet. Admins only, and only while the switches say Checkout is on.
 */
export function SwitchOffCheckout({ timeZone }: { timeZone: string }) {
  const query = useFeatureSwitches();
  const [open, setOpen] = useState(false);
  if (!query.data?.switches?.pos_enabled?.effective) return null;
  return (
    <View style={styles.offRow}>
      <TextLink label={swT('sw.panel.switchOff')} tone="danger" onPress={() => setOpen(true)} />
      <SwitchOffSheet feature="pos_enabled" visible={open} onClose={() => setOpen(false)} timeZone={timeZone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  extras: { gap: spacing.xs, paddingTop: spacing.xs },
  extra: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  extraIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: spacing.xxs },
  historyHead: { flexDirection: 'row', paddingTop: spacing.xs },
  history: { gap: spacing.sm },
  historyRow: { gap: spacing.xxs },
  offRow: { alignItems: 'flex-end', paddingTop: spacing.sm },
});
