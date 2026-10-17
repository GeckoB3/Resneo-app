import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard, ChoiceGroup, SetupSection } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { TickRow } from '@/components/pos/switches/parts';
import { useProductsAiAvailability } from '@/components/retail/ai-import/api';
import { ProductsAiEntry } from '@/components/retail/ai-import/ProductsAiEntry';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage } from '@/lib/pos/api';
import { isShopEnabled } from '@/lib/pos/pos-enabled';
import { emptyQuickRow, quickAddProducts, quickProductBody, type QuickRow } from '@/lib/pos/setup/answers';
import { setupT } from '@/lib/pos/setup/copy';
import { currencySymbol } from '@/lib/pos/settings-form';
import { settingsPaths, useSaveCheckoutSettings, useSettingsWrite } from '@/lib/queries/useCheckoutSettings';
import { useRefreshSetupStatus } from '@/lib/queries/usePosSetup';
import { useRetailProducts, useSaveProduct } from '@/lib/queries/useRetail';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The app's own product import (a CSV, matched, checked, then imported), the web's spreadsheet import. */
export const PRODUCT_IMPORT_HREF = '/stock/import';

/**
 * W7, "Add your products" (design 6.3, drawn as B8): only while "Sell products" is on. A few
 * products typed in now (rows with the same name become one product with an option each, as the
 * import does; each goes through the ordinary products route), the spreadsheet import (the app has
 * it, as `/stock/import`), "Add products with AI" (OB7: the practice and AI builder's flow at
 * `/stock/ai-import`, shown only while the server offers the reader), and whether ResNeo should
 * count stock ("Yes" turns on Track stock for every existing product, as the Features switch does;
 * "Not now" leaves it as it is). Coming back from the import or the AI flow reads the count again.
 * While the online shop is on, "Sell these in my online shop too" (ticked) adds the quick-added
 * products as sold online, so W10 can open the shop with them (owner, 2026-10-17, as the web).
 */
export function ProductsStep({ data }: { data: SetupData }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const runner = useStepRunner('products', data);
  const saveProduct = useSaveProduct();
  const saveSettings = useSaveCheckoutSettings();
  const write = useSettingsWrite();
  const refreshStatus = useRefreshSetupStatus();
  const productsQuery = useRetailProducts({ q: '', archived: 'live', low: false });
  const ai = useProductsAiAvailability();
  const settings = data.settings.settings;
  const refetchProducts = productsQuery.refetch;
  // Back from the import or the AI flow: products may have been added, and the step ticked.
  useFocusEffect(
    useCallback(() => {
      void refetchProducts();
      void refreshStatus();
    }, [refetchProducts, refreshStatus]),
  );
  const nextKey = useRef(1);
  const [rows, setRows] = useState<QuickRow[]>(() => [emptyQuickRow('row-0')]);
  const [rowErrors, setRowErrors] = useState<Record<string, 'name' | 'price'>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [stock, setStock] = useState<boolean | null>(() => data.status.answers.track_stock ?? (settings.track_stock_enabled ? true : null));
  const shopOn = isShopEnabled(data.venue);
  const [online, setOnline] = useState(true);

  const total = productsQuery.data?.pages[0]?.total ?? null;
  // Every row with something typed counts, so pressing Add says what a row is missing.
  const typedRows = rows.filter((r) => r.name.trim() || r.option.trim() || r.price.trim()).length;
  const currency = currencySymbol(data.settings.venue?.currency);

  const setRow = (key: string, patch: Partial<QuickRow>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setRowErrors((errs) => {
      if (!errs[key]) return errs;
      const next = { ...errs };
      delete next[key];
      return next;
    });
    setAddError(null);
  };

  /** Adds every typed row. Answers the sentence to show when something stopped it. */
  const addRows = async (): Promise<string | null> => {
    const current = quickAddProducts(rows);
    if (Object.keys(current.errors).length > 0) {
      setRowErrors(current.errors);
      const first = Object.values(current.errors)[0];
      return first === 'name' ? setupT('setup.products.quick.needName') : setupT('setup.products.quick.badPrice');
    }
    if (current.products.length === 0) return null;
    let added = 0;
    for (const product of current.products) {
      try {
        await saveProduct.mutateAsync({
          kind: 'create',
          body: quickProductBody(product, { online: shopOn && online }),
          clientRequestId: newPaymentAttemptId(),
        });
        added += 1;
        // Rows saved are taken off, so trying again sends only what is left.
        const name = product.name.toLowerCase();
        setRows((list) => {
          const left = list.filter((r) => r.name.trim().toLowerCase() !== name);
          return left.length > 0 ? left : [emptyQuickRow(`row-${nextKey.current++}`)];
        });
      } catch (e) {
        const message = posErrorMessage(e, setupT('setup.error.save'));
        if (added > 0) {
          void refreshStatus();
          return setupT('app.setup.products.quick.partFailed', { added, count: current.products.length, error: message });
        }
        return message;
      }
    }
    toast.success(setupT('setup.products.quick.added', { count: current.rows }));
    void refreshStatus();
    return null;
  };

  const onAdd = async () => {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    const problem = await addRows();
    setAdding(false);
    if (problem) setAddError(problem);
  };

  const onContinue = () => {
    void runner.proceed(async () => {
      const problem = await addRows();
      if (problem) {
        setAddError(problem);
        return problem;
      }
      if (stock === true && !settings.track_stock_enabled) {
        const saved = await saveSettings({ track_stock_enabled: true });
        if (!saved.ok) return saved.message;
        const all = await write(settingsPaths.trackAll, 'POST');
        if (!all.ok) return all.message;
      }
      return null;
    }, stock === null ? null : { track_stock: stock });
  };

  const busy = runner.busy !== null || adding;

  return (
    <SetupFrame
      screen="products"
      data={data}
      title={setupT('setup.products.title')}
      intro={setupT('setup.products.help')}
      footer={
        <SetupButtons
          onContinue={onContinue}
          onSkip={() => void runner.skip()}
          skipLabel={setupT('setup.products.later')}
          busy={runner.busy}
          error={runner.error}
        />
      }>
      {total !== null && total > 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {setupT('app.setup.products.count', { count: total })}
        </Text>
      ) : null}

      <SetupSection title={setupT('setup.products.quick')}>
        {rows.map((row, i) => (
          <View key={row.key} style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
            <View style={styles.rowHead}>
              <View style={styles.flex}>
                <Input
                  label={setupT('setup.products.quick.name')}
                  value={row.name}
                  onChangeText={(name) => setRow(row.key, { name })}
                  editable={!busy}
                  maxLength={120}
                  error={rowErrors[row.key] === 'name' ? setupT('setup.products.quick.needName') : undefined}
                />
              </View>
              {rows.length > 1 ? (
                <IconButton
                  icon={{ ios: 'xmark.circle', android: 'cancel', web: 'cancel' }}
                  accessibilityLabel={setupT('setup.products.quick.remove', { row: i + 1 })}
                  onPress={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                />
              ) : null}
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <Input
                  label={setupT('setup.products.quick.option')}
                  value={row.option}
                  onChangeText={(option) => setRow(row.key, { option })}
                  editable={!busy}
                  maxLength={80}
                />
              </View>
              <View style={styles.price}>
                <Input
                  label={setupT('setup.products.quick.price')}
                  value={row.price}
                  onChangeText={(price) => setRow(row.key, { price })}
                  editable={!busy}
                  keyboardType="decimal-pad"
                  leftIcon={
                    <Text variant="body" tone="muted">
                      {currency}
                    </Text>
                  }
                  error={rowErrors[row.key] === 'price' ? setupT('setup.products.quick.badPrice') : undefined}
                />
              </View>
            </View>
          </View>
        ))}
        <Button
          label={setupT('setup.products.quick.add')}
          variant="ghost"
          onPress={() => setRows((list) => [...list, emptyQuickRow(`row-${nextKey.current++}`)])}
          disabled={busy}
        />
        {shopOn ? (
          <TickRow
            title={setupT('setup.products.quick.online')}
            detail={setupT('setup.products.quick.online.note')}
            checked={online}
            onChange={setOnline}
            disabled={busy}
          />
        ) : null}
        {addError ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {addError}
          </Text>
        ) : null}
        <Button
          label={setupT('setup.products.quick.save', { count: typedRows })}
          onPress={() => void onAdd()}
          loading={adding}
          disabled={busy || typedRows === 0}
          fullWidth
        />
      </SetupSection>

      <SetupSection title={setupT('setup.products.import')} help={setupT('app.setup.products.import.body')}>
        <Button
          label={setupT('app.setup.products.import.button')}
          variant="secondary"
          fullWidth
          onPress={() => router.push(PRODUCT_IMPORT_HREF as Href)}
          disabled={busy}
        />
      </SetupSection>

      {ai.offered ? (
        <SetupSection title={setupT('setup.products.ai')} help={setupT('setup.products.ai.body')}>
          <ProductsAiEntry />
        </SetupSection>
      ) : null}

      <ChoiceGroup label={setupT('setup.products.stock.title')}>
        <Text variant="bodySmall" tone="secondary">
          {setupT('setup.products.stock.body')}
        </Text>
        <ChoiceCard title={setupT('setup.products.stock.yes')} selected={stock === true} onPress={() => setStock(true)} disabled={busy} />
        <ChoiceCard
          title={setupT('setup.products.stock.no')}
          selected={stock === false}
          onPress={() => setStock(false)}
          disabled={busy || settings.track_stock_enabled}
        />
      </ChoiceGroup>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingTop: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  price: { width: 120 },
});
