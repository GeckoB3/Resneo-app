import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { TickRow } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SectionCard } from '@/components/ui/SectionCard';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useSwitchTreatmentRecords, useTreatmentRecordsSwitchState } from '@/lib/queries/useTreatmentRecords';
import { TR_COPY } from '@/lib/treatment-records/copy';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The Treatment records switch in Booking settings, for admins (web plan TR3, §9). It does not save
 * through the feature flags, which strip this key: switching on opens a sheet that explains what
 * the business takes on, names the linked venues that will see records too, and needs a tick before
 * Switch on works. Switching off asks first and deletes nothing.
 */
export function TreatmentRecordsSwitchCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const toggle = useSwitchTreatmentRecords();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [ticked, setTicked] = useState(false);
  const state = useTreatmentRecordsSwitchState(sheetOpen);
  const linked = state.data?.linked_venues ?? [];

  function run(on: boolean) {
    toggle.mutate(on, {
      onSuccess: () => {
        hapticSuccess();
        setSheetOpen(false);
        setConfirmOff(false);
        setTicked(false);
        toast.success(on ? 'Treatment records are on.' : 'Treatment records are off. Nothing was deleted.');
        onChanged();
      },
      onError: (e) => {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not change treatment records.');
      },
    });
  }

  const [intro, ...steps] = TR_COPY.switchOnMessage;

  return (
    <SectionCard>
      <SectionCard.Body>
        <View style={styles.row}>
          <View style={styles.text}>
            <Text variant="bodyMedium">{TR_COPY.settingsTitle}</Text>
            <Text variant="caption" tone="muted">
              {TR_COPY.settingsDescription}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={() => (enabled ? setConfirmOff(true) : setSheetOpen(true))}
            disabled={toggle.isPending}
            accessibilityLabel={TR_COPY.settingsTitle}
            trackColor={{ true: colors.brand }}
          />
        </View>
      </SectionCard.Body>

      <Sheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setTicked(false);
        }}>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text variant="subheading">{TR_COPY.switchOnTitle}</Text>
          <Text variant="bodySmall" tone="secondary">
            {intro}
          </Text>
          {steps.map((s, i) => (
            <Text key={s} variant="bodySmall" tone="secondary">
              {`${i + 1}. ${s}`}
            </Text>
          ))}
          {linked.length > 0 ? (
            <View style={[styles.linked, { backgroundColor: colors.infoSurface, borderColor: colors.brandBorder }]}>
              <Text variant="bodySmall">{TR_COPY.switchOnLinked(linked.map((v) => v.name).join(', '))}</Text>
            </View>
          ) : null}
          <TickRow title={TR_COPY.switchOnAcknowledge} checked={ticked} onChange={setTicked} plain />
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={toggle.isPending}
              onPress={() => {
                setSheetOpen(false);
                setTicked(false);
              }}
            />
            <Button
              label={TR_COPY.switchOnButton}
              style={styles.flex1}
              disabled={!ticked}
              loading={toggle.isPending}
              onPress={() => run(true)}
            />
          </View>
        </ScrollView>
      </Sheet>

      <ConfirmSheet
        visible={confirmOff}
        title={TR_COPY.switchOffTitle}
        message={TR_COPY.switchOffMessage}
        confirmLabel={TR_COPY.switchOffButton}
        loading={toggle.isPending}
        onConfirm={() => run(false)}
        onClose={() => setConfirmOff(false)}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  sheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  linked: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
