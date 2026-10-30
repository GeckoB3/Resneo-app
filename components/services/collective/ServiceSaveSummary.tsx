import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { UNDO_WINDOW_MS } from '@/lib/collective-area/model';
import { refusalText } from '@/lib/queries/useCollectiveServiceTools';
import { useUndoCollectiveSave } from '@/lib/queries/useUndoCollectiveSave';
import {
  saveSummaryLines,
  undoDoneText,
  type ClearedCalendarValue,
  type ServiceSaveSync,
} from '@/lib/services/save-summary';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * What a host is told after saving a service on the collective page (web `CollectiveSaveSummary`,
 * CQ-11, CQ-13): how far the save reached, and Put it back for 60 seconds, which restores what the
 * collective copies at every venue.
 *
 * The screen keys it per save, so every save starts its own minute (W5-07). Once the minute is up and
 * nothing is left to read but "up to date", the card goes.
 */
export function ServiceSaveSummary({
  savedAt,
  sync,
  serviceName,
  collectiveId,
  venueNames,
  calendarsChanged,
  clearedValues,
}: {
  /** When the save went through: the minute runs from then, even if this card was left and came back. */
  savedAt: number;
  sync: ServiceSaveSync;
  serviceName: string;
  collectiveId: string;
  /** Names the venues the service reached, for the "up to date at" line. */
  venueNames: readonly string[];
  /** The save also ticked or unticked calendars, which Put it back leaves as they are. */
  calendarsChanged: boolean;
  /** Calendar values the save cleared, sent with Put it back so they come back too. */
  clearedValues: readonly ClearedCalendarValue[];
}) {
  const { colors } = useTheme();
  const undo = useUndoCollectiveSave();
  const auditEventId = sync.audit_event_id ?? null;
  const expiresAt = savedAt + UNDO_WINDOW_MS;
  const [offered, setOffered] = useState(() => auditEventId !== null && Date.now() < expiresAt);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  /** What Put it back did, or why it could not, in its place. */
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!offered) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setOffered(false);
    }, 1000);
    return () => clearInterval(tick);
  }, [offered, expiresAt]);

  const putItBack = () => {
    if (!auditEventId) return;
    setError(null);
    undo.mutate(
      {
        collectiveId,
        auditEventId,
        restoreValues: clearedValues.map((c) => ({ calendar_id: c.calendar_id, service_id: c.service_id, values: c.values })),
      },
      {
        onSuccess: (answer) => {
          setOffered(false);
          setOutcome(
            undoDoneText({ serviceName, calendarsChanged, cleared: clearedValues, notRestored: answer.values_not_restored }),
          );
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 410) {
            setOffered(false);
            setOutcome(areaCopy('ov.undo.expired'));
            return;
          }
          setError(refusalText(err, areaCopy('ov.venue.retryError'), areaCopy('ov.venue.retryError')));
        },
      },
    );
  };

  const lines = saveSummaryLines(sync, serviceName, venueNames);
  const stillToSay = lines.some((line) => line.tone !== 'ok') || outcome !== null;
  if (!offered && !stillToSay) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="service-save-summary">
      {lines.map((line) => (
        <Text
          key={line.key}
          variant="bodySmall"
          color={line.tone === 'ok' ? colors.success : line.tone === 'warn' ? colors.warning : colors.danger}>
          {line.text}
        </Text>
      ))}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {offered ? (
        <View style={styles.row}>
          <Button
            label={`${areaCopy('ov.undo.offer')} (${secondsLeft}s)`}
            variant="secondary"
            size="sm"
            loading={undo.isPending}
            onPress={putItBack}
          />
        </View>
      ) : null}
      {outcome ? (
        <Text variant="bodySmall" tone="secondary">
          {outcome}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
  },
});
