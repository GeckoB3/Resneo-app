import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { money, PickRow, PosSheet } from '@/components/pos/parts';
import { LoyaltyStamps } from '@/components/pos/settings-more/loyalty/LoyaltyStamps';
import { NumberTextField } from '@/components/pos/settings-more/loyalty/NumberTextField';
import { useLoyaltyPut } from '@/components/pos/settings-more/loyalty/useLoyaltyPut';
import {
  CheckRow,
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
} from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { isLoyaltyEnabled } from '@/lib/pos/pos-enabled';
import {
  fieldErrorFor,
  fieldErrorsFrom,
  isFeatureOff,
  isStaleWrite,
  sameValue,
  settingsErrorMessage,
  settingsMorePaths,
} from '@/lib/pos/settings-more/api';
import { SM_COPY, smT, useClientWords } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery } from '@/lib/pos/settings-more/hooks';
import { loyT, rewardText } from '@/lib/pos/settings-more/loyalty-copy';
import type { FieldError, LoyaltyProgramme, LoyaltyProgrammeResponse, PosSettingsResponse } from '@/lib/pos/settings-more/types';
import { usePosGate } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Settings, Loyalty card (web Settings, Checkout tab, `LoyaltyCard`; UX spec §21.1): admins only,
 * while the venue's `pos_loyalty_enabled` is on. Its own row and version through
 * GET/PUT /api/venue/pos/loyalty/programme: until it is set up the screen shows the defaults and the
 * first save sends every field at version 0. Later saves send only what changed. Pausing (after a
 * confirm) and starting again save at once. A 412 loads the fresh card and keeps the edits beside it.
 */

type Editable = Pick<
  LoyaltyProgramme,
  | 'name'
  | 'stamps_needed'
  | 'qualifying_service_item_ids'
  | 'reward_kind'
  | 'reward_service_item_ids'
  | 'reward_amount_pence'
  | 'reward_percent_bps'
  | 'reward_valid_days'
  | 'started_on'
  | 'reward_email_enabled'
>;

const KEYS: (keyof Editable)[] = [
  'name',
  'stamps_needed',
  'qualifying_service_item_ids',
  'reward_kind',
  'reward_service_item_ids',
  'reward_amount_pence',
  'reward_percent_bps',
  'reward_valid_days',
  'started_on',
  'reward_email_enabled',
];

export default function LoyaltySettingsScreen() {
  const venue = useVenue();
  return (
    <SettingsScreen
      title={loyT('set.loy.screen')}
      gate={(data) =>
        !isLoyaltyEnabled(venue.data) ? { featureOff: loyT('feature.name') } : data.can.is_admin ? 'ok' : 'admin_only'
      }>
      {(data) => <LoyaltyBody settings={data} />}
    </SettingsScreen>
  );
}

const stampsText = (n: number | null) => (n == null ? '' : String(n));
const parseStamps = (text: string) => (/^\d+$/.test(text.trim()) ? Math.max(2, Math.min(20, Number(text.trim()))) : undefined);
const percentText = (bps: number | null) => (bps == null ? '' : String(bps / 100));
function parsePercent(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}
const parseDays = (text: string) => (/^\d+$/.test(text.trim()) ? Math.max(1, Number(text.trim())) : undefined);

function LoyaltyBody({ settings }: { settings: PosSettingsResponse }) {
  const { colors } = useTheme();
  const { accessToken } = usePosGate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { clients } = useClientWords();
  const put = useLoyaltyPut();
  const query = useSettingsQuery<LoyaltyProgrammeResponse>(settingsMoreKeys.loyalty, settingsMorePaths.loyaltyProgramme);
  const [edits, setEdits] = useState<Partial<Editable>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [confirmPause, setConfirmPause] = useState(false);
  const [pickingService, setPickingService] = useState(false);

  const loaded = query.data?.programme && Array.isArray(query.data.services) ? query.data : null;
  const source = loaded?.programme ?? null;
  const value = useMemo(() => (source ? { ...source, ...edits } : null), [source, edits]);
  const changes = useMemo(() => {
    const out: Partial<Editable> = {};
    if (!source) return out;
    for (const k of KEYS) {
      // Until the card is set up, the first save sends every field (version 0 creates the row).
      if (!source.set_up || (k in edits && !sameValue(edits[k], source[k]))) {
        (out as Record<string, unknown>)[k] = k in edits ? edits[k] : source[k];
      }
    }
    return out;
  }, [source, edits]);
  const dirty = Boolean(source) && (!source!.set_up || Object.keys(changes).length > 0);
  const guard = useLeaveGuard(Boolean(source?.set_up) && dirty);

  if (query.isError && isFeatureOff(query.error)) {
    return (
      <EmptyState
        title={smT('gate.featureOff.title', { feature: loyT('feature.name') })}
        message={smT('gate.featureOff.body', { feature: loyT('feature.name') })}
      />
    );
  }
  if (!value || !loaded || !source) {
    if (query.isError || query.data) {
      return (
        <ErrorState
          message={query.isError ? settingsErrorMessage(query.error, loyT('set.loy.loadError')) : loyT('set.loy.loadError')}
          onRetry={() => void query.refetch()}
        />
      );
    }
    return <DetailSkeleton />;
  }

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => {
    setEdits((cur) => ({ ...cur, [k]: v }));
    setFields((cur) => cur.filter((f) => f.path !== k && !f.path.startsWith(`${k}.`)));
  };
  const fieldError = (path: keyof Editable) => fieldErrorFor(fields, path);

  /** One PUT at the loaded version. `keepEdits` leaves unsaved edits in place (pause, start again). */
  const send = async (body: Record<string, unknown>, keepEdits: boolean) => {
    setSaving(true);
    setError(null);
    setStale(false);
    try {
      const next = await put({ ...body, version: source.version });
      queryClient.setQueryData(settingsMoreKeys.loyalty(accessToken), next);
      if (!keepEdits) setEdits({});
      setFields([]);
      toast.success(loyT('set.loy.saved'));
    } catch (e) {
      if (isStaleWrite(e)) {
        await query.refetch();
        setStale(true);
        setError(SM_COPY['err.POS_SETTINGS_STALE']);
      } else {
        setError(settingsErrorMessage(e));
        setFields(fieldErrorsFrom(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setEdits({});
    setError(null);
    setStale(false);
    setFields([]);
  };

  const services = loaded.services;
  const rewardServiceId = value.reward_service_item_ids?.[0] ?? '';
  const rewardService = services.find((s) => s.id === rewardServiceId) ?? null;
  const preview = rewardText(
    {
      reward_kind: value.reward_kind,
      reward_service_name: rewardService?.name ?? null,
      reward_amount_pence: value.reward_amount_pence,
      reward_percent_bps: value.reward_percent_bps,
    },
    money,
  );
  const someServices = value.qualifying_service_item_ids !== null;
  const previewCount = Math.min(2, value.stamps_needed);
  const serviceLabel = (s: { name: string; price_pence: number }) => `${s.name} (${money(s.price_pence)})`;

  return (
    <>
      <SettingsScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
        <SettingsCard title={loyT('set.loy.title')} description={loyT('set.loy.help', { clients })}>
          {!source.set_up ? (
            <MessageBox tone="info" role="note">
              {loyT('feat.loyalty.setup')}
            </MessageBox>
          ) : null}
          {source.set_up && source.status === 'paused' ? (
            <MessageBox tone="warning" role="status">
              {loyT('set.loy.paused')}
            </MessageBox>
          ) : null}

          <FieldBlock label={loyT('set.loy.name')} error={fieldError('name')}>
            <Input
              value={value.name}
              maxLength={60}
              onChangeText={(t) => set('name', t)}
              accessibilityLabel={loyT('set.loy.name')}
            />
          </FieldBlock>

          <FieldBlock label={loyT('set.loy.stamps')} help={loyT('set.loy.stamps.help')} error={fieldError('stamps_needed')}>
            <NumberTextField
              value={value.stamps_needed}
              toText={stampsText}
              parse={parseStamps}
              onChange={(n) => n != null && set('stamps_needed', n)}
              accessibilityLabel={loyT('set.loy.stamps')}
            />
          </FieldBlock>

          <View style={styles.group}>
            <OptionList
              label={loyT('set.loy.services')}
              value={someServices ? 'some' : 'all'}
              options={[
                { value: 'all', label: loyT('set.loy.services.all') },
                { value: 'some', label: loyT('set.loy.services.some') },
              ]}
              onChange={(v) => set('qualifying_service_item_ids', v === 'all' ? null : (value.qualifying_service_item_ids ?? []))}
            />
            {someServices ? (
              <View style={[styles.tickList, { borderColor: colors.border }]}>
                {services.map((s) => {
                  const checked = value.qualifying_service_item_ids?.includes(s.id) ?? false;
                  return (
                    <CheckRow
                      key={s.id}
                      label={s.name}
                      checked={checked}
                      onChange={(on) => {
                        const cur = value.qualifying_service_item_ids ?? [];
                        set('qualifying_service_item_ids', on ? [...cur, s.id] : cur.filter((x) => x !== s.id));
                      }}
                    />
                  );
                })}
              </View>
            ) : null}
            {fieldError('qualifying_service_item_ids') ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {fieldError('qualifying_service_item_ids')}
              </Text>
            ) : null}
          </View>

          <View style={styles.group}>
            <OptionList
              label={loyT('set.loy.reward')}
              value={value.reward_kind}
              options={[
                { value: 'free_service', label: loyT('set.loy.reward.free') },
                { value: 'amount', label: loyT('set.loy.reward.amount') },
                { value: 'percent', label: loyT('set.loy.reward.percent') },
              ]}
              onChange={(v) => set('reward_kind', v)}
            />
            {value.reward_kind === 'free_service' ? (
              <FieldBlock label={loyT('set.loy.reward.free')} error={fieldError('reward_service_item_ids')}>
                <PickRow
                  title={rewardService ? serviceLabel(rewardService) : loyT('set.loy.reward.chooseService')}
                  onPress={() => setPickingService(true)}
                />
              </FieldBlock>
            ) : value.reward_kind === 'amount' ? (
              <FieldBlock label={loyT('set.loy.reward.amount')} error={fieldError('reward_amount_pence')}>
                <MoneyField
                  value={value.reward_amount_pence}
                  onChange={(p) => set('reward_amount_pence', p != null && Number.isFinite(p) ? p : null)}
                  accessibilityLabel={loyT('set.loy.reward.amount')}
                />
              </FieldBlock>
            ) : (
              <FieldBlock label={loyT('set.loy.reward.percent')} error={fieldError('reward_percent_bps')}>
                <NumberTextField
                  value={value.reward_percent_bps}
                  toText={percentText}
                  parse={parsePercent}
                  onChange={(bps) => set('reward_percent_bps', bps)}
                  accessibilityLabel={loyT('set.loy.reward.percent')}
                  keyboardType="decimal-pad"
                />
              </FieldBlock>
            )}
          </View>

          <View style={styles.group}>
            <OptionList
              label={loyT('set.loy.validity')}
              value={value.reward_valid_days == null ? 'none' : 'days'}
              options={[
                { value: 'none', label: loyT('set.loy.validity.none') },
                {
                  value: 'days',
                  label: loyT('set.loy.validity.days', { days: value.reward_valid_days ?? loyT('set.loy.validity.someDays') }),
                },
              ]}
              onChange={(v) => set('reward_valid_days', v === 'none' ? null : (value.reward_valid_days ?? 90))}
            />
            {value.reward_valid_days != null ? (
              <NumberTextField
                value={value.reward_valid_days}
                toText={stampsText}
                parse={parseDays}
                onChange={(n) => n != null && set('reward_valid_days', n)}
                accessibilityLabel={loyT('set.loy.validity.daysLabel')}
              />
            ) : null}
            {fieldError('reward_valid_days') ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {fieldError('reward_valid_days')}
              </Text>
            ) : null}
          </View>

          <FieldBlock label={loyT('set.loy.start')} help={loyT('set.loy.start.help')} error={fieldError('started_on')}>
            <DatePickerField
              value={value.started_on}
              onChange={(d) => {
                if (d) set('started_on', d);
              }}
              accessibilityLabel={loyT('set.loy.start')}
            />
          </FieldBlock>

          <SwitchRow
            label={loyT('set.loy.email', { clients })}
            value={value.reward_email_enabled}
            onChange={(on) => set('reward_email_enabled', on)}
          />
        </SettingsCard>

        <SettingsCard title={loyT('set.loy.preview', { clients })}>
          <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="label">{value.name || loyT('set.loy.name.default')}</Text>
            <LoyaltyStamps count={previewCount} needed={value.stamps_needed} />
            <Text variant="bodySmall">
              {loyT('acct.loyalty.progress', { count: previewCount, needed: value.stamps_needed, venue: settings.venue.name })}
            </Text>
            <Text variant="caption" tone="muted">
              {loyT('acct.loyalty.reward', { rewardText: preview })}
            </Text>
          </View>
        </SettingsCard>

        {source.set_up ? (
          <SettingsCard>
            <Text variant="caption" tone="muted">
              {loyT('set.loy.change.note')}
            </Text>
            <Button
              label={value.status === 'active' ? loyT('set.loy.pause') : loyT('set.loy.resume')}
              variant="secondary"
              disabled={saving}
              onPress={() => {
                if (value.status === 'active') setConfirmPause(true);
                else void send({ status: 'active' }, true);
              }}
              fullWidth
            />
          </SettingsCard>
        ) : null}

        <SaveBar
          dirty={dirty}
          saving={saving}
          error={error}
          stale={stale}
          onSave={() => void send(changes, false)}
          onDiscard={source.set_up ? discard : undefined}
        />
      </SettingsScroll>

      <PosSheet visible={pickingService} onClose={() => setPickingService(false)} title={loyT('set.loy.reward.free')}>
        {services.map((s) => (
          <PickRow
            key={s.id}
            title={serviceLabel(s)}
            selected={s.id === rewardServiceId}
            onPress={() => {
              set('reward_service_item_ids', [s.id]);
              setPickingService(false);
            }}
          />
        ))}
      </PosSheet>

      <ConfirmSheet
        visible={confirmPause}
        title={loyT('set.loy.pause.title')}
        message={loyT('set.loy.pause.body')}
        confirmLabel={loyT('set.loy.pause')}
        cancelLabel={smT('common.cancel')}
        destructive={false}
        loading={saving}
        onConfirm={() => {
          setConfirmPause(false);
          void send({ status: 'paused' }, true);
        }}
        onClose={() => setConfirmPause(false)}
      />
      {guard}
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  tickList: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  preview: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.base, gap: spacing.sm },
});
