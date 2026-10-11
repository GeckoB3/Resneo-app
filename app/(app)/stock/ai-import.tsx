import { type Href, Stack, useRouter } from 'expo-router';

import { aiCount, aiT } from '@/components/retail/ai-import/copy';
import { ProductsAiImport } from '@/components/retail/ai-import/ProductsAiImport';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { posErrorMessage } from '@/lib/pos/api';
import { canPos } from '@/lib/pos/pos-enabled';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';

/**
 * "Add products with AI" (POS test round 2026-10-11, Part 4, OB7), at `/stock/ai-import`: opened by
 * "Add with AI" on Products and by the set-up wizard's W7 (`PRODUCTS_AI_HREF`). Needs Checkout on
 * and `manage_products`; the flow itself shows nothing to try unless the server offers the reader.
 * Done, or back, returns to whichever screen opened it, saying how many products were added.
 */
export default function ProductsAiImportScreen() {
  const t = useStockT();
  const router = useRouter();
  const toast = useToast();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const header = <Stack.Screen options={{ headerShown: true, title: aiT('ai.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (boot.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (!boot.data) {
    return (
      <Screen>
        {header}
        <ErrorState title={t('prod.error')} message={posErrorMessage(boot.error, t('common.networkError'))} onRetry={() => void boot.refetch()} />
      </Screen>
    );
  }
  if (!canPos(boot.data, 'manage_products')) {
    return (
      <Screen>
        {header}
        <EmptyState title={aiT('ai.title')} message={t('prod.readOnly')} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ProductsAiImport
        onAdded={(count) => toast.success(aiCount('ai.toast.added', count))}
        onClose={() => (router.canGoBack() ? router.back() : router.replace('/stock' as Href))}
      />
    </Screen>
  );
}
