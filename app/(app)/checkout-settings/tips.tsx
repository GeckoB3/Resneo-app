import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CheckoutSettingsShell,
  FormSection,
  MoneyField,
  PercentField,
  RadioList,
  SwitchRow,
  TextField,
  useCheckoutSettingsCtx,
  useSettingsSection,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY, tippingPolicyTemplate, type SettingsCopyId } from '@/lib/pos/settings-copy';
import { formatMoney, textToInt } from '@/lib/pos/settings-form';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosCheckoutSettings, PosTipRule } from '@/types/pos-settings';

/**
 * Tips and tipping policy (web `TipsCard.tsx`, UX spec §9.4): the switch, the tips rules note, three
 * suggested percentages and three amounts for smaller bills, the smart threshold, letting clients
 * choose another amount, what percentages are worked out on, how tips are shared, and the tipping
 * policy with "Start from our template" (asking first when there is text already).
 */

const KEYS = [
  'tipping_enabled',
  'tip_percent_presets',
  'tip_amount_presets',
  'smart_tip_threshold_pence',
  'tip_custom_allowed',
  'tip_base',
  'tip_allocation_rule',
  'tipping_policy',
] as const;

const RULES: PosTipRule[] = ['pro_rata_services', 'equal_performers', 'operator', 'manual'];

export default function TipsSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.tips.title']}>
      <TipsSection />
    </CheckoutSettingsShell>
  );
}

function TipsSection() {
  const { data, t, words, currency, canEdit } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const f = useSettingsSection(KEYS, t('set.tips.saved'));
  const guard = useUnsavedGuard(f.dirty);
  const v = f.value;
  const disabled = !canEdit;
  const [askTemplate, setAskTemplate] = useState(false);

  const setAt = (key: 'tip_percent_presets' | 'tip_amount_presets', i: number, n: number) => {
    const next = [...v[key]];
    next[i] = n;
    f.set(key, next);
  };

  const applyTemplate = () => {
    const venue = data.settings.trading_name?.trim() || data.venue.name;
    f.set(
      'tipping_policy',
      tippingPolicyTemplate(venue, words.client, t(`set.tips.policy.rule.${v.tip_allocation_rule}` as SettingsCopyId)),
    );
  };

  return (
    <>
      <FormSection
        title={t('set.tips.title')}
        description={t('set.tips.help')}
        dirty={f.dirty}
        saving={f.saving}
        error={f.error}
        stale={f.stale}
        canEdit={canEdit}
        onSave={() => void f.submit()}
        onDiscard={f.discard}>
        <SwitchRow label={t('set.tips.enabled')} value={v.tipping_enabled} disabled={disabled} onChange={(x) => f.set('tipping_enabled', x)} />
        <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="label">{t('set.tips.mode')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t('set.tips.mode.all')}
          </Text>
        </View>

        {v.tipping_enabled ? (
          <>
            <View style={styles.stack}>
              <Text variant="label">{t('set.tips.presets')}</Text>
              <View style={styles.three}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.third}>
                    <PercentField
                      label={t('set.tips.percent.n', { n: String(i + 1) })}
                      value={v.tip_percent_presets[i]}
                      disabled={disabled}
                      onChange={(text) => setAt('tip_percent_presets', i, textToInt(text))}
                    />
                  </View>
                ))}
              </View>
              {f.fieldError('tip_percent_presets') ? (
                <Text variant="caption" tone="danger" accessibilityRole="alert">
                  {f.fieldError('tip_percent_presets')}
                </Text>
              ) : null}
            </View>

            <View style={styles.stack}>
              <Text variant="label">{t('set.tips.amounts')}</Text>
              <View style={styles.three}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.third}>
                    <MoneyField
                      label={t('set.tips.amount.n', { n: String(i + 1) })}
                      currency={currency}
                      value={v.tip_amount_presets[i] ?? null}
                      disabled={disabled}
                      onChange={(p) => setAt('tip_amount_presets', i, p ?? Number.NaN)}
                    />
                  </View>
                ))}
              </View>
              {f.fieldError('tip_amount_presets') ? (
                <Text variant="caption" tone="danger" accessibilityRole="alert">
                  {f.fieldError('tip_amount_presets')}
                </Text>
              ) : null}
            </View>

            <MoneyField
              label={t('set.tips.smart', {
                amount: Number.isFinite(v.smart_tip_threshold_pence) ? formatMoney(v.smart_tip_threshold_pence, currency) : '...',
              })}
              currency={currency}
              value={v.smart_tip_threshold_pence}
              disabled={disabled}
              error={f.fieldError('smart_tip_threshold_pence')}
              onChange={(p) => f.set('smart_tip_threshold_pence', p ?? 0)}
            />

            <SwitchRow label={t('set.tips.custom')} value={v.tip_custom_allowed} disabled={disabled} onChange={(x) => f.set('tip_custom_allowed', x)} />

            <RadioList<PosCheckoutSettings['tip_base']>
              label={t('set.tips.base')}
              value={v.tip_base}
              disabled={disabled}
              onChange={(x) => f.set('tip_base', x)}
              options={[
                { value: 'services', label: t('set.tips.base.services') },
                { value: 'total', label: t('set.tips.base.total') },
              ]}
            />

            <RadioList<PosTipRule>
              label={t('set.tips.rule')}
              value={v.tip_allocation_rule}
              disabled={disabled}
              onChange={(x) => f.set('tip_allocation_rule', x)}
              options={RULES.map((r) => ({ value: r, label: t(`set.tips.rule.${r}` as SettingsCopyId) }))}
            />
          </>
        ) : null}

        <TextField
          label={t('set.tips.policy')}
          help={t('set.tips.policy.help')}
          value={v.tipping_policy}
          multiline
          maxLength={4000}
          disabled={disabled}
          error={f.fieldError('tipping_policy')}
          onChange={(x) => f.set('tipping_policy', x)}
        />
        <View style={styles.policyFoot}>
          {!disabled ? (
            <Button
              label={t('set.tips.policy.template')}
              variant="secondary"
              size="sm"
              onPress={() => (v.tipping_policy?.trim() ? setAskTemplate(true) : applyTemplate())}
            />
          ) : (
            <View />
          )}
          <Text variant="caption" tone="muted">
            {`${(v.tipping_policy ?? '').length.toLocaleString('en-GB')} / 4,000`}
          </Text>
        </View>
      </FormSection>
      <ConfirmSheet
        visible={askTemplate}
        title={t('set.tips.policy.replace.title')}
        message={t('set.tips.policy.replace.body')}
        confirmLabel={t('set.tips.policy.replace.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => {
          setAskTemplate(false);
          applyTemplate();
        }}
        onClose={() => setAskTemplate(false)}
      />
      {guard}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  three: { flexDirection: 'row', gap: spacing.sm },
  third: { flex: 1, minWidth: 0 },
  policyFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
