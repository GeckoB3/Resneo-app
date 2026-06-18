import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  ResourceEditorSheet,
  type ResourceEditorTarget,
} from '@/components/resources/ResourceEditorSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeleteResource,
  useHostCalendars,
  useResourcesManageList,
} from '@/lib/queries/useResourcesManage';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Resource } from '@/types/resources-manage';

/**
 * Open the manager straight into a sub-flow: a fresh "New resource" form, or the
 * editor for a specific resource (by id). Lets the resources page surface "New
 * resource" / per-resource "Edit" as one tap instead of opening the list first.
 */
export type ResourceManagerInitialAction =
  | { type: 'create' }
  | { type: 'edit'; resourceId: string };

type ResourceManagerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** When set, the editor opens to this on the next time the sheet becomes visible. */
  initialAction?: ResourceManagerInitialAction | null;
  /** Book a slot on this resource — the parent closes the sheet and routes to the flow. */
  onBookResource?: (resourceId: string) => void;
};

/** Payment summary line, mirroring the web resource payment rule. */
function paymentSummary(resource: Resource): string {
  const req = resource.payment_requirement ?? 'none';
  if (req === 'full_payment') return 'Full payment online';
  if (req === 'deposit') {
    const amount = formatPence(resource.deposit_amount_pence ?? null);
    return amount ? `Deposit ${amount}` : 'Deposit online';
  }
  return 'No online payment';
}

/**
 * In-app resource manager — opened from a header action on /resources. Lists
 * every bookable resource (court, room, bay…) with its slot grid, pricing and
 * host calendar, plus Edit, Delete and "New resource". Replaces the previous
 * "create or edit on the web dashboard" dead-end.
 */
export function ResourceManagerSheet({
  visible,
  onClose,
  initialAction = null,
  onBookResource,
}: ResourceManagerSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();

  const query = useResourcesManageList();
  const hostCalendarsQuery = useHostCalendars();
  const deleteResource = useDeleteResource();

  const [editorTarget, setEditorTarget] = useState<ResourceEditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);

  const resources = useMemo(() => query.data ?? [], [query.data]);

  // Consume `initialAction` once per open: jump straight to the create form, or to
  // a specific resource's editor (waiting for the list to load to resolve the id).
  // The ref guard stops it re-opening the editor after the user closes it.
  const consumedActionRef = useRef<ResourceManagerInitialAction | null>(null);
  useEffect(() => {
    if (!visible) {
      consumedActionRef.current = null;
      return;
    }
    if (!initialAction || consumedActionRef.current === initialAction) return;
    if (initialAction.type === 'create') {
      consumedActionRef.current = initialAction;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the editor in response to the sheet opening with an initialAction
      setEditorTarget({ mode: 'create' });
      return;
    }
    // edit: resolve the full record from the loaded list before opening.
    const match = resources.find((r) => r.id === initialAction.resourceId);
    if (match) {
      consumedActionRef.current = initialAction;
      setEditorTarget({ mode: 'edit', resource: match });
    }
  }, [visible, initialAction, resources]);
  const hostCalendars = useMemo(() => hostCalendarsQuery.data ?? [], [hostCalendarsQuery.data]);

  const hostNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of hostCalendars) map.set(c.id, c.name);
    return map;
  }, [hostCalendars]);

  const onDelete = useCallback(() => {
    const resource = deleteTarget;
    if (!resource) return;
    deleteResource.mutate(resource.id, {
      onSuccess: () => {
        hapticSuccess();
        setDeleteTarget(null);
        toast.success(`"${resource.name}" deleted.`);
      },
      onError: (e) => {
        hapticWarning();
        setDeleteTarget(null);
        toast.error(
          e instanceof ApiError ? e.message : 'Could not delete the resource. Please try again.',
        );
      },
    });
  }, [deleteTarget, deleteResource, toast]);

  return (
    <>
      <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
        <View style={styles.header}>
          <Text variant="subheading">Resources</Text>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={onClose}
          />
        </View>

        {query.isLoading ? (
          <ListSkeleton />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError ? query.error.message : 'Could not load resources.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }>
            <Button
              label="New resource"
              fullWidth
              onPress={() => setEditorTarget({ mode: 'create' })}
            />

            {resources.length === 0 ? (
              <EmptyState
                title="No resources yet"
                message="Create your first court, room, or piece of equipment to start taking resource bookings."
              />
            ) : (
              resources.map((resource) => {
                const hostName = resource.display_on_calendar_id
                  ? hostNameById.get(resource.display_on_calendar_id) ?? null
                  : null;
                const price = formatPence(resource.price_per_slot_pence ?? null);
                return (
                  <Card key={resource.id} style={styles.resourceCard}>
                    <View style={styles.resourceHeader}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: resource.colour ?? colors.brand },
                        ]}
                      />
                      <View style={styles.resourceText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {resource.name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {resource.resource_type ? `${resource.resource_type} · ` : ''}
                          {resource.slot_interval_minutes} min slots
                          {price ? ` · ${price}/slot` : ' · free'}
                        </Text>
                      </View>
                      {resource.is_active === false ? (
                        <Badge label="Inactive" tone="neutral" />
                      ) : null}
                    </View>

                    <View style={styles.metaGrid}>
                      {hostName ? (
                        <Text variant="caption" tone="secondary">
                          On {hostName}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="danger">
                          No calendar
                        </Text>
                      )}
                      <Text variant="caption" tone="muted">
                        {paymentSummary(resource)}
                      </Text>
                    </View>

                    {!resource.display_on_calendar_id ? (
                      // Web parity: a resource with no host column isn't visible on
                      // any calendar — offer the one-tap fix.
                      <Button
                        label="Set calendar"
                        variant="primary"
                        size="sm"
                        onPress={() => setEditorTarget({ mode: 'edit', resource })}
                      />
                    ) : resource.is_active !== false && onBookResource ? (
                      <Button
                        label="Book this resource"
                        variant="secondary"
                        size="sm"
                        onPress={() => onBookResource(resource.id)}
                      />
                    ) : null}

                    <View style={styles.actionsRow}>
                      <Button
                        label="Edit"
                        variant="secondary"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setEditorTarget({ mode: 'edit', resource })}
                      />
                      <Button
                        label="Delete"
                        variant="ghost"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setDeleteTarget(resource)}
                      />
                    </View>
                  </Card>
                );
              })
            )}
            <View style={styles.spacer} />
          </ScrollView>
        )}
      </Sheet>

      {/* Create / edit a resource */}
      <ResourceEditorSheet
        target={editorTarget}
        hostCalendars={hostCalendars}
        onClose={() => setEditorTarget(null)}
      />

      {/* Delete confirm — a Sheet, since Alert.alert's confirm is a no-op on web. */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Delete resource</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone, and will be blocked if
            upcoming bookings exist.
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setDeleteTarget(null)}
            />
            <Button
              label="Delete"
              variant="danger"
              style={styles.flex1}
              loading={deleteResource.isPending}
              onPress={onDelete}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  resourceCard: {
    gap: spacing.sm,
  },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  resourceText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  deleteSheet: {
    gap: spacing.md,
  },
});
