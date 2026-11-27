import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { OnPageControl } from '@/components/services/collective/OnPageControl';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import {
  collectiveBadge,
  collectiveServiceLines,
  collectiveStatusBadge,
  isSwitchedOffOnPage,
} from '@/lib/services/collective-service';
import { cardHoldFeePercentOf, cardHoldPercentLabel } from '@/lib/booking/card-hold-fee';
import { formatPence, formatPositivePence } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService } from '@/types/services-manage';
import { radius, spacing } from '@/theme/index';

// ServiceRow, moved out of the Services screen (`app/(app)/manage/services.tsx`)
// unchanged (codebase standards P5.2).

/** Per-calendar offer state for the non-admin "Offer on your calendars" toggles. */
export type OfferCalendar = { id: string; name: string; enabled: boolean };

function ServiceRowBase({
  service,
  expanded,
  isAdmin,
  canManage,
  offerCalendars,
  canOverride,
  togglingKey,
  onToggle,
  onEdit,
  onDelete,
  onToggleCalendar,
  onOverride,
  onMoveUp = null,
  onMoveDown = null,
  onView = null,
  suggest = null,
  reorderPending = false,
  pageOn = null,
  pageBusy = false,
  onPageChange = null,
  memberVenueNames,
  onSwitchOn = null,
  switchingOn = false,
}: {
  service: ManagedService;
  expanded: boolean;
  isAdmin: boolean;
  /** Admin, or the non-admin creator of this service — may Edit/Delete it. */
  canManage: boolean;
  /**
   * Non-admin self-service "Offer on your calendars" toggles (the staff
   * member's managed calendars + whether each currently offers this service).
   * Empty for admins (they manage links in the form's "Offered by" section).
   */
  offerCalendars: OfferCalendar[];
  /** Non-admin may set per-calendar field overrides (service permits + offers). */
  canOverride: boolean;
  /** `${serviceId}:${calendarId}` currently saving a toggle, or null. */
  togglingKey: string | null;
  onToggle: (id: string) => void;
  onEdit: (service: ManagedService) => void;
  onDelete: (service: ManagedService) => void;
  onToggleCalendar: (serviceId: string, calendarId: string, nextEnabled: boolean) => void;
  onOverride: (service: ManagedService) => void;
  /** Admin display-order controls; null at the list edges. */
  onMoveUp?: (() => void) | null;
  onMoveDown?: (() => void) | null;
  /** A host's service at a member: opens the member's read-only view (web `MemberServiceView`). */
  onView?: ((service: ManagedService) => void) | null;
  /**
   * A member's parked service (web "Suggest to {host}"): the button's words and what it does, or,
   * once suggested and the host has not answered, only the words ("Suggested to {host}").
   */
  suggest?: { label: string; onPress: ((service: ManagedService) => void) | null } | null;
  reorderPending?: boolean;
  /** A host admin's own service: whether it is on the collective page. Null shows no control (CQ-10.2). */
  pageOn?: boolean | null;
  pageBusy?: boolean;
  onPageChange?: ((service: ManagedService, next: boolean) => void) | null;
  /** The other venues, for the host's switched-off line (CQ-13). */
  memberVenueNames?: readonly string[];
  /** A page service switched off at the host: switches it back on (CQ-13). */
  onSwitchOn?: ((service: ManagedService) => void) | null;
  switchingOn?: boolean;
}) {
  const { colors } = useTheme();
  const price = formatPence(service.price_pence);
  // Positive-only: non-deposit services now persist deposit_pence: 0 (web parity),
  // so format with the zero-hiding helper to avoid a misleading "Deposit £0.00" row.
  const deposit = formatPositivePence(service.deposit_pence);
  const variants = service.variants ?? [];
  const addonGroups = service.addon_groups ?? [];
  // D5: for card-hold services the deposit column holds the no-show fee, unless the fee is a
  // percentage of the price (web 2026-11-25), which reads "50% of the price".
  const isCardHold = service.payment_requirement === 'card_hold';
  const holdPercent = isCardHold ? cardHoldFeePercentOf(service) : null;
  const holdFee = holdPercent != null ? cardHoldPercentLabel(holdPercent) : deposit;
  const roleBadge = collectiveBadge(service);
  const statusBadge = collectiveStatusBadge(service);
  const collectiveLines = collectiveServiceLines(service, { memberVenueNames });

  return (
    <Card padded={false} style={styles.serviceCard} testID={`services-row-${service.id}`}>
      <Pressable
        onPress={() => onToggle(service.id)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.serviceHeader, { opacity: pressed ? 0.55 : 1 }]}>
        <View style={[styles.colourDot, { backgroundColor: service.colour ?? colors.brand }]} />
        <View style={styles.serviceText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {service.name}
          </Text>
          {/* Price first, then the duration behind a clock glyph (web #184). */}
          <View style={styles.serviceFacts}>
            {price ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {price} ·{' '}
              </Text>
            ) : null}
            <SymbolView
              name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
              tintColor={colors.textMuted}
              size={12}
              accessibilityLabel="Duration"
            />
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.serviceFactsText}>
              {' '}
              {service.duration_minutes} min
              {variants.length ? ` · ${variants.length} option${variants.length === 1 ? '' : 's'}` : ''}
              {addonGroups.length ? ` · ${addonGroups.length} add-on group${addonGroups.length === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
          {/* Badges sit on their own line so two of them never squeeze the name. */}
          {service.is_active === false || roleBadge || statusBadge ? (
            <View style={styles.serviceBadges}>
              {service.is_active === false ? <Badge label="Inactive" tone="neutral" /> : null}
              {roleBadge ? <Badge label={roleBadge.label} tone={roleBadge.tone} /> : null}
              {statusBadge ? <Badge label={statusBadge.label} tone={statusBadge.tone} /> : null}
            </View>
          ) : null}
        </View>
        <Text variant="title" tone="muted">
          {expanded ? '▾' : '›'}
        </Text>
      </Pressable>

      {pageOn !== null ? (
        <View style={styles.pageControl}>
          <OnPageControl
            on={pageOn}
            busy={pageBusy}
            label={`${areaCopy('svc.card.onPageSwitch', { collective: service.collective?.collective_name })}: ${service.name}`}
            onChange={(next) => onPageChange?.(service, next)}
          />
        </View>
      ) : null}

      {expanded ? (
        <View style={[styles.serviceBody, { borderTopColor: colors.border }]}>
          {collectiveLines.map((line) => (
            <Text key={line} variant="caption" tone="secondary">
              {line}
            </Text>
          ))}
          {onSwitchOn && isSwitchedOffOnPage(service) ? (
            <View style={styles.editRow}>
              <Button
                label={areaCopy('ov.grid.row.turnOn')}
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                loading={switchingOn}
                onPress={() => onSwitchOn(service)}
              />
            </View>
          ) : null}
          {service.description?.trim() ? (
            <Text variant="bodySmall" tone="secondary">
              {service.description}
            </Text>
          ) : null}
          <View style={styles.metaGrid}>
            {isCardHold ? (
              <Text variant="caption" tone="muted">
                {holdPercent != null
                  ? `Card hold: no-show fee ${cardHoldPercentLabel(holdPercent)}`
                  : holdFee
                    ? `Card hold: ${holdFee} no-show fee`
                    : 'Card hold'}
              </Text>
            ) : deposit ? (
              <Text variant="caption" tone="muted">Deposit {deposit}</Text>
            ) : null}
            {service.buffer_minutes ? (
              <Text variant="caption" tone="muted">Buffer {service.buffer_minutes} min</Text>
            ) : null}
            {!isCardHold && service.payment_requirement && service.payment_requirement !== 'none' ? (
              <Text variant="caption" tone="muted">
                Payment: {service.payment_requirement.replace('_', ' ')}
              </Text>
            ) : null}
            {service.cancellation_notice_hours != null ? (
              <Text variant="caption" tone="muted">
                Cancel notice {service.cancellation_notice_hours}h
              </Text>
            ) : null}
            {service.custom_availability_enabled ? (
              <Text variant="caption" tone="muted">Custom schedule</Text>
            ) : null}
          </View>

          {variants.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">Options</Text>
              {variants.map((variant) => {
                const staffVariant = variant as typeof variant & { is_active?: boolean };
                return (
                  <Text key={variant.id} variant="bodySmall" tone="secondary">
                    • {variant.name} ({variant.duration_minutes} min)
                    {variant.price_pence != null ? ` · ${formatPence(variant.price_pence)}` : ''}
                    {staffVariant.is_active === false ? ' (inactive)' : ''}
                  </Text>
                );
              })}
            </View>
          ) : null}

          {addonGroups.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">Add-on groups</Text>
              {addonGroups.map((group) => (
                <Text key={group.group.id} variant="bodySmall" tone="secondary">
                  • {group.group.name} ({group.addons.length} add-on
                  {group.addons.length === 1 ? '' : 's'})
                </Text>
              ))}
            </View>
          ) : null}

          {/* Non-admin self-service: "Offer on your calendars" toggles (web
              parity). Each toggle replaces the FULL service set for that one
              calendar via PUT /api/venue/practitioner-services, scoped to
              calendars the staff member manages — so the old re-link privilege
              hole stays closed (admins still edit every link in the form). */}
          {offerCalendars.length > 0 ? (
            <View style={styles.offerBox}>
              <Text variant="overline" tone="muted">
                Offer on your calendars
              </Text>
              {offerCalendars.map((cal) => (
                <View
                  key={cal.id}
                  style={[styles.offerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text variant="bodySmall" numberOfLines={1} style={styles.offerName}>
                    {cal.name}
                  </Text>
                  <Switch
                    value={cal.enabled}
                    disabled={togglingKey === `${service.id}:${cal.id}`}
                    onValueChange={(next) => onToggleCalendar(service.id, cal.id, next)}
                    accessibilityLabel={`Offer ${service.name} on ${cal.name}`}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* Per-calendar field overrides — non-admin, when the service permits
              customisation and the staff member offers it. */}
          {!isAdmin && canOverride ? (
            <Button
              label="Edit your settings"
              variant="secondary"
              size="sm"
              onPress={() => onOverride(service)}
            />
          ) : null}

          {/* Display order — admins reorder the venue's service list (web 2026-07:
              the saved order drives the booking page and staff booking form). */}
          {isAdmin && (onMoveUp || onMoveDown) ? (
            <View style={styles.editRow}>
              <Button
                label="Move up"
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                disabled={!onMoveUp || reorderPending}
                onPress={() => onMoveUp?.()}
              />
              <Button
                label="Move down"
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                disabled={!onMoveDown || reorderPending}
                onPress={() => onMoveDown?.()}
              />
            </View>
          ) : null}

          {/* A member asks its host to add a parked service (web "Suggest to {host}"). */}
          {suggest ? (
            suggest.onPress ? (
              <View style={styles.editRow}>
                <Button
                  label={suggest.label}
                  variant="secondary"
                  size="sm"
                  style={styles.editBtnFull}
                  onPress={() => suggest.onPress?.(service)}
                />
              </View>
            ) : (
              <Text variant="caption" tone="secondary">
                {suggest.label}
              </Text>
            )
          ) : null}

          {/* A service the host manages: look at it and choose this venue's calendars (web "View"). */}
          {onView ? (
            <View style={styles.editRow}>
              <Button
                label={areaCopy('svc.member.card.view')}
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                onPress={() => onView(service)}
              />
            </View>
          ) : null}

          {/* Edit/Delete — admins, or the non-admin who created this service
              (created_by_staff_id-scoped, matching the API's own enforcement). */}
          {canManage ? (
            <View style={styles.editRow}>
              <Button label="Edit" variant="secondary" size="sm" style={styles.editBtnFull} onPress={() => onEdit(service)} />
            </View>
          ) : null}
          {canManage ? (
            <Button
              label="Delete service"
              variant="ghost"
              size="sm"
              onPress={() => onDelete(service)}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Memoized so untouched rows don't re-render when another row expands/collapses. */
export const ServiceRow = memo(ServiceRowBase);

const styles = StyleSheet.create({
  pageControl: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
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
  serviceBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  serviceFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  serviceFactsText: {
    flexShrink: 1,
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
  editBtnFull: {
    flex: 1,
  },
  // Non-admin "Offer on your calendars" toggles in the expanded row.
  offerBox: {
    gap: spacing.xs,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.base,
    minHeight: 48,
  },
  offerName: {
    flex: 1,
    minWidth: 0,
  },
});
