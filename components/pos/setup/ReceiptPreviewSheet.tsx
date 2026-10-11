import { Platform, StyleSheet, View } from 'react-native';

import { PosSheet } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { setupT } from '@/lib/pos/setup/copy';
import { useReceiptPreview } from '@/lib/queries/usePosSetup';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Preview a receipt" (design 6.3 W5; UX spec §9.3): the receipt a client would get, built by the
 * server from the saved settings and a sample bill (`GET /api/venue/pos/receipt-preview`). Nothing
 * is sent and it carries no sale number. Shown as the plain version, which reads well on a phone.
 * Mounted only while open, so each opening reads it fresh.
 */
export function ReceiptPreviewSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <ReceiptPreviewBody onClose={onClose} /> : null;
}

function ReceiptPreviewBody({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const query = useReceiptPreview();
  const text = query.data?.text?.trim() ?? '';
  return (
    <PosSheet
      visible
      onClose={onClose}
      title={setupT('setup.biz.preview')}
      subtitle={setupT('setup.practice.receipt')}
      footer={<Button label={setupT('app.setup.biz.preview.close')} variant="secondary" fullWidth onPress={onClose} />}>
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError || !text ? (
        <View style={styles.error}>
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {setupT('setup.biz.preview.error')}
          </Text>
          <Button label={setupT('setup.error.tryAgain')} variant="secondary" size="sm" onPress={() => void query.refetch()} />
        </View>
      ) : (
        <View style={[styles.paper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="bodySmall" style={styles.mono} selectable>
            {text}
          </Text>
        </View>
      )}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  paper: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  error: { gap: spacing.sm, alignItems: 'flex-start' },
});
