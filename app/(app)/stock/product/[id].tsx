import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ChoiceChips, ErrorLine, money, Notice, PickRow, posStyles, usePosT } from '@/components/pos/parts';
import { CameraScanner, cameraScanAvailable, ScanButton } from '@/components/retail/CameraScanner';
import { AdjustStockSheet, MovementsSheet, type AdjustTarget } from '@/components/retail/StockSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, retailPaths } from '@/lib/pos/api';
import type { PosCopyId } from '@/lib/pos/copy';
import { canPos, isTrackStockOn } from '@/lib/pos/pos-enabled';
import { detectSymbology } from '@/lib/retail/barcode';
import {
  barcodeError,
  buildProductBody,
  draftFromProduct,
  liveOptions,
  newOption,
  sameDraft,
  serverFieldErrors,
  type FieldErrors,
  type OptionDraft,
  type ProductDraft,
} from '@/lib/retail/product-editor';
import { productLabel } from '@/lib/retail/stock-words';
import { pickVenueImage } from '@/lib/queries/useVenueImageUpload';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import {
  ProductStaleError,
  removeProductPhoto,
  uploadProductPhoto,
  useArchiveProduct,
  useDeleteProduct,
  useRetailNamed,
  useRetailProduct,
  useSaveProduct,
} from '@/lib/queries/useRetail';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap } from '@/types/pos';
import type { ProductPhoto, ProductUsage, RetailProduct, TaxCategory } from '@/types/retail';

/**
 * One product in the app, or a new one at `/stock/product/new` (POS app step 4, POS plan P7-12; UX
 * spec §6.2, §6.3, §13.6).
 *
 * With `manage_products`: the name, brand and category, how it is used, "Not sold online" and "Age
 * restricted (18+)", the VAT category (VAT registered venues), photos from the library or the
 * camera (expo-image-picker, already in the app), and its options with price, SKU, barcodes (typed,
 * or by a keyboard-mode scanner into the field), and with Track stock on, cost, counting stock,
 * reorder level and quantity and a new option's starting count. Saved once per tap
 * (`client_request_id` on create, `version` on edit; a 412 loads the other person's changes).
 * Archive, unarchive, and delete for a product with no history. The rest of a product (description,
 * sizes, supplier, manufacturer details) stays on the web, and an edit here leaves it as it is.
 *
 * Every login sees the product and, with Track stock on, each option's stock with History, and
 * Adjust with `adjust_stock`.
 */

const VAT_IDS: { value: TaxCategory; id: PosCopyId }[] = [
  { value: 'standard', id: 'vat.rate.standard' },
  { value: 'reduced', id: 'vat.rate.reduced' },
  { value: 'zero', id: 'vat.rate.zero' },
  { value: 'exempt', id: 'vat.rate.exempt' },
];

const PHOTO_LIMIT = 8;

export default function ProductScreen() {
  const t = usePosT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = typeof id === 'string' && id !== 'new' ? id : null;
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const productQ = useRetailProduct(productId);
  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header(t('prod.title'))}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (boot.isLoading || (productId && productQ.isLoading)) {
    return (
      <Screen padded={false}>
        {header(t('prod.title'))}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (productId && productQ.error instanceof ApiError && productQ.error.status === 404) {
    return (
      <Screen>
        {header(t('prod.title'))}
        <EmptyState title={t('prod.title')} message={t('x.notFound')} />
      </Screen>
    );
  }
  if (!boot.data || (productId && !productQ.data)) {
    const err = productQ.error ?? boot.error;
    return (
      <Screen>
        {header(t('prod.title'))}
        <ErrorState
          message={posErrorMessage(err, t('prod.error'))}
          onRetry={() => {
            void boot.refetch();
            void productQ.refetch();
          }}
        />
      </Screen>
    );
  }
  const product = productQ.data?.product ?? null;
  const canEdit = canPos(boot.data, 'manage_products') && (productQ.data?.can_edit ?? true);
  return (
    <>
      {header(product ? product.name : t('x.addTitle'))}
      {canEdit ? (
        <ProductEditor product={product} bootstrap={boot.data} />
      ) : product ? (
        <ProductReadOnly product={product} bootstrap={boot.data} />
      ) : (
        <Screen>
          <Text tone="muted">{t('prod.readOnly')}</Text>
        </Screen>
      )}
    </>
  );
}

// ─── Read only ──────────────────────────────────────────────────────────────

function ProductReadOnly({ product, bootstrap }: { product: RetailProduct; bootstrap: PosBootstrap }) {
  const t = usePosT();
  const trackStock = isTrackStockOn(bootstrap);
  return (
    <Screen scroll={false} padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="bodySmall" tone="muted">
          {t('prod.readOnly')}
        </Text>
        {product.archived_at ? <Notice tone="warning">{t('x.archivedNote')}</Notice> : null}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="heading">{product.name}</Text>
            <Text variant="caption" tone="muted">
              {[product.brand_name, product.category_name].filter(Boolean).join(' · ')}
            </Text>
            {product.variants
              .filter((v) => !v.archived_at)
              .map((v) => (
                <View key={v.id} style={posStyles.row}>
                  <Text variant="bodySmall" style={styles.flex}>
                    {v.option_name ?? product.name}
                    {v.sku ? ` · ${v.sku}` : ''}
                  </Text>
                  <Text variant="bodyMedium">{money(v.price_pence)}</Text>
                </View>
              ))}
          </View>
        </Card>
        {trackStock ? <StockSection product={product} bootstrap={bootstrap} /> : null}
      </ScrollView>
    </Screen>
  );
}

// ─── Stock per option ───────────────────────────────────────────────────────

function StockSection({ product, bootstrap }: { product: RetailProduct; bootstrap: PosBootstrap }) {
  const t = usePosT();
  const canAdjust = canPos(bootstrap, 'adjust_stock');
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [history, setHistory] = useState<{ variantId?: string; productId?: string; label: string } | null>(null);
  const live = product.variants.filter((v) => !v.archived_at);
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('x.stock')}</Text>
        {live.map((v) => {
          const label = productLabel(product.name, v.option_name);
          return (
            <View key={v.id} style={posStyles.stack}>
              {live.length > 1 ? <Text variant="bodyMedium">{v.option_name ?? product.name}</Text> : null}
              {v.track_stock ? (
                <>
                  <Text variant="bodySmall">
                    {t('app.stock.stockSection', { onHand: v.on_hand, available: v.on_hand - v.reserved })}
                  </Text>
                  <View style={styles.actions}>
                    {canAdjust && !product.archived_at ? (
                      <Button
                        label={t('stock.adjust')}
                        size="sm"
                        variant="secondary"
                        onPress={() => setAdjusting({ variantId: v.id, label, onHand: v.on_hand })}
                      />
                    ) : null}
                    <Button label={t('stock.history')} size="sm" variant="ghost" onPress={() => setHistory({ variantId: v.id, label })} />
                  </View>
                </>
              ) : (
                <Text variant="caption" tone="muted">
                  {t('prod.stock.notTracked')}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      <AdjustStockSheet target={adjusting} onClose={() => setAdjusting(null)} />
      <MovementsSheet target={history} timeZone={timeZone} onClose={() => setHistory(null)} />
    </Card>
  );
}

// ─── The editor ─────────────────────────────────────────────────────────────

function ProductEditor({ product, bootstrap }: { product: RetailProduct | null; bootstrap: PosBootstrap }) {
  const t = usePosT();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const accessToken = useAccessToken();
  const trackStock = isTrackStockOn(bootstrap);
  const vatRegistered = bootstrap.tax_settings?.vat_registered === true;
  const ctx = useMemo(() => ({ trackStock, vatRegistered }), [trackStock, vatRegistered]);
  const words = useMemo(
    () => ({
      nameRequired: t('x.name.required'),
      priceInvalid: t('x.price.invalid'),
      numberInvalid: t('x.number.invalid'),
      needOption: t('x.needOption'),
      barcodeInvalid: t('var.barcode.invalid'),
    }),
    [t],
  );
  const brands = useRetailNamed('brands');
  const categories = useRetailNamed('categories');
  const save = useSaveProduct();
  const archive = useArchiveProduct();
  const del = useDeleteProduct();

  const [initial, setInitial] = useState<ProductDraft>(() => draftFromProduct(product, trackStock));
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [version, setVersion] = useState(product?.version ?? 0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const [photos, setPhotos] = useState<ProductPhoto[]>(product?.photos ?? []);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const requestId = useRef(newPaymentAttemptId());
  const leavingOk = useRef(false);
  const dirty = !sameDraft(draft, initial);

  // A fresh read of the product (after a save here, a photo, or someone else's change) resets the
  // form when nothing is being edited; otherwise only the version and photos follow it.
  const productKey = product ? `${product.id}:${product.version}` : '';
  const [seenKey, setSeenKey] = useState(productKey);
  if (product && productKey !== seenKey) {
    setSeenKey(productKey);
    setPhotos(product.photos);
    if (!dirty) {
      const next = draftFromProduct(product, trackStock);
      setInitial(next);
      setDraft(next);
      setVersion(product.version);
    }
  }

  // The unsaved-changes guard (§6.2 `common.unsaved`).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leavingOk.current) return;
      e.preventDefault();
      setLeaving(e.data.action);
    });
    return unsubscribe;
  }, [navigation, dirty]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setOption = (key: string, patch: Partial<OptionDraft>) =>
    setDraft((d) => ({ ...d, options: d.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));

  async function onSave() {
    setFormError(null);
    setNotice(null);
    const built = buildProductBody(draft, product, ctx, words);
    if (!built.ok) {
      setErrors(built.errors);
      setFormError(t('x.fixFields'));
      return;
    }
    setErrors({});
    try {
      const saved = await save.mutateAsync(
        product
          ? { kind: 'update', productId: product.id, version, body: built.body }
          : { kind: 'create', body: built.body, clientRequestId: requestId.current },
      );
      const next = draftFromProduct(saved, trackStock);
      setInitial(next);
      setDraft(next);
      setVersion(saved.version);
      setPhotos(saved.photos);
      toast.success(t('prod.saved'));
      if (!product) {
        leavingOk.current = true;
        router.replace(`/stock/product/${saved.id}` as Href);
      }
    } catch (e) {
      if (e instanceof ProductStaleError) {
        if (e.product) {
          const next = draftFromProduct(e.product, trackStock);
          setInitial(next);
          setDraft(next);
          setVersion(e.product.version);
          setPhotos(e.product.photos);
        }
        setNotice(e.message);
        return;
      }
      if (e instanceof ApiError) setErrors(serverFieldErrors(e.body, built.variantKeys));
      setFormError(posErrorMessage(e, t('common.saveError')));
    }
  }

  async function addPhoto(source: 'library' | 'camera') {
    if (!product || !accessToken) return;
    setPhotoError(null);
    let file: { uri: string; mimeType: string } | null = null;
    try {
      if (source === 'library') {
        file = await pickVenueImage();
      } else {
        // Asked first on both platforms: iOS needs it, and Android refuses the camera to an app that
        // declares the CAMERA permission without holding it.
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('app.photo.denied'));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
        const asset = result.canceled ? null : result.assets?.[0];
        file = asset?.uri ? { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' } : null;
      }
    } catch {
      setPhotoError(t('prod.photos.failed'));
      return;
    }
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhotos(await uploadProductPhoto(accessToken, product.id, file));
      // The photos changed the product's version: follow it, so a save here is not refused.
      await followVersion();
    } catch (e) {
      setPhotoError(posErrorMessage(e, t('prod.photos.failed')));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(index: number) {
    if (!product || !accessToken) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      setPhotos(await removeProductPhoto(accessToken, product.id, index));
      await followVersion();
    } catch (e) {
      setPhotoError(posErrorMessage(e, t('common.saveError')));
    } finally {
      setPhotoBusy(false);
    }
  }

  /** After a photo change, take the product's new version without dropping what is being typed. */
  async function followVersion() {
    if (!product || !accessToken) return;
    try {
      const fresh = await posFetch<{ product: RetailProduct }>(retailPaths.product(product.id), { accessToken });
      setVersion(fresh.product.version);
      setPhotos(fresh.product.photos);
    } catch {
      // The next read of the product catches up.
    }
  }

  async function onArchive(archived: boolean) {
    if (!product) return;
    setFormError(null);
    try {
      const saved = await archive.mutateAsync({ productId: product.id, version, archived });
      setVersion(saved.version);
      toast.success(archived ? t('x.archived') : t('x.unarchived'));
      setConfirm(null);
    } catch (e) {
      setConfirm(null);
      setFormError(posErrorMessage(e, t('common.saveError')));
    }
  }

  async function onDelete() {
    if (!product) return;
    setFormError(null);
    try {
      const res = await del.mutateAsync(product.id);
      setConfirm(null);
      toast.success(res.deleted ? t('x.deleted') : t('x.archived'));
      leavingOk.current = true;
      router.back();
    } catch (e) {
      setConfirm(null);
      setFormError(posErrorMessage(e, t('common.saveError')));
    }
  }

  const live = liveOptions(draft);
  const defaultVat = bootstrap.tax_settings?.default_product_tax_category ?? 'standard';
  const defaultVatWords = t(VAT_IDS.find((v) => v.value === defaultVat)?.id ?? 'vat.rate.standard');

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {product?.archived_at ? <Notice tone="warning">{t('x.archivedNote')}</Notice> : null}
        {notice ? <Notice tone="warning">{notice}</Notice> : null}

        {/* Basics */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.basics')}</Text>
            <Input label={t('prod.f.name')} value={draft.name} onChangeText={(v) => set('name', v)} maxLength={120} error={errors.name} />
            <NamedPicker
              label={t('prod.f.brand')}
              none={t('x.noBrand')}
              items={brands.data ?? []}
              value={draft.brand_id}
              onChange={(v) => set('brand_id', v)}
            />
            <NamedPicker
              label={t('prod.f.category')}
              none={t('x.noCategory')}
              items={categories.data ?? []}
              value={draft.category_id}
              onChange={(v) => set('category_id', v)}
            />
          </View>
        </Card>

        {/* Photos */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.photos')}</Text>
            {!product ? (
              <Text variant="caption" tone="muted">
                {t('x.photosAfterSave')}
              </Text>
            ) : (
              <>
                {photos.length ? (
                  <ScrollView horizontal contentContainerStyle={styles.photoRow} showsHorizontalScrollIndicator={false}>
                    {photos.map((p, i) => (
                      <PhotoThumb
                        key={p.path}
                        photo={p}
                        main={i === 0}
                        disabled={photoBusy}
                        onRemove={() => void removePhoto(i)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {photoBusy ? (
                  <Text variant="caption" tone="muted">
                    {t('x.photosUploading')}
                  </Text>
                ) : null}
                {photos.length >= PHOTO_LIMIT ? (
                  <Text variant="caption" tone="muted">
                    {t('prod.photos.limit')}
                  </Text>
                ) : (
                  <View style={styles.actions}>
                    <Button label={t('app.photo.library')} size="sm" variant="secondary" disabled={photoBusy} onPress={() => void addPhoto('library')} />
                    <Button label={t('app.photo.camera')} size="sm" variant="secondary" disabled={photoBusy} onPress={() => void addPhoto('camera')} />
                  </View>
                )}
                <ErrorLine message={photoError} />
              </>
            )}
          </View>
        </Card>

        {/* How you use it, and restrictions */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('prod.f.use')}</Text>
            <ChoiceChips<ProductUsage>
              options={[
                { value: 'retail', label: t('prod.use.retail') },
                { value: 'professional', label: t('prod.use.professional') },
                { value: 'both', label: t('prod.use.both') },
              ]}
              value={draft.usage}
              onChange={(v) => set('usage', v)}
            />
            <SwitchRow label={t('prod.f.soldInStore')} value={draft.sold_in_store} onChange={(v) => set('sold_in_store', v)} />
            <Text variant="label">{t('x.restrictions')}</Text>
            <SwitchRow
              label={t('prod.f.notOnline')}
              help={t('prod.f.notOnline.help')}
              value={draft.not_online}
              onChange={(v) => set('not_online', v)}
            />
            <SwitchRow label={t('prod.f.age18')} help={t('prod.f.age18.help')} value={draft.age18} onChange={(v) => set('age18', v)} />
          </View>
        </Card>

        {vatRegistered ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('prod.f.vat')}</Text>
              <ChoiceChips<'' | TaxCategory>
                options={[
                  { value: '', label: t('prod.vat.default', { rate: defaultVatWords }) },
                  ...VAT_IDS.map((v) => ({ value: v.value, label: t(v.id) })),
                ]}
                value={draft.tax_category}
                onChange={(v) => set('tax_category', v)}
              />
            </View>
          </Card>
        ) : null}

        {/* Options */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.options')}</Text>
            <SwitchRow
              label={t('var.makeOptions')}
              value={draft.multi}
              onChange={(v) => {
                if (!v && live.length > 1) return;
                set('multi', v);
              }}
            />
            {draft.options.map((o, index) =>
              o.archived ? null : (
                <OptionEditor
                  key={o.key}
                  option={o}
                  index={index}
                  multi={draft.multi}
                  trackStock={trackStock}
                  errors={errors}
                  canRemove={draft.multi && live.length > 1}
                  onChange={(patch) => setOption(o.key, patch)}
                  onRemove={() =>
                    o.id
                      ? setOption(o.key, { archived: true })
                      : setDraft((d) => ({ ...d, options: d.options.filter((x) => x.key !== o.key) }))
                  }
                />
              ),
            )}
            <ErrorLine message={errors.options} />
            {draft.multi ? (
              <Button
                label={t('var.add')}
                variant="secondary"
                onPress={() => setDraft((d) => ({ ...d, options: [...d.options, newOption(trackStock)] }))}
                fullWidth
              />
            ) : null}
          </View>
        </Card>

        {product && trackStock ? <StockSection product={product} bootstrap={bootstrap} /> : null}

        <ErrorLine message={formError} />
        <Button label={t('prod.save')} loading={save.isPending} disabled={product ? !dirty : false} onPress={() => void onSave()} fullWidth />
        {product ? (
          <View style={posStyles.buttons}>
            {product.archived_at ? (
              <Button label={t('prod.unarchive')} variant="secondary" loading={archive.isPending} onPress={() => void onArchive(false)} fullWidth />
            ) : (
              <Button label={t('prod.archive')} variant="ghost" onPress={() => setConfirm('archive')} fullWidth />
            )}
            {product.can_delete ? (
              <Button label={t('prod.delete')} variant="ghost" onPress={() => setConfirm('delete')} fullWidth />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <ConfirmSheet
        visible={confirm === 'archive'}
        title={t('prod.archive.title', { product: product?.name ?? '' })}
        message={t('prod.archive.body')}
        confirmLabel={t('prod.archive')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        loading={archive.isPending}
        onConfirm={() => void onArchive(true)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === 'delete'}
        title={t('prod.delete.title', { product: product?.name ?? '' })}
        message={t('prod.delete.body')}
        confirmLabel={t('prod.delete')}
        cancelLabel={t('common.cancel')}
        loading={del.isPending}
        onConfirm={() => void onDelete()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={leaving !== null}
        title={t('common.unsaved')}
        confirmLabel={t('x.leave')}
        cancelLabel={t('x.stay')}
        onConfirm={() => {
          const action = leaving;
          setLeaving(null);
          leavingOk.current = true;
          if (action) navigation.dispatch(action);
        }}
        onClose={() => setLeaving(null)}
      />
    </Screen>
  );
}

function NamedPicker({
  label,
  none,
  items,
  value,
  onChange,
}: {
  label: string;
  none: string;
  items: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (items.length === 0 && !value) return null;
  return (
    <View style={posStyles.stack}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <ChoiceChips
        options={[{ value: '', label: none }, ...items.map((i) => ({ value: i.id, label: i.name }))]}
        value={value ?? ''}
        onChange={(v) => onChange(v || null)}
      />
    </View>
  );
}

function SwitchRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={posStyles.row}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{label}</Text>
        {help ? (
          <Text variant="caption" tone="muted">
            {help}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function PhotoThumb({ photo, main, disabled, onRemove }: { photo: ProductPhoto; main: boolean; disabled: boolean; onRemove: () => void }) {
  const t = usePosT();
  const { colors } = useTheme();
  return (
    <View style={styles.photo}>
      <Image source={{ uri: photo.url }} style={[styles.photoImage, { borderColor: colors.border }]} contentFit="cover" />
      {main ? <Badge label={t('prod.photos.main')} /> : null}
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('prod.photos.remove')}
        hitSlop={8}>
        <Text variant="caption" tone="danger">
          {t('prod.photos.remove')}
        </Text>
      </Pressable>
    </View>
  );
}

function OptionEditor({
  option,
  index,
  multi,
  trackStock,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  option: OptionDraft;
  index: number;
  multi: boolean;
  trackStock: boolean;
  errors: FieldErrors;
  canRemove: boolean;
  onChange: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const err = (field: string) => errors[`opt.${option.key}.${field}`];

  function addBarcode(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (option.barcodes.some((b) => b.barcode === value)) {
      setCode('');
      return;
    }
    const b = { barcode: value, symbology: detectSymbology(value) };
    const problem = barcodeError(b, { barcodeInvalid: t('var.barcode.invalid') });
    if (problem) {
      setCodeError(problem);
      return;
    }
    setCodeError(null);
    setCode('');
    onChange({ barcodes: [...option.barcodes, b] });
  }

  return (
    <View style={[styles.option, multi ? { borderColor: colors.border } : styles.optionFlat]}>
      {multi ? (
        <Input
          label={t('var.option')}
          placeholder={t('x.option.n', { n: index + 1 })}
          value={option.option_name}
          onChangeText={(v) => onChange({ option_name: v })}
          maxLength={80}
        />
      ) : null}
      <Input
        label={t('var.price')}
        value={option.price}
        onChangeText={(v) => onChange({ price: v })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={err('price')}
      />
      <Input
        label={t('var.sku')}
        helper={t('var.sku.help')}
        value={option.sku}
        onChangeText={(v) => onChange({ sku: v })}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={64}
        error={err('sku')}
      />
      <Text variant="bodySmall" tone="muted">
        {t('var.barcodes')}
      </Text>
      {option.barcodes.map((b) => (
        <PickRow
          key={b.barcode}
          title={b.barcode}
          detail={t('x.removeBarcode', { barcode: b.barcode })}
          onPress={() => onChange({ barcodes: option.barcodes.filter((x) => x.barcode !== b.barcode) })}
        />
      ))}
      <Input
        label={t('var.barcode.add')}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setCodeError(null);
        }}
        // A keyboard-mode scanner types the code and presses Enter.
        onSubmitEditing={() => addBarcode(code)}
        submitBehavior="submit"
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        error={codeError ?? err('barcodes')}
        rightSlot={
          code.trim() ? (
            <Button label={t('var.barcode.add')} size="sm" variant="ghost" onPress={() => addBarcode(code)} />
          ) : cameraScanAvailable ? (
            <ScanButton onPress={() => setCamera(true)} />
          ) : undefined
        }
      />
      <CameraScanner visible={camera} onClose={() => setCamera(false)} onScan={(scanned) => addBarcode(scanned)} />
      {trackStock ? (
        <>
          <Input
            label={t('var.cost')}
            helper={t('var.cost.help')}
            value={option.cost}
            onChangeText={(v) => onChange({ cost: v })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={err('cost')}
          />
          <View style={posStyles.row}>
            <Text variant="bodyMedium" style={styles.flex}>
              {t('var.track')}
            </Text>
            <Switch value={option.track_stock} onValueChange={(v) => onChange({ track_stock: v })} accessibilityLabel={t('var.track')} />
          </View>
          {option.track_stock ? (
            <>
              <Input
                label={t('var.reorderLevel')}
                helper={t('var.reorderLevel.help')}
                value={option.reorder_level}
                onChangeText={(v) => onChange({ reorder_level: v })}
                keyboardType="number-pad"
                error={err('reorder_level')}
              />
              <Input
                label={t('var.reorderQty')}
                value={option.reorder_quantity}
                onChangeText={(v) => onChange({ reorder_quantity: v })}
                keyboardType="number-pad"
                error={err('reorder_quantity')}
              />
              {!option.id ? (
                <Input
                  label={t('x.opening')}
                  helper={t('x.opening.help')}
                  value={option.opening_quantity}
                  onChangeText={(v) => onChange({ opening_quantity: v })}
                  keyboardType="number-pad"
                  error={err('opening_quantity')}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {canRemove ? (
        <Button label={option.id ? t('var.archive') : t('x.option.remove')} variant="ghost" size="sm" onPress={onRemove} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoRow: { gap: spacing.sm },
  photo: { width: 96, gap: spacing.xs, alignItems: 'flex-start' },
  photoImage: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1 },
  option: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  optionFlat: { borderWidth: 0, padding: 0 },
});
