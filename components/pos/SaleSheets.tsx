import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  ErrorLine,
  money,
  PickRow,
  PosSheet,
  posStyles,
  usePosT,
  writeError,
  type Send,
} from '@/components/pos/parts';
import { AddNoticeBanner, OptionChooser, ProductRows, useAddProduct, type AddNotice } from '@/components/pos/ProductAdd';
import { VoucherSellForm, VoucherTiles } from '@/components/pos/VoucherSheets';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { hapticWarning } from '@/lib/haptics';
import { posErrorMessage } from '@/lib/pos/api';
import { canPos } from '@/lib/pos/pos-enabled';
import {
  discountBasePence,
  discountOffPence,
  overStaffLimit,
  parseMoneyInput,
  penceToInput,
} from '@/lib/pos/sale-math';
import { looksLikeBarcode, readStockRules, resolveTillFavourites, type TillFavourite } from '@/lib/pos/product-math';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuests } from '@/lib/queries/useGuests';
import { creditLocked } from '@/lib/pos/voucher-math';
import {
  lookupBarcode,
  usePosCatalogue,
  usePosSaleList,
  useProductSearch,
  useVoucherSettings,
  type SaleWriteInput,
} from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';
import type { PosBootstrap, PosCatalogueProduct, PosCatalogueService, PosSale, PosSaleLine } from '@/types/pos';

/**
 * The sale's sheets in the app (UX spec §3.8 to §3.17, presented as phone sheets, §13.3): adding
 * items, the line editor, discounts, the client, who is serving, park, void and combining with
 * another open sale. Each hides what the login's capabilities do not allow, and every write sends
 * the sale's `version`; a stale write shows `stale.dialog` and leaves the fresh sale on screen.
 */

export { writeError, type Send } from '@/components/pos/parts';

// ─── Add items ──────────────────────────────────────────────────────────────

type AddTab = 'favourites' | 'services' | 'products' | 'custom' | 'fee' | 'vouchers';

function AddItemsSheetBody({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
  myCalendarIds,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  myCalendarIds: string[];
}) {
  const t = usePosT();
  const accessToken = useAccessToken();
  const catalogue = usePosCatalogue({ enabled: visible });
  const canCustom = canPos(bootstrap, 'custom_line');
  // Gift vouchers (Pass V, §20.2): while the voucher switch is on, for logins that can start a sale
  // and take its payment, once the venue has set vouchers up on the web.
  const canSellVouchers =
    bootstrap.vouchers?.selling === true && canPos(bootstrap, 'create_sale') && canPos(bootstrap, 'take_payment');
  const voucherSettingsQ = useVoucherSettings({ enabled: visible && canSellVouchers });
  const voucherSettings =
    canSellVouchers && voucherSettingsQ.data?.settings.set_up ? voucherSettingsQ.data.settings : null;
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';
  const venueName = bootstrap.venue?.name ?? 'This venue';
  const [voucherPick, setVoucherPick] = useState<{ presetPence: number | null } | null>(null);
  const [chosenTab, setTab] = useState<AddTab | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [service, setService] = useState<PosCatalogueService | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<PosCatalogueProduct | null>(null);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [group, setGroup] = useState<'services' | 'retail' | 'other'>('services');
  const [feeKind, setFeeKind] = useState<'lateCancel' | 'noShow' | 'other'>('lateCancel');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Products arrive with Pass 4 (P4-4): a server before it sends no `products`, and the sheet stays
  // as it was (services, custom items, fees and vouchers).
  const productsOn = Array.isArray(catalogue.data?.products);
  const rules = readStockRules(catalogue.data?.stock);
  const favourites = useMemo(() => resolveTillFavourites(catalogue.data), [catalogue.data]);
  const tab: AddTab = chosenTab ?? (productsOn && favourites.tiles.length > 0 ? 'favourites' : 'services');
  const searching = debounced.length > 0 && (tab === 'services' || tab === 'products' || tab === 'favourites');
  const productSearch = useProductSearch(debounced, { enabled: visible && productsOn && (tab === 'products' || searching) });
  const { add: addProduct, busy: adding } = useAddProduct({ sale, send, rules, venueName, onNotice: setNotice });

  const services = useMemo(() => {
    const all = catalogue.data?.services ?? [];
    const q = query.trim().toLowerCase();
    const favIds = new Set((catalogue.data?.favourites ?? []).map((f) => f.item_id));
    const matched = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
    return [...matched].sort((a, b) => Number(favIds.has(b.id)) - Number(favIds.has(a.id)));
  }, [catalogue.data, query]);
  const products = productSearch.data?.products ?? [];

  function chooseService(s: PosCatalogueService, presetOptionId: string | null = null) {
    setService(s);
    setOptionId(presetOptionId ?? (s.options.length === 1 ? s.options[0]!.id : null));
    const mine = s.calendars.find((c) => myCalendarIds.includes(c.calendar_id));
    setCalendarId(mine?.calendar_id ?? (s.calendars.length === 1 ? s.calendars[0]!.calendar_id : null));
    setError(null);
  }

  function pickProduct(p: PosCatalogueProduct) {
    if (p.options.length === 1) void addProduct(p, p.options[0]!);
    else if (p.options.length > 1) setChoosing(p);
  }

  function pickFavourite(f: TillFavourite) {
    if (f.kind === 'product') void addProduct(f.product, f.option);
    else chooseService(f.service, f.optionId);
  }

  // A keyboard-mode scanner types the code into the search field and ends with Enter: the code is
  // looked up exactly and added (UX spec §3.8 `scan.*`). A name is just a search.
  async function scan(code: string) {
    if (!accessToken || !productsOn || adding || scanning) return;
    setScanning(true);
    try {
      const res = await lookupBarcode(accessToken, code);
      if ('hit' in res) {
        const option = res.hit.product.options.find((o) => o.id === res.hit.option_id)!;
        setQuery('');
        setDebounced('');
        await addProduct(res.hit.product, option);
      } else if ('refused' in res) {
        hapticWarning();
        setNotice({ tone: 'error', lines: [res.refused] });
      } else {
        hapticWarning();
        setNotice({
          tone: 'error',
          lines: [t('scan.unknown', { barcode: code })],
          action: {
            label: t('scan.unknown.search'),
            onPress: () => {
              setNotice(null);
              setQuery('');
              setTab('products');
            },
          },
        });
      }
    } catch (e) {
      setNotice({ tone: 'error', lines: [posErrorMessage(e, t('common.networkError'))] });
    } finally {
      setScanning(false);
    }
  }

  async function add(line: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await send({ action: 'lines', body: { version: sale.version, ops: [{ op: 'add', line }] } });
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { value: AddTab; label: string }[] = [
    ...(productsOn ? [{ value: 'favourites' as const, label: t('add.tab.favourites') }] : []),
    { value: 'services', label: t('add.tab.services') },
    ...(productsOn ? [{ value: 'products' as const, label: t('add.tab.products') }] : []),
    ...(canCustom
      ? [
          { value: 'custom' as const, label: t('add.tab.custom') },
          { value: 'fee' as const, label: t('add.fee') },
        ]
      : []),
    ...(voucherSettings ? [{ value: 'vouchers' as const, label: t('add.tab.vouchers') }] : []),
  ];
  const pricePence = parseMoneyInput(price);
  const feeName = feeKind === 'lateCancel' ? t('fee.lateCancel') : feeKind === 'noShow' ? t('fee.noShow') : name.trim();
  const showSearch = tab === 'favourites' || tab === 'services' || tab === 'products';

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={
        service
          ? t('walkin.title')
          : choosing
            ? t('add.variant.title')
            : voucherPick && voucherSettings
              ? t('vsell.title')
              : t('add.open')
      }>
      {voucherPick && voucherSettings ? (
        <VoucherSellForm
          settings={voucherSettings}
          presetPence={voucherPick.presetPence}
          sale={sale}
          send={send}
          timeZone={timeZone}
          onDone={onClose}
          onBack={() => setVoucherPick(null)}
        />
      ) : choosing ? (
        <OptionChooser
          product={choosing}
          rules={rules}
          busy={adding}
          onBack={() => setChoosing(null)}
          onPick={(o) => {
            const product = choosing;
            setChoosing(null);
            void addProduct(product, o);
          }}
        />
      ) : service ? (
        <View style={posStyles.stack}>
          <Text variant="label">{service.name}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('walkin.body')}
          </Text>
          {service.options.length > 1 ? (
            <>
              <Text variant="label">{t('walkin.option')}</Text>
              {service.options.map((o) => (
                <PickRow
                  key={o.id}
                  title={o.name}
                  detail={o.price_pence != null ? money(o.price_pence) : null}
                  selected={optionId === o.id}
                  onPress={() => setOptionId(o.id)}
                />
              ))}
            </>
          ) : null}
          <Text variant="label">{t('app.sale.walkIn.choose')}</Text>
          {service.calendars.map((c) => (
            <PickRow
              key={c.calendar_id}
              title={c.name}
              detail={c.price_pence != null ? money(c.price_pence) : null}
              selected={calendarId === c.calendar_id}
              onPress={() => setCalendarId(c.calendar_id)}
            />
          ))}
          {sale.lines.some((l) => l.booking_id) ? (
            <Text variant="caption" tone="muted">
              {t('walkin.sameVisit')}
            </Text>
          ) : null}
          <ErrorLine message={error} />
          <View style={posStyles.buttons}>
            <Button
              label={t('walkin.confirm')}
              loading={busy}
              disabled={!calendarId || (service.options.length > 1 && !optionId)}
              onPress={() =>
                void add({
                  kind: 'service',
                  service_item_id: service.id,
                  ...(optionId ? { service_variant_id: optionId } : {}),
                  performer_calendar_id: calendarId,
                })
              }
              fullWidth
            />
            <Button label={t('app.card.back')} variant="ghost" onPress={() => setService(null)} fullWidth />
          </View>
        </View>
      ) : (
        <View style={posStyles.stack}>
          {showSearch ? (
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder={t('add.search.placeholder')}
              onClear={() => setQuery('')}
              onSubmitEditing={() => {
                const code = query.trim();
                if (productsOn && looksLikeBarcode(code)) void scan(code);
              }}
              submitBehavior="submit"
              returnKeyType="search"
              accessibilityLabel={t('add.search.placeholder')}
            />
          ) : null}
          <AddNoticeBanner notice={notice} />
          {tabs.length > 1 ? <ChoiceChips options={tabs} value={tab} onChange={(v) => setTab(v)} /> : null}
          {catalogue.isLoading ? (
            <Text tone="muted">{t('app.loading')}</Text>
          ) : catalogue.isError ? (
            <ErrorLine message={posErrorMessage(catalogue.error, t('common.networkError'))} />
          ) : tab === 'favourites' && !searching ? (
            favourites.tiles.length === 0 ? (
              <Text tone="muted">{t('add.fav.empty')}</Text>
            ) : (
              <>
                {favourites.suggested ? (
                  <Text variant="caption" tone="muted">
                    {t('add.fav.suggested')}
                  </Text>
                ) : null}
                {favourites.tiles.map((f) => (
                  <PickRow
                    key={f.key}
                    title={f.name}
                    detail={f.price_pence != null ? money(f.price_pence) : null}
                    disabled={f.kind === 'product' && adding}
                    onPress={() => pickFavourite(f)}
                  />
                ))}
              </>
            )
          ) : tab === 'products' ? (
            productSearch.isLoading ? (
              <Text tone="muted">{t('app.loading')}</Text>
            ) : productSearch.isError ? (
              <ErrorLine message={posErrorMessage(productSearch.error, t('common.networkError'))} />
            ) : products.length === 0 ? (
              <Text tone="muted">{debounced ? t('add.none', { query: debounced }) : t('add.fav.empty')}</Text>
            ) : (
              <ProductRows products={products} rules={rules} disabled={adding} onPick={pickProduct} />
            )
          ) : tab === 'services' || tab === 'favourites' ? (
            <>
              {services.length === 0 && !(searching && products.length > 0) ? (
                <Text tone="muted">{t('add.none', { query: query.trim() })}</Text>
              ) : (
                services.map((s) => (
                  <PickRow
                    key={s.id}
                    title={s.name}
                    detail={
                      s.options.length > 1
                        ? t('add.options', { count: s.options.length })
                        : s.price_pence != null
                          ? money(s.price_pence)
                          : null
                    }
                    onPress={() => chooseService(s)}
                  />
                ))
              )}
              {searching && products.length > 0 ? (
                <ProductRows products={products} rules={rules} disabled={adding} onPick={pickProduct} />
              ) : null}
            </>
          ) : tab === 'vouchers' && voucherSettings ? (
            <VoucherTiles settings={voucherSettings} onPick={(presetPence) => setVoucherPick({ presetPence })} />
          ) : tab === 'custom' ? (
            <>
              <Input label={t('custom.name')} value={name} onChangeText={setName} maxLength={120} />
              <Input
                label={t('custom.price')}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
              <Text variant="label">{t('custom.kind')}</Text>
              <ChoiceChips
                options={[
                  { value: 'services', label: t('custom.kind.service') },
                  { value: 'retail', label: t('custom.kind.product') },
                  { value: 'other', label: t('custom.kind.other') },
                ]}
                value={group}
                onChange={setGroup}
              />
              <ErrorLine message={error} />
              <Button
                label={t('custom.add')}
                loading={busy}
                disabled={!name.trim() || pricePence == null}
                onPress={() =>
                  void add({ kind: 'custom', name: name.trim(), unit_price_pence: pricePence, reporting_group: group })
                }
                fullWidth
              />
            </>
          ) : (
            <>
              <Text variant="bodySmall" tone="muted">
                {t('fee.help')}
              </Text>
              <ChoiceChips
                options={[
                  { value: 'lateCancel', label: t('fee.lateCancel') },
                  { value: 'noShow', label: t('fee.noShow') },
                  { value: 'other', label: t('fee.other') },
                ]}
                value={feeKind}
                onChange={setFeeKind}
              />
              {feeKind === 'other' ? (
                <Input label={t('custom.name')} value={name} onChangeText={setName} maxLength={120} />
              ) : null}
              <Input
                label={t('custom.price')}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
              <ErrorLine message={error} />
              <Button
                label={t('fee.add')}
                loading={busy}
                disabled={!feeName || pricePence == null}
                onPress={() => void add({ kind: 'fee', name: feeName, unit_price_pence: pricePence })}
                fullWidth
              />
            </>
          )}
          {productsOn && (tab === 'favourites' || tab === 'products' || tab === 'services') ? (
            <Button label={t('add.done')} variant="secondary" onPress={onClose} fullWidth />
          ) : null}
        </View>
      )}
    </PosSheet>
  );
}

// ─── The line editor ────────────────────────────────────────────────────────

const PRICE_REASONS = ['price.reason.longer', 'price.reason.shorter', 'price.reason.match', 'price.reason.correction'] as const;

/** Mounted per line, so each line opens with its own price and nothing left from the last. */
export function LineEditorSheet(props: Omit<Parameters<typeof LineEditorBody>[0], 'line'> & { line: PosSaleLine | null }) {
  return props.line ? <LineEditorBody key={props.line.id} {...props} line={props.line} /> : null;
}

function LineEditorBody({
  line,
  onClose,
  sale,
  bootstrap,
  send,
  editable,
}: {
  line: PosSaleLine;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  /** The sale is open and no card payment is waiting. */
  editable: boolean;
}) {
  const t = usePosT();
  const [price, setPrice] = useState(() => penceToInput(line.unit_price_pence));
  const [reason, setReason] = useState<string | null>(null);
  const [creditTo, setCreditTo] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A product line's quantity (Pass 4, §3.9 `line.qty`); the server checks the stock rules again.
  const [qty, setQty] = useState(line.quantity);
  const canQty = editable && line.line_type === 'product' && !line.paid_by_credit;

  const noPriceYet = line.list_unit_price_pence === 0;
  const canPrice = editable && !line.paid_by_credit && (canPos(bootstrap, 'override_price') || noPriceYet);
  const canCredit = canPos(bootstrap, 'edit_credit') && sale.status !== 'voided';
  const newPrice = parseMoneyInput(price);
  const priceChanged = newPrice != null && newPrice !== line.unit_price_pence;
  const needsReason = priceChanged && !noPriceYet && newPrice !== line.list_unit_price_pence;
  const performerName = line.performer?.name ?? line.seller?.name ?? null;

  async function run(label: string, input: SaleWriteInput) {
    setBusy(label);
    setError(null);
    try {
      await send(input);
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  const reasonText = reason ? t(reason as (typeof PRICE_REASONS)[number]) : '';

  return (
    <PosSheet visible onClose={onClose} title={line.name} subtitle={line.option_name}>
      <View style={posStyles.stack}>
        <Text variant="bodySmall" tone="muted">
          {t('line.price')}: {money(line.unit_price_pence)}
          {line.quantity > 1 ? ` · ${t('line.qtyPrefix', { count: line.quantity })}` : ''}
          {performerName ? ` · ${performerName}` : ''}
        </Text>

        {canQty ? (
          <>
            <Stepper
              label={t('line.qty')}
              value={String(qty)}
              onDecrement={() => setQty((q) => Math.max(1, q - 1))}
              onIncrement={() => setQty((q) => Math.min(999, q + 1))}
            />
            {qty !== line.quantity ? (
              <Button
                label={t('line.save')}
                variant="secondary"
                loading={busy === 'qty'}
                disabled={busy !== null}
                onPress={() =>
                  void run('qty', {
                    action: 'lines',
                    body: { version: sale.version, ops: [{ op: 'update', line_id: line.id, quantity: qty }] },
                  })
                }
                fullWidth
              />
            ) : null}
          </>
        ) : null}

        {canPrice ? (
          <>
            <Input
              label={t('line.price.change')}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              inputMode="decimal"
              helper={t('price.help')}
            />
            {needsReason ? (
              <>
                <Text variant="label">{t('price.reason')}</Text>
                <ChoiceChips
                  options={PRICE_REASONS.map((id) => ({ value: id, label: t(id) }))}
                  value={reason}
                  onChange={setReason}
                />
              </>
            ) : null}
            {line.unit_price_pence !== line.list_unit_price_pence && !noPriceYet ? (
              <Button
                label={t('price.reset')}
                variant="ghost"
                size="sm"
                onPress={() => setPrice(penceToInput(line.list_unit_price_pence))}
              />
            ) : null}
            <Button
              label={t('line.save')}
              loading={busy === 'price'}
              disabled={!priceChanged || (needsReason && !reason) || busy !== null}
              onPress={() =>
                void run('price', {
                  action: 'lines',
                  body: {
                    version: sale.version,
                    ops: [
                      {
                        op: 'update',
                        line_id: line.id,
                        unit_price_pence: newPrice,
                        ...(needsReason ? { price_change_reason: reasonText } : {}),
                      },
                    ],
                  },
                })
              }
              fullWidth
            />
          </>
        ) : editable && !noPriceYet ? (
          <Text variant="caption" tone="muted">
            {t('limit.price')}
          </Text>
        ) : null}

        {canCredit && line.line_type !== 'fee' ? (
          <>
            <Text variant="label">{t('attr.title', { item: line.name })}</Text>
            <Text variant="caption" tone="muted">
              {t('attr.help')}
            </Text>
            <View style={styles.chipWrap}>
              {bootstrap.operators.map((o) => {
                const key = o.calendar_id ?? o.staff_id ?? o.name;
                return (
                  <PickRow
                    key={key}
                    title={o.name}
                    selected={creditTo === key}
                    onPress={() => setCreditTo(key)}
                  />
                );
              })}
            </View>
            {creditTo ? (
              <>
                <Input label={t('attr.reason')} value={creditReason} onChangeText={setCreditReason} maxLength={200} />
                <Button
                  label={t('done.credit.change')}
                  variant="secondary"
                  loading={busy === 'credit'}
                  disabled={!creditReason.trim() || busy !== null}
                  onPress={() => {
                    const person = bootstrap.operators.find((o) => (o.calendar_id ?? o.staff_id ?? o.name) === creditTo);
                    if (!person) return;
                    void run('credit', {
                      action: 'attributions',
                      method: 'PATCH',
                      body: {
                        line_id: line.id,
                        role: line.reporting_group === 'services' ? 'performer' : 'seller',
                        shares: [
                          {
                            ...(person.calendar_id ? { calendar_id: person.calendar_id } : { staff_id: person.staff_id }),
                            share_bps: 10000,
                          },
                        ],
                        reason: creditReason.trim(),
                      },
                    });
                  }}
                  fullWidth
                />
              </>
            ) : null}
          </>
        ) : null}

        {editable ? (
          confirmRemove ? (
            <View style={posStyles.stack}>
              <Text variant="bodyMedium">
                {line.booking_id && !line.walkin_booking
                  ? t('line.remove.bookingConfirm.title', { service: line.name })
                  : line.name}
              </Text>
              <Text variant="bodySmall" tone="muted">
                {line.walkin_booking
                  ? t('line.remove.walkInConfirm.body', { staffName: performerName ?? 'the team member' })
                  : line.booking_id
                    ? t('line.remove.bookingConfirm.body')
                    : ''}
              </Text>
              <Button
                label={line.booking_id && !line.walkin_booking ? t('line.remove.booking') : t('line.remove')}
                variant="danger"
                loading={busy === 'remove'}
                onPress={() =>
                  void run('remove', {
                    action: 'lines',
                    body: { version: sale.version, ops: [{ op: 'remove', line_id: line.id }] },
                  })
                }
                fullWidth
              />
            </View>
          ) : (
            <Button
              label={line.booking_id && !line.walkin_booking ? t('line.remove.booking') : t('line.remove')}
              variant="ghost"
              onPress={() => setConfirmRemove(true)}
              fullWidth
            />
          )
        ) : null}
        <ErrorLine message={error} />
      </View>
    </PosSheet>
  );
}

// ─── Discounts ──────────────────────────────────────────────────────────────

function DiscountSheetBody({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
  lineId,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  lineId: string | null;
}) {
  const t = usePosT();
  const [mode, setMode] = useState<'manual' | 'preset'>('manual');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [freeReason, setFreeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const settings = bootstrap.settings;
  const presets = bootstrap.discount_presets ?? [];
  const reasons = settings.discount_reasons ?? [];
  const isAdmin = bootstrap.role === 'admin';
  const line = lineId ? sale.lines.find((l) => l.id === lineId) ?? null : null;
  const base = discountBasePence(sale, lineId);
  const preset = presets.find((p) => p.id === presetId) ?? null;
  const draftValue =
    mode === 'preset'
      ? preset
        ? preset.kind === 'percent'
          ? (preset.percent_bps ?? 0) / 100
          : preset.amount_pence ?? 0
        : 0
      : kind === 'percent'
        ? Number(value.replace(',', '.')) || 0
        : parseMoneyInput(value) ?? 0;
  const draftKind = mode === 'preset' ? (preset?.kind === 'percent' ? 'percent' : 'amount') : kind;
  const off = discountOffPence({ kind: draftKind, value: draftValue }, base, preset?.max_amount_pence ?? null);
  const limit = settings.staff_max_discount_percent ?? 0;
  const overLimit = !isAdmin && mode === 'manual' && off > 0 && overStaffLimit({ sale, newOffPence: off, limitPercent: limit });
  const chosenReason = reason === '__other' ? freeReason.trim() : reason ?? '';
  const reasonNeeded = settings.discount_reason_required === true || preset?.reason_required === true;

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await send({
        action: 'discounts',
        body: {
          version: sale.version,
          scope: lineId ? 'line' : 'sale',
          ...(lineId ? { line_id: lineId } : {}),
          kind: mode === 'preset' ? 'preset' : kind,
          ...(mode === 'preset' ? { preset_id: presetId } : { value: kind === 'percent' ? draftValue : Math.round(draftValue) }),
          ...(chosenReason ? { reason: chosenReason } : {}),
        },
      });
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={t('disc.title')}
      subtitle={line ? t('disc.scope.line', { item: line.name }) : t('disc.scope.sale')}>
      <View style={posStyles.stack}>
        {presets.length ? (
          <Segmented
            options={[
              { value: 'manual', label: t('disc.tab.manual') },
              { value: 'preset', label: t('disc.tab.preset') },
            ]}
            value={mode}
            onChange={setMode}
          />
        ) : null}
        {mode === 'manual' ? (
          <>
            <ChoiceChips
              options={[
                { value: 'percent', label: t('disc.kind.percent') },
                { value: 'amount', label: t('disc.kind.amount') },
              ]}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setValue('');
              }}
            />
            <Input
              label={kind === 'percent' ? t('disc.kind.percent') : t('disc.kind.amount')}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
          </>
        ) : (
          presets.map((p) => (
            <PickRow
              key={p.id}
              title={p.name}
              detail={p.max_amount_pence ? t('disc.preset.max', { amount: money(p.max_amount_pence) }) : null}
              selected={presetId === p.id}
              onPress={() => setPresetId(p.id)}
            />
          ))
        )}
        {reasons.length || settings.discount_free_text_allowed ? (
          <>
            <Text variant="label">{t('disc.reason')}</Text>
            <ChoiceChips
              options={[
                ...reasons.map((r) => ({ value: r, label: r })),
                ...(settings.discount_free_text_allowed ? [{ value: '__other', label: t('disc.reason.other') }] : []),
              ]}
              value={reason}
              onChange={setReason}
            />
            {reason === '__other' ? (
              <Input label={t('disc.reason')} value={freeReason} onChangeText={setFreeReason} maxLength={200} />
            ) : null}
          </>
        ) : null}
        {off > 0 ? (
          <Text variant="bodyMedium">
            {t('disc.preview', { amount: money(off), total: money(Math.max(0, sale.total_pence - off)) })}
          </Text>
        ) : null}
        {overLimit ? (
          <Text variant="bodySmall" tone="danger">
            {t('limit.discount', { limit })}
          </Text>
        ) : null}
        <ErrorLine message={error} />
        <Button
          label={t('disc.apply')}
          loading={busy}
          disabled={off <= 0 || overLimit || (reasonNeeded && !chosenReason) || (mode === 'preset' && !presetId)}
          onPress={() => void apply()}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

// ─── The client ─────────────────────────────────────────────────────────────

function ClientSheetBody({
  visible,
  onClose,
  sale,
  send,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  send: Send;
}) {
  const t = usePosT();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guests = useGuests({ search, limit: 20 }, { enabled: visible && search.trim().length >= 2 });


  async function setGuest(guestId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await send({ action: '', method: 'PATCH', body: { version: sale.version, guest_id: guestId } });
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const hasBookings = sale.lines.some((l) => l.booking_id);
  // Pass V (§20.4): while account credit is used on the sale, the client stays.
  if (sale.guest && creditLocked(sale)) {
    return (
      <PosSheet visible={visible} onClose={onClose} title={t('client.change')}>
        <Text variant="bodySmall">{t('cpay.clientLocked')}</Text>
      </PosSheet>
    );
  }

  return (
    <PosSheet visible={visible} onClose={onClose} title={sale.guest ? t('client.change') : t('client.title')}>
      <View style={posStyles.stack}>
        {sale.guest && hasBookings ? (
          <Text variant="bodySmall" tone="muted">
            {t('client.changeBooking', { clientName: sale.guest.name })}
          </Text>
        ) : null}
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('client.search')} onClear={() => setSearch('')} />
        {(guests.data?.guests ?? []).map((g) => {
          const name = [g.first_name, g.last_name].filter(Boolean).join(' ').trim() || g.email || g.phone || '';
          return (
            <PickRow
              key={g.id}
              title={name}
              detail={[g.phone, g.email].filter(Boolean).join(' · ') || null}
              selected={sale.guest?.id === g.id}
              onPress={() => void setGuest(g.id)}
            />
          );
        })}
        <ErrorLine message={error} />
        {sale.guest ? (
          <Button label={t('client.remove')} variant="ghost" loading={busy} onPress={() => void setGuest(null)} fullWidth />
        ) : (
          <Button label={t('client.walkIn')} variant="ghost" onPress={onClose} fullWidth />
        )}
      </View>
    </PosSheet>
  );
}

// ─── Who is serving ─────────────────────────────────────────────────────────

export function ServingSheet({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
}) {
  const t = usePosT();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const operators = bootstrap.operators.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function choose(o: PosBootstrap['operators'][number]) {
    setError(null);
    try {
      await send({
        action: '',
        method: 'PATCH',
        body: {
          version: sale.version,
          operator: o.calendar_id ? { calendar_id: o.calendar_id } : { staff_id: o.staff_id },
        },
      });
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    }
  }

  return (
    <PosSheet visible={visible} onClose={onClose} title={t('serving.title')} subtitle={t('serving.help')}>
      <View style={posStyles.stack}>
        {bootstrap.operators.length > 8 ? (
          <SearchBar value={search} onChangeText={setSearch} placeholder={t('serving.search')} onClear={() => setSearch('')} />
        ) : null}
        {operators.map((o) => (
          <PickRow
            key={o.calendar_id ?? o.staff_id ?? o.name}
            title={o.name}
            selected={
              (o.calendar_id != null && o.calendar_id === sale.operator.calendar_id) ||
              (o.staff_id != null && o.staff_id === sale.operator.staff_id)
            }
            onPress={() => void choose(o)}
          />
        ))}
        <ErrorLine message={error} />
      </View>
    </PosSheet>
  );
}

// ─── Park, void and combine ─────────────────────────────────────────────────

export function ParkSheet({
  visible,
  onClose,
  sale,
  send,
  onParked,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  send: Send;
  onParked: () => void;
}) {
  const t = usePosT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <PosSheet visible={visible} onClose={onClose} title={t('park.title')} subtitle={t('park.body')}>
      <View style={posStyles.stack}>
        <Input label={t('park.note')} value={note} onChangeText={setNote} maxLength={200} />
        <ErrorLine message={error} />
        <Button
          label={t('park.confirm')}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await send({ action: 'park', body: { version: sale.version, ...(note.trim() ? { note: note.trim() } : {}) } });
              onParked();
            } catch (e) {
              setError(writeError(e, t));
            } finally {
              setBusy(false);
            }
          }}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

export function VoidSheet({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
}) {
  const t = usePosT();
  const reasons = bootstrap.settings.void_reasons?.length
    ? bootstrap.settings.void_reasons
    : ['Started by mistake', 'Duplicate'];
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBookings = sale.lines.some((l) => l.booking_id && !l.walkin_booking);
  const hasWalkIns = sale.lines.some((l) => l.walkin_booking);
  return (
    <PosSheet visible={visible} onClose={onClose} title={t('void.title', { saleNo: sale.number_label })}>
      <View style={posStyles.stack}>
        <Text variant="bodySmall">{t('void.body')}</Text>
        {hasBookings ? <Text variant="bodySmall">{t('void.bookings')}</Text> : null}
        {hasWalkIns ? <Text variant="bodySmall">{t('void.walkIns')}</Text> : null}
        <Text variant="label">{t('void.reason')}</Text>
        <ChoiceChips options={reasons.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
        <ErrorLine message={error} />
        <Button
          label={t('void.confirm')}
          variant="danger"
          loading={busy}
          disabled={!reason}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await send({ action: 'void', body: { version: sale.version, reason } });
              onClose();
            } catch (e) {
              setError(writeError(e, t));
            } finally {
              setBusy(false);
            }
          }}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

export function CombineSheet({
  visible,
  onClose,
  sale,
  send,
  onCombined,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  send: Send;
  onCombined: (saleId: string) => void;
}) {
  const t = usePosT();
  const open = usePosSaleList({ status: 'open' }, { enabled: visible });
  const [error, setError] = useState<string | null>(null);
  const others = (open.data?.sales ?? []).filter((s) => s.id !== sale.id);
  return (
    <PosSheet visible={visible} onClose={onClose} title={t('attach.title')} subtitle={t('attach.body')}>
      <View style={posStyles.stack}>
        <Text variant="label">{t('attach.sales')}</Text>
        {others.length === 0 && !open.isLoading ? (
          <Text tone="muted">{t('sales.empty.title')}</Text>
        ) : null}
        {others.map((s) => (
          <PickRow
            key={s.id}
            title={`${t('sale.title', { saleNo: s.number_label })} · ${s.client_name ?? t('sales.walkIn')}`}
            detail={`${s.summary} · ${money(s.balance_due_pence)}`}
            onPress={async () => {
              setError(null);
              try {
                const res = await send({ action: 'attach', body: { version: sale.version, sale_id: s.id } });
                onCombined(res.sale?.id ?? sale.id);
              } catch (e) {
                setError(writeError(e, t));
              }
            }}
          />
        ))}
        <ErrorLine message={error} />
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  chipWrap: { gap: spacing.sm },
});

/** Mounted only while open, so every opening starts from a clean form. */
export function AddItemsSheet(props: Parameters<typeof AddItemsSheetBody>[0]) {
  return props.visible ? <AddItemsSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a clean form. */
export function DiscountSheet(props: Parameters<typeof DiscountSheetBody>[0]) {
  return props.visible ? <DiscountSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a clean form. */
export function ClientSheet(props: Parameters<typeof ClientSheetBody>[0]) {
  return props.visible ? <ClientSheetBody {...props} /> : null;
}
