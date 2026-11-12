import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { followOnQuestion } from '@/lib/follow-ons/group-input';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { FollowOnGroup } from '@/types/follow-on-groups';

/**
 * The groups a service asks about: the form's choice once made, else what is saved (web
 * `FollowOnGroupsSection`). `null` means untouched, so the save leaves the links alone.
 */
export function linkedFollowOnIds(
  value: string[] | null,
  serviceId: string | null,
  groups: readonly FollowOnGroup[],
): string[] {
  if (value) return value;
  if (!serviceId) return [];
  return groups.filter((g) => g.trigger_service_ids.includes(serviceId)).map((g) => g.id);
}

/**
 * The Follow-on services card of the service form (web `FollowOnGroupsSection`, follow-on plan 6.3).
 * It edits `follow_on_group_ids`: `null` until the owner changes something, so an untouched form
 * never rewrites the links. It also shows the other direction: the groups that offer this service.
 * A member's copies of its host's groups are listed but cannot be picked, edited or removed.
 * Renders no scroll container of its own (it lives inside the form's scroll view).
 */
export function FollowOnLinksEditor({
  serviceId,
  value,
  onChange,
  groups,
  services,
  isLoading = false,
  error = null,
  onCreateGroup,
  onEditGroup,
}: {
  /** The service being edited; null while adding a new one. */
  serviceId: string | null;
  value: string[] | null;
  onChange: (next: string[]) => void;
  groups: readonly FollowOnGroup[] | null;
  services: readonly FollowOnServiceOption[];
  isLoading?: boolean;
  error?: string | null;
  onCreateGroup: () => void;
  onEditGroup: (group: FollowOnGroup) => void;
}) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const all = groups ?? [];
  const byId = new Map(all.map((g) => [g.id, g] as const));
  const nameOf = new Map(services.map((s) => [s.id, s.name] as const));
  const serviceName = (id: string) => nameOf.get(id) ?? 'Unknown service';

  const linkedIds = linkedFollowOnIds(value, serviceId, all);
  const linked = linkedIds.map((id) => byId.get(id)).filter((g): g is FollowOnGroup => Boolean(g));
  const offeredAfter = serviceId ? all.filter((g) => g.offered_service_ids.includes(serviceId)) : [];
  // A group that offers this service cannot also be asked after it (R10). A member's copies of its
  // host's groups belong to the collective's services only.
  const pickable = all.filter(
    (g) =>
      !g.managed_by_collective_id &&
      !linkedIds.includes(g.id) &&
      !(serviceId && g.offered_service_ids.includes(serviceId)),
  );

  return (
    <View style={styles.root} testID="follow-on-links">
      <Text variant="caption" tone="muted">
        Ask clients to add another service after this one, such as a cut. It is booked as its own appointment, so it can be
        with someone else.
      </Text>
      <View style={styles.buttons}>
        <Button
          label="Use existing group"
          variant="secondary"
          size="sm"
          disabled={!groups || pickable.length === 0}
          onPress={() => setPicking((p) => !p)}
        />
        <Button label="+ New group" size="sm" disabled={!groups} onPress={onCreateGroup} />
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}

      {picking && pickable.length > 0 ? (
        <View style={styles.pickList}>
          <Text variant="overline" tone="muted">
            Use an existing follow-on group
          </Text>
          {pickable.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={`Use ${g.name}`}
              onPress={() => {
                hapticSelect();
                onChange([...linkedIds, g.id]);
                setPicking(false);
              }}
              style={({ pressed }) => [
                styles.pickRow,
                { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text variant="bodyMedium">{g.name}</Text>
              <Text variant="caption" tone="muted">
                “{followOnQuestion(g.prompt_to_client)}” · Offers {g.offered_service_ids.map(serviceName).join(', ')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {linked.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          {groups || !isLoading ? 'Clients are not asked about other services after this one.' : 'Loading…'}
        </Text>
      ) : (
        linked.map((g) => {
          const managed = Boolean(g.managed_by_collective_id);
          return (
            <View key={g.id} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.rowHead}>
                <Text variant="bodyMedium" tone="brand">
                  {g.name}
                </Text>
                {g.required ? <Badge label="Clients must choose one" tone="warning" /> : null}
                {!g.is_active ? <Badge label="Switched off" /> : null}
              </View>
              <Text variant="bodySmall" tone="secondary">
                After booking this, clients are asked: “{followOnQuestion(g.prompt_to_client)}”
              </Text>
              <Text variant="caption" tone="muted">
                Offers: {g.offered_service_ids.map(serviceName).join(', ')}
              </Text>
              {managed ? null : (
                <View style={styles.buttons}>
                  <Button label="Edit group" variant="ghost" size="sm" onPress={() => onEditGroup(g)} />
                  <Button
                    label="Remove from this service"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      hapticSelect();
                      onChange(linkedIds.filter((id) => id !== g.id));
                    }}
                  />
                </View>
              )}
            </View>
          );
        })
      )}

      {serviceId && groups ? (
        <Text variant="bodySmall" tone="secondary" style={[styles.offeredAfter, { borderTopColor: colors.border }]}>
          {offeredAfter.length === 0
            ? 'This service is not offered after any other service.'
            : offeredAfter
                .map(
                  (g) =>
                    `Offered after: ${g.trigger_service_ids.map(serviceName).join(', ') || 'no services yet'} (${g.name})`,
                )
                .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pickList: { gap: spacing.xs },
  pickRow: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  row: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  rowHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  offeredAfter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
