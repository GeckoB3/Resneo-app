import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import {
  useDismissReleaseReview,
  useReleaseReview,
  type ReleaseReview,
} from '@/lib/queries/useCollectiveServiceTools';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Review your services" after leaving a collective, being removed, or the end of the collective
 * (web `ReleaseReviewPanel` + `ReleaseReviewCard` in `collective/ReleaseReview.tsx`; UX spec J7 to
 * J9, plan contract 7). Loads the review for the signed-in venue and shows nothing when there is
 * none, or when it cannot load: it is a convenience, never in the way.
 */
export function releaseReviewItems(review: ReleaseReview): { key: string; text: string; warn?: boolean }[] {
  const collective = review.collective_name;
  const host = review.host_name;
  const items: { key: string; text: string; warn?: boolean }[] = [];
  if (review.prices > 0) {
    items.push({
      key: 'prices',
      text:
        review.prices === 1
          ? areaCopy('review.pricesOne', { host })
          : areaCopy('review.prices', { count: review.prices, host }),
    });
  }
  if (review.link > 0) {
    items.push({
      key: 'link',
      text: review.link === 1 ? areaCopy('review.linkOne') : areaCopy('review.link', { count: review.link }),
    });
  }
  if (review.stripe) items.push({ key: 'stripe', text: areaCopy('review.stripe'), warn: true });
  if (review.library) items.push({ key: 'library', text: areaCopy('review.library', { host }) });
  if (review.photos === 'copying') items.push({ key: 'photos', text: areaCopy('review.photos.copying', { host }) });
  if (review.photos === 'done') items.push({ key: 'photos', text: areaCopy('review.photos.done') });
  if (review.photos === 'failed') items.push({ key: 'photos', text: areaCopy('review.photos.failed'), warn: true });
  for (const name of review.sameName) {
    items.push({ key: `same-${name}`, text: areaCopy('review.sameName', { service: name, host }) });
  }
  if (review.unparked > 0) {
    items.push({
      key: 'unparked',
      text:
        review.unparked === 1
          ? areaCopy('review.unparkedOne', { collective })
          : areaCopy('review.unparked', { count: review.unparked, collective }),
    });
  }
  return items;
}

export function ReleaseReviewPanel({ review, onDismiss }: { review: ReleaseReview; onDismiss: () => void }) {
  const { colors } = useTheme();
  const collective = review.collective_name;
  const title =
    review.reason === 'left'
      ? areaCopy('review.title', { collective })
      : areaCopy('review.titleRemoved', { collective });
  const items = releaseReviewItems(review);
  return (
    <Card style={[styles.card, { backgroundColor: colors.infoSurface }]}>
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      {items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.key} style={styles.item}>
              <Text variant="bodySmall" color={item.warn ? colors.warning : undefined} tone="default">
                {'•'}
              </Text>
              <Text
                variant="bodySmall"
                color={item.warn ? colors.warning : undefined}
                style={styles.itemText}>
                {item.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        label={areaCopy('review.dismiss')}
        variant="secondary"
        size="sm"
        style={styles.dismiss}
        onPress={onDismiss}
      />
    </Card>
  );
}

/** Loads the review for the signed-in venue; renders nothing when there is none. */
export function ReleaseReviewCard({ enabled = true }: { enabled?: boolean }) {
  const query = useReleaseReview(enabled);
  const dismiss = useDismissReleaseReview();
  // Hidden at once, before the server hears (web `setReview(null)` then the POST).
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const review = enabled ? (query.data ?? null) : null;
  if (!review || review.collective_id === dismissedId) return null;
  return (
    <ReleaseReviewPanel
      review={review}
      // A failed dismiss is ignored, as on the web: the review shows again next time.
      onDismiss={() => {
        setDismissedId(review.collective_id);
        dismiss.mutate(review.collective_id);
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  dismiss: {
    alignSelf: 'flex-start',
  },
});
