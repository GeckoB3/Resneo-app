import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ErrorLine, posStyles, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSale } from '@/types/pos';

import { useReceiptPreview } from './api';
import { practiceT } from './copy';

/**
 * "This is what your client's receipt looks like." (design W11, B13): the receipt the client would
 * get, from `GET /api/venue/pos/receipt-preview?sale_id=`, built from the practice bill with
 * "Practice" across it and no sale number. Nothing is sent. The plain version of the email is shown
 * as a receipt card, which reads well on a phone; it carries every block the email does.
 */
export function PracticeReceipt({ sale }: { sale: Pick<PosSale, 'id' | 'version'> }) {
  const t = usePosT();
  const { colors } = useTheme();
  const preview = useReceiptPreview(sale);
  const text = preview.data?.text?.trim() ?? '';

  return (
    <View style={posStyles.stack}>
      <Text variant="bodyMedium">{practiceT('setup.practice.receipt')}</Text>
      {preview.isLoading ? (
        <View style={posStyles.row} accessibilityRole="progressbar" accessibilityLabel={practiceT('app.setup.practice.receipt.loading')}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text variant="bodySmall" tone="muted">
            {practiceT('app.setup.practice.receipt.loading')}
          </Text>
        </View>
      ) : preview.isError || !text ? (
        <View style={posStyles.stack}>
          <ErrorLine
            message={
              preview.isError
                ? posErrorMessage(preview.error, practiceT('setup.practice.receipt.error'))
                : practiceT('setup.practice.receipt.error')
            }
          />
          <Button label={t('common.tryAgain')} size="sm" variant="secondary" onPress={() => void preview.refetch()} />
        </View>
      ) : (
        <View
          style={[styles.receipt, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised }]}
          accessibilityLabel={`${practiceT('setup.practice.receipt.frame')}. ${text}`}>
          <View style={styles.badge}>
            <Badge label={practiceT('setup.practice.watermark')} tone="accent" />
          </View>
          <Text variant="bodySmall" style={styles.mono} selectable>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  badge: { alignSelf: 'flex-start' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), lineHeight: 20 },
});
