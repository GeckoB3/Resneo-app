import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { priceWords } from '@/components/services/collective/AddFromVenueSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import {
  refusalText,
  useCollectiveSuggestions,
  useDeclineSuggestion,
  type WaitingSuggestion,
} from '@/lib/queries/useCollectiveServiceTools';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The suggestions waiting for the host (web `SuggestedServices` in `collective/Suggestions.tsx`;
 * contract 10, N25): one row per suggestion, "{venue} suggests {service}", with "Add to the page"
 * (the "Add from another venue" sheet, with that venue and service chosen) and "Not now".
 *
 * Reported 2026-10-12: a member suggested a service and nothing appeared in the host's account, as a
 * suggestion reached the host only as one notice. Hidden when nothing is waiting, and quiet when the
 * list cannot be read: the notice still opens the sheet.
 *
 * Since 2026-10-27 only for a server without every venue's services (it answers 404 there): a
 * current server gets `SuggestionsReviewCard`, which adds them all at once with nobody asked. Delete
 * this, and `AddFromVenueSheet`, once every server has the venue-services route.
 */
export function SuggestedServicesCard({
  collectiveId,
  collectiveName,
  currencySymbol,
  onAdd,
}: {
  collectiveId: string;
  collectiveName: string;
  currencySymbol: string;
  onAdd: (suggestion: WaitingSuggestion) => void;
}) {
  const { colors } = useTheme();
  const query = useCollectiveSuggestions(collectiveId, true);
  const decline = useDeclineSuggestion();
  const [asking, setAsking] = useState<WaitingSuggestion | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const suggestions = query.data?.role === 'host' ? query.data.suggestions : [];

  const confirmDecline = () => {
    const s = asking;
    if (!s) return;
    setNote(null);
    decline.mutate(
      { collectiveId, serviceId: s.service_id },
      {
        onSuccess: () => {
          setAsking(null);
          setNote({
            tone: 'ok',
            text: areaCopy('svc.suggested.declined', { service: s.service_name, venue: s.venue_name, collective: collectiveName }),
          });
        },
        onError: (error) => {
          setAsking(null);
          setNote({
            tone: 'error',
            text: refusalText(
              error,
              'Could not answer the suggestion. Please try again.',
              'Could not answer the suggestion. Please check your connection.',
            ),
          });
        },
      },
    );
  };

  if (suggestions.length === 0 && !note) return null;
  return (
    <>
      {suggestions.length > 0 ? (
        <Card style={styles.card}>
          <Text variant="overline" tone="secondary" accessibilityRole="header">
            {areaCopy('svc.suggested.heading', { collective: collectiveName })}
          </Text>
          {suggestions.map((s) => {
            const facts = [
              s.duration_minutes != null ? `${s.duration_minutes} min` : null,
              s.price_pence != null ? priceWords(s.price_pence, currencySymbol) : null,
            ].filter(Boolean);
            return (
              <View key={s.service_id} testID="suggestion-row" style={[styles.row, { borderColor: colors.border }]}>
                <Text variant="bodyMedium">{areaCopy('svc.suggested.line', { venue: s.venue_name, service: s.service_name })}</Text>
                {facts.length > 0 ? (
                  <Text variant="caption" tone="muted">
                    {facts.join(', ')}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Button
                    label={areaCopy('svc.suggested.add')}
                    size="sm"
                    style={styles.flex1}
                    disabled={decline.isPending}
                    onPress={() => {
                      setNote(null);
                      onAdd(s);
                    }}
                  />
                  <Button
                    label={areaCopy('svc.suggested.decline')}
                    size="sm"
                    variant="secondary"
                    style={styles.flex1}
                    disabled={decline.isPending}
                    onPress={() => setAsking(s)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
      {note ? (
        <View
          accessibilityRole={note.tone === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          style={[
            styles.note,
            note.tone === 'error'
              ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
              : { backgroundColor: colors.successSurface, borderColor: colors.success },
          ]}>
          <Text variant="bodySmall">{note.text}</Text>
        </View>
      ) : null}
      <ConfirmSheet
        visible={asking !== null}
        title={asking ? areaCopy('svc.suggested.declineTitle', { service: asking.service_name }) : ''}
        message={
          asking ? areaCopy('svc.suggested.declineMessage', { service: asking.service_name, venue: asking.venue_name }) : undefined
        }
        confirmLabel={areaCopy('svc.suggested.declineConfirm')}
        destructive={false}
        loading={decline.isPending}
        onConfirm={confirmDecline}
        onClose={() => {
          if (!decline.isPending) setAsking(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
