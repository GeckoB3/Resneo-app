import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LinkShareCard } from '@/components/pos/settings-more/LinkShareCard';
import {
  FieldBlock,
  MessageBox,
  MoneyField,
  OptionList,
  SaveBar,
  SettingsCard,
  SettingsScreen,
  SettingsScroll,
  SwitchRow,
  useLeaveGuard,
  WholeNumberField,
} from '@/components/pos/settings-more/parts';
import { AddExistingVoucherSheet } from '@/components/pos/settings-more/vouchers/AddExistingVoucherSheet';
import { VoucherImportSheet } from '@/components/pos/settings-more/vouchers/VoucherImportSheet';
import {
  ACCENT_SWATCHES,
  canSellOnline,
  DEFAULT_ACCENT,
  MAX_PRESETS,
  moneyShort,
  normaliseHex,
  pickDraft,
  presetsWith,
  TERMS_MAX,
  voucherSettingsPatch,
  type VoucherDraft,
} from '@/components/pos/settings-more/vouchers/voucher-settings-logic';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { isVouchersEnabled } from '@/lib/pos/pos-enabled';
import {
  errorBody,
  fieldErrorFor,
  fieldErrorsFrom,
  isFeatureOff,
  isStaleWrite,
  settingsErrorMessage,
  settingsMorePaths,
} from '@/lib/pos/settings-more/api';
import { SM_COPY, smT, useClientWords } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { FieldError, PosSettingsResponse, VoucherSettings, VoucherSettingsResponse } from '@/lib/pos/settings-more/types';
import { vchT, voucherTermsTemplate } from '@/lib/pos/settings-more/vouchers-copy';
import { queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Settings, Checkout, Gift vouchers in the app (UX spec §20.9), with the web's GiftVouchersCard
 * field for field: admins only, while the venue's gift voucher switch is on (web
 * `CheckoutSettingsSection`: `vouchersEnabled && can.is_admin`). Its own settings row and version
 * (GET/PATCH /api/venue/pos/voucher-settings): the first save sends every field at version 0 and
 * creates the row; until then the till's Vouchers tab stays hidden, so the screen says so
 * (`feat.vouchers.setup`). A 412 loads the fresh settings from its body and keeps the edits beside
 * them. Once set up: add an existing voucher, and import vouchers from a CSV.
 *
 * The web's "Vouchers" report link is left out: the app's Reports screen has no vouchers view.
 */
export default function GiftVouchersSettingsScreen() {
  const venue = useVenue();
  return (
    <SettingsScreen
      title={vchT('set.vch.title')}
      gate={(data) =>
        !isVouchersEnabled(venue.data) ? { featureOff: vchT('set.vch.title') } : data.can.is_admin ? 'ok' : 'admin_only'
      }>
      {(data) => <GiftVouchersBody pos={data} />}
    </SettingsScreen>
  );
}

function GiftVouchersBody({ pos }: { pos: PosSettingsResponse }) {
  const query = useSettingsQuery<VoucherSettingsResponse>(settingsMoreKeys.vouchers, settingsMorePaths.voucherSettings);
  if (query.isError && isFeatureOff(query.error)) {
    return (
      <EmptyState
        title={smT('gate.featureOff.title', { feature: vchT('set.vch.title') })}
        message={smT('gate.featureOff.body', { feature: vchT('set.vch.title') })}
      />
    );
  }
  if (query.isError && !query.data) {
    return <ErrorState message={settingsErrorMessage(query.error, smT('common.loadError'))} onRetry={() => void query.refetch()} />;
  }
  if (!query.data) return <DetailSkeleton />;
  return (
    <GiftVouchersForm pos={pos} loaded={query.data} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
  );
}

function GiftVouchersForm({
  pos,
  loaded,
  refreshing,
  onRefresh,
}: {
  pos: PosSettingsResponse;
  loaded: VoucherSettingsResponse;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const words = useClientWords();
  const queryClient = useQueryClient();
  const { accessToken } = usePosGate();
  const send = useSettingsSend();
  const source = loaded.settings;
  const [edits, setEdits] = useState<Partial<VoucherDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [presetPence, setPresetPence] = useState<number | null>(null);
  const [hexText, setHexText] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [sheet, setSheet] = useState<'add' | 'import' | null>(null);

  const value: VoucherDraft = useMemo(() => ({ ...pickDraft(source), ...edits }), [source, edits]);
  const changes = useMemo(() => voucherSettingsPatch(source, edits), [source, edits]);
  // The first save sets the venue up even with the defaults untouched.
  const dirty = !source.set_up || Object.keys(changes).length > 0;
  const leaveGuard = useLeaveGuard(source.set_up && dirty);

  const putLoaded = (next: VoucherSettingsResponse) => {
    queryClient.setQueryData(settingsMoreKeys.vouchers(accessToken), next);
  };

  const set = <K extends keyof VoucherDraft>(k: K, v: VoucherDraft[K]) => {
    setEdits((cur) => ({ ...cur, [k]: v }));
    setFields((cur) => cur.filter((f) => f.path !== k && !f.path.startsWith(`${k}.`)));
    setLocalErrors((cur) => {
      if (!(k in cur)) return cur;
      const next = { ...cur };
      delete next[k];
      return next;
    });
  };
  const fieldError = (path: string) => localErrors[path] ?? fieldErrorFor(fields, path);

  const save = async () => {
    if (saving) return;
    // Checked here before sending, in the server's words: an emptied months field would otherwise
    // go as null, which means "never runs out", and a colour code that isn't one.
    const local: Record<string, string> = {};
    if (value.expiry_months != null && !Number.isFinite(value.expiry_months)) local.expiry_months = vchT('web.months.invalid');
    if (value.accent_colour != null && !/^#[0-9A-F]{6}$/.test(value.accent_colour)) local.accent_colour = vchT('web.colour.invalid');
    setLocalErrors(local);
    if (Object.keys(local).length > 0) return;
    setSaving(true);
    setError(null);
    setStale(false);
    try {
      const next = await send<VoucherSettingsResponse>(settingsMorePaths.voucherSettings, 'PATCH', {
        ...changes,
        version: source.version,
      });
      putLoaded(next);
      setEdits({});
      setFields([]);
      setHexText(null);
      // The till's Vouchers tab reads the same settings, and the bootstrap says whether it shows.
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.voucherSettings(accessToken) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
      toast.success(vchT('web.saved'));
    } catch (e) {
      if (isStaleWrite(e)) {
        const fresh = errorBody<{ settings?: VoucherSettings }>(e)?.settings;
        if (fresh) putLoaded({ ...loaded, settings: fresh });
        else onRefresh();
        setStale(true);
        setError(SM_COPY['err.POS_SETTINGS_STALE']);
        return;
      }
      setError(settingsErrorMessage(e));
      setFields(fieldErrorsFrom(e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setEdits({});
    setError(null);
    setStale(false);
    setFields([]);
    setLocalErrors({});
    setHexText(null);
  };

  const addPreset = () => {
    const next = presetsWith(value.preset_pence, presetPence);
    if (!next) return;
    set('preset_pence', next);
    setPresetPence(null);
  };

  const venueName = pos.settings.trading_name?.trim() || pos.venue.name;
  const templateMonths = value.expiry_months == null ? null : Number.isFinite(value.expiry_months) ? value.expiry_months : 12;
  const applyTemplate = () => set('terms', voucherTermsTemplate(venueName, templateMonths));

  const cardReady = loaded.venue.card_payments_ready;
  const sellOnline = canSellOnline(value.terms, cardReady);
  const monthsShown = value.expiry_months != null && Number.isFinite(value.expiry_months) ? value.expiry_months : 12;
  const slug = loaded.venue.slug;

  return (
    <>
      <SettingsScroll refreshing={refreshing} onRefresh={onRefresh}>
        <SettingsCard title={vchT('set.vch.title')} description={vchT('set.vch.help')}>
          {!source.set_up ? (
            <MessageBox tone="info" role="note">
              {vchT('feat.vouchers.setup')}
            </MessageBox>
          ) : null}

          <FieldBlock label={vchT('set.vch.presets')} error={fieldError('preset_pence')}>
            <View style={styles.chips}>
              {value.preset_pence.map((p) => (
                <View key={p} style={[styles.preset, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
                  <Text variant="bodySmall">{moneyShort(p)}</Text>
                  <Pressable
                    onPress={() => set('preset_pence', value.preset_pence.filter((x) => x !== p))}
                    accessibilityRole="button"
                    accessibilityLabel={vchT('web.removeAmount', { amount: moneyShort(p) })}
                    hitSlop={8}
                    style={styles.presetRemove}>
                    <Text variant="bodyMedium" tone="secondary">
                      ×
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
            {value.preset_pence.length < MAX_PRESETS ? (
              <View style={styles.addRow}>
                <View style={styles.flex}>
                  <MoneyField value={presetPence} onChange={setPresetPence} accessibilityLabel={vchT('set.vch.presets.add')} />
                </View>
                <Button
                  label={vchT('set.vch.presets.add')}
                  variant="secondary"
                  onPress={addPreset}
                  disabled={presetPence == null || !(presetPence > 0)}
                />
              </View>
            ) : null}
          </FieldBlock>

          <SwitchRow label={vchT('vsell.custom')} value={value.custom_allowed} onChange={(x) => set('custom_allowed', x)} />

          <FieldBlock label={vchT('set.vch.min')} error={fieldError('min_pence')}>
            <MoneyField value={value.min_pence} onChange={(p) => set('min_pence', p)} accessibilityLabel={vchT('set.vch.min')} />
          </FieldBlock>
          <FieldBlock label={vchT('set.vch.max')} error={fieldError('max_pence')}>
            <MoneyField value={value.max_pence} onChange={(p) => set('max_pence', p)} accessibilityLabel={vchT('set.vch.max')} />
          </FieldBlock>

          <View style={styles.stack}>
            <OptionList
              label={vchT('set.vch.expiry')}
              value={value.expiry_months == null ? 'none' : 'months'}
              onChange={(x) => set('expiry_months', x === 'none' ? null : (source.expiry_months ?? 12))}
              options={[
                { value: 'months', label: vchT('set.vch.expiry.months', { months: monthsShown }) },
                { value: 'none', label: vchT('set.vch.expiry.none') },
              ]}
            />
            {value.expiry_months != null ? (
              <View style={styles.monthsRow}>
                <View style={styles.monthsField}>
                  <WholeNumberField
                    value={Number.isFinite(value.expiry_months) ? value.expiry_months : null}
                    onChange={(n) => set('expiry_months', n ?? Number.NaN)}
                    accessibilityLabel={vchT('web.months')}
                  />
                </View>
                <Text variant="bodySmall" tone="secondary">
                  {vchT('web.months')}
                </Text>
              </View>
            ) : null}
            <Text variant="caption" tone="muted">
              {vchT('set.vch.expiry.help')}
            </Text>
            {fieldError('expiry_months') ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {fieldError('expiry_months')}
              </Text>
            ) : null}
          </View>

          <FieldBlock label={vchT('set.vch.terms')} help={vchT('set.vch.terms.help')} error={fieldError('terms')}>
            <Input
              accessibilityLabel={vchT('set.vch.terms')}
              value={value.terms ?? ''}
              onChangeText={(t) => set('terms', t === '' ? null : t)}
              multiline
              maxLength={TERMS_MAX}
              style={styles.terms}
              textAlignVertical="top"
            />
            <View style={styles.termsFoot}>
              <Button
                label={vchT('set.vch.terms.template')}
                variant="secondary"
                size="sm"
                onPress={() => (value.terms?.trim() ? setConfirmTemplate(true) : applyTemplate())}
              />
              <Text variant="caption" tone="muted">
                {vchT('web.termsCount', { count: (value.terms ?? '').length })}
              </Text>
            </View>
          </FieldBlock>

          <SwitchRow
            label={vchT('set.vch.online')}
            help={sellOnline ? vchT('set.vch.online.help') : vchT('set.vch.online.needs')}
            value={value.online_sale_enabled}
            disabled={!sellOnline && !value.online_sale_enabled}
            onChange={(x) => set('online_sale_enabled', x)}
          />
          {fieldError('online_sale_enabled') ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {fieldError('online_sale_enabled')}
            </Text>
          ) : null}
          {source.online_sale_enabled && slug ? (
            <LinkShareCard
              title={vchT('set.vch.link')}
              url={`${getWebUrl()}/vouchers/${slug}`}
              fileName={`gift-vouchers-qr-${slug.replace(/[^a-z0-9-]/gi, '-')}`}
              qrLabel={vchT('set.vch.qr')}
              copiedText={vchT('web.copied')}
            />
          ) : null}

          <FieldBlock label={vchT('set.vch.design')} error={fieldError('accent_colour')}>
            <View style={styles.chips}>
              {ACCENT_SWATCHES.map((c) => {
                const selected = value.accent_colour === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      set('accent_colour', c);
                      setHexText(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={vchT('app.colour.swatch', { colour: c })}
                    style={[styles.swatch, { backgroundColor: c, borderColor: selected ? colors.text : colors.border }]}
                  />
                );
              })}
            </View>
            <Input
              accessibilityLabel={vchT('app.colour.code')}
              placeholder={DEFAULT_ACCENT}
              value={hexText ?? value.accent_colour ?? ''}
              onChangeText={(t) => {
                setHexText(t);
                const hex = normaliseHex(t);
                if (hex) set('accent_colour', hex);
                else set('accent_colour', t.trim() === '' ? null : t.trim().toUpperCase());
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
            />
            {value.accent_colour ? (
              <Button
                label={vchT('web.colour.useBooking')}
                variant="ghost"
                size="sm"
                onPress={() => {
                  set('accent_colour', null);
                  setHexText(null);
                }}
              />
            ) : (
              <Text variant="bodySmall" tone="secondary">
                {vchT('web.colour.booking')}
              </Text>
            )}
          </FieldBlock>

          <SaveBar
            dirty={dirty}
            saving={saving}
            error={error}
            stale={stale}
            onSave={() => void save()}
            onDiscard={source.set_up ? discard : undefined}
          />
        </SettingsCard>

        {source.set_up ? (
          <SettingsCard>
            <Button label={vchT('vadd.open')} variant="secondary" onPress={() => setSheet('add')} fullWidth />
            <Button label={vchT('vimp.open')} variant="secondary" onPress={() => setSheet('import')} fullWidth />
          </SettingsCard>
        ) : null}
      </SettingsScroll>

      <ConfirmSheet
        visible={confirmTemplate}
        title={vchT('web.template.title')}
        message={vchT('web.template.body')}
        confirmLabel={vchT('web.template.confirm')}
        cancelLabel={smT('common.cancel')}
        onConfirm={() => {
          setConfirmTemplate(false);
          applyTemplate();
        }}
        onClose={() => setConfirmTemplate(false)}
      />
      {sheet === 'add' ? (
        <AddExistingVoucherSheet
          visible
          onClose={() => setSheet(null)}
          timeZone={pos.venue.timezone || 'Europe/London'}
          expiryMonths={source.expiry_months}
          clientWord={words.client}
        />
      ) : null}
      {sheet === 'import' ? <VoucherImportSheet visible onClose={() => setSheet(null)} /> : null}
      {leaveGuard}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 36,
  },
  presetRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.xl },
  monthsField: { width: 96 },
  terms: { minHeight: 160 },
  termsFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
});
