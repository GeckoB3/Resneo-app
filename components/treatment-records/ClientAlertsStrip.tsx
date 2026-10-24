import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAddClientAlert, useClientAlerts, useRemoveClientAlert } from '@/lib/queries/useTreatmentRecords';
import { TR_COPY } from '@/lib/treatment-records/copy';
import { formatDay } from '@/lib/treatment-records/format';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A client's alerts (web plan TR24): one amber line with Edit alerts, in the booking hero, the
 * client hero and the record editor. Nothing shows when the client has none, or when this person
 * does not reach treatment records (the route refuses and the hook answers null).
 */
export function ClientAlertsStrip({ guestId, enabled = true }: { guestId: string; enabled?: boolean }) {
  const { colors } = useTheme();
  const alerts = useClientAlerts(guestId, enabled);
  const [editing, setEditing] = useState(false);
  const list = alerts.data ?? [];
  // The sheet stays open after its last alert is removed; the strip goes once it closes.
  if (list.length === 0 && !editing) return null;
  return (
    <>
      {list.length > 0 ? (
        <View
          accessibilityRole="alert"
          accessibilityLabel={`${TR_COPY.alertsLabel}: ${list.map((a) => a.text).join('; ')}`}
          style={[styles.strip, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall" style={styles.stripText}>
            <Text variant="bodySmall" style={styles.bold}>
              {`${TR_COPY.alertsLabel}: `}
            </Text>
            {list.map((a) => a.text).join('; ')}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing(true)}>
            <Text variant="caption" style={styles.editLink}>
              {TR_COPY.editAlerts}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <ClientAlertsSheet guestId={guestId} visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}

/** Add and remove a client's alerts. An alert is never edited: a change is a removal and a new one. */
export function ClientAlertsSheet({ guestId, visible, onClose }: { guestId: string; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const alerts = useClientAlerts(guestId, visible);
  const add = useAddClientAlert(guestId);
  const remove = useRemoveClientAlert();
  const [text, setText] = useState('');
  // Shown in the sheet: a toast raised while a sheet is open is drawn behind it.
  const [error, setError] = useState<string | null>(null);
  const showing = alerts.data ?? [];
  const full = showing.length >= 10;

  function submit() {
    const value = text.trim();
    if (!value) return;
    setError(null);
    add.mutate(value, {
      onSuccess: () => {
        hapticSuccess();
        setText('');
      },
      onError: (e) => {
        hapticWarning();
        setError(e instanceof ApiError ? e.message : 'Could not add the alert.');
      },
    });
  }

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close}>
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <Text variant="subheading">{TR_COPY.alertsLabel}</Text>
        {showing.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            No alerts.
          </Text>
        ) : (
          showing.map((a) => (
            <View key={a.id} style={[styles.alertRow, { borderColor: colors.border, backgroundColor: colors.warningSurface }]}>
              <View style={styles.alertText}>
                <Text variant="bodyMedium">{a.text}</Text>
                <Text variant="caption" tone="muted">
                  {[a.created_by_name, formatDay(a.created_at)].filter(Boolean).join(', ')}
                </Text>
              </View>
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                accessibilityLabel={`Remove ${a.text}`}
                onPress={() => {
                  setError(null);
                  remove.mutate(a.id, {
                    onError: (e) => {
                      hapticWarning();
                      setError(e instanceof ApiError ? e.message : 'Could not remove the alert.');
                    },
                  });
                }}
              />
            </View>
          ))
        )}
        <Input
          label="New alert"
          value={text}
          onChangeText={setText}
          placeholder={TR_COPY.alertPlaceholder}
          maxLength={200}
          editable={!full}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {full ? (
          <Text variant="caption" tone="muted">
            A client has at most 10 alerts. Remove one first.
          </Text>
        ) : null}
        {error ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={TR_COPY.addAlert} loading={add.isPending} disabled={!text.trim() || full} onPress={submit} fullWidth />
        <Button label="Done" variant="secondary" onPress={close} fullWidth />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stripText: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  editLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  sheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  alertText: {
    flex: 1,
    gap: 2,
  },
});
