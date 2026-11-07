import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { SELECT_TEXT_ON_FOCUS_PROP, selectAllOnFocus } from '@/components/ui/selectAllOnFocus';
import { currentChoice, planServiceChanges } from '@/lib/compliance/choose-services';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  COMPLIANCE_ENFORCEMENT_DESCRIPTIONS,
  COMPLIANCE_ENFORCEMENT_OPTIONS,
  COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS,
  COMPLIANCE_ONLINE_COLLECTION_OPTIONS,
  useAddComplianceRequirement,
  useAllComplianceRequirements,
  useDeleteComplianceRequirement,
  type ComplianceEnforcement,
  type ComplianceOnlineCollection,
} from '@/lib/queries/useComplianceRequirements';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The form the services are chosen for. */
export interface ChooseServicesForm {
  id: string;
  name: string;
  /** Its capture methods include `client_online`, so the terms ask how it is collected online. */
  clientOnline: boolean;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  form: ChooseServicesForm | null;
  /** Opened right after the form was created: the title says it is ready. */
  justCreated?: boolean;
  /** After a save, whole or partial, so the Forms list can refresh its counts. */
  onSaved?: () => void;
};

type Choice = { allBookings: boolean; serviceIds: Set<string> };

/** Lead time as the web sends it: blank is none, otherwise whole hours, 0 to 8760. */
function leadTimeHours(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Math.max(0, Math.min(8760, Math.round(Number(raw))));
  return Number.isFinite(n) ? n : null;
}

/**
 * "Choose services" for one form (web `ChooseServicesDialog`, owner 2026-11-07): tick All bookings
 * and every service that should ask for it, in one place, instead of opening each service in turn.
 * Newly ticked rows get the terms set here; unticking removes the form from that service; rows left
 * as they were keep their own terms. Opened from the Forms list and the form editor, and straight
 * after a form is created. Errors show inside the sheet: a toast would be drawn behind it.
 */
export function ComplianceChooseServicesSheet({ visible, onClose, form, justCreated = false, onSaved }: Props) {
  const { colors } = useTheme();
  const servicesQuery = useManagedServices();
  const reqsQuery = useAllComplianceRequirements(visible && form !== null);
  const addReq = useAddComplianceRequirement();
  const deleteReq = useDeleteComplianceRequirement();
  const leadTimeRef = useRef<TextInput>(null);

  const services = (servicesQuery.data?.services ?? []).filter((s) => s.is_active !== false);
  const formId = form?.id ?? '';
  const current = useMemo(
    () => currentChoice(reqsQuery.data?.requirements ?? [], formId),
    [reqsQuery.data, formId],
  );

  // The ticks start from what is saved and are kept only once the user changes one.
  const [edited, setEdited] = useState<Choice | null>(null);
  const [enforcement, setEnforcement] = useState<ComplianceEnforcement>('warn_staff');
  const [leadTime, setLeadTime] = useState('');
  const [onlineCollection, setOnlineCollection] = useState<ComplianceOnlineCollection>('confirmation_link');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every opening (and every other form) starts afresh, as the web dialog does on each mount.
  const openKey = visible && form ? form.id : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (openKey !== seenKey) {
    setSeenKey(openKey);
    if (openKey) {
      setEdited(null);
      setEnforcement('warn_staff');
      setLeadTime('');
      setOnlineCollection('confirmation_link');
      setSaving(false);
      setError(null);
    }
  }

  const choice: Choice = edited ?? { allBookings: current.allBookings, serviceIds: new Set(current.serviceIds) };
  const plan = planServiceChanges(current, choice, new Set(services.map((s) => s.id)));
  const loading = servicesQuery.isLoading || reqsQuery.isLoading;

  function toggleService(id: string, on: boolean) {
    const next = new Set(choice.serviceIds);
    if (on) next.add(id);
    else next.delete(id);
    setEdited({ allBookings: choice.allBookings, serviceIds: next });
  }

  function close() {
    setEdited(null);
    setError(null);
    onClose();
  }

  async function save() {
    if (!form) return;
    // The plan and the rows it was made from, as they were when Save was tapped.
    const changes = plan;
    const before = current;
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    const nameOf = (serviceId: string) => services.find((s) => s.id === serviceId)?.name ?? 'a service';
    const terms = {
      compliance_type_id: form.id,
      enforcement,
      online_collection: form.clientOnline ? onlineCollection : ('none' as const),
      lock_period_hours: leadTimeHours(leadTime),
    };
    try {
      // One request per change, through the same routes as Requirements, so each reaches the
      // collective's members exactly as a change made there would.
      for (const a of changes.add) {
        try {
          await addReq.mutateAsync(
            a.scope === 'venue'
              ? { scope: 'venue', ...terms }
              : { scope: 'service', service_id: a.serviceId, ...terms },
          );
        } catch {
          failed.push(a.scope === 'venue' ? 'All bookings' : nameOf(a.serviceId));
        }
      }
      for (const requirementId of changes.remove) {
        try {
          await deleteReq.mutateAsync(requirementId);
        } catch {
          const serviceId = [...before.requirementIdByService].find(([, id]) => id === requirementId)?.[0];
          failed.push(serviceId ? nameOf(serviceId) : 'All bookings');
        }
      }
      await reqsQuery.refetch();
      onSaved?.();
      if (failed.length > 0) {
        hapticWarning();
        setEdited(null);
        setError(`Some changes could not be saved: ${failed.join(', ')}. Try again.`);
        return;
      }
      hapticSuccess();
      close();
    } finally {
      setSaving(false);
    }
  }

  const name = form?.name ?? '';
  const title = justCreated ? `${name} is ready. Which services need it?` : `Which services ask for ${name}?`;
  const askedForSomewhere = current.serviceIds.size + (current.allBookings ? 1 : 0) > 0;

  return (
    <Sheet visible={visible} onClose={close} fill maxHeight="92%">
      <View style={styles.header}>
        <Text variant="subheading">{title}</Text>
        <Text variant="bodySmall" tone="muted">
          Tick where this form is asked for. Unticking stops it being asked for there.
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        testID="choose-services">
        {error ? (
          <View
            testID="choose-services-error"
            style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <Text variant="bodySmall" tone="muted">
            Loading services…
          </Text>
        ) : (
          <>
            <View style={[styles.box, { borderColor: colors.border }]}>
              <TickRow
                label="All bookings"
                help="Every appointment booking asks for it."
                checked={choice.allBookings}
                onChange={(on) => setEdited({ allBookings: on, serviceIds: new Set(choice.serviceIds) })}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text variant="label" tone="secondary">
                  Services
                </Text>
                {services.length > 0 ? (
                  <View style={styles.sectionActions}>
                    <Button
                      label="Select all"
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        setEdited({ allBookings: choice.allBookings, serviceIds: new Set(services.map((s) => s.id)) })
                      }
                    />
                    <Button
                      label="Clear"
                      variant="ghost"
                      size="sm"
                      onPress={() => setEdited({ allBookings: choice.allBookings, serviceIds: new Set() })}
                    />
                  </View>
                ) : null}
              </View>
              {services.length === 0 ? (
                <Text variant="bodySmall" tone="muted">
                  No services yet. Add services first, then come back.
                </Text>
              ) : (
                <View style={[styles.box, { borderColor: colors.border }]}>
                  {services.map((s, index) => (
                    <View
                      key={s.id}
                      style={
                        index > 0
                          ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                          : null
                      }>
                      <TickRow
                        label={s.name}
                        checked={choice.serviceIds.has(s.id)}
                        onChange={(on) => toggleService(s.id, on)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            {plan.add.length > 0 ? (
              <View
                testID="choose-services-terms"
                style={[styles.terms, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text variant="bodyMedium">For the services you add</Text>

                <View style={styles.field}>
                  <Text variant="label" tone="secondary">
                    When unmet
                  </Text>
                  <View style={styles.chipWrap}>
                    {COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => (
                      <Chip
                        key={o.value}
                        label={o.label}
                        selected={enforcement === o.value}
                        onPress={() => setEnforcement(o.value)}
                      />
                    ))}
                  </View>
                  {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[enforcement] ? (
                    <Text variant="caption" tone="muted">
                      {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[enforcement]}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.field}>
                  <Text variant="label" tone="secondary">
                    Lead time (optional)
                  </Text>
                  <View style={styles.leadRow}>
                    <TextInput
                      ref={leadTimeRef}
                      value={leadTime}
                      onChangeText={setLeadTime}
                      onFocus={() => selectAllOnFocus(leadTimeRef.current, leadTime)}
                      keyboardType="number-pad"
                      selectTextOnFocus={SELECT_TEXT_ON_FOCUS_PROP}
                      placeholder="None"
                      placeholderTextColor={colors.textMuted}
                      accessibilityLabel="Lead time (optional)"
                      style={[
                        styles.leadInput,
                        { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                      ]}
                    />
                    <Text variant="bodySmall" tone="muted" style={styles.leadSuffix}>
                      hours before the appointment
                    </Text>
                  </View>
                </View>

                {form?.clientOnline ? (
                  <View style={styles.field}>
                    <Text variant="label" tone="secondary">
                      Online booking
                    </Text>
                    <View style={styles.chipWrap}>
                      {COMPLIANCE_ONLINE_COLLECTION_OPTIONS.map((o) => (
                        <Chip
                          key={o.value}
                          label={o.label}
                          selected={onlineCollection === o.value}
                          onPress={() => setOnlineCollection(o.value)}
                        />
                      ))}
                    </View>
                    {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[onlineCollection] ? (
                      <Text variant="caption" tone="muted">
                        {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[onlineCollection]}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {askedForSomewhere ? (
                  <Text variant="caption" tone="muted">
                    Services that already ask for it keep their own settings. Change them in Requirements.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        <View style={styles.spacer} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
        <Button
          label={justCreated ? 'Not now' : 'Cancel'}
          variant="secondary"
          onPress={close}
          style={styles.footerBtn}
        />
        <Button
          label={saving ? 'Saving…' : 'Save'}
          variant="primary"
          disabled={saving || loading || (plan.add.length === 0 && plan.remove.length === 0)}
          onPress={() => void save()}
          style={styles.footerBtnPrimary}
        />
      </View>
    </Sheet>
  );
}

/** A tick box with its label (the web's checkbox row), as the app's other tick lists draw it. */
function TickRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => [styles.tickRow, { opacity: pressed ? 0.7 : 1 }]}>
      <View
        style={[
          styles.tickBox,
          {
            borderColor: checked ? colors.brand : colors.borderStrong,
            backgroundColor: checked ? colors.brand : 'transparent',
          },
        ]}>
        {checked ? (
          <Text variant="caption" color={colors.onBrand}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={styles.tickText}>
        <Text variant="bodyMedium">{label}</Text>
        {help ? (
          <Text variant="caption" tone="muted">
            {help}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  errorBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  tickBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tickText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  terms: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  leadInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 44,
    width: 96,
  },
  leadSuffix: {
    flex: 1,
    minWidth: 0,
  },
  spacer: {
    height: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
  },
  footerBtnPrimary: {
    flex: 2,
  },
});
