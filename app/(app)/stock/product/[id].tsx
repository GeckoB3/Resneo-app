import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorLine, money, Notice, PickRow, posStyles } from '@/components/pos/parts';
import { CameraScanner, cameraScanAvailable, ScanButton } from '@/components/retail/CameraScanner';
import { AdjustStockSheet, MovementsSheet, type AdjustTarget } from '@/components/retail/StockSheets';
import { SwitchRow } from '@/components/retail/setup-parts';
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
import { canPos, isTrackStockOn } from '@/lib/pos/pos-enabled';
import { parseMoneyInput } from '@/lib/pos/sale-math';
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
import { isPosAdmin } from '@/lib/retail/stock-access';
import { dismissStockPrompt, isStockPromptDismissed } from '@/lib/retail/stock-prompt-store';
import { useStockT, type StockCopyId } from '@/lib/retail/stock-setup-copy';
import { productLabel } from '@/lib/retail/stock-words';
import { asJurisdiction, formatUnitPrice, unitPrice, type Jurisdiction } from '@/lib/retail/unit-price';
import { pickVenueImage } from '@/lib/queries/useVenueImageUpload';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import {
  ProductStaleError,
  removeProductPhoto,
  uploadProductPhoto,
  useArchiveProduct,
  useDeleteProduct,
  useRetailProduct,
  useSaveProduct,
} from '@/lib/queries/useRetail';
import { countProducts, useAddNamed, useNamedList, useTurnOnTrackStock } from '@/lib/queries/useStockSetup';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap } from '@/types/pos';
import type { NetUnit, ProductPhoto, ProductUsage, RetailNamedItem, RetailProduct, TaxCategory } from '@/types/retail';

/**
 * One product in the app, or a new one at `/stock/product/new` (UX spec §6.2, §6.3), with every
 * field of the web's `ProductEditor.tsx` (2026-10-09 parity): the name, brand and category (each
 * with "Add as a new one"), the description, photos, how it is used, "Sell it at the till",
 * "Sealed for hygiene reasons", "This is make-up" (where the venue's unit price rules have a
 * make-up basis), "Not sold online", "Age restricted (18+)", the manufacturer's details, the VAT
 * category (VAT registered venues), the supplier (Track stock on), and its options with price,
 * size and unit (with the unit price preview), SKU, barcodes, and with Track stock on cost,
 * counting, reorder level and quantity, order up to, pack size and a new option's starting count.
 *
 * Saved once per tap (`client_request_id` on create, `version` on edit; a 412 loads the other
 * person's changes). Archive, unarchive, and delete for a product with no history (anything else
 * is archived instead, and the screen says so). The first product an admin saves while Track stock
 * is off offers to count stock (`?first=1`, "Not now" remembered on this phone).
 *
 * Without `manage_products` the same fields show read only, as on the web. With Track stock on,
 * each counted option shows its stock with History, and Adjust with `adjust_stock`.
 */

const VAT_IDS: { value: TaxCategory; id: StockCopyId }[] = [
  { value: 'standard', id: 'vat.rate.standard' },
  { value: 'reduced', id: 'vat.rate.reduced' },
  { value: 'zero', id: 'vat.rate.zero' },
  { value: 'exempt', id: 'vat.rate.exempt' },
];

const UNITS: NetUnit[] = ['ml', 'l', 'g', 'kg', 'item'];
const PHOTO_LIMIT = 8;
const OPTION_LIMIT = 100;

export default function ProductScreen() {
  const t = useStockT();
  const { id, first } = useLocalSearchParams<{ id: string; first?: string }>();
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
      <ProductEditor
        key={product?.id ?? 'new'}
        product={product}
        bootstrap={boot.data}
        readOnly={!canEdit}
        firstProduct={first === '1'}
      />
    </>
  );
}

// ─── The first-product prompt ───────────────────────────────────────────────

function StockPrompt() {
  const t = useStockT();
  const turnOn = useTurnOnTrackStock();
  const [hidden, setHidden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void isStockPromptDismissed().then((dismissed) => {
      if (live) setHidden(dismissed);
    });
    return () => {
      live = false;
    };
  }, []);
  if (hidden) return null;
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="subheading">{t('feat.stock.prompt.title')}</Text>
        <Text variant="bodySmall">{t('feat.stock.prompt.body')}</Text>
        <ErrorLine message={error} />
        <Button
          label={t('feat.stock.prompt.yes')}
          loading={turnOn.isPending}
          onPress={async () => {
            setError(null);
            try {
              await turnOn.mutateAsync();
              setHidden(true);
            } catch (e) {
              setError(posErrorMessage(e, t('x.promptFailed')));
            }
          }}
          fullWidth
        />
        <Button
          label={t('feat.stock.prompt.no')}
          variant="ghost"
          disabled={turnOn.isPending}
          onPress={() => {
            dismissStockPrompt();
            setHidden(true);
          }}
          fullWidth
        />
      </View>
    </Card>
  );
}

// ─── Stock per option ───────────────────────────────────────────────────────

function StockSection({ product, bootstrap }: { product: RetailProduct; bootstrap: PosBootstrap }) {
  const t = useStockT();
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
            <View key={v.id} style={styles.group}>
              <Text variant="bodyMedium">{v.option_name || product.name}</Text>
              {v.track_stock ? (
                <>
                  <Text variant="bodySmall">{`${t('x.stock.onHand')}: ${v.on_hand} · ${t('x.stock.reserved')}: ${v.reserved}`}</Text>
                  <View style={styles.actions}>
                    <Button label={t('stock.history')} size="sm" variant="secondary" onPress={() => setHistory({ variantId: v.id, label })} />
                    {canAdjust && !product.archived_at ? (
                      <Button
                        label={t('stock.adjust')}
                        size="sm"
                        variant="secondary"
                        onPress={() => setAdjusting({ variantId: v.id, label, onHand: v.on_hand })}
                      />
                    ) : null}
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

function ProductEditor({
  product,
  bootstrap,
  readOnly,
  firstProduct,
}: {
  product: RetailProduct | null;
  bootstrap: PosBootstrap;
  readOnly: boolean;
  firstProduct: boolean;
}) {
  const t = useStockT();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const accessToken = useAccessToken();
  const trackStock = isTrackStockOn(bootstrap);
  const vatRegistered = bootstrap.tax_settings?.vat_registered === true;
  const jurisdiction = asJurisdiction(bootstrap.tax_settings?.jurisdiction);
  const isAdmin = isPosAdmin(bootstrap);
  const ctx = useMemo(() => ({ trackStock, vatRegistered, jurisdiction }), [trackStock, vatRegistered, jurisdiction]);
  const words = useMemo(
    () => ({
      nameRequired: t('x.name.required'),
      priceInvalid: t('x.price.invalid'),
      numberInvalid: t('x.number.invalid'),
      needOption: t('x.needOption'),
      barcodeInvalid: t('var.barcode.invalid'),
      sizeInvalid: t('x.size.invalid'),
      sizeUnit: t('x.size.unit'),
    }),
    [t],
  );
  const brands = useNamedList('brands');
  const categories = useNamedList('categories');
  const suppliers = useNamedList('suppliers', { enabled: trackStock });
  const addNamed = useAddNamed();
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
  const dirty = !readOnly && !sameDraft(draft, initial);

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

  async function addName(kind: 'brands' | 'categories' | 'suppliers', name: string): Promise<RetailNamedItem | null> {
    setFormError(null);
    try {
      return await addNamed.mutateAsync({ kind, name });
    } catch (e) {
      setFormError(posErrorMessage(e, t('common.networkError')));
      return null;
    }
  }

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
        // The first product an admin saves while Track stock is off offers to count stock (§6.2).
        let isFirst = false;
        if (isAdmin && !trackStock && accessToken) {
          try {
            isFirst = (await countProducts(accessToken)) === 1;
          } catch {
            isFirst = false;
          }
        }
        leavingOk.current = true;
        router.replace(`/stock/product/${saved.id}${isFirst ? '?first=1' : ''}` as Href);
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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)) {
      setPhotoError(t('prod.photos.wrongType'));
      return;
    }
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
      if (res.deleted) {
        toast.success(t('x.deleted'));
        leavingOk.current = true;
        router.back();
        return;
      }
      // It has a history, so the server archived it instead: the product stays on screen.
      toast.success(t('x.archived'));
    } catch (e) {
      setConfirm(null);
      setFormError(posErrorMessage(e, t('common.saveError')));
    }
  }

  const live = liveOptions(draft);
  const archiving = draft.options.filter((o) => o.archived);
  const defaultVat = bootstrap.tax_settings?.default_product_tax_category ?? 'standard';
  const defaultVatId = VAT_IDS.find((v) => v.value === defaultVat)?.id;
  const defaultVatWords = defaultVatId ? t(defaultVatId) : defaultVat;
  const flagged = draft.age18;
  const basis = jurisdiction === 'ni' && draft.makeup ? 'makeup' : 'standard';

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {firstProduct && isAdmin && !trackStock && product ? <StockPrompt /> : null}
        {readOnly ? (
          <Text variant="bodySmall" tone="muted">
            {t('prod.readOnly')}
          </Text>
        ) : null}
        {product?.archived_at ? <Notice tone="warning">{t('x.archivedNote')}</Notice> : null}
        {notice ? <Notice tone="warning">{notice}</Notice> : null}

        {/* Basics */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.basics')}</Text>
            <Input
              label={t('prod.f.name')}
              accessibilityLabel={t('prod.f.name')}
              value={draft.name}
              onChangeText={(v) => set('name', v)}
              maxLength={120}
              error={errors.name}
              editable={!readOnly}
            />
            <NamedPicker
              label={t('prod.f.brand')}
              none={t('x.noBrand')}
              items={brands.data ?? []}
              value={draft.brand_id}
              readOnly={readOnly}
              addLabel={(name) => t('prod.f.brand.add', { name })}
              adding={addNamed.isPending && addNamed.variables?.kind === 'brands'}
              onAdd={async (name) => {
                const item = await addName('brands', name);
                if (item) set('brand_id', item.id);
              }}
              onChange={(v) => set('brand_id', v)}
              error={errors.brand_id}
            />
            <NamedPicker
              label={t('prod.f.category')}
              none={t('x.noCategory')}
              items={categories.data ?? []}
              value={draft.category_id}
              readOnly={readOnly}
              addLabel={(name) => t('prod.f.category.add', { name })}
              adding={addNamed.isPending && addNamed.variables?.kind === 'categories'}
              onAdd={async (name) => {
                const item = await addName('categories', name);
                if (item) set('category_id', item.id);
              }}
              onChange={(v) => set('category_id', v)}
              error={errors.category_id}
            />
            <Input
              label={t('prod.f.description')}
              accessibilityLabel={t('prod.f.description')}
              helper={t('prod.f.description.help')}
              value={draft.description}
              onChangeText={(v) => set('description', v)}
              maxLength={4000}
              multiline
              error={errors.description}
              editable={!readOnly}
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
                        alt={t('x.photoAlt', { product: draft.name })}
                        disabled={photoBusy}
                        readOnly={readOnly}
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
                {readOnly ? null : photos.length >= PHOTO_LIMIT ? (
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

        {/* How you use it */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.use')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('prod.f.use')}
            </Text>
            {readOnly ? (
              <Text>{t(`prod.use.${draft.usage}` as StockCopyId)}</Text>
            ) : (
              <ChoiceChips<ProductUsage>
                options={[
                  { value: 'retail', label: t('prod.use.retail') },
                  { value: 'professional', label: t('prod.use.professional') },
                  { value: 'both', label: t('prod.use.both') },
                ]}
                value={draft.usage}
                onChange={(v) => set('usage', v)}
              />
            )}
            <SwitchRow label={t('prod.f.soldInStore')} value={draft.sold_in_store} disabled={readOnly} onChange={(v) => set('sold_in_store', v)} />
            <SwitchRow
              label={t('prod.f.hygiene')}
              help={t('prod.f.hygiene.help')}
              value={draft.hygiene_sealed}
              disabled={readOnly}
              onChange={(v) => set('hygiene_sealed', v)}
            />
            {jurisdiction === 'ni' ? (
              <SwitchRow
                label={t('prod.f.makeUp')}
                help={t('prod.f.makeUp.help')}
                value={draft.makeup}
                disabled={readOnly}
                onChange={(v) => set('makeup', v)}
              />
            ) : null}
          </View>
        </Card>

        {/* Restrictions and product details */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.restrictions')}</Text>
            <SwitchRow
              label={t('prod.f.notOnline')}
              help={t('prod.f.notOnline.help')}
              value={draft.not_online || flagged}
              disabled={readOnly || flagged}
              onChange={(v) => set('not_online', v)}
            />
            <SwitchRow
              label={t('prod.f.age18')}
              help={t('prod.f.age18.help')}
              value={draft.age18}
              disabled={readOnly}
              onChange={(v) => setDraft((d) => ({ ...d, age18: v, not_online: v ? true : d.not_online }))}
            />
            {draft.not_online || flagged ? (
              <Text variant="caption" tone="muted">
                {t('prod.f.soldOnline.flagged')}
              </Text>
            ) : null}
            <Text variant="label">{t('prod.maker.title')}</Text>
            <Text variant="caption" tone="muted">
              {t('prod.maker.help')}
            </Text>
            <Input
              label={t('prod.safety.manufacturer')}
              accessibilityLabel={t('prod.safety.manufacturer')}
              value={draft.manufacturer_name}
              onChangeText={(v) => set('manufacturer_name', v)}
              maxLength={200}
              error={errors.manufacturer_name}
              editable={!readOnly}
            />
            <Input
              label={t('prod.safety.manufacturerAddress')}
              accessibilityLabel={t('prod.safety.manufacturerAddress')}
              value={draft.manufacturer_address}
              onChangeText={(v) => set('manufacturer_address', v)}
              maxLength={500}
              multiline
              error={errors.manufacturer_address}
              editable={!readOnly}
            />
            <Input
              label={t('prod.safety.manufacturerContact')}
              accessibilityLabel={t('prod.safety.manufacturerContact')}
              value={draft.manufacturer_contact}
              onChangeText={(v) => set('manufacturer_contact', v)}
              maxLength={254}
              autoCapitalize="none"
              error={errors.manufacturer_contact}
              editable={!readOnly}
            />
            {jurisdiction === 'ni' ? (
              <Text variant="caption" tone="muted">
                {t('prod.maker.ni')}
              </Text>
            ) : null}
          </View>
        </Card>

        {vatRegistered ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('x.vat')}</Text>
              <Text variant="bodySmall" tone="muted">
                {t('prod.f.vat')}
              </Text>
              {readOnly ? (
                <Text>
                  {draft.tax_category
                    ? t(VAT_IDS.find((v) => v.value === draft.tax_category)?.id ?? 'vat.rate.standard')
                    : t('prod.vat.default', { rate: defaultVatWords })}
                </Text>
              ) : (
                <ChoiceChips<'' | TaxCategory>
                  options={[
                    { value: '', label: t('prod.vat.default', { rate: defaultVatWords }) },
                    ...VAT_IDS.map((v) => ({ value: v.value, label: t(v.id) })),
                  ]}
                  value={draft.tax_category}
                  onChange={(v) => set('tax_category', v)}
                />
              )}
            </View>
          </Card>
        ) : null}

        {trackStock ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('x.supplier')}</Text>
              <NamedPicker
                label={t('prod.f.supplier')}
                none={t('x.noSupplier')}
                items={suppliers.data ?? []}
                value={draft.supplier_id}
                readOnly={readOnly}
                addLabel={() => t('prod.f.supplier.add')}
                adding={addNamed.isPending && addNamed.variables?.kind === 'suppliers'}
                onAdd={async (name) => {
                  const item = await addName('suppliers', name);
                  if (item) set('supplier_id', item.id);
                }}
                onChange={(v) => set('supplier_id', v)}
                showEmpty
              />
            </View>
          </Card>
        ) : null}

        {/* Options */}
        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('x.options')}</Text>
            {draft.multi ? (
              <SwitchRow
                label={t('var.makeOptions')}
                value={draft.multi}
                disabled={readOnly || live.length > 1}
                onChange={(v) => {
                  if (!v && live.length > 1) return;
                  set('multi', v);
                }}
              />
            ) : null}
            {live.map((o, index) => (
              <OptionEditor
                key={o.key}
                option={o}
                index={index}
                multi={draft.multi}
                trackStock={trackStock}
                jurisdiction={jurisdiction}
                basis={basis}
                readOnly={readOnly}
                errors={errors}
                canRemove={draft.multi && live.length > 1}
                onChange={(patch) => setOption(o.key, patch)}
                onRemove={() =>
                  o.id ? setOption(o.key, { archived: true }) : setDraft((d) => ({ ...d, options: d.options.filter((x) => x.key !== o.key) }))
                }
              />
            ))}
            <ErrorLine message={errors.options} />
            {!draft.multi ? (
              <SwitchRow label={t('var.makeOptions')} value={false} disabled={readOnly} onChange={(v) => set('multi', v)} />
            ) : null}
            {archiving.map((o) => (
              <View key={o.key} style={posStyles.row}>
                <Text variant="bodySmall" tone="muted" style={styles.flex}>
                  {t('ss.option.n.archived', { name: o.option_name || o.sku || t('x.option.n', { n: draft.options.indexOf(o) + 1 }) })}
                </Text>
                {readOnly ? null : (
                  <Button label={t('x.option.restore')} size="sm" variant="ghost" onPress={() => setOption(o.key, { archived: false })} />
                )}
              </View>
            ))}
            {draft.multi && !readOnly && live.length < OPTION_LIMIT ? (
              <Button
                label={t('var.add')}
                variant="secondary"
                onPress={() => setDraft((d) => ({ ...d, multi: true, options: [...d.options, newOption(trackStock)] }))}
                fullWidth
              />
            ) : null}
          </View>
        </Card>

        {product && trackStock ? <StockSection product={product} bootstrap={bootstrap} /> : null}

        {readOnly ? null : (
          <>
            <ErrorLine message={formError} />
            <Button label={t('prod.save')} loading={save.isPending} disabled={product ? !dirty : false} onPress={() => void onSave()} fullWidth />
          </>
        )}
        {readOnly ? <ErrorLine message={formError} /> : null}
        {product && !readOnly ? (
          <View style={posStyles.buttons}>
            {product.archived_at ? (
              <Button label={t('prod.unarchive')} variant="secondary" loading={archive.isPending} onPress={() => void onArchive(false)} fullWidth />
            ) : (
              <Button label={t('prod.archive')} variant="secondary" onPress={() => setConfirm('archive')} fullWidth />
            )}
            {product.can_delete ? <Button label={t('prod.delete')} variant="danger" onPress={() => setConfirm('delete')} fullWidth /> : null}
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

/**
 * A brand, category or supplier: chips for the venue's list with "No brand" first, and a field to
 * add a new one by name (the web's combobox "Add as a new brand"). A typed name that is already in
 * the list chooses that one.
 */
function NamedPicker({
  label,
  none,
  items,
  value,
  readOnly,
  addLabel,
  adding,
  onAdd,
  onChange,
  error,
  showEmpty,
}: {
  label: string;
  none: string;
  items: RetailNamedItem[];
  value: string | null;
  readOnly: boolean;
  addLabel: (name: string) => string;
  adding: boolean;
  onAdd: (name: string) => Promise<void>;
  onChange: (id: string | null) => void;
  error?: string;
  showEmpty?: boolean;
}) {
  const t = useStockT();
  const [typed, setTyped] = useState('');
  const name = typed.trim();
  if (readOnly) {
    const chosen = items.find((i) => i.id === value);
    if (!chosen && !showEmpty && items.length === 0) return null;
    return (
      <View style={styles.group}>
        <Text variant="bodySmall" tone="muted">
          {label}
        </Text>
        <Text>{chosen?.name ?? none}</Text>
      </View>
    );
  }
  async function add() {
    if (!name) return;
    const there = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (there) {
      onChange(there.id);
      setTyped('');
      return;
    }
    await onAdd(name);
    setTyped('');
  }
  return (
    <View style={styles.group}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      {items.length > 0 || value ? (
        <ChoiceChips
          options={[{ value: '', label: none }, ...items.map((i) => ({ value: i.id, label: i.name }))]}
          value={value ?? ''}
          onChange={(v) => onChange(v || null)}
        />
      ) : null}
      <Input
        placeholder={t('ss.addNamed')}
        accessibilityLabel={`${label}: ${t('ss.addNamed')}`}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => void add()}
        returnKeyType="done"
        maxLength={120}
        rightSlot={name ? <Button label={addLabel(name)} size="sm" variant="ghost" loading={adding} onPress={() => void add()} /> : undefined}
      />
      <ErrorLine message={error} />
    </View>
  );
}

function PhotoThumb({
  photo,
  main,
  alt,
  disabled,
  readOnly,
  onRemove,
}: {
  photo: ProductPhoto;
  main: boolean;
  alt: string;
  disabled: boolean;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const t = useStockT();
  const { colors } = useTheme();
  return (
    <View style={styles.photo}>
      <Image
        source={{ uri: photo.url }}
        style={[styles.photoImage, { borderColor: colors.border }]}
        contentFit="cover"
        accessibilityLabel={alt}
      />
      {main ? <Badge label={t('prod.photos.main')} /> : null}
      {readOnly ? null : (
        <Pressable onPress={onRemove} disabled={disabled} accessibilityRole="button" accessibilityLabel={t('prod.photos.remove')} hitSlop={8}>
          <Text variant="caption" tone="danger">
            {t('prod.photos.remove')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function OptionEditor({
  option,
  index,
  multi,
  trackStock,
  jurisdiction,
  basis,
  readOnly,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  option: OptionDraft;
  index: number;
  multi: boolean;
  trackStock: boolean;
  jurisdiction: Jurisdiction;
  basis: 'standard' | 'makeup';
  readOnly: boolean;
  errors: FieldErrors;
  canRemove: boolean;
  onChange: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}) {
  const t = useStockT();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const err = (field: string) => errors[`opt.${option.key}.${field}`];
  const editable = !readOnly;

  const preview = (() => {
    const price = parseMoneyInput(option.price);
    const qty = Number(option.net_quantity.trim().replace(',', '.'));
    if (price == null || !option.net_unit || !Number.isFinite(qty)) return null;
    const u = unitPrice(price, qty, option.net_unit, jurisdiction, basis);
    return u ? t('var.unitPrice.preview', { unitPrice: formatUnitPrice(u, money) }) : null;
  })();

  function addBarcode(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const b = { barcode: value, symbology: detectSymbology(value) };
    const problem = barcodeError(b, { barcodeInvalid: t('var.barcode.invalid') });
    if (problem) {
      setCodeError(problem);
      return;
    }
    setCodeError(null);
    setCode('');
    if (option.barcodes.some((x) => x.barcode === value)) return;
    onChange({ barcodes: [...option.barcodes, b] });
  }

  const num = (field: 'reorder_level' | 'reorder_quantity' | 'order_up_to_level' | 'pack_size' | 'opening_quantity', label: string, help?: string) => (
    <Input
      label={label}
      accessibilityLabel={label}
      helper={help}
      value={option[field]}
      onChangeText={(v) => onChange({ [field]: v } as Partial<OptionDraft>)}
      keyboardType="number-pad"
      error={err(field)}
      editable={editable}
    />
  );

  return (
    <View style={[styles.option, multi ? { borderColor: colors.border } : styles.optionFlat]}>
      {multi ? (
        <View style={posStyles.row}>
          <Text variant="bodyMedium" style={styles.flex}>
            {option.option_name || t('x.option.n', { n: index + 1 })}
          </Text>
          {canRemove && !readOnly ? (
            <Button label={option.id ? t('var.archive') : t('x.option.remove')} variant="ghost" size="sm" onPress={onRemove} />
          ) : null}
        </View>
      ) : null}
      {multi ? (
        <Input
          label={t('var.option')}
          accessibilityLabel={t('var.option')}
          placeholder={t('x.option.n', { n: index + 1 })}
          value={option.option_name}
          onChangeText={(v) => onChange({ option_name: v })}
          maxLength={80}
          error={err('option_name')}
          editable={editable}
        />
      ) : null}
      <Input
        label={t('var.sku')}
        accessibilityLabel={t('var.sku')}
        helper={t('var.sku.help')}
        value={option.sku}
        onChangeText={(v) => onChange({ sku: v })}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={64}
        error={err('sku')}
        editable={editable}
      />
      <Input
        label={t('var.price')}
        accessibilityLabel={t('var.price')}
        value={option.price}
        onChangeText={(v) => onChange({ price: v })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={err('price')}
        editable={editable}
      />
      <Input
        label={t('var.netQty')}
        accessibilityLabel={t('var.netQty')}
        helper={t('var.netQty.help')}
        value={option.net_quantity}
        onChangeText={(v) => onChange({ net_quantity: v })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={err('net_quantity')}
        editable={editable}
      />
      <Text variant="bodySmall" tone="muted">
        {t('var.netUnit')}
      </Text>
      {readOnly ? (
        option.net_unit ? (
          <Text>{t(`var.unit.${option.net_unit}` as StockCopyId)}</Text>
        ) : (
          <Text tone="muted">{t('ss.notSet')}</Text>
        )
      ) : (
        <ChoiceChips<'' | NetUnit>
          options={UNITS.map((u) => ({ value: u, label: t(`var.unit.${u}` as StockCopyId) }))}
          value={option.net_unit || null}
          onChange={(u) => onChange({ net_unit: option.net_unit === u ? '' : u })}
        />
      )}
      {preview ? <Text variant="bodySmall">{preview}</Text> : null}
      <Text variant="bodySmall" tone="muted">
        {t('var.barcodes')}
      </Text>
      {option.barcodes.map((b) =>
        readOnly ? (
          <Text key={b.barcode}>{b.barcode}</Text>
        ) : (
          <PickRow
            key={b.barcode}
            title={b.barcode}
            detail={t('x.removeBarcode', { barcode: b.barcode })}
            onPress={() => onChange({ barcodes: option.barcodes.filter((x) => x.barcode !== b.barcode) })}
          />
        ),
      )}
      {readOnly ? (
        <ErrorLine message={err('barcodes')} />
      ) : (
        <>
          <Input
            label={t('var.barcode.add')}
            accessibilityLabel={t('var.barcode.add')}
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
        </>
      )}
      {trackStock ? (
        <>
          <Input
            label={t('var.cost')}
            accessibilityLabel={t('var.cost')}
            helper={t('var.cost.help')}
            value={option.cost}
            onChangeText={(v) => onChange({ cost: v })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={err('cost')}
            editable={editable}
          />
          <SwitchRow label={t('var.track')} value={option.track_stock} disabled={readOnly} onChange={(v) => onChange({ track_stock: v })} />
          {option.track_stock ? (
            <>
              {num('reorder_level', t('var.reorderLevel'), t('var.reorderLevel.help'))}
              {num('reorder_quantity', t('var.reorderQty'))}
              {num('order_up_to_level', t('var.orderUpTo'), t('var.orderUpTo.help'))}
              {num('pack_size', t('var.packSize'), t('var.packSize.help'))}
              {!option.id ? num('opening_quantity', t('x.opening'), t('x.opening.help')) : null}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  group: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoRow: { gap: spacing.sm },
  photo: { width: 96, gap: spacing.xs, alignItems: 'flex-start' },
  photoImage: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1 },
  option: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  optionFlat: { borderWidth: 0, padding: 0 },
});
