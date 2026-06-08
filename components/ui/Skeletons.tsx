import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ListSkeletonProps = {
  rows?: number;
  /** Show a leading circular avatar placeholder per row. */
  avatar?: boolean;
};

/** Placeholder rows for a loading list (Bookings, Clients). */
export function ListSkeleton({ rows = 6, avatar = false }: ListSkeletonProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[styles.row, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {avatar ? <Skeleton width={44} height={44} radius={radius.full} /> : null}
          <View style={styles.rowText}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={64} height={20} radius={radius.pill} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a detail screen (header + two cards). */
export function DetailSkeleton() {
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Skeleton width={56} height={56} radius={radius.full} />
        <View style={styles.rowText}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="45%" height={13} />
        </View>
      </View>
      <Card>
        <Skeleton width="35%" height={14} />
        <View style={styles.gap} />
        <Skeleton width="90%" height={16} />
        <View style={styles.gapSm} />
        <Skeleton width="70%" height={16} />
      </Card>
      <Card>
        <Skeleton width="25%" height={14} />
        <View style={styles.gap} />
        <Skeleton width="100%" height={14} />
        <View style={styles.gapSm} />
        <Skeleton width="80%" height={14} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.sm,
  },
  detail: {
    padding: spacing.base,
    gap: spacing.base,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  gap: {
    height: spacing.md,
  },
  gapSm: {
    height: spacing.sm,
  },
});
