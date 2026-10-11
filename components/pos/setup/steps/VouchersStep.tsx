import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { ChoiceCard, ChoiceGroup } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { canSellOnline, MAX_PRESETS, moneyShort, presetsWith, voucherSettingsPatch, type VoucherDraft } from '@/components/pos/settings-more/vouchers/voucher-settings-logic';
import { TickRow } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { setupT } from '@/lib/pos/setup/copy';
import { currencySymbol, textToPence } from '@/lib/pos/settings-form';
import { errorBody, isStaleWrite, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { VoucherSettings, VoucherSettingsResponse } from '@/lib/pos/settings-more/types';
import { voucherTermsTemplate } from '@/lib/pos/settings-more/vouchers-copy';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type Expiry = '12' | 'other' | 'none';

function expiryFrom(months: number | null): Expiry {
  if (months === null) return 'none';
  return months === 12 ? '12' : 'other';
}

/**
 * W8, "Set up gift vouchers" (design 6.3, drawn as B10): only once gift vouchers are on. The
 * amounts, another amount between the set limits, how long they last, our voucher terms and
 * selling online (which needs the terms and Stripe). Saving once is what makes the till's Vouchers
 * tab appear (`PATCH /api/venue/pos/voucher-settings`, every field at the first save, as Gift
 * voucher settings does). Paper vouchers sold before are added in Gift voucher settings.
 */
export function VouchersStep({ data }: { data: SetupData }) {
  const query = useSettingsQuery<VoucherSettingsResponse>(settingsMoreKeys.vouchers, settingsMorePaths.voucherSettings);
  if (query.isError && !query.data) {
    return (
      <SetupFrame screen="vouchers" data={data} title={setupT('setup.vch.title')}>
        <ErrorState message={settingsErrorMessage(query.error, SM_COPY['common.loadError'])} onRetry={() => void query.refetch()} />
      </SetupFrame>
    );
  }
  if (!query.data) {
    return (
      <SetupFrame screen="vouchers" data={data} title={setupT('setup.vch.title')}>
        <DetailSkeleton />
      </SetupFrame>
    );
  }
  return <VouchersForm data={data} loaded={query.data} />;
}

function VouchersForm({ data, loaded }: { data: SetupData; loaded: VoucherSettingsResponse }) {
  const { colors } = useTheme();
  const runner = useStepRunner('vouchers', data);
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const send = useSettingsSend();
  const switches = useFeatureSwitches();
  const source = loaded.settings;
  const venueName = loaded.venue.name || data.venue.name;
  const currency = currencySymbol(loaded.venue.currency);
  const [presets, setPresets] = useState<number[]>(source.preset_pence);
  const [custom, setCustom] = useState(source.custom_allowed);
  const [expiry, setExpiry] = useState<Expiry>(() => expiryFrom(source.set_up ? source.expiry_months : 12));
  const [monthsText, setMonthsText] = useState(() =>
    source.expiry_months !== null && source.expiry_months !== 12 ? String(source.expiry_months) : '',
  );
  const hasTerms = Boolean(source.terms?.trim());
  const [useTerms, setUseTerms] = useState(!hasTerms);
  const [online, setOnline] = useState(source.online_sale_enabled);
  const [amountText, setAmountText] = useState('');

  const months = expiry === 'none' ? null : expiry === '12' ? 12 : Number.parseInt(monthsText, 10);
  const terms = hasTerms ? source.terms : useTerms ? voucherTermsTemplate(venueName, Number.isFinite(months) ? months : null) : null;
  const onlineAllowed = canSellOnline(terms, loaded.venue.card_payments_ready);
  const collective = switches.data?.venue?.collective_name?.trim() || null;
  const voucherLink = loaded.venue.slug ? `${getWebUrl()}/vouchers/${loaded.venue.slug}` : null;

  const edits = useMemo<Partial<VoucherDraft>>(
    () => ({
      preset_pence: presets,
      custom_allowed: custom,
      expiry_months: expiry === 'none' ? null : expiry === '12' ? 12 : Number.parseInt(monthsText, 10),
      terms,
      online_sale_enabled: online && onlineAllowed,
    }),
    [custom, expiry, monthsText, online, onlineAllowed, presets, terms],
  );

  const addAmount = () => {
    const next = presetsWith(presets, textToPence(amountText));
    if (next) {
      setPresets(next);
      setAmountText('');
    }
  };

  const onContinue = () => {
    if (expiry === 'other' && !(Number.isInteger(months) && (months as number) >= 1 && (months as number) <= 120)) {
      runner.setError(setupT('setup.vch.expiry.months.invalid'));
      return;
    }
    void runner.proceed(async () => {
      const changes = voucherSettingsPatch(source, edits);
      if (source.set_up && Object.keys(changes).length === 0) return null;
      try {
        const next = await send<VoucherSettingsResponse>(settingsMorePaths.voucherSettings, 'PATCH', { ...changes, version: source.version });
        queryClient.setQueryData(settingsMoreKeys.vouchers(accessToken), next);
        // The till's Vouchers tab reads the same settings, and the bootstrap says whether it shows.
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.voucherSettings(accessToken) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
        return null;
      } catch (e) {
        if (isStaleWrite(e)) {
          const fresh = errorBody<{ settings?: VoucherSettings }>(e)?.settings;
          if (fresh) queryClient.setQueryData(settingsMoreKeys.vouchers(accessToken), { ...loaded, settings: fresh });
          return SM_COPY['err.POS_SETTINGS_STALE'];
        }
        return settingsErrorMessage(e);
      }
    });
  };

  const busy = runner.busy !== null;

  return (
    <SetupFrame
      screen="vouchers"
      data={data}
      title={setupT('setup.vch.title')}
      footer={<SetupButtons onContinue={onContinue} onSkip={() => void runner.skip()} busy={runner.busy} error={runner.error} />}>
      {collective && voucherLink ? <Notice>{setupT('setup.vch.collective', { collective, link: voucherLink })}</Notice> : null}

      <View style={styles.stack}>
        <Text variant="label">{setupT('setup.vch.amounts')}</Text>
        <View style={styles.chips}>
          {presets.map((p) => (
            <View key={p} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text variant="bodySmall">{moneyShort(p)}</Text>
              <Pressable
                onPress={() => setPresets((list) => list.filter((x) => x !== p))}
                disabled={busy || presets.length <= 1}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={setupT('setup.vch.amounts.remove', { amount: moneyShort(p) })}>
                <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={colors.textMuted} size={16} />
              </Pressable>
            </View>
          ))}
        </View>
        {presets.length < MAX_PRESETS ? (
          <View style={styles.addRow}>
            <View style={styles.flex}>
              <Input
                label={setupT('app.setup.vch.amount.new')}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                editable={!busy}
                leftIcon={
                  <Text variant="body" tone="muted">
                    {currency}
                  </Text>
                }
              />
            </View>
            <Button
              label={setupT('setup.vch.amounts.add')}
              variant="secondary"
              size="sm"
              onPress={addAmount}
              disabled={busy || !presetsWith(presets, textToPence(amountText))}
            />
          </View>
        ) : null}
      </View>

      <TickRow
        title={setupT('setup.vch.custom', { min: moneyShort(source.min_pence), max: moneyShort(source.max_pence) })}
        checked={custom}
        onChange={setCustom}
        disabled={busy}
      />

      <ChoiceGroup label={setupT('setup.vch.expiry.title')}>
        <ChoiceCard title={setupT('setup.vch.expiry.12')} selected={expiry === '12'} onPress={() => setExpiry('12')} disabled={busy} />
        <ChoiceCard title={setupT('setup.vch.expiry.other')} selected={expiry === 'other'} onPress={() => setExpiry('other')} disabled={busy} />
        {expiry === 'other' ? (
          <Input
            label={setupT('setup.vch.expiry.months')}
            value={monthsText}
            onChangeText={(text) => {
              setMonthsText(text.replace(/[^\d]/g, ''));
              runner.setError(null);
            }}
            keyboardType="number-pad"
            maxLength={3}
            editable={!busy}
          />
        ) : null}
        <ChoiceCard title={setupT('setup.vch.expiry.none')} selected={expiry === 'none'} onPress={() => setExpiry('none')} disabled={busy} />
      </ChoiceGroup>

      {!hasTerms ? (
        <TickRow
          title={setupT('setup.vch.terms')}
          detail={setupT('setup.vch.terms.note')}
          checked={useTerms}
          onChange={setUseTerms}
          disabled={busy}
        />
      ) : null}

      <ChoiceGroup label={setupT('setup.vch.online.title')}>
        <ChoiceCard
          title={setupT('setup.vch.online.yes')}
          selected={online && onlineAllowed}
          onPress={() => setOnline(true)}
          disabled={busy || !onlineAllowed}
        />
        <ChoiceCard title={setupT('setup.vch.online.later')} selected={!online || !onlineAllowed} onPress={() => setOnline(false)} disabled={busy} />
        {!loaded.venue.card_payments_ready ? (
          <Text variant="caption" tone="muted">
            {setupT('setup.vch.online.needs')}
          </Text>
        ) : null}
      </ChoiceGroup>

      <Text variant="bodySmall" tone="secondary">
        {setupT('app.setup.vch.existing')}
      </Text>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
