import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { GuestTagEditor } from '@/components/clients/GuestTagEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useUpdateBookingDetails,
  type UpdateBookingDetailsInput,
} from '@/lib/queries/useBookingMutations';
import { useUpdateGuest } from '@/lib/queries/useGuestMutations';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail } from '@/types/booking-detail';

/**
 * Tap-to-edit note field — mirrors the web `EditableField`. Reads as a bordered
 * value (dashed "add…" affordance when empty); tapping reveals an inline input
 * with Save/Cancel. Each field saves on its own, so there is no bundled form.
 */
function InlineEditableNote({
  label,
  value,
  placeholder,
  multiline = false,
  disabled = false,
  accessibilityLabel,
  onSave,
}: {
  /** Small caption above the field. Omit when a section header already labels it. */
  label?: string;
  value: string | null | undefined;
  placeholder: string;
  multiline?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  onSave: (next: string | null) => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Focus the field one frame AFTER it mounts rather than with `autoFocus`.
  // autoFocus opens the keyboard during the same commit that swaps the short
  // read row for the taller input — that height change + the keyboard + the
  // sheet's shrink all animate at once and strand a white gap on Android/Fabric.
  // Deferring to the next frame lets the row settle first, so the keyboard opens
  // cleanly. (set-state-free, so it's safe on Fabric — see textinput-focus.)
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const normalized = (value ?? '').trim();
  const hasValue = normalized.length > 0;
  const isDirty = draft.trim() !== normalized;

  const save = async () => {
    if (!isDirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Empty → null clears the field; otherwise trim only trailing whitespace
      // so intentional internal spacing/newlines survive (web parity).
      await onSave(draft.trim() ? draft.trimEnd() : null);
      hapticSuccess();
      setEditing(false);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = () => {
    // Seed from the latest saved value as we enter edit mode — avoids syncing
    // `draft` from props via an effect (which would clobber mid-edit typing).
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setError(null);
    setEditing(false);
  };

  const a11yLabel =
    accessibilityLabel ?? `${hasValue ? 'Edit' : 'Add'} ${(label ?? 'note').toLowerCase()}`;

  return (
    <View style={styles.field}>
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
      {editing ? (
        <>
          <Input
            ref={inputRef}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              if (error) setError(null);
            }}
            placeholder={placeholder}
            multiline={multiline}
            editable={!saving}
            style={multiline ? styles.multiline : undefined}
            error={error ?? undefined}
          />
          <View style={styles.editActions}>
            <Button
              label="Save"
              size="sm"
              onPress={() => void save()}
              loading={saving}
              disabled={!isDirty}
            />
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={cancel}
              disabled={saving}
            />
            {isDirty && !saving ? (
              <Text variant="caption" tone="muted" style={styles.dirtyHint}>
                Unsaved changes
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          onPress={disabled ? undefined : beginEdit}
          disabled={disabled}
          style={({ pressed }) => [
            styles.readField,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderStyle: hasValue ? 'solid' : 'dashed',
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Text variant="bodySmall" tone={hasValue ? 'default' : 'muted'}>
            {hasValue ? normalized : placeholder}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The booking detail "Notes" body, rebuilt to web parity. Two clearly separated
 * scopes:
 *   • Booking notes — special requests / staff notes (and dietary for tables),
 *     edited inline per field and saved to THIS booking.
 *   • Customer notes + tags — saved on the guest, so they persist across every
 *     booking for this client.
 *
 * Replaces the old single "Edit" sheet that bundled guest contact (name / phone
 * / email) with the booking notes; contact details are edited from the contact
 * screen, matching the web drawer.
 */
export function BookingNotesSection({
  booking,
  isTable,
}: {
  booking: BookingDetail;
  isTable: boolean;
}) {
  const { colors } = useTheme();
  const updateBooking = useUpdateBookingDetails(booking.id);
  const guestId = booking.guest?.id ?? null;
  const updateGuest = useUpdateGuest(guestId ?? '');

  const saveBookingField =
    (field: keyof UpdateBookingDetailsInput) => (next: string | null) =>
      updateBooking.mutateAsync({ [field]: next } as UpdateBookingDetailsInput);

  return (
    <View style={styles.root}>
      {/* This booking */}
      {isTable && booking.occasion?.trim() ? (
        <View style={styles.field}>
          <Text variant="caption" tone="muted">
            Occasion
          </Text>
          <View style={[styles.occasionPill, { backgroundColor: colors.brandSubtle }]}>
            <Text variant="bodySmall" color={colors.brand}>
              {booking.occasion}
            </Text>
          </View>
        </View>
      ) : null}

      {isTable ? (
        <InlineEditableNote
          label="Dietary notes"
          value={booking.dietary_notes}
          placeholder="e.g. Gluten free, nut allergy"
          multiline
          onSave={saveBookingField('dietary_notes')}
        />
      ) : null}

      <InlineEditableNote
        label={isTable ? 'Guest requests' : 'Booking notes'}
        value={booking.special_requests}
        placeholder={
          isTable
            ? 'e.g. Accessibility, timing, or seating preferences'
            : 'Notes, comments or requests the guest entered when booking'
        }
        multiline
        onSave={saveBookingField('special_requests')}
      />

      <InlineEditableNote
        label="Staff notes for this booking"
        value={booking.internal_notes}
        placeholder="Internal notes (not visible to the guest)"
        multiline
        onSave={saveBookingField('internal_notes')}
      />

      {/* This client — persists across every booking */}
      {guestId ? (
        <View style={styles.customerBlock}>
          <View style={styles.customerHeader}>
            <Text variant="label">Customer notes</Text>
            <Text variant="caption" tone="muted">
              Shown on every booking for this client.
            </Text>
          </View>
          <InlineEditableNote
            value={booking.guest?.customer_profile_notes}
            accessibilityLabel="Edit customer notes"
            placeholder="e.g. Allergies, accessibility, VIP or payment preferences"
            multiline
            onSave={(next) => updateGuest.mutateAsync({ customer_profile_notes: next })}
          />
        </View>
      ) : null}

      {guestId ? (
        <View style={styles.tagsBlock}>
          <GuestTagEditor
            tags={booking.guest?.tags ?? []}
            onTagsChange={(next) => updateGuest.mutateAsync({ tags: next })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  readField: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dirtyHint: {
    marginLeft: 'auto',
  },
  occasionPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  customerBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customerHeader: {
    gap: 2,
  },
  tagsBlock: {
    marginTop: spacing.sm,
  },
});
