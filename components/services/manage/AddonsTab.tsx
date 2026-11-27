import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { type AddonGroupEditorTarget } from '@/components/manage/AddonGroupEditorSheet';
import { addonSelectionRuleLabel } from '@/components/manage/AddonLinksEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { visibleAddonLibrary } from '@/lib/addons/visible-addon-library';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { useAddonGroups } from '@/lib/queries/useAddonGroups';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/index';

// The Add-ons library tab, moved out of the Services screen
// (`app/(app)/manage/services.tsx`) unchanged (codebase standards P5.2).

export function AddonsTab({
  isAdmin,
  addonGroupsQuery,
  includeInactive,
  setIncludeInactive,
  serviceNameById,
  onPressService,
  onEdit,
  onCreate,
}: {
  isAdmin: boolean;
  addonGroupsQuery: ReturnType<typeof useAddonGroups>;
  includeInactive: boolean;
  setIncludeInactive: (v: boolean) => void;
  /** id → name for every managed service, to render "Used by" chips. */
  serviceNameById: Map<string, string>;
  /** Jump to a service from a "Used by" chip. */
  onPressService: (serviceId: string) => void;
  onEdit: (target: AddonGroupEditorTarget) => void;
  onCreate: () => void;
}) {
  const { colors } = useTheme();
  // The query always holds every group and option (see `useAddonGroups` below):
  // the editor saves a group's options as the full set, so one it was never
  // shown would be removed. The switch only filters what this list shows.
  const allAddonsByGroup = addonGroupsQuery.data?.addons_by_group ?? {};
  const { groups, addonsByGroup } = visibleAddonLibrary(
    addonGroupsQuery.data?.groups ?? [],
    allAddonsByGroup,
    includeInactive,
  );
  const serviceLinks = addonGroupsQuery.data?.service_links ?? [];

  /** Services linked to a group, named and sorted (web parity: usedByForGroup). */
  const usedByForGroup = (groupId: string) => {
    const ids = new Set<string>();
    for (const link of serviceLinks) {
      if (link.addon_group_id === groupId) {
        const sid = link.service_item_id ?? link.appointment_service_id;
        if (sid) ids.add(sid);
      }
    }
    return [...ids]
      .map((id) => ({ id, name: serviceNameById.get(id) ?? 'Unknown service' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  if (addonGroupsQuery.isLoading) return <ListSkeleton />;
  if (addonGroupsQuery.isError) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState
          message={
            addonGroupsQuery.error instanceof ApiError
              ? addonGroupsQuery.error.message
              : 'Could not load add-on groups.'
          }
          onRetry={() => void addonGroupsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={addonGroupsQuery.isRefetching}
          onRefresh={() => void addonGroupsQuery.refetch()}
        />
      }>
      {isAdmin ? <Button label="New add-on group" onPress={onCreate} fullWidth /> : null}
      <View style={styles.switchRow}>
        <Text variant="bodySmall" tone="muted">
          Show archived groups
        </Text>
        <Switch value={includeInactive} onValueChange={setIncludeInactive} />
      </View>

      {groups.length === 0 ? (
        <EmptyState
          title="No add-on groups"
          message={
            isAdmin
              ? 'Create add-on groups to offer clients optional extras at booking.'
              : 'No add-on groups have been created yet.'
          }
        />
      ) : (
        groups.map((group) => {
          const addons = addonsByGroup[group.id] ?? [];
          const usedBy = usedByForGroup(group.id);
          return (
            <Card key={group.id} padded={false} style={styles.serviceCard}>
              <View style={styles.addonGroupRow}>
                <View style={styles.serviceText}>
                  <View style={styles.addonGroupNameRow}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {group.name}
                    </Text>
                    {!group.is_active ? (
                      <Badge label="Archived" tone="warning" />
                    ) : null}
                    {group.hidden_from_online ? (
                      <Badge label="Hidden online" tone="neutral" />
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {addonSelectionRuleLabel(group)} · {addons.length} option
                    {addons.length === 1 ? '' : 's'}
                  </Text>
                  {group.prompt_to_client ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      &quot;{group.prompt_to_client}&quot;
                    </Text>
                  ) : null}
                </View>
                {isAdmin ? (
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      onEdit({
                        mode: 'edit',
                        group,
                        // Every option, inactive ones included, whatever the list shows.
                        addons: allAddonsByGroup[group.id] ?? [],
                      })
                    }
                  />
                ) : null}
              </View>
              {addons.length > 0 ? (
                <View
                  style={[
                    styles.addonList,
                    { borderTopColor: colors.border },
                  ]}>
                  {addons.map((addon) => (
                    <Text key={addon.id} variant="bodySmall" tone="secondary">
                      • {addon.name}
                      {addon.additional_price_pence > 0
                        ? ` +${formatPence(addon.additional_price_pence)}`
                        : ''}
                      {addon.additional_duration_minutes > 0
                        ? ` +${addon.additional_duration_minutes}min`
                        : ''}
                      {!addon.is_active ? ' (inactive)' : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={[styles.usedByWrap, { borderTopColor: colors.border }]}>
                {usedBy.length > 0 ? (
                  <>
                    <Text variant="overline" tone="muted">
                      Used by ({usedBy.length})
                    </Text>
                    <View style={styles.usedByChips}>
                      {usedBy.map((svc) => (
                        <Pressable
                          key={svc.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Open service ${svc.name}`}
                          hitSlop={6}
                          onPress={() => onPressService(svc.id)}
                          style={({ pressed }) => [
                            styles.usedByChip,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}>
                          <Text variant="caption" tone="secondary" numberOfLines={1}>
                            {svc.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text variant="caption" tone="muted">
                    Not linked to any services yet.
                  </Text>
                )}
              </View>
            </Card>
          );
        })
      )}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  serviceCard: {
    overflow: 'hidden',
  },
  serviceText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  // Add-ons tab
  addonGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  addonGroupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  addonList: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  usedByWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  usedByChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  usedByChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
  },
  spacer: {
    height: spacing.xl,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
});
