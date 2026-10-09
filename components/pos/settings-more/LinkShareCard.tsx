import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { smT } from '@/lib/pos/settings-more/copy';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { MessageBox } from './parts';

/** Pixel size of the rendered QR (square). */
const QR_SIZE = 200;

/**
 * A public page's address with copy, share, open and its QR code (the web's `VoucherPageLink` and
 * the shop link row). The web downloads the QR as a PNG; here the PNG goes to the share sheet, so
 * it can be saved to Photos or Files, printed or sent, the way the booking page QR card does it.
 */
export function LinkShareCard({
  title,
  url,
  fileName,
  copyLabel = smT('common.copyLink'),
  copiedText = smT('common.copied'),
  qrLabel,
  openLabel = smT('common.open'),
}: {
  title?: string | null;
  url: string;
  /** Names the shared PNG ("gift-vouchers-qr-studio"). */
  fileName: string;
  copyLabel?: string;
  copiedText?: string;
  /** The QR button's words (`set.vch.qr`, `set.shop.qr`). */
  qrLabel: string;
  openLabel?: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const svgRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharingQr, setSharingQr] = useState(false);
  const [qrError, setQrError] = useState(false);

  const copy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const shareLink = useCallback(async () => {
    try {
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
    } catch {
      // The person closed the share sheet.
    }
  }, [url]);

  const shareQr = useCallback(() => {
    const node = svgRef.current;
    if (!node || typeof node.toDataURL !== 'function') {
      toast.error(smT('common.qr.loading'));
      return;
    }
    setQrError(false);
    setSharingQr(true);
    node.toDataURL(async (base64: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native modules
        const FileSystem = require('expo-file-system/legacy') as {
          cacheDirectory?: string | null;
          writeAsStringAsync?: (uri: string, data: string, opts?: { encoding?: string }) => Promise<void>;
          EncodingType?: { Base64?: string };
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native modules
        const Sharing = require('expo-sharing') as {
          isAvailableAsync?: () => Promise<boolean>;
          shareAsync?: (uri: string, opts?: Record<string, unknown>) => Promise<void>;
        };
        const available = typeof Sharing.isAvailableAsync === 'function' ? await Sharing.isAvailableAsync() : false;
        if (!available || typeof FileSystem.writeAsStringAsync !== 'function' || typeof Sharing.shareAsync !== 'function') {
          toast.error(smT('common.share.unavailable'));
          return;
        }
        const safe = fileName.replace(/[^a-z0-9-]/gi, '-') || 'qr-code';
        const uri = `${FileSystem.cacheDirectory ?? ''}${safe}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType?.Base64 ?? 'base64' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: qrLabel, UTI: 'public.png' });
        hapticSuccess();
      } catch {
        hapticWarning();
        setQrError(true);
      } finally {
        setSharingQr(false);
      }
    });
  }, [fileName, qrLabel, toast]);

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
      {title ? <Text variant="label">{title}</Text> : null}
      <Text variant="bodySmall" tone="brand" selectable numberOfLines={2}>
        {url}
      </Text>
      <View style={styles.buttons}>
        <Button label={copied ? copiedText : copyLabel} variant="secondary" size="sm" onPress={() => void copy()} />
        <Button label={smT('common.shareLink')} variant="secondary" size="sm" onPress={() => void shareLink()} />
        <Button label={openLabel} variant="secondary" size="sm" onPress={() => void WebBrowser.openBrowserAsync(url)} />
      </View>
      <View style={styles.qrWrap}>
        <View style={styles.qrFrame}>
          <QRCode
            value={url}
            size={QR_SIZE}
            backgroundColor="#ffffff"
            color="#111111"
            getRef={(c) => {
              svgRef.current = c as typeof svgRef.current;
            }}
          />
        </View>
      </View>
      <Button label={qrLabel} variant="secondary" size="sm" loading={sharingQr} onPress={shareQr} />
      {qrError ? (
        <MessageBox tone="danger" role="alert">
          {smT('common.qr.error')}
        </MessageBox>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  qrWrap: { alignItems: 'center' },
  qrFrame: { backgroundColor: '#ffffff', padding: spacing.md, borderRadius: 12 },
});
