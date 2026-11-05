/**
 * A member's calendars against the collective page's services (web `MemberCalendarsGrid`,
 * 2026-11-05): which calendar offers what at a glance, ticks for as many services as the member
 * likes, saved together through POST /api/venue/collectives/{id}/my-calendars. A calendar's own box
 * ticks or clears it for every service. A switched-off calendar shows only where it still offers
 * something, and can be cleared but not given more. Removals that leave upcoming bookings are asked
 * about once for the whole save; the bookings stay.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { apiFetch, ApiError } from '@/lib/api/client';
import { appointmentCalendarsOf } from '@/lib/calendar/schedule-calendars';
import { areaCopy } from '@/lib/collective-area/copy';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const NAME_WIDTH = 150;
const CELL_WIDTH = 92;
const ROW_HEIGHT = 48;

const cellKey = (serviceId: string, calendarId: string) => `${serviceId}:${calendarId}`;

interface AffectedBooking {
  id: string;
  service_name?: string;
  calendar_name?: string;
  guest_name?: string;
  booking_date?: string;
  booking_time?: string;
}

interface SaveBody {
  results?: { service_id: string; ok: boolean; message?: string }[];
}

interface ConfirmBody {
  requires_confirmation?: boolean;
  message?: string;
  error?: string;
  affected_bookings?: AffectedBooking[];
  affected_total?: number;
}

function TickBox({
  state,
  label,
  disabled,
  changed,
  onPress,
}: {
  state: 'on' | 'off' | 'mixed';
  label: string;
  disabled?: boolean;
  changed?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const filled = state !== 'off';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: state === 'mixed' ? 'mixed' : state === 'on', disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.cell,
        changed ? { backgroundColor: colors.warningSurface } : null,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <View
        style={[
          styles.box,
          { borderColor: filled ? colors.brand : colors.border },
          filled ? { backgroundColor: colors.brand } : null,
        ]}
      >
        {state === 'on' ? (
          <Text variant="caption" color={colors.onColor}>
            ✓
          </Text>
        ) : state === 'mixed' ? (
          <View style={[styles.dash, { backgroundColor: colors.onColor }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function MemberCalendarsGrid({ collectiveId, collectiveName }: { collectiveId: string; collectiveName: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const servicesQuery = useManagedServices();
  // Switched-off calendars too: one that still offers a service is shown, to be cleared.
  const practitionersQuery = usePractitioners({ includeInactive: true });
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);

  const services = useMemo(
    () => (servicesQuery.data?.services ?? []).filter((s) => s.collective?.role === 'replica'),
    [servicesQuery.data],
  );
  const offers = useMemo(
    () => new Set((servicesQuery.data?.practitioner_services ?? []).map((l) => cellKey(l.service_id, l.practitioner_id))),
    [servicesQuery.data],
  );
  const columns = useMemo(
    () =>
      appointmentCalendarsOf(
        [...(practitionersQuery.data?.practitioners ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      ).filter((c) => c.is_active !== false || services.some((s) => offers.has(cellKey(s.id, c.id)))),
    [practitionersQuery.data, services, offers],
  );

  const isOn = (serviceId: string, calendarId: string) => {
    const key = cellKey(serviceId, calendarId);
    return staged.has(key) ? staged.get(key)! : offers.has(key);
  };
  const set = (pairs: { serviceId: string; calendarId: string }[], value: boolean) => {
    setErrors([]);
    setStaged((prev) => {
      const next = new Map(prev);
      for (const { serviceId, calendarId } of pairs) {
        const key = cellKey(serviceId, calendarId);
        if (offers.has(key) === value) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  };

  const changes = useMemo(() => {
    const byService = new Map<string, { add: string[]; remove: string[] }>();
    for (const [key, value] of staged) {
      const [serviceId, calendarId] = key.split(':') as [string, string];
      const entry = byService.get(serviceId) ?? { add: [], remove: [] };
      (value ? entry.add : entry.remove).push(calendarId);
      byService.set(serviceId, entry);
    }
    return [...byService.entries()].map(([service_id, e]) => ({ service_id, ...e }));
  }, [staged]);

  const save = async (acknowledge: boolean) => {
    if (!accessToken) return;
    setSaving(true);
    setErrors([]);
    try {
      const data = await apiFetch<SaveBody>(`/api/venue/collectives/${collectiveId}/my-calendars`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ changes, ...(acknowledge ? { acknowledge_affected: true } : {}) }),
      });
      setConfirm(null);
      // Read the calendars again first, so the ticks never flash back to before the save.
      await queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
      const failed = (data.results ?? []).filter((r) => !r.ok);
      const failedIds = new Set(failed.map((r) => r.service_id));
      setStaged((prev) => new Map([...prev].filter(([key]) => failedIds.has(key.split(':')[0]!))));
      if (failed.length > 0) {
        setErrors(
          failed.map((r) =>
            areaCopy('mcg.failed', {
              service: services.find((s) => s.id === r.service_id)?.name ?? 'A service',
              message: r.message ?? 'Could not save.',
            }),
          ),
        );
      } else {
        toast.success(areaCopy('mcg.saved', { collective: collectiveName }));
      }
    } catch (err) {
      const body = (err instanceof ApiError ? err.body : null) as ConfirmBody | null;
      if (err instanceof ApiError && err.status === 409 && body?.requires_confirmation) {
        const lines = (body.affected_bookings ?? [])
          .slice(0, 5)
          .map((b) => `${b.service_name ?? ''} with ${b.calendar_name ?? ''}: ${b.guest_name ?? ''}, ${b.booking_date ?? ''} ${b.booking_time ?? ''}`.trim());
        const more = (body.affected_total ?? 0) > 5 ? [`and ${(body.affected_total ?? 0) - 5} more`] : [];
        setConfirm({ message: [body.message ?? body.error ?? '', ...lines, ...more].filter(Boolean).join('\n') });
        return;
      }
      setErrors([err instanceof ApiError ? err.message : 'Could not save your calendars. Please check your connection.']);
    } finally {
      setSaving(false);
    }
  };

  if (!servicesQuery.data || !practitionersQuery.data || services.length === 0) return null;
  const count = staged.size;

  return (
    <View style={styles.stack} testID="member-calendars-grid">
      <Text variant="label">{areaCopy('mcg.title')}</Text>
      <Text variant="caption" tone="secondary">
        {areaCopy('mcg.intro', { collective: collectiveName })}
      </Text>
      {columns.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {areaCopy('mcg.noCalendars')}
        </Text>
      ) : (
        <Card padded={false}>
          <View style={styles.table}>
            {/* The service names stay put while the calendars scroll sideways. */}
            <View style={{ width: NAME_WIDTH }}>
              <View style={[styles.headCell, { borderBottomColor: colors.border }]}>
                <Text variant="caption" tone="secondary">
                  {areaCopy('mcg.service')}
                </Text>
              </View>
              {services.map((s) => (
                <View key={s.id} style={[styles.nameCell, { borderBottomColor: colors.border }]}>
                  <Text variant="bodySmall" numberOfLines={2}>
                    {s.name}
                  </Text>
                </View>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              {columns.map((c) => {
                const off = c.is_active === false;
                const onCount = services.filter((s) => isOn(s.id, c.id)).length;
                const all = onCount === services.length;
                return (
                  <View key={c.id} style={{ width: CELL_WIDTH }}>
                    <View style={[styles.headCell, styles.headCalendar, { borderBottomColor: colors.border }]}>
                      <Text variant="caption" numberOfLines={1}>
                        {c.name}
                      </Text>
                      {off ? (
                        <Text variant="caption" tone="muted">
                          {areaCopy('mcg.calendarOff')}
                        </Text>
                      ) : null}
                      <TickBox
                        state={all ? 'on' : onCount > 0 ? 'mixed' : 'off'}
                        label={all ? areaCopy('mcg.columnNone', { calendar: c.name }) : areaCopy('mcg.columnAll', { calendar: c.name })}
                        disabled={saving || (off && onCount === 0)}
                        onPress={() =>
                          set(
                            services.map((s) => ({ serviceId: s.id, calendarId: c.id })),
                            off ? false : !all,
                          )
                        }
                      />
                      <Text variant="caption" tone="muted">
                        {areaCopy('mcg.count', { count: onCount, total: services.length })}
                      </Text>
                    </View>
                    {services.map((s) => {
                      const on = isOn(s.id, c.id);
                      const changed = staged.has(cellKey(s.id, c.id));
                      return (
                        <View key={s.id} style={[styles.rowCell, { borderBottomColor: colors.border }]}>
                          <TickBox
                            state={on ? 'on' : 'off'}
                            label={areaCopy('mcg.cell', { service: s.name, calendar: c.name })}
                            disabled={saving || (off && !on && !changed)}
                            changed={changed}
                            onPress={() => set([{ serviceId: s.id, calendarId: c.id }], !on)}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Card>
      )}
      {errors.map((e) => (
        <Text key={e} variant="bodySmall" tone="danger">
          {e}
        </Text>
      ))}
      {count > 0 ? (
        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.flex1}>
            {count === 1 ? areaCopy('mcg.changes.one') : areaCopy('mcg.changes.many', { count })}
          </Text>
          <Button
            label={areaCopy('mcg.discard')}
            variant="secondary"
            size="sm"
            disabled={saving}
            onPress={() => {
              setStaged(new Map());
              setErrors([]);
            }}
          />
          <Button label={areaCopy('mcg.save')} size="sm" loading={saving} disabled={saving} onPress={() => void save(false)} />
        </View>
      ) : null}
      <ConfirmSheet
        visible={confirm !== null}
        title={areaCopy('mcg.confirm.title')}
        message={confirm?.message ?? ''}
        confirmLabel={areaCopy('mcg.confirm.keep')}
        cancelLabel={areaCopy('mcg.confirm.back')}
        loading={saving}
        onConfirm={() => void save(true)}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  table: { flexDirection: 'row' },
  headCell: {
    minHeight: 96,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headCalendar: { alignItems: 'center', gap: 2 },
  nameCell: {
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dash: { width: 10, height: 2, borderRadius: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex1: { flex: 1 },
});
