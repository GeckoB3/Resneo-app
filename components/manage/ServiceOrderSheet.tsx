import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import {
  serviceOrderIds,
  withGroupOrder,
  type ServiceOrderGroup,
  type ServiceOrderItem,
} from '@/lib/services/service-order';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const SHEET_HEIGHT = '90%';

export type ServiceOrderSheetProps = {
  visible: boolean;
  /** The services in their booking-page order, under their headings, read once on mounting. */
  groups: ServiceOrderGroup[];
  /** Save the full new order. Rejects when the save fails, so the sheet can put the old order back. */
  onSave: (serviceIds: string[]) => Promise<unknown>;
  onClose: () => void;
};

/**
 * Drag services into order (The Beauty Parlour, 2026-11-18: "it would be much easier
 * to drag services into the order we want"). Press and hold a row, then drag it up or
 * down; each drop saves the full order through the same route as Move up / Move down.
 * Rows move inside their own heading only, as on the web; headings are ordered on the
 * Categories tab.
 */
export function ServiceOrderSheet({ visible, groups, onSave, onClose }: ServiceOrderSheetProps) {
  const { colors } = useTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // The order as it stood when the sheet opened (the parent mounts the sheet on opening).
  // A refetch after our own save must not undo a drag made since, so props are not followed.
  const [order, setOrder] = useState<ServiceOrderGroup[]>(groups);
  const [saving, setSaving] = useState(false);

  const handleDrop = useCallback(
    (key: string, services: ServiceOrderItem[]) => {
      const before = order;
      const next = withGroupOrder(order, key, services);
      const beforeIds = serviceOrderIds(before);
      const nextIds = serviceOrderIds(next);
      if (beforeIds.every((id, index) => id === nextIds[index])) return;
      setOrder(next);
      setSaving(true);
      onSave(nextIds)
        .catch(() => setOrder(before))
        .finally(() => setSaving(false));
    },
    [order, onSave],
  );

  const renderItem = useCallback<SortableGridRenderItem<ServiceOrderItem>>(
    ({ item }) => (
      <View
        style={[styles.row, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        accessibilityLabel={`${item.name}. Press and hold, then drag to move.`}>
        <SymbolView
          name={{ ios: 'line.3.horizontal', android: 'drag_handle', web: 'drag_handle' }}
          tintColor={colors.textMuted}
          size={20}
        />
        <Text variant="body" numberOfLines={1} style={styles.rowName}>
          {item.name}
        </Text>
        {item.durationMinutes != null ? (
          <Text variant="caption" tone="muted">
            {`${item.durationMinutes} min`}
          </Text>
        ) : null}
      </View>
    ),
    [colors],
  );

  const categorised = order.some((group) => group.heading !== null);

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight={SHEET_HEIGHT}>
      <View style={styles.body}>
        <Text variant="subheading">Change order</Text>
        <Text variant="bodySmall" tone="secondary">
          {categorised
            ? 'Press and hold a service, then drag it up or down. Services stay under their category. To move a whole category, use the Categories tab.'
            : 'Press and hold a service, then drag it up or down. Clients see this order on your booking page.'}
        </Text>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {order.map((group) => (
            <View key={group.key} style={styles.group}>
              {group.heading !== null ? (
                <Text variant="overline" tone="muted">
                  {group.heading}
                </Text>
              ) : null}
              <Sortable.Grid
                data={group.services}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                columns={1}
                rowGap={spacing.xs}
                scrollableRef={scrollRef}
                onDragStart={() => hapticSelect()}
                onDragEnd={({ data }) => handleDrop(group.key, data)}
              />
            </View>
          ))}
        </Animated.ScrollView>
        <View style={styles.actions}>
          <Button label="Done" onPress={onClose} loading={saving} fullWidth />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding, so the body pads itself.
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  rowName: {
    flex: 1,
  },
  actions: {
    paddingTop: spacing.sm,
  },
});
