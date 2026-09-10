import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess } from '@/lib/haptics';
import { collectivePublicPath } from '@/lib/linked/collective-page';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';

/** The combined page's full address, with Copy link and Open (web `CombinedPageAddressRow`). */
export function CombinedPageAddressRow({ collective }: { collective: CollectiveView }) {
  const base = getWebUrl() || 'https://app.resneo.com';
  const url = `${base}${collectivePublicPath(collective)}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <View style={styles.root}>
      <Text variant="caption" tone="muted">
        Combined page address
      </Text>
      <Text variant="bodySmall" numberOfLines={1} selectable accessibilityLabel="Combined page address">
        {url}
      </Text>
      <View style={styles.actions}>
        <Button
          label={copied ? 'Copied' : 'Copy link'}
          size="sm"
          variant="secondary"
          onPress={() => {
            void Clipboard.setStringAsync(url).then(() => {
              hapticSuccess();
              setCopied(true);
            });
          }}
        />
        <Button
          label="Open"
          size="sm"
          variant="ghost"
          onPress={() =>
            void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined))
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
