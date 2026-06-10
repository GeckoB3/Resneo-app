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
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ManagedService,
  ServicePaymentRequirement,
} from '@/types/services-manage';

type EditTarget = {
  id: string;
  /** Snapshot of linked calendar ids — practitioner_ids only sent when changed. */
  practitionerIds: string[];
};

/** Web service colour presets (`APPOINTMENT_SERVICE_COLOUR_OPTIONS`). */
const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const PAYMENT_OPTIONS: { value: ServicePaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the venue or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full price taken at booking' },
];

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
  const { colors } = useTheme();
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

  // Sheet form state (shared between edit + create) — full web form parity.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [buffer, setBuffer] = useState('0');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [paymentReq, setPaymentReq] = useState<ServicePaymentRequirement>('none');
  const [colour, setColour] = useState(COLOUR_OPTIONS[0]!);
  const [advanceDays, setAdvanceDays] = useState('90');
  const [noticeHours, setNoticeHours] = useState('1');
  const [cancelHours, setCancelHours] = useState('48');
  const [sameDay, setSameDay] = useState(true);
  const [practitionerIds, setPractitionerIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Active calendars for the "Offered by" picker.
  const practitionersQuery = usePractitioners();
  const practitioners = (practitionersQuery.data?.practitioners ?? [])
    .filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const services = [...(query.data?.services ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  );

  const linkedCalendarIds = (serviceId: string): string[] =>
    (query.data?.practitioner_services ?? [])
      .filter((link) => link.service_id === serviceId)
      .map((link) => link.practitioner_id);

  const openEdit = (service: ManagedService) => {
    const linked = linkedCalendarIds(service.id);
    setName(service.name);
    setDescription(service.description ?? '');
    setDuration(String(service.duration_minutes));
    setBuffer(String(service.buffer_minutes ?? 0));
    setPrice(penceToPoundsInput(service.price_pence));
    setDeposit(penceToPoundsInput(service.deposit_pence));
    setPaymentReq(service.payment_requirement ?? 'none');
    setColour(service.colour ?? COLOUR_OPTIONS[0]!);
    setAdvanceDays(String(service.max_advance_booking_days ?? 90));
    setNoticeHours(String(service.min_booking_notice_hours ?? 1));
    setCancelHours(String(service.cancellation_notice_hours ?? 48));
    setSameDay(service.allow_same_day_booking !== false);
    setPractitionerIds(linked);
    setIsActive(service.is_active !== false);
    setError(null);
    setEditTarget({ id: service.id, practitionerIds: linked });
  };

  const openCreate = () => {
    setName('');
    setDescription('');
    setDuration('30');
    setBuffer('0');
    setPrice('');
    setDeposit('');
    setPaymentReq('none');
    setColour(COLOUR_OPTIONS[0]!);
    setAdvanceDays('90');
    setNoticeHours('1');
    setCancelHours('48');
    setSameDay(true);
    setPractitionerIds(practitioners.map((p) => p.id));
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
    const bufferMinutes = Number(buffer || '0');
    const advance = Number(advanceDays);
    const notice = Number(noticeHours);
    const cancel = Number(cancelHours);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      setError('Duration must be 5–480 minutes.');
      return;
    }
    if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
      setError('Buffer must be 0–120 minutes.');
      return;
    }
    if (!Number.isInteger(advance) || advance < 1 || advance > 365) {
      setError('Max advance booking must be 1–365 days.');
      return;
    }
    if (!Number.isInteger(notice) || notice < 0 || notice > 168) {
      setError('Min booking notice must be 0–168 hours.');
      return;
    }
    if (!Number.isInteger(cancel) || cancel < 0 || cancel > 168) {
      setError('Cancellation notice must be 0–168 hours.');
      return;
    }
    const pricePence = parsePoundsToPence(price);
    const depositPence = parsePoundsToPence(deposit);
    if (pricePence === undefined || depositPence === undefined) {
      setError('Price and deposit must be valid amounts.');
      return;
    }
    // Web superrefine rules.
    if (paymentReq === 'deposit' && !(depositPence != null && depositPence > 0)) {
      setError('Enter a deposit amount greater than zero for the deposit option.');
      return;
    }
    if (paymentReq === 'full_payment' && !(pricePence != null && pricePence > 0)) {
      setError('Enter a price greater than zero to take full payment online.');
      return;
    }
    if (practitionerIds.length === 0) {
      setError('Select at least one calendar to offer this service.');
      return;
    }

    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      duration_minutes: durationMinutes,
      buffer_minutes: bufferMinutes,
      price_pence: pricePence ?? null,
      deposit_pence: depositPence ?? null,
      payment_requirement: paymentReq,
      colour,
      is_active: isActive,
      max_advance_booking_days: advance,
      min_booking_notice_hours: notice,
      cancellation_notice_hours: cancel,
      allow_same_day_booking: sameDay,
    };

    try {
      if (editTarget) {
        const linksChanged =
          JSON.stringify([...practitionerIds].sort()) !==
          JSON.stringify([...editTarget.practitionerIds].sort());
        await update.mutateAsync({
          id: editTarget.id,
          ...shared,
          // Only send links when changed — replace semantics on the API.
          ...(linksChanged ? { practitioner_ids: practitionerIds } : {}),
        });
      } else {
        await create.mutateAsync({
          ...shared,
          description: shared.description ?? undefined,
          price_pence: pricePence ?? undefined,
          deposit_pence: depositPence ?? undefined,
          practitioner_ids: practitionerIds,
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
                  maxLength={1000}
                />
                <View style={styles.moneyRow}>
                  <View style={styles.moneyField}>
                    <Input
                      label="Duration (mins)"
                      value={duration}
                      onChangeText={setDuration}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.moneyField}>
                    <Input
                      label="Buffer (mins)"
                      value={buffer}
                      onChangeText={setBuffer}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                {/* Online payment rules (web parity: none / deposit / full payment) */}
                <Text variant="overline" tone="muted">
                  Online payment
                </Text>
                {PAYMENT_OPTIONS.map((option) => {
                  const selected = paymentReq === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setPaymentReq(option.value)}
                      style={({ pressed }) => [
                        styles.radioRow,
                        {
                          borderColor: selected ? colors.brand : colors.border,
                          backgroundColor: selected ? colors.brandSubtle : colors.surface,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}>
                      <View
                        style={[
                          styles.radioDot,
                          { borderColor: selected ? colors.brand : colors.borderStrong },
                        ]}>
                        {selected ? (
                          <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} />
                        ) : null}
                      </View>
                      <View style={styles.radioText}>
                        <Text variant="bodyMedium">{option.label}</Text>
                        <Text variant="caption" tone="muted">
                          {option.hint}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                <View style={styles.moneyRow}>
                  <View style={styles.moneyField}>
                    <Input label="Price (£)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                  </View>
                  {paymentReq === 'deposit' ? (
                    <View style={styles.moneyField}>
                      <Input label="Deposit (£)" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />
                    </View>
                  ) : null}
                </View>

                {/* Guest booking rules */}
                <Text variant="overline" tone="muted">
                  Guest booking rules
                </Text>
                <View style={styles.moneyRow}>
                  <View style={styles.moneyField}>
                    <Input
                      label="Book ahead (days)"
                      value={advanceDays}
                      onChangeText={setAdvanceDays}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.moneyField}>
                    <Input
                      label="Min notice (hours)"
                      value={noticeHours}
                      onChangeText={setNoticeHours}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <Input
                  label="Cancellation notice (hours)"
                  helper="Refund cut-off for deposits and online payments."
                  value={cancelHours}
                  onChangeText={setCancelHours}
                  keyboardType="number-pad"
                />
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Allow same-day bookings</Text>
                  <Switch value={sameDay} onValueChange={setSameDay} />
                </View>

                {/* Colour */}
                <Text variant="overline" tone="muted">
                  Calendar colour
                </Text>
                <View style={styles.swatchRow}>
                  {COLOUR_OPTIONS.map((option) => {
                    const selected = colour === option;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityLabel={`Colour ${option}`}
                        accessibilityState={{ selected }}
                        onPress={() => setColour(option)}
                        style={({ pressed }) => [
                          styles.swatch,
                          { backgroundColor: option, opacity: pressed ? 0.7 : 1 },
                          selected
                            ? { borderColor: colors.text, borderWidth: 2.5 }
                            : { borderColor: 'transparent', borderWidth: 2.5 },
                        ]}
                      />
                    );
                  })}
                </View>

                {/* Calendars offering this service */}
                <Text variant="overline" tone="muted">
                  Offered by
                </Text>
                <View style={styles.calendarWrap}>
                  {practitioners.map((practitioner) => {
                    const selected = practitionerIds.includes(practitioner.id);
                    return (
                      <Pressable
                        key={practitioner.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setPractitionerIds((current) =>
                            selected
                              ? current.filter((id) => id !== practitioner.id)
                              : [...current, practitioner.id],
                          )
                        }
                        style={({ pressed }) => [
                          styles.calendarChip,
                          {
                            backgroundColor: selected ? colors.brand : colors.surface,
                            borderColor: selected ? colors.brand : colors.border,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}>
                        <Text
                          variant="label"
                          color={selected ? colors.onBrand : colors.textSecondary}
                          numberOfLines={1}>
                          {practitioner.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Active (visible to clients)</Text>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

                <Text variant="caption" tone="muted">
                  Custom availability windows, processing-time blocks and per-calendar staff
                  overrides are managed on the web dashboard.
                </Text>

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
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  radioText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
  },
  calendarWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  calendarChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
