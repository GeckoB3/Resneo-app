import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { priceWords, type VenueServiceRow } from '@/lib/collective-area/venue-services';
import { useSuggestServices, useVenueServices } from '@/lib/queries/useCollectiveCurate';
import { refusalText } from '@/lib/queries/useCollectiveServiceTools';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type Note = { tone: 'ok' | 'error'; text: string };

/**
 * A member's own services on Manage Collective, to suggest to the host many at once (owner,
 * 2026-10-27; web `MemberSuggestPanel.tsx`). It lists the services not on the page, each either
 * waiting for the host or ready to tick; the member sends the ticked ones in one go. The host adds
 * them from its Manage Collective, as they are, with the member's calendars kept.
 *
 * Hidden once every service is on the page (owner, 2026-10-29: it had nothing left to do; those
 * services are in the list below), while loading, and when the server cannot list them (one from
 * before 2026-10-27): the Services screen's per-service "Suggest" still works there.
 */
export function MemberSuggestPanel({
  collectiveId,
  collectiveName,
  hostName,
  currencySymbol,
}: {
  collectiveId: string;
  collectiveName: string;
  hostName: string;
  currencySymbol: string;
}) {
  const { colors } = useTheme();
  const query = useVenueServices(collectiveId, true);
  const suggest = useSuggestServices();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<Note | null>(null);

  const services = useMemo<VenueServiceRow[]>(() => query.data?.venues[0]?.services ?? [], [query.data]);
  const offPage = useMemo(() => services.filter((s) => !s.on_page), [services]);
  /** Only a service off the page and not already waiting for the host can be suggested. */
  const suggestable = useMemo(() => offPage.filter((s) => !s.suggested_at), [offPage]);
  const picked = suggestable.filter((s) => selected.has(s.id));
  const allPicked = suggestable.length > 0 && picked.length === suggestable.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = () => {
    const ids = picked.map((s) => s.id);
    if (ids.length === 0) return;
    setNote(null);
    suggest.mutate(
      { collectiveId, serviceIds: ids },
      {
        onSuccess: () => {
          setNote({
            tone: 'ok',
            text:
              ids.length === 1
                ? areaCopy('ms.sentOne', { service: picked[0]?.name, host: hostName })
                : areaCopy('ms.sent', { count: ids.length, host: hostName }),
          });
          setSelected(new Set());
        },
        onError: (error) =>
          setNote({
            tone: 'error',
            text: refusalText(
              error,
              'Could not send the suggestions. Please try again.',
              'Could not send the suggestions. Please check your connection.',
            ),
          }),
      },
    );
  };

  // Loading, an older server, an error, or nothing off the page: the lists below still say it all,
  // and a member with nothing to send never sees a card come and go.
  if (!query.data || offPage.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="label" accessibilityRole="header">
          {areaCopy('ms.heading')}
        </Text>
        <Text variant="caption" tone="secondary">
          {areaCopy('ms.intro', { collective: collectiveName, host: hostName })}
        </Text>
      </View>
      {suggestable.length > 0 ? (
        <ChoiceRow
          kind="checkbox"
          selected={allPicked}
          title={areaCopy('vs.selectAll')}
          disabled={suggest.isPending}
          onPress={() => setSelected(allPicked ? new Set() : new Set(suggestable.map((s) => s.id)))}
        />
      ) : null}
      {offPage.map((s) => {
        const canPick = !s.suggested_at;
        const facts = [
          s.duration_minutes ? `${s.duration_minutes} min` : null,
          s.price_pence != null ? priceWords(s.price_pence, currencySymbol) : null,
          s.heading,
        ].filter(Boolean);
        const pill: { label: string; tone: BadgeTone } = s.suggested_at
          ? { label: areaCopy('ms.pill.waiting', { host: hostName }), tone: 'warning' }
          : { label: areaCopy('ms.pill.off'), tone: 'neutral' };
        return (
          <ChoiceRow
            key={s.id}
            kind="checkbox"
            selected={canPick && selected.has(s.id)}
            title={s.name}
            summary={facts.length > 0 ? facts.join(' · ') : null}
            disabled={!canPick || suggest.isPending}
            onPress={() => toggle(s.id)}>
            <View style={styles.pills}>
              <Badge label={pill.label} tone={pill.tone} />
            </View>
          </ChoiceRow>
        );
      })}
      {suggestable.length === 0 ? (
        <Text variant="caption" tone="muted">
          {areaCopy('ms.nothingToSuggest', { host: hostName })}
        </Text>
      ) : (
        <Button
          label={areaCopy('ms.send', { host: hostName, count: picked.length })}
          fullWidth
          loading={suggest.isPending}
          disabled={picked.length === 0 || suggest.isPending}
          onPress={send}
        />
      )}
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
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { gap: spacing.xxs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
