import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { siteScopedKey } from '@/lib/sites/active-site';

/**
 * "Not now" on the first-product Track stock prompt (UX spec §6.2 first-use prompt), kept on this
 * phone as the web keeps it in a cookie on that browser, per site (web roles plan §6.2c). A read
 * failure shows the prompt again, which is harmless.
 */

const KEY = 'resneo_stock_prompt_dismissed';

export async function isStockPromptDismissed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(siteScopedKey(KEY))) === '1';
  } catch {
    return false;
  }
}

export function dismissStockPrompt(): void {
  if (Platform.OS === 'web') return;
  void SecureStore.setItemAsync(siteScopedKey(KEY), '1').catch(() => {
    // Convenience only.
  });
}
