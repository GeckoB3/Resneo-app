import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { SectionCard } from '@/components/ui/SectionCard';
import { Text } from '@/components/ui/Text';
import { useStockT, type StockT } from '@/lib/retail/stock-setup-copy';
import { usePosEnabled } from '@/lib/queries/usePos';
import { LOW_STOCK_SHOWN, useLowStock } from '@/lib/queries/useLowStock';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The Today screen's "Low stock" card, as the web home's `LowStockHomeCard`
 * (Docs/pos-retail-ux-spec.md §2.2; plan §4.13): counted options at or below their reorder level,
 * lowest first, up to five. Only while POS is on; hidden while Track stock is off (the route
 * answers `enabled: false`), when nothing is low, or when it cannot be loaded. "See what's low"
 * opens Products and stock on the Levels tab with the Low filter, as the web's link does.
 */

/** Where "See what's low" goes (web `LOW_STOCK_HREF`, `/dashboard/stock?tab=levels&filter=low`). */
export const LOW_STOCK_HREF = '/stock?tab=levels&filter=low';

/** `home.stock.body`; the deck has only the plural, so one item reads in the singular (web `lowStockBody`). */
export function lowStockBody(count: number, t: StockT): string {
  return count === 1 ? t('home.stock.one') : t('home.stock.body', { count });
}

export function LowStockHomeCard() {
  const t = useStockT();
  const router = useRouter();
  const { colors } = useTheme();
  const posOn = usePosEnabled();
  const { data } = useLowStock({ enabled: posOn });

  if (!posOn || !data || !data.enabled || !(data.count > 0)) return null;
  const items = (data.items ?? []).slice(0, LOW_STOCK_SHOWN);

  return (
    <SectionCard elevated>
      <SectionCard.Header title={t('home.stock.title')} description={lowStockBody(data.count, t)} />
      {items.length > 0 ? (
        <SectionCard.Body style={styles.body}>
          {items.map((item, i) => {
            const out = item.on_hand <= 0;
            return (
              <View
                key={item.variant_id}
                style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <Text variant="bodySmall" style={styles.name}>
                  {item.product_name}
                  {item.option_name ? <Text variant="bodySmall" tone="muted">{`, ${item.option_name}`}</Text> : null}
                </Text>
                <View style={styles.figures}>
                  {out ? (
                    <Badge label={t('stock.tile.out')} tone="danger" />
                  ) : (
                    <Text variant="caption" tone="secondary" style={styles.nums}>
                      {`${t('stock.col.onHand')}: ${item.on_hand}`}
                    </Text>
                  )}
                  <Text variant="caption" tone="muted" style={styles.nums}>
                    {`${t('stock.col.reorderAt')}: ${item.reorder_level}`}
                  </Text>
                </View>
              </View>
            );
          })}
        </SectionCard.Body>
      ) : null}
      <SectionCard.Footer style={styles.footer}>
        <Pressable
          onPress={() => router.push(LOW_STOCK_HREF as Href)}
          accessibilityRole="link"
          accessibilityLabel={t('home.stock.link')}
          hitSlop={8}>
          <Text variant="label" color={colors.brand}>
            {`${t('home.stock.link')} →`}
          </Text>
        </Pressable>
      </SectionCard.Footer>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontWeight: '600',
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  nums: {
    fontVariant: ['tabular-nums'],
  },
  footer: {
    alignItems: 'flex-end',
  },
});
