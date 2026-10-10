import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { LinkShareCard } from '@/components/pos/settings-more/LinkShareCard';
import {
  FieldBlock,
  MessageBox,
  MoneyField,
  OptionList,
  SaveBar,
  SettingsCard,
  SettingsScreen,
  SwitchRow,
  WholeNumberField,
  longDay,
  useLeaveGuard,
} from '@/components/pos/settings-more/parts';
import { ZoneSheet } from '@/components/pos/settings-more/shop/ZoneSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { isShopEnabled } from '@/lib/pos/pos-enabled';
import {
  errorBody,
  fieldErrorFor,
  fieldErrorsFrom,
  isNetworkFailure,
  isStaleWrite,
  sameValue,
  settingsErrorMessage,
  settingsMorePaths,
} from '@/lib/pos/settings-more/api';
import { smT } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import {
  READY_OPTIONS,
  shT,
  zoneSummary,
  type ShopSetCopyId,
} from '@/lib/pos/settings-more/shop-copy';
import type { FieldError, PosSettingsResponse, ShopAdminView, ShopSettings, ShopZone } from '@/lib/pos/settings-more/types';
import { usePosGate } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Checkout settings, Online shop (web `ShopSettingsCard`, UX spec §9.12): admins only, while the
 * venue's `pos_online_shop_enabled` is on. The opening checklist (each unticked line's "Fix this"),
 * what is still missing, the Open my shop switch (saved at once, closing asks first, the server's
 * refusal word for word), the shop link and QR once open, the four policies with templates,
 * returns, collection, delivery and its zones, stock display, minimum order and the two optional
 * messages. Its own route (GET/PATCH /api/venue/shop/settings) on the shared POS settings
 * version: a save sends only what changed with that version, a 412 loads the fresh settings and
 * keeps the edits beside them.
 */

type Editable = Pick<
  ShopSettings,
  | 'collection_enabled'
  | 'collection_instructions'
  | 'collection_ready_minutes'
  | 'delivery_enabled'
  | 'returns_policy'
  | 'cancellation_policy'
  | 'delivery_policy'
  | 'terms_of_sale'
  | 'shop_min_order_pence'
  | 'shop_stock_display'
  | 'shop_return_postage'
  | 'shop_ready_sms_enabled'
  | 'shop_delivered_email_enabled'
> & {
  /** Null while the field is empty; sent as 0, as the web's number field does. */
  return_window_days: number | null;
  collection_hold_days: number | null;
};

const POLICIES = [
  { key: 'returns_policy', label: 'set.shop.returns', template: 'returns' },
  { key: 'cancellation_policy', label: 'set.shop.cancellation', template: 'cancellation' },
  { key: 'delivery_policy', label: 'set.shop.delivery', template: 'delivery' },
  { key: 'terms_of_sale', label: 'set.shop.terms', template: 'terms' },
] as const;

/** Text fields where empty and "not written" are the same (the server stores both as null). */
const TEXT_KEYS = new Set<string>(['returns_policy', 'cancellation_policy', 'delivery_policy', 'terms_of_sale', 'collection_instructions']);

type CheckKey = keyof ShopAdminView['readiness']['checks'];
type Fix = { kind: 'route'; href: string } | { kind: 'scroll'; section: 'policies' | 'fulfilment' };

/**
 * The checklist in the web's order. Where the web links to a page the app has, the app opens its
 * own screen: business details are on the Checkout settings hub, cards and plan on Plan and
 * payments, products on Products and stock.
 */
const CHECKS: { key: CheckKey; label: ShopSetCopyId; fix: Fix }[] = [
  { key: 'legal', label: 'set.shop.check.legal', fix: { kind: 'route', href: '/checkout-settings' } },
  { key: 'policies', label: 'set.shop.check.policies', fix: { kind: 'scroll', section: 'policies' } },
  { key: 'cards', label: 'set.shop.check.cards', fix: { kind: 'route', href: '/manage/plan' } },
  { key: 'plan', label: 'set.shop.check.plan', fix: { kind: 'route', href: '/manage/plan' } },
  { key: 'products', label: 'set.shop.check.products', fix: { kind: 'route', href: '/stock' } },
  { key: 'fulfilment', label: 'set.shop.check.fulfilment', fix: { kind: 'scroll', section: 'fulfilment' } },
];

const same = (key: string, a: unknown, b: unknown) =>
  TEXT_KEYS.has(key) ? sameValue(a === '' ? null : a, b === '' ? null : b) : sameValue(a, b);

export default function ShopSettingsRoute() {
  const venue = useVenue();
  return (
    <SettingsScreen
      title={shT('set.shop.title')}
      gate={(data) => (!isShopEnabled(venue.data) ? { featureOff: shT('feature.name') } : data.can.is_admin ? 'ok' : 'admin_only')}>
      {(data) => <ShopSettingsBody data={data} />}
    </SettingsScreen>
  );
}

function ShopSettingsBody({ data }: { data: PosSettingsResponse }) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { accessToken } = usePosGate();
  const send = useSettingsSend();
  const query = useSettingsQuery<ShopAdminView>(settingsMoreKeys.shop, settingsMorePaths.shopSettings);
  const view = query.data;
  const currency = data.venue.currency;

  const [edits, setEdits] = useState<Partial<Editable>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [openError, setOpenError] = useState<{ message: string; stale: boolean } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [zoneSheet, setZoneSheet] = useState<{ zone: ShopZone | null; n: number } | null>(null);
  const [starterBusy, setStarterBusy] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
  const starterRequestId = useRef<string>(newPaymentAttemptId());
  const zoneOpenings = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<'policies' | 'fulfilment', number>>({ policies: 0, fulfilment: 0 });

  const value = useMemo(() => (view ? ({ ...view.settings, ...edits } as unknown as ShopSettings & Editable) : null), [view, edits]);
  const changes = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (!view) return out;
    const saved = view.settings as Record<string, unknown>;
    for (const [k, v] of Object.entries(edits)) if (!same(k, v, saved[k])) out[k] = v;
    return out;
  }, [edits, view]);
  const dirty = Object.keys(changes).length > 0;
  const leaveGuard = useLeaveGuard(dirty);

  const set = useCallback(<K extends keyof Editable>(k: K, v: Editable[K]) => {
    setEdits((e) => ({ ...e, [k]: v }));
    setFields((prev) => prev.filter((f) => f.path !== k));
  }, []);

  const shopKey = settingsMoreKeys.shop(accessToken);

  /** PATCH at the loaded version; the answer (or the 412's fresh view) goes into the cache. */
  const patch = async (body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string; stale: boolean; fields: FieldError[] }> => {
    if (!view) return { ok: false, message: smT('common.saveError'), stale: false, fields: [] };
    try {
      const fresh = await send<ShopAdminView>(settingsMorePaths.shopSettings, 'PATCH', { ...body, version: view.settings.version });
      queryClient.setQueryData(shopKey, fresh);
      // The shop settings share the POS settings version: other screens read it again.
      void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
      toast.success(shT('set.shop.saved'));
      return { ok: true };
    } catch (e) {
      if (isStaleWrite(e)) {
        const b = errorBody<Partial<ShopAdminView> & { error?: unknown; code?: unknown }>(e);
        if (b?.settings && b.readiness) {
          const { error: _error, code: _code, ...rest } = b;
          queryClient.setQueryData(shopKey, rest as ShopAdminView);
        } else {
          await query.refetch();
        }
        void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
        return { ok: false, message: smT('err.POS_SETTINGS_STALE'), stale: true, fields: [] };
      }
      return { ok: false, message: settingsErrorMessage(e), stale: false, fields: fieldErrorsFrom(e) };
    }
  };

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setStale(false);
    setFields([]);
    const body: Record<string, unknown> = { ...changes };
    if ('return_window_days' in body) body.return_window_days = body.return_window_days ?? 0;
    if ('collection_hold_days' in body) body.collection_hold_days = body.collection_hold_days ?? 0;
    const result = await patch(body);
    setSaving(false);
    if (result.ok) {
      setEdits({});
      return;
    }
    setError(result.message);
    setStale(result.stale);
    setFields(result.fields);
  };

  const discard = () => {
    setEdits({});
    setError(null);
    setStale(false);
    setFields([]);
  };

  const setOpen = async (next: boolean) => {
    setSaving(true);
    setOpenError(null);
    const result = await patch({ shop_open: next });
    setSaving(false);
    if (!result.ok) setOpenError({ message: result.message, stale: result.stale });
  };

  const addStarterZone = async () => {
    if (starterBusy) return;
    setStarterBusy(true);
    setStarterError(null);
    try {
      await send(settingsMorePaths.deliveryZones, 'POST', {
        client_request_id: starterRequestId.current,
        name: shT('set.shop.rate.name.placeholder'),
        area: 'uk',
        price_pence: 395,
      });
      starterRequestId.current = newPaymentAttemptId();
      await query.refetch();
    } catch (e) {
      if (!isNetworkFailure(e)) starterRequestId.current = newPaymentAttemptId();
      setStarterError(settingsErrorMessage(e));
    } finally {
      setStarterBusy(false);
    }
  };

  const openZone = (zone: ShopZone | null) => {
    zoneOpenings.current += 1;
    setZoneSheet({ zone, n: zoneOpenings.current });
  };

  const fix = (f: Fix) => {
    if (f.kind === 'route') {
      router.push(f.href as Href);
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current[f.section] - spacing.base), animated: true });
  };

  if (!view || !value) {
    if (query.isError) {
      return <ErrorState message={settingsErrorMessage(query.error, smT('common.loadError'))} onRetry={() => void query.refetch()} />;
    }
    return <DetailSkeleton />;
  }

  const readiness = view.readiness;
  const open = view.settings.shop_open;
  const deliveryAreas = view.delivery_areas ?? [];
  const areaSentence = deliveryAreas.length > 0 ? shT('set.shop.delivery.help') : null;
  const fieldError = (path: string) => fieldErrorFor(fields, path);

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
        <SettingsCard title={shT('set.shop.title')} description={open ? shT('set.shop.status.open') : shT('set.shop.status.closed')}>
          <View style={styles.checks}>
            {CHECKS.map((c) => {
              const done = readiness.checks[c.key];
              return (
                <View key={c.key} style={styles.checkRow} accessible accessibilityLabel={`${shT(c.label)} ${shT(done ? 'set.shop.check.done' : 'set.shop.check.todo')}`}>
                  <View
                    style={[styles.tick, { backgroundColor: done ? colors.success : colors.surfaceSunken, borderColor: done ? colors.success : colors.border }]}
                    testID={`shop-check-${c.key}-${done ? 'done' : 'todo'}`}>
                    {done ? (
                      <Text variant="caption" color={colors.onBrand}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodySmall">{shT(c.label)}</Text>
                    {!done ? (
                      <Pressable onPress={() => fix(c.fix)} accessibilityRole="link" accessibilityLabel={`${shT('set.shop.check.fix')}: ${shT(c.label)}`} hitSlop={8}>
                        <Text variant="bodySmall" tone="brand" style={styles.link}>
                          {shT('set.shop.check.fix')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {!readiness.canOpen && view.missing_sentence ? (
            <MessageBox tone="warning">{shT('err.SHOP_LEGAL_DETAILS_MISSING', { missing: view.missing_sentence })}</MessageBox>
          ) : null}
          <SwitchRow
            label={shT('set.shop.open')}
            value={open}
            disabled={saving || (!open && !readiness.canOpen)}
            onChange={(next) => {
              if (!next) setConfirmClose(true);
              else void setOpen(true);
            }}
          />
          {openError ? (
            <MessageBox tone={openError.stale ? 'warning' : 'danger'} role="alert">
              {openError.message}
            </MessageBox>
          ) : null}
          {open && view.shop_url ? (
            <LinkShareCard
              url={view.shop_url}
              fileName="shop-qr-code"
              copyLabel={shT('set.shop.copyLink')}
              copiedText={shT('set.shop.copied')}
              qrLabel={shT('set.shop.qr')}
              openLabel={shT('set.shop.view')}
            />
          ) : null}
        </SettingsCard>

        <View
          onLayout={(e) => {
            sectionY.current.policies = e.nativeEvent.layout.y;
          }}>
          <SettingsCard>
            <Text variant="bodySmall" tone="secondary">
              {shT('set.shop.policy.help')}
            </Text>
            <Text variant="caption" tone="muted">
              {view.policy_updated_at
                ? shT('set.shop.policy.version', { version: view.settings.policies_version, date: longDay(view.policy_updated_at) })
                : shT('set.shop.policy.versionNew')}
            </Text>
            {POLICIES.map((p) => (
              <FieldBlock key={p.key} label={shT(p.label)} error={fieldError(p.key)}>
                <Input
                  value={value[p.key] ?? ''}
                  onChangeText={(t) => set(p.key, t)}
                  multiline
                  style={styles.policy}
                  accessibilityLabel={shT(p.label)}
                  maxLength={20000}
                />
                <View style={styles.leftButton}>
                  <Button label={shT('set.shop.policy.template')} variant="ghost" size="sm" onPress={() => set(p.key, view.templates[p.template])} />
                </View>
              </FieldBlock>
            ))}
            <OptionList
              label={shT('set.shop.returnPostage')}
              value={value.shop_return_postage}
              options={[
                { value: 'customer', label: shT('set.shop.returnPostage.customer') },
                { value: 'venue', label: shT('set.shop.returnPostage.venue', { venue: data.venue.name }) },
              ]}
              onChange={(v) => set('shop_return_postage', v)}
            />
            <FieldBlock label={shT('set.shop.returnWindow')} help={shT('set.shop.returnWindow.help')} error={fieldError('return_window_days')}>
              <WholeNumberField
                value={value.return_window_days}
                onChange={(n) => set('return_window_days', n)}
                accessibilityLabel={shT('set.shop.returnWindow')}
              />
            </FieldBlock>
          </SettingsCard>
        </View>

        <View
          onLayout={(e) => {
            sectionY.current.fulfilment = e.nativeEvent.layout.y;
          }}>
          <SettingsCard>
            <SwitchRow
              label={shT('set.shop.collection', { venue: data.venue.name })}
              value={value.collection_enabled}
              onChange={(v) => set('collection_enabled', v)}
            />
            {value.collection_enabled ? (
              <>
                <FieldBlock label={shT('set.shop.collection.instructions')} error={fieldError('collection_instructions')}>
                  <Input
                    value={value.collection_instructions ?? ''}
                    onChangeText={(t) => set('collection_instructions', t)}
                    multiline
                    style={styles.instructions}
                    accessibilityLabel={shT('set.shop.collection.instructions')}
                    maxLength={500}
                  />
                </FieldBlock>
                <OptionList
                  label={shT('set.shop.collection.ready')}
                  value={String(value.collection_ready_minutes)}
                  options={READY_OPTIONS.map((m) => ({ value: String(m), label: shT(`ready.${m}`) }))}
                  onChange={(v) => set('collection_ready_minutes', Number(v))}
                />
                <FieldBlock label={shT('set.shop.collection.hold')} error={fieldError('collection_hold_days')}>
                  <WholeNumberField
                    value={value.collection_hold_days}
                    onChange={(n) => set('collection_hold_days', n)}
                    accessibilityLabel={shT('set.shop.collection.hold')}
                  />
                </FieldBlock>
              </>
            ) : (
              <Text variant="bodySmall" tone="secondary">
                {shT('set.shop.deliveryOnly.note')}
              </Text>
            )}
            <SwitchRow label={shT('set.shop.delivery.enabled')} value={value.delivery_enabled} onChange={(v) => set('delivery_enabled', v)} />
            {areaSentence ? (
              <Text variant="bodySmall" tone="secondary">
                {areaSentence}
              </Text>
            ) : null}
            {value.delivery_enabled ? (
              <View style={styles.zones}>
                {view.zones.length === 0 ? (
                  <Text variant="bodySmall" tone="secondary">
                    {shT('set.shop.rate.none')}
                  </Text>
                ) : (
                  <View style={[styles.zoneList, { borderColor: colors.border }]}>
                    {view.zones.map((z, i) => (
                      <View
                        key={z.id}
                        style={[styles.zoneRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                        <View style={styles.flex}>
                          <Text variant="bodyMedium">{z.name}</Text>
                          <Text variant="caption" tone="secondary">
                            {zoneSummary(z, currency)}
                          </Text>
                          {!z.is_active ? (
                            <Text variant="caption" tone="muted">
                              {shT('set.shop.rate.inactive')}
                            </Text>
                          ) : null}
                        </View>
                        <Button
                          label={shT('set.shop.rate.edit')}
                          variant="secondary"
                          size="sm"
                          onPress={() => openZone(z)}
                          accessibilityLabel={`${shT('set.shop.rate.edit')} ${z.name}`}
                        />
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.wrap}>
                  {view.zones.length === 0 && deliveryAreas.includes('uk') ? (
                    <Button
                      label={shT('set.shop.rate.starter', { country: shT('areas.uk') })}
                      size="sm"
                      loading={starterBusy}
                      onPress={() => void addStarterZone()}
                    />
                  ) : null}
                  {deliveryAreas.length > 0 ? (
                    <Button label={shT('set.shop.rate.add')} variant="secondary" size="sm" onPress={() => openZone(null)} />
                  ) : null}
                </View>
                {starterError ? (
                  <MessageBox tone="danger" role="alert">
                    {starterError}
                  </MessageBox>
                ) : null}
              </View>
            ) : null}
          </SettingsCard>
        </View>

        <SettingsCard>
          <OptionList
            label={shT('set.shop.stock')}
            value={value.shop_stock_display}
            options={[
              { value: 'exact', label: shT('set.shop.stock.exact') },
              { value: 'low_only', label: shT('set.shop.stock.low_only') },
              { value: 'none', label: shT('set.shop.stock.none') },
            ]}
            onChange={(v) => set('shop_stock_display', v)}
          />
          <FieldBlock label={shT('set.shop.minOrder')} error={fieldError('shop_min_order_pence')}>
            <MoneyField
              value={value.shop_min_order_pence || null}
              onChange={(p) => set('shop_min_order_pence', p ?? 0)}
              accessibilityLabel={shT('set.shop.minOrder')}
              placeholder=""
            />
          </FieldBlock>
        </SettingsCard>

        <SettingsCard title={shT('set.shop.messages')} description={shT('set.shop.messages.always')}>
          <SwitchRow label={shT('set.shop.readySms')} value={value.shop_ready_sms_enabled} onChange={(v) => set('shop_ready_sms_enabled', v)} />
          <SwitchRow
            label={shT('set.shop.deliveredEmail')}
            value={value.shop_delivered_email_enabled}
            onChange={(v) => set('shop_delivered_email_enabled', v)}
          />
        </SettingsCard>
      </ScrollView>

      {dirty || error ? (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <SaveBar dirty={dirty} saving={saving} error={error} stale={stale} onSave={() => void save()} onDiscard={discard} />
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirmClose}
        title={shT('set.shop.close.title')}
        message={shT('set.shop.close.body')}
        confirmLabel={shT('set.shop.close.confirm')}
        cancelLabel={smT('common.cancel')}
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          void setOpen(false);
        }}
        onClose={() => setConfirmClose(false)}
      />

      {zoneSheet ? (
        <ZoneSheet
          key={zoneSheet.n}
          visible
          zone={zoneSheet.zone}
          highlands={view.zone_presets?.highlands ?? []}
          importNote={view.settings.jurisdiction !== 'ni'}
          onClose={() => setZoneSheet(null)}
          onSaved={async () => {
            setZoneSheet(null);
            await query.refetch();
          }}
          onStale={() => void query.refetch()}
        />
      ) : null}

      {leaveGuard}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing['3xl'] },
  checks: { gap: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tick: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  link: { textDecorationLine: 'underline', fontWeight: '600', marginTop: 2 },
  policy: { minHeight: 132, textAlignVertical: 'top' },
  instructions: { minHeight: 64, textAlignVertical: 'top' },
  leftButton: { alignItems: 'flex-start' },
  zones: { gap: spacing.sm },
  zoneList: { borderWidth: 1, borderRadius: radius.md },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { padding: spacing.base, borderTopWidth: StyleSheet.hairlineWidth },
});
