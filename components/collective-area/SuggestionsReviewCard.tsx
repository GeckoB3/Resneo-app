import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { curateOutcome, declinedText, declineTitle, priceWords } from '@/lib/collective-area/venue-services';
import { useCurateServices, useDeclineSuggestions } from '@/lib/queries/useCollectiveCurate';
import { refusalText, useCollectiveSuggestions, type WaitingSuggestion } from '@/lib/queries/useCollectiveServiceTools';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** `rows`: one "{service} at {venue}: {reason}" line per suggestion that did not go on (CQ-04). */
type Note = { tone: 'ok' | 'error'; text: string; rows?: string[] };

/**
 * The members' suggestions waiting for the host, answered all at once or a few at a time (owner,
 * 2026-10-27; web `SuggestionsReview.tsx`). On Manage Collective's Services tab and on the Services
 * screen.
 *
 * Adding one puts it on the page as it is, offered by the calendars of the venue that suggested it,
 * with nobody asked (POST venue-services, mode 'match'). "Not now" tells each venue once for the
 * lot. Nothing ticked means the buttons act on every suggestion; some ticked, on those.
 *
 * Replaces `SuggestedServicesCard`, where each suggestion was added on its own through "Add from
 * another venue" and the member was then asked whether to use its own service. Hidden when nothing
 * is waiting, and quiet when the list cannot be read: the bell still opens every venue's services.
 */
export function SuggestionsReviewCard({
  collectiveId,
  collectiveName,
  currencySymbol,
  onReview,
}: {
  collectiveId: string;
  collectiveName: string;
  currencySymbol: string;
  /** Opens every venue's services on the suggestions, for a closer look. */
  onReview?: () => void;
}) {
  const { colors } = useTheme();
  const query = useCollectiveSuggestions(collectiveId, true);
  const curate = useCurateServices(collectiveId);
  const decline = useDeclineSuggestions();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<Note | null>(null);
  /** The suggestions "Not now" is asking about, while its question is open. */
  const [declining, setDeclining] = useState<WaitingSuggestion[] | null>(null);
  const busy = curate.isPending || decline.isPending;

  const suggestions = useMemo(() => (query.data?.role === 'host' ? query.data.suggestions : []), [query.data]);
  // The ticks are kept as ids; one that is no longer waiting simply stops counting.
  const picked = suggestions.filter((s) => selected.has(s.service_id));
  const allPicked = suggestions.length > 0 && picked.length === suggestions.length;

  /** By venue, in the order they arrive, so each venue's suggestions sit together. */
  const byVenue = useMemo(() => {
    const map = new Map<string, { venueName: string; rows: WaitingSuggestion[] }>();
    for (const s of suggestions) {
      const entry = map.get(s.venue_id) ?? { venueName: s.venue_name, rows: [] };
      entry.rows.push(s);
      map.set(s.venue_id, entry);
    }
    return [...map.entries()];
  }, [suggestions]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = (list: WaitingSuggestion[]) => {
    if (list.length === 0) return;
    setNote(null);
    curate.mutate(
      { action: 'add', mode: 'match', items: list.map((s) => ({ venue_id: s.venue_id, service_id: s.service_id })) },
      {
        onSuccess: ({ results, refused, refusal }) => {
          if (refused) {
            setNote({ tone: 'error', text: refusal ?? 'Could not add them. Please try again.' });
            return;
          }
          const nameOf = (id: string) => list.find((s) => s.service_id === id)?.service_name ?? 'A service';
          const venueOf = (id: string) => list.find((s) => s.service_id === id)?.venue_name ?? 'a venue';
          const outcome = curateOutcome(
            'add',
            results,
            (r) => nameOf(r.service_id),
            collectiveName,
            (r) => venueOf(r.service_id),
          );
          setNote({ tone: outcome.tone, text: outcome.text, rows: outcome.rows });
          // Keep only the ones that did not go on, so they can be tried again.
          const failed = new Set(results.filter((r) => !r.ok).map((r) => r.service_id));
          setSelected(failed);
        },
        onError: () => setNote({ tone: 'error', text: 'Could not add them. Please check your connection.' }),
      },
    );
  };

  const confirmDecline = () => {
    const list = declining;
    if (!list || list.length === 0) return;
    setNote(null);
    decline.mutate(
      { collectiveId, serviceIds: list.map((s) => s.service_id) },
      {
        onSuccess: () => {
          setDeclining(null);
          setSelected(new Set());
          setNote({ tone: 'ok', text: declinedText(list.map((s) => ({ service: s.service_name, venue: s.venue_name }))) });
        },
        onError: (error) => {
          setDeclining(null);
          setNote({
            tone: 'error',
            text: refusalText(
              error,
              'Could not answer the suggestions. Please try again.',
              'Could not answer the suggestions. Please check your connection.',
            ),
          });
        },
      },
    );
  };

  if (suggestions.length === 0 && !note) return null;

  const addLabel =
    picked.length > 0 && !allPicked
      ? areaCopy('sr.addSelected', { count: picked.length })
      : suggestions.length === 1
        ? areaCopy('sr.addAllOne')
        : areaCopy('sr.addAll', { count: suggestions.length });

  return (
    <>
      {suggestions.length > 0 ? (
        <Card style={[styles.card, { borderColor: colors.warning }]} testID="suggestions-review">
          <View style={styles.head}>
            <Text variant="label" accessibilityRole="header">
              {areaCopy('sr.heading')}{' '}
              <Text variant="bodySmall" tone="muted">{`(${suggestions.length})`}</Text>
            </Text>
            <Text variant="caption" tone="secondary">
              {areaCopy('sr.caption', { collective: collectiveName })}
            </Text>
          </View>
          {byVenue.map(([venueId, { venueName, rows }]) => (
            <View key={venueId} style={styles.group}>
              <Text variant="overline" tone="secondary">
                {venueName}
              </Text>
              {rows.map((s) => {
                const facts = [
                  s.duration_minutes ? `${s.duration_minutes} min` : null,
                  s.price_pence != null ? priceWords(s.price_pence, currencySymbol) : null,
                ].filter(Boolean);
                return (
                  <ChoiceRow
                    key={s.service_id}
                    kind="checkbox"
                    selected={selected.has(s.service_id)}
                    title={s.service_name}
                    summary={facts.length > 0 ? facts.join(' · ') : null}
                    accessibilityLabel={areaCopy('sr.line', { venue: s.venue_name, service: s.service_name })}
                    disabled={busy}
                    onPress={() => toggle(s.service_id)}
                  />
                );
              })}
            </View>
          ))}
          <Button
            label={addLabel}
            fullWidth
            loading={curate.isPending}
            disabled={busy}
            onPress={() => add(picked.length > 0 && !allPicked ? picked : suggestions)}
          />
          <View style={styles.actions}>
            <Button
              label={areaCopy('vs.decline')}
              variant="secondary"
              size="sm"
              style={styles.flex1}
              disabled={busy}
              onPress={() => {
                setNote(null);
                setDeclining(picked.length > 0 ? picked : suggestions);
              }}
            />
            {onReview ? (
              <Button
                label={areaCopy('sr.review')}
                variant="ghost"
                size="sm"
                style={styles.flex1}
                disabled={busy}
                onPress={onReview}
              />
            ) : null}
          </View>
        </Card>
      ) : null}
      {note ? (
        <View
          accessibilityRole={note.tone === 'error' ? 'alert' : 'summary'}
          accessibilityLiveRegion="polite"
          style={[
            styles.note,
            note.tone === 'error'
              ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
              : { backgroundColor: colors.successSurface, borderColor: colors.success },
          ]}>
          <Text variant="bodySmall">{note.text}</Text>
          {(note.rows ?? []).map((row, index) => (
            <Text key={index} variant="caption">
              {`• ${row}`}
            </Text>
          ))}
        </View>
      ) : null}
      <ConfirmSheet
        visible={declining !== null}
        title={declining ? declineTitle(declining.map((s) => s.service_name)) : ''}
        message={areaCopy('vs.declineMessage')}
        confirmLabel={areaCopy('svc.suggested.declineConfirm')}
        destructive={false}
        loading={decline.isPending}
        onConfirm={confirmDecline}
        onClose={() => {
          if (!decline.isPending) setDeclining(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { gap: spacing.xxs },
  group: { gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
