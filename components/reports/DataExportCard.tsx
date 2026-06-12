/**
 * DataExportCard — two buttons that download full-venue bookings / guests CSV
 * via GET /api/venue/export?type=bookings|guests, then open the OS share sheet
 * using expo-file-system + expo-sharing (or RN Share.share() as fallback).
 */
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { isBackendConfigured, getApiUrl } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

interface DataExportCardProps {
  /** "Appointment" / "Client" copy overrides (default: Booking / Guest). */
  bookingWord?: string;
  clientLabel?: string;
}

export function DataExportCard({
  bookingWord = 'Booking',
  clientLabel = 'Guest',
}: DataExportCardProps) {
  const accessToken = useAccessToken();
  const toast = useToast();
  const [downloading, setDownloading] = useState<'bookings' | 'guests' | null>(null);

  async function handleExport(type: 'bookings' | 'guests') {
    if (!accessToken || !isBackendConfigured()) {
      toast.error('Please sign in to export data.');
      return;
    }

    setDownloading(type);
    try {
      // Fetch as text (CSV) from the backend.
      const url = `${getApiUrl()}/api/venue/export?type=${type}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'text/csv,application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let msg = `Export failed (${response.status})`;
        try {
          const body = JSON.parse(text) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // ignore parse error
        }
        toast.error(msg);
        return;
      }

      const csvText = await response.text();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `${type}-${today}.csv`;

      // Try expo-file-system (legacy) + expo-sharing
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSystem = require('expo-file-system/legacy') as any;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sharing = require('expo-sharing') as any;

        if (typeof Sharing?.isAvailableAsync === 'function') {
          const isAvail = (await Sharing.isAvailableAsync()) as boolean;
          if (isAvail && typeof FileSystem?.writeAsStringAsync === 'function') {
            const cacheDir = (FileSystem.cacheDirectory as string | null) ?? '';
            const uri = `${cacheDir}${filename}`;
            await FileSystem.writeAsStringAsync(uri, csvText, {
              encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
            });
            await Sharing.shareAsync(uri, {
              mimeType: 'text/csv',
              dialogTitle: `Export ${filename}`,
              UTI: 'public.comma-separated-values-text',
            });
            return;
          }
        }
      } catch {
        // expo-file-system/legacy or expo-sharing not installed — fall through
      }

      // Web fallback
      if (Platform.OS === 'web') {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success('Export started.');
        return;
      }

      // Native fallback: share as text
      await Share.share({ title: filename, message: csvText });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Export failed — please check your connection and try again.';
      toast.error(msg);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Card>
      <Text variant="label">Export your data</Text>
      <Text variant="bodySmall" tone="secondary" style={styles.description}>
        Download a full CSV of all {bookingWord.toLowerCase()}s or your{' '}
        {clientLabel.toLowerCase()} records. Exports cover your whole venue (not limited to
        the date range above).
      </Text>

      <View style={styles.buttons}>
        <Button
          label={
            downloading === 'bookings'
              ? 'Downloading...'
              : `Export all ${bookingWord.toLowerCase()}s`
          }
          variant="secondary"
          size="sm"
          disabled={downloading !== null}
          loading={downloading === 'bookings'}
          onPress={() => void handleExport('bookings')}
          fullWidth
        />
        <Button
          label={
            downloading === 'guests'
              ? 'Downloading...'
              : `Export ${clientLabel.toLowerCase()} list`
          }
          variant="secondary"
          size="sm"
          disabled={downloading !== null}
          loading={downloading === 'guests'}
          onPress={() => void handleExport('guests')}
          fullWidth
        />
      </View>

      <Text variant="caption" tone="muted" style={styles.footer}>
        Files are generated from your venue&apos;s live data. Install expo-file-system for native
        file sharing.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  description: {
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  buttons: {
    gap: spacing.sm,
  },
  footer: {
    marginTop: spacing.md,
  },
});
