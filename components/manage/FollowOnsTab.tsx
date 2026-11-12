import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { followOnPriceLabel } from '@/components/manage/FollowOnServicePicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { followOnQuestion } from '@/lib/follow-ons/group-input';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import type { useFollowOnGroups } from '@/lib/queries/useFollowOnGroups';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { FollowOnGroup, FollowOnManagedBy } from '@/types/follow-on-groups';

/** Who sets a group, when it is a member's copy of its live collective host's group. */
export function followOnSetter(
  group: Pick<FollowOnGroup, 'managed_by_collective_id'>,
  managedBy: FollowOnManagedBy | undefined,
): { collective_name: string; host_name: string } | null {
  const id = group.managed_by_collective_id;
  return id ? managedBy?.[id] ?? null : null;
}

/**
 * The Follow-ons tab of the Services screen (web `FollowOnsLibraryView`, follow-on plan 6.1 and
 * 6.4): every follow-on group with its question, the services it is asked after and the ones it
 * offers. Admins create and edit; a member's copies of its collective host's groups are read-only,
 * named as set by the host.
 */
export function FollowOnsTab({
  isAdmin,
  query,
  services,
  onPressService,
  onEdit,
  onCreate,
  onOpenAddons,
}: {
  isAdmin: boolean;
  query: ReturnType<typeof useFollowOnGroups>;
  services: readonly FollowOnServiceOption[];
  onPressService: (serviceId: string) => void;
  onEdit: (group: FollowOnGroup) => void;
  onCreate: () => void;
  onOpenAddons: () => void;
}) {
  const { colors } = useTheme();
  const groups = query.data?.groups ?? [];
  const managedBy = query.data?.managed_by;
  const byId = new Map(services.map((s) => [s.id, s] as const));
  const firstSetter = groups.map((g) => followOnSetter(g, managedBy)).find(Boolean) ?? null;

  if (query.isLoading) return <ListSkeleton />;
  if (query.isError) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load follow-on groups'}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  const chip = (id: string, tone: 'trigger' | 'offered') => {
    const s = byId.get(id);
    const name = s?.name ?? 'Unknown service';
    const price = s && tone === 'offered' ? followOnPriceLabel(s) : '';
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={`Open service ${name}`}
        hitSlop={6}
        onPress={() => onPressService(id)}
        style={({ pressed }) => [
          styles.chip,
          {
            borderColor: tone === 'offered' ? colors.accent : colors.border,
            backgroundColor: tone === 'offered' ? colors.accentSubtle : colors.surface,
            opacity: pressed ? 0.6 : 1,
          },
        ]}>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {price ? `${name} · ${price}` : name}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <Text variant="caption" tone="muted">
        After a client picks a service, ask them to add another one. It is booked as its own appointment, so it can be with
        someone else. Want an extra on the same appointment instead, like a toner? Use{' '}
        <Text variant="caption" tone="brand" accessibilityRole="link" onPress={onOpenAddons}>
          Add-ons
        </Text>
        .
      </Text>
      {isAdmin ? <Button label="New follow-on group" onPress={onCreate} fullWidth /> : null}

      {firstSetter ? (
        <View style={[styles.banner, { borderColor: colors.brand, backgroundColor: colors.brandSubtle }]}>
          <Text variant="bodySmall">
            <Text variant="bodySmall" style={styles.bold}>
              Set by {firstSetter.host_name} for the collective page.
            </Text>{' '}
            Your clients on the {firstSetter.collective_name} page are asked these questions. Only {firstSetter.host_name} can
            change them.
          </Text>
        </View>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title="No follow-on groups yet"
          message="For example, “Cut after colour”: when a client picks a colour, ask whether they would like a cut too, with the same stylist or someone else."
        />
      ) : (
        groups.map((group) => {
          const setter = followOnSetter(group, managedBy);
          const triggers = [...group.trigger_service_ids].sort((a, b) =>
            (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
          );
          return (
            <Card key={group.id} testID="follow-on-group-card" style={[styles.card, !group.is_active && styles.dimmed]}>
              <View style={styles.cardHead}>
                <View style={styles.cardText}>
                  <Text variant="bodyMedium">{group.name}</Text>
                  <View style={styles.badges}>
                    <Badge label={group.selection_type === 'single' ? 'Pick one' : 'Pick any'} />
                    {group.required ? <Badge label="Clients must choose one" tone="warning" /> : null}
                    {setter ? <Badge label={`Set by ${setter.host_name}`} tone="brand" /> : null}
                    <Badge
                      label={group.is_active ? 'Active' : 'Switched off'}
                      tone={group.is_active ? 'success' : 'neutral'}
                    />
                  </View>
                </View>
                {isAdmin && !setter ? (
                  <Button label="Edit" variant="secondary" size="sm" onPress={() => onEdit(group)} />
                ) : null}
              </View>
              <Text variant="caption" tone="muted">
                Question: “{followOnQuestion(group.prompt_to_client)}”
              </Text>
              <View style={[styles.section, { borderTopColor: colors.border }]}>
                <Text variant="overline" tone="muted">
                  Asked after ({group.trigger_service_ids.length})
                </Text>
                {triggers.length === 0 ? (
                  <Text variant="caption" tone="muted">
                    Not asked after any service yet.
                  </Text>
                ) : (
                  <View style={styles.chips}>{triggers.map((id) => chip(id, 'trigger'))}</View>
                )}
                <Text variant="overline" tone="muted">
                  Offers ({group.offered_service_ids.length})
                </Text>
                <View style={styles.chips}>{group.offered_service_ids.map((id) => chip(id, 'offered'))}</View>
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
  content: { padding: spacing.base, gap: spacing.md },
  stateWrap: { flex: 1, padding: spacing.base },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  bold: { fontWeight: '700' },
  card: { gap: spacing.sm },
  dimmed: { opacity: 0.75 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardText: { flex: 1, minWidth: 0, gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  spacer: { height: spacing.xl },
});
