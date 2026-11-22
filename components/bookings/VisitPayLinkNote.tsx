import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { VisitPayLink } from '@/types/booking-detail';
import { spacing } from '@/theme/index';

/**
 * A visit across businesses waiting on its one pay link (web QA 2026-11-21 COLLECTIVE-PAY-13): the
 * Payments card says that link covers every business, and which parts are paid and which are still
 * owed. Recording cash or waiving one part used to look like it settled the visit, while the other
 * business's part was still waiting on the link. The words are the server's, as the web shows them.
 */
export function VisitPayLinkNote({ link }: { link: VisitPayLink }) {
  return (
    <View style={styles.container} testID="visit-pay-link-note">
      <Text variant="bodyMedium">One payment link for the whole visit</Text>
      <Text variant="caption" tone="muted">
        {link.summary}
      </Text>
      {link.parts.map((part) => (
        <Text
          key={part.venue_id}
          variant="caption"
          tone={part.status === 'paid' || part.status === 'nothing_due' ? 'muted' : undefined}
          testID={`visit-pay-link-part-${part.status}`}>
          {part.line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
});
