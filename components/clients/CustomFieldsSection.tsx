import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateGuest } from '@/lib/queries/useGuestMutations';
import { spacing } from '@/theme/index';
import type { CustomClientFieldDefinition } from '@/types/guest-detail';

type CustomFieldsSectionProps = {
  guestId: string;
  definitions: CustomClientFieldDefinition[];
  currentValues: Record<string, unknown>;
  /** Render inside a tap-to-expand CollapsibleCard instead of a plain Card. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

/**
 * Renders a card with editable custom client fields.
 * Only shown when there are active field definitions.
 */
export function CustomFieldsSection({
  guestId,
  definitions,
  currentValues,
  collapsible = false,
  defaultExpanded = false,
}: CustomFieldsSectionProps) {
  const updateMutation = useUpdateGuest(guestId);
  const activeFields = definitions.filter((d) => d.is_active);
  const [values, setValues] = useState<Record<string, unknown>>({ ...currentValues });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Stable primitive snapshot of the incoming values. currentValues is a new
  // object reference every render, so depending on it directly would loop; the
  // hash only changes when the underlying content does.
  const currentValuesHash = useMemo(() => JSON.stringify(currentValues), [currentValues]);

  // Reseed local state when the guest changes OR when the underlying values
  // change content (e.g. a merge wizard / GuestEditSheet updated custom fields
  // while this profile was open). Reconciling on the content hash prevents a
  // later Save here from writing back a stale snapshot and reverting that edit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues({ ...currentValues });
    setSaved(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestId, currentValuesHash]);

  if (activeFields.length === 0) return null;

  function setValue(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    try {
      await updateMutation.mutateAsync({ custom_fields: values });
      hapticSuccess();
      setSaved(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save custom fields.');
    }
  }

  const body = (
    <>
      <View style={styles.fields}>
        {activeFields.map((field) => {
          const val = values[field.field_key];

          if (field.field_type === 'boolean') {
            return (
              <View key={field.id} style={styles.switchRow}>
                <Text variant="bodySmall">{field.field_name}</Text>
                <Switch
                  value={Boolean(val)}
                  onValueChange={(v) => setValue(field.field_key, v)}
                />
              </View>
            );
          }

          return (
            <Input
              key={field.id}
              label={field.field_name}
              value={val != null ? String(val) : ''}
              onChangeText={(v) => {
                if (field.field_type === 'number') {
                  setValue(field.field_key, v === '' ? null : Number(v));
                } else {
                  setValue(field.field_key, v);
                }
              }}
              keyboardType={field.field_type === 'number' ? 'numeric' : 'default'}
              placeholder={
                field.field_type === 'date' ? 'YYYY-MM-DD' : `Enter ${field.field_name.toLowerCase()}`
              }
            />
          );
        })}
      </View>

      {error ? (
        <Text variant="bodySmall" tone="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {saved ? (
        <Text variant="caption" tone="success" style={styles.savedNote}>
          Saved
        </Text>
      ) : null}

      <Button
        label="Save custom fields"
        variant="secondary"
        size="sm"
        loading={updateMutation.isPending}
        onPress={() => void handleSave()}
        style={styles.saveButton}
      />
    </>
  );

  if (collapsible) {
    return (
      <CollapsibleCard
        title="Custom fields"
        summary={`${activeFields.length} field${activeFields.length === 1 ? '' : 's'}`}
        defaultExpanded={defaultExpanded}>
        {body}
      </CollapsibleCard>
    );
  }

  return (
    <Card>
      <Text variant="label" style={styles.title}>
        Custom fields
      </Text>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.sm,
  },
  fields: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  error: {
    marginTop: spacing.sm,
  },
  savedNote: {
    marginTop: spacing.xs,
  },
  saveButton: {
    marginTop: spacing.md,
  },
});
