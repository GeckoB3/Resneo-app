import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, type ImportApi } from '@/lib/import/api';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** One row of an uploaded file, column by column (the web's `ImportRowPreviewDialog`). */
export function RowPreviewSheet({
  api,
  sessionId,
  target,
  onClose,
}: {
  api: ImportApi;
  sessionId: string;
  target: { fileId: string; row: number; filename: string } | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={target !== null} onClose={onClose} fill maxHeight="85%">
      <View style={styles.header}>
        <Text variant="heading">{target ? `Row ${target.row}` : ''}</Text>
        <Text variant="bodySmall" tone="muted">
          {target?.filename ?? ''}
        </Text>
      </View>
      {target ? (
        <RowCells key={`${target.fileId}-${target.row}`} api={api} sessionId={sessionId} fileId={target.fileId} row={target.row} />
      ) : (
        <View style={styles.scroll} />
      )}
      <View style={styles.footer}>
        <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
      </View>
    </Sheet>
  );
}

/** The row's cells. Keyed per row, so each opens in its loading state. */
function RowCells({ api, sessionId, fileId, row }: { api: ImportApi; sessionId: string; fileId: string; row: number }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cells, setCells] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getRow(sessionId, fileId, row)
      .then((data) => {
        const values = data.values ?? {};
        const headers = data.headers ?? Object.keys(values);
        if (!cancelled) setCells(headers.map((key) => ({ key, value: values[key] ?? '' })));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(importErrorMessage(e, 'That row could not be loaded.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, sessionId, fileId, row]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {error ? (
        <Text variant="bodySmall" tone="danger">
          {error}
        </Text>
      ) : null}
      {!loading && !error
        ? cells.map((c) => (
            <View key={c.key} style={[styles.cell, { borderBottomColor: colors.border }]}>
              <Text variant="caption" tone="secondary">
                {c.key}
              </Text>
              <Text variant="bodySmall">{c.value || 'Empty'}</Text>
            </View>
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xxs },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs },
  cell: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xxs },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
