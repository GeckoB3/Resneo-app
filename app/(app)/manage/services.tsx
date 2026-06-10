import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { AddonLinksSheet, type AddonLinksTarget } from '@/components/manage/AddonLinksSheet';
import {
  VariantsEditorSheet,
  type VariantsEditorTarget,
} from '@/components/manage/VariantsEditorSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence, parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAddonGroups } from '@/lib/queries/useAddonGroups';
import {
  useCreateService,
  useManagedServices,
  useReplaceServiceAddonLinks,
  useReplaceServiceVariants,
  useUpdateService,
} from '@/lib/queries/useServicesManage';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService } from '@/types/services-manage';

type EditTarget = {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: string;
  deposit: string;
  isActive: boolean;
};

function ServiceRow({
  service,
  expanded,
  isAdmin,
  onToggle,
  onEdit,
  onEditVariants,
  onEditAddons,
}: {
  service: ManagedService;
  expanded: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onEditVariants: () => void;
  onEditAddons: () => void;
}) {
  const { colors } = useTheme();
  const price = formatPence(service.price_pence);
  const deposit = formatPence(service.deposit_pence);
  const variants = service.variants ?? [];
  const addonGroups = service.addon_groups ?? [];

  return (
    <Card padded={false} style={styles.serviceCard}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        style={({ pressed }) => [styles.serviceHeader, { opacity: pressed ? 0.55 : 1 }]}>
        <View
          style={[styles.colourDot, { backgroundColor: service.colour ?? colors.brand }]}
        />
        <View style={styles.serviceText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {service.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {service.duration_minutes} min
            {price ? ` · ${price}` : ''}
            {variants.length ? ` · ${variants.length} option${variants.length === 1 ? '' : 's'}` : ''}
            {addonGroups.length ? ` · ${addonGroups.length} add-on group${addonGroups.length === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        {service.is_active === false ? <Badge label="Inactive" tone="neutral" /> : null}
        <Text variant="title" tone="muted">
          {expanded ? '▾' : '›'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={[styles.serviceBody, { borderTopColor: colors.border }]}>
          {service.description?.trim() ? (
            <Text variant="bodySmall" tone="secondary">
              {service.description}
            </Text>
          ) : null}
          <View style={styles.metaGrid}>
            {deposit ? (
              <Text variant="caption" tone="muted">
                Deposit {deposit}
              </Text>
            ) : null}
            {service.buffer_minutes ? (
              <Text variant="caption" tone="muted">
                Buffer {service.buffer_minutes} min
              </Text>
            ) : null}
            {service.payment_requirement && service.payment_requirement !== 'none' ? (
              <Text variant="caption" tone="muted">
                Payment: {service.payment_requirement.replace('_', ' ')}
              </Text>
            ) : null}
            {service.cancellation_notice_hours != null ? (
              <Text variant="caption" tone="muted">
                Cancel notice {service.cancellation_notice_hours}h
              </Text>
            ) : null}
          </View>

          {variants.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">
                Options
              </Text>
              {variants.map((variant) => (
                <Text key={variant.id} variant="bodySmall" tone="secondary">
                  • {variant.name} — {variant.duration_minutes} min
                  {variant.price_pence != null ? ` · ${formatPence(variant.price_pence)}` : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {addonGroups.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">
                Add-on groups
              </Text>
              {addonGroups.map((group) => (
                <Text key={group.group.id} variant="bodySmall" tone="secondary">
                  • {group.group.name} ({group.addons.length} add-on
                  {group.addons.length === 1 ? '' : 's'})
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.editRow}>
            <Button label="Edit" variant="secondary" size="sm" style={styles.editBtn} onPress={onEdit} />
            {isAdmin ? (
              <Button
                label={variants.length ? `Options (${variants.length})` : 'Options'}
                variant="secondary"
                size="sm"
                style={styles.editBtn}
                onPress={onEditVariants}
              />
            ) : null}
            {isAdmin ? (
              <Button
                label={addonGroups.length ? `Add-ons (${addonGroups.length})` : 'Add-ons'}
                variant="secondary"
                size="sm"
                style={styles.editBtn}
                onPress={onEditAddons}
              />
            ) : null}
          </View>
          <Text variant="caption" tone="muted">
            Per-service availability rules & processing time are managed on the web dashboard.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function ServicesScreen() {
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const query = useManagedServices();
  const update = useUpdateService();
  const create = useCreateService();
  const replaceVariants = useReplaceServiceVariants();
  const replaceAddonLinks = useReplaceServiceAddonLinks();
  const addonGroupsQuery = useAddonGroups(isAdmin);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [variantsTarget, setVariantsTarget] = useState<VariantsEditorTarget | null>(null);
  const [addonsTarget, setAddonsTarget] = useState<AddonLinksTarget | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sheet form state (shared between edit + create).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [isActive, setIsActive] = useState(true);

  const services = [...(query.data?.services ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  );

  const openEdit = (service: ManagedService) => {
    setName(service.name);
    setDescription(service.description ?? '');
    setDuration(String(service.duration_minutes));
    setPrice(penceToPoundsInput(service.price_pence));
    setDeposit(penceToPoundsInput(service.deposit_pence));
    setIsActive(service.is_active !== false);
    setError(null);
    setEditTarget({
      id: service.id,
      name: service.name,
      description: service.description ?? '',
      duration: String(service.duration_minutes),
      price: penceToPoundsInput(service.price_pence),
      deposit: penceToPoundsInput(service.deposit_pence),
      isActive: service.is_active !== false,
    });
  };

  const openCreate = () => {
    setName('');
    setDescription('');
    setDuration('30');
    setPrice('');
    setDeposit('');
    setIsActive(true);
    setError(null);
    setCreating(true);
  };

  const closeSheet = () => {
    setEditTarget(null);
    setCreating(false);
  };

  async function handleSave() {
    setError(null);
    const durationMinutes = Number(duration);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      setError('Duration must be 5–480 minutes.');
      return;
    }
    const pricePence = parsePoundsToPence(price);
    const depositPence = parsePoundsToPence(deposit);
    if (pricePence === undefined || depositPence === undefined) {
      setError('Price and deposit must be valid amounts.');
      return;
    }

    try {
      if (editTarget) {
        await update.mutateAsync({
          id: editTarget.id,
          ...(name.trim() !== editTarget.name ? { name: name.trim() } : {}),
          ...(description.trim() !== editTarget.description
            ? { description: description.trim() || null }
            : {}),
          ...(duration !== editTarget.duration ? { duration_minutes: durationMinutes } : {}),
          ...(price !== editTarget.price ? { price_pence: pricePence } : {}),
          ...(deposit !== editTarget.deposit ? { deposit_pence: depositPence } : {}),
          ...(isActive !== editTarget.isActive ? { is_active: isActive } : {}),
        });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          duration_minutes: durationMinutes,
          ...(pricePence != null ? { price_pence: pricePence } : {}),
          ...(depositPence != null ? { deposit_pence: depositPence } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      }
      hapticSuccess();
      closeSheet();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the service.');
    }
  }

  const openVariantsEditor = (service: ManagedService) =>
    setVariantsTarget({
      serviceId: service.id,
      serviceName: service.name,
      variants: (service.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        duration_minutes: variant.duration_minutes,
        price_pence: variant.price_pence,
        deposit_pence: variant.deposit_pence,
      })),
    });

  const openAddonsEditor = (service: ManagedService) =>
    setAddonsTarget({
      serviceId: service.id,
      serviceName: service.name,
      linkedGroupIds: (service.addon_groups ?? []).map((group) => group.group.id),
    });

  const sheetOpen = editTarget !== null || creating;
  const saving = update.isPending || create.isPending;

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Services' }} />

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Could not load services.'}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          <Button label="New service" onPress={openCreate} fullWidth />
          {services.length === 0 ? (
            <EmptyState
              title="No services yet"
              message="Create your first service to start taking appointments."
            />
          ) : (
            services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                expanded={expandedId === service.id}
                isAdmin={isAdmin}
                onToggle={() => setExpandedId((cur) => (cur === service.id ? null : service.id))}
                onEdit={() => openEdit(service)}
                onEditVariants={() => openVariantsEditor(service)}
                onEditAddons={() => openAddonsEditor(service)}
              />
            ))
          )}
          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* Options (variants) editor — sends the FULL set on save */}
      <VariantsEditorSheet
        target={variantsTarget}
        saving={replaceVariants.isPending}
        onClose={() => setVariantsTarget(null)}
        onSave={(variants) => {
          if (!variantsTarget) return;
          replaceVariants.mutate(
            { id: variantsTarget.serviceId, variants },
            {
              onSuccess: () => {
                hapticSuccess();
                setVariantsTarget(null);
              },
              onError: (e) => {
                hapticWarning();
                Alert.alert(
                  'Could not save options',
                  e instanceof ApiError ? e.message : 'Please try again.',
                );
              },
            },
          );
        }}
      />

      {/* Add-on group links editor */}
      <AddonLinksSheet
        target={addonsTarget}
        groups={addonGroupsQuery.data?.groups ?? []}
        addonsByGroup={addonGroupsQuery.data?.addons_by_group ?? {}}
        saving={replaceAddonLinks.isPending}
        onClose={() => setAddonsTarget(null)}
        onSave={(groupIds) => {
          if (!addonsTarget) return;
          replaceAddonLinks.mutate(
            { id: addonsTarget.serviceId, addonGroupIds: groupIds },
            {
              onSuccess: () => {
                hapticSuccess();
                setAddonsTarget(null);
              },
              onError: (e) => {
                hapticWarning();
                Alert.alert(
                  'Could not save add-ons',
                  e instanceof ApiError ? e.message : 'Please try again.',
                );
              },
            },
          );
        }}
      />

      {/* Edit / create sheet */}
      <Sheet visible={sheetOpen} onClose={closeSheet} maxHeight="88%">
        <View style={styles.sheetBodyWrap}>
              <Text variant="overline" tone="muted">
                {editTarget ? 'Edit service' : 'New service'}
              </Text>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetBody}
                keyboardShouldPersistTaps="handled">
                <Input label="Name" value={name} onChangeText={setName} maxLength={200} />
                <Input
                  label="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  style={styles.multiline}
                />
                <Input
                  label="Duration (minutes)"
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                />
                <View style={styles.moneyRow}>
                  <View style={styles.moneyField}>
                    <Input label="Price (£)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.moneyField}>
                    <Input label="Deposit (£)" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />
                  </View>
                </View>
                {editTarget ? (
                  <View style={styles.switchRow}>
                    <Text variant="bodyMedium">Active (bookable)</Text>
                    <Switch value={isActive} onValueChange={setIsActive} />
                  </View>
                ) : null}

                {error ? (
                  <Text variant="bodySmall" tone="danger">
                    {error}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={closeSheet} />
                <Button label="Save" style={styles.flex1} loading={saving} onPress={() => void handleSave()} />
              </View>
        </View>
      </Sheet>
    </Screen>
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
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  colourDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  serviceText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  serviceBody: {
    padding: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  subList: {
    gap: spacing.xs,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtn: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  sheetBodyWrap: {
    gap: spacing.md,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyField: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
