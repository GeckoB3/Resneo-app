import { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/** Pixel size of the rendered QR (square). */
const QR_SIZE = 220;

/**
 * Public booking-page QR code card. Renders a scannable QR for `url`
 * (`react-native-qrcode-svg`, which draws purely through `react-native-svg` — no
 * native module) and offers a "Share QR code" action that rasterises the SVG to a
 * PNG and hands it to the OS share sheet (`expo-sharing`), mirroring the web
 * "Download QR code". Suitable for table cards, menus or window stickers.
 *
 * Sharing uses dynamic `require()` of `expo-file-system/legacy` + `expo-sharing`
 * (same guarded pattern as `lib/reports/csv-export.ts`) so the component still
 * renders if those modules are unavailable in a given runtime (e.g. web/tests).
 *
 * NEEDS AN ON-DEVICE SMOKE TEST: QR rendering + the SVG→PNG capture + native
 * share sheet can only be verified on a real device/simulator (the Android
 * emulator is blocked here and web preview can't open a native share sheet).
 */
export function BookingPageQrCard({
  url,
  venueName,
  slug,
}: {
  url: string;
  venueName: string;
  slug: string;
}) {
  const toast = useToast();
  // The QR component hands us a ref to its underlying SVG via getRef(); that ref
  // exposes toDataURL(cb) → base64 PNG (no data: prefix). Stored in a ref so the
  // share handler can read it without re-rendering.
  const svgRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void } | null>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(() => {
    const node = svgRef.current;
    if (!node || typeof node.toDataURL !== 'function') {
      toast.error('QR code is still rendering — try again in a moment.');
      return;
    }
    setSharing(true);
    node.toDataURL(async (base64: string) => {
      try {
        // Web has no native share sheet for a file; surface the limitation.
        if (Platform.OS === 'web') {
          toast.info('Open the app on your phone to share or save the QR code.');
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSystem = require('expo-file-system/legacy') as {
          cacheDirectory?: string | null;
          writeAsStringAsync?: (uri: string, data: string, opts?: { encoding?: string }) => Promise<void>;
          EncodingType?: { Base64?: string };
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sharing = require('expo-sharing') as {
          isAvailableAsync?: () => Promise<boolean>;
          shareAsync?: (uri: string, opts?: Record<string, unknown>) => Promise<void>;
        };

        const available =
          typeof Sharing.isAvailableAsync === 'function'
            ? await Sharing.isAvailableAsync()
            : false;
        if (
          !available ||
          typeof FileSystem.writeAsStringAsync !== 'function' ||
          typeof Sharing.shareAsync !== 'function'
        ) {
          toast.error('Sharing is not available on this device.');
          return;
        }

        const cacheDir = FileSystem.cacheDirectory ?? '';
        const uri = `${cacheDir}booking-qr-${slug || 'venue'}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
        });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${venueName} — booking QR code`,
          UTI: 'public.png',
        });
        hapticSuccess();
      } catch {
        hapticWarning();
        toast.error('Could not share the QR code.');
      } finally {
        setSharing(false);
      }
    });
  }, [slug, venueName, toast]);

  return (
    <Card style={styles.card}>
      <Text variant="bodySmall" tone="secondary">
        Link straight to your booking page. Great for table cards, menus or window stickers.
      </Text>
      <View style={styles.qrWrap}>
        <View style={styles.qrFrame}>
          <QRCode
            value={url}
            size={QR_SIZE}
            // White background + dark cells so it scans on any card stock.
            backgroundColor="#ffffff"
            color="#111111"
            getRef={(c) => {
              svgRef.current = c;
            }}
          />
        </View>
        <Text variant="caption" tone="muted">{venueName}</Text>
      </View>
      <Button
        label="Share QR code"
        variant="secondary"
        size="sm"
        loading={sharing}
        onPress={handleShare}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  qrWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrFrame: {
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: 12,
  },
});
