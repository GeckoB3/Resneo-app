import { useEffect, useState } from 'react';
import { View } from 'react-native';

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
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { readStockRules } from '@/lib/pos/product-math';
import { sellProductsOn } from '@/lib/pos/setup/answers';
import { usePosCatalogue, useProductSearch } from '@/lib/queries/usePos';
import type { PosBootstrap, PosCatalogueProduct, PosSale } from '@/types/pos';

import { practiceT } from './copy';
import { practiceItemLine, PRACTICE_ITEM_PENCE } from './model';

/**
 * "Add items" on a practice sale (design W11, B12; section 6.8): products and one custom "Practice
 * item" only. A service sold with no booking becomes a real walk-in in the diary the moment it is
 * added, so the Services choice explains, in one sentence, that a real checkout brings the
 * booking's services with it. "Sell products" off (OB3) leaves the products out too.
 *
 * The adds are the sale's ordinary line writes; a practice sale takes them like any sale. There is
 * no camera here: the scanner is a window of its own, and this sheet is one already.
 */

type Tab = 'products' | 'item' | 'services';

function PracticeAddSheetBody({
  onClose,
  sale,
  bootstrap,
  send,
}: {
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
}) {
  const t = usePosT();
  const catalogue = usePosCatalogue();
  const productsOn = Array.isArray(catalogue.data?.products) && sellProductsOn(bootstrap.settings);
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab = chosen ?? (productsOn ? 'products' : 'item');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [choosing, setChoosing] = useState<PosCatalogueProduct | null>(null);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const rules = readStockRules(catalogue.data?.stock);
  const search = useProductSearch(debounced, { enabled: productsOn && tab === 'products' });
  const products = search.data?.products ?? [];
  const venueName = bootstrap.venue?.name ?? 'This venue';
  const { add: addProduct, busy: adding } = useAddProduct({ sale, send, rules, venueName, onNotice: setNotice });

  function pickProduct(p: PosCatalogueProduct) {
    if (p.options.length === 1) void addProduct(p, p.options[0]!);
    else if (p.options.length > 1) setChoosing(p);
  }

  async function addPracticeItem() {
    setBusy(true);
    setError(null);
    try {
      await send({ action: 'lines', body: { version: sale.version, ops: [{ op: 'add', line: practiceItemLine(sale) }] } });
      onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { value: Tab; label: string }[] = [
    ...(productsOn ? [{ value: 'products' as const, label: t('add.tab.products') }] : []),
    { value: 'item', label: practiceT('setup.practice.item') },
    { value: 'services', label: t('add.tab.services') },
  ];

  return (
    <PosSheet visible onClose={onClose} title={choosing ? t('add.variant.title') : t('add.open')}>
      {choosing ? (
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
      ) : (
        <View style={posStyles.stack}>
          <ChoiceChips options={tabs} value={tab} onChange={setChosen} />
          {catalogue.isLoading ? (
            <Text tone="muted">{t('app.loading')}</Text>
          ) : tab === 'products' ? (
            <>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder={t('prod.search')}
                onClear={() => setQuery('')}
                returnKeyType="search"
                accessibilityLabel={t('prod.search')}
              />
              <AddNoticeBanner notice={notice} />
              {search.isLoading ? (
                <Text tone="muted">{t('app.loading')}</Text>
              ) : search.isError ? (
                <ErrorLine message={posErrorMessage(search.error, t('common.networkError'))} />
              ) : products.length === 0 ? (
                <Text tone="muted">
                  {debounced ? t('add.none', { query: debounced }) : practiceT('app.setup.practice.noProducts')}
                </Text>
              ) : (
                <ProductRows products={products} rules={rules} disabled={adding} onPick={pickProduct} />
              )}
              <Button label={t('add.done')} variant="secondary" onPress={onClose} fullWidth />
            </>
          ) : tab === 'item' ? (
            <>
              <PickRow
                title={practiceT('setup.practice.item')}
                detail={`${money(PRACTICE_ITEM_PENCE)} · ${practiceT('app.setup.practice.item.detail')}`}
                disabled={busy}
                onPress={() => void addPracticeItem()}
              />
              <ErrorLine message={error} />
            </>
          ) : (
            <Text variant="bodySmall" tone="secondary">
              {practiceT('setup.practice.services')}
            </Text>
          )}
        </View>
      )}
    </PosSheet>
  );
}

/** Mounted only while open, so every opening starts clean. */
export function PracticeAddSheet(props: Parameters<typeof PracticeAddSheetBody>[0] & { visible: boolean }) {
  return props.visible ? <PracticeAddSheetBody {...props} /> : null;
}
