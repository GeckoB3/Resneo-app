import { type Href, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';

import { PRODUCTS_AI_HREF, useProductsAiAvailability } from './api';
import { aiT } from './copy';

/**
 * "Add with AI" beside "Add product" and Import on Products (OB7; on by default, one way to add
 * products beside adding them by hand and the spreadsheet import). Shown only when the server
 * offers the reader (`GET /api/venue/retail/products/ai-extract` says `enabled`, which a server
 * without its AI key or with PRODUCTS_AI_SETUP_ENABLED=false does not); the caller shows it only to
 * people who can add products.
 */
export function ProductsAiEntry() {
  const router = useRouter();
  const { offered } = useProductsAiAvailability();
  if (!offered) return null;
  return <Button label={aiT('ai.entry')} variant="secondary" onPress={() => router.push(PRODUCTS_AI_HREF as Href)} />;
}
