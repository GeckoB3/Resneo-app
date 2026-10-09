import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { refusalText, useAddFromVenue, useAddFromVenueServices } from '@/lib/queries/useCollectiveServiceTools';
import { spacing } from '@/theme/index';

/**
 * "Add from another venue" (web `AddFromVenueDialog` in `collective/Adoptions.tsx`; UX spec
 * `svc.addFrom.*`, plan contracts 1 and 10). The host picks a member and one of that member's own
 * services; the server copies it exactly, puts the copy on the page and asks the member whether to
 * use its own. Nothing here edits the service: the request carries the two ids and nothing else.
 */
export interface AddFromVenueSheetProps {
  onClose: () => void;
  collectiveId: string;
  collectiveName: string;
  /** The collective's other venues (the host's `collective_calendars`, less the host). */
  venues: { venue_id: string; venue_name: string }[];
  currencySymbol: string;
  onAdded: (message: string) => void;
  /** From a member's suggestion (N25): that venue and service, already chosen. */
  initialVenueId?: string | null;
  initialServiceId?: string | null;
}

/** Web `formatPricePenceForServiceCatalog`, for a price that is set. */
function priceWords(pence: number, symbol: string): string {
  return pence <= 0 ? 'Free' : `${symbol}${(pence / 100).toFixed(2)}`;
}

export function AddFromVenueSheet({
  onClose,
  collectiveId,
  collectiveName,
  venues,
  currencySymbol,
  onAdded,
  initialVenueId = null,
  initialServiceId = null,
}: AddFromVenueSheetProps) {
  const [venueId, setVenueId] = useState(
    initialVenueId && venues.some((v) => v.venue_id === initialVenueId) ? initialVenueId : (venues[0]?.venue_id ?? ''),
  );
  const [preset, setPreset] = useState<string | null>(initialServiceId);
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useAddFromVenueServices(collectiveId, venueId || null, true);
  const add = useAddFromVenue();
  const busy = add.isPending;

  // A suggested service is chosen for the host, once, if it can still be added.
  useEffect(() => {
    if (!list.data || preset === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServiceId(list.data.some((s) => s.id === preset) ? preset : '');
    setPreset(null);
  }, [list.data, preset]);

  const services = list.data ?? null;
  const loadError = list.isError
    ? refusalText(
        list.error,
        'Could not load that venue’s services.',
        'Could not load that venue’s services. Please check your connection.',
      )
    : null;
  const venueName = venues.find((v) => v.venue_id === venueId)?.venue_name ?? 'That venue';
  const chosen = services?.find((s) => s.id === serviceId) ?? null;

  const submit = () => {
    if (!chosen) return;
    setError(null);
    add.mutate(
      { collectiveId, sourceVenueId: venueId, sourceServiceId: chosen.id },
      {
        onSuccess: () =>
          onAdded(areaCopy('svc.addFrom.done', { service: chosen.name, collective: collectiveName, venue: venueName })),
        onError: (err) =>
          setError(
            refusalText(
              err,
              'Could not add that service. Please try again.',
              'Could not add that service. Please check your connection.',
            ),
          ),
      },
    );
  };

  return (
    <StepShell
      visible
      onClose={() => {
        if (!busy) onClose();
      }}
      title={areaCopy('svc.addFrom.title')}
      error={error ?? loadError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label={areaCopy('svc.addFrom.confirm')}
            disabled={!chosen || busy}
            loading={busy}
            onPress={submit}
          />
        </>
      }>
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('svc.addFrom.help', { collective: collectiveName })}
      </Text>
      <View style={styles.section}>
        <Text variant="label">{areaCopy('svc.addFrom.venueLabel')}</Text>
        <View style={styles.chips}>
          {venues.map((v) => (
            <Chip
              key={v.venue_id}
              label={v.venue_name}
              selected={v.venue_id === venueId}
              onPress={() => {
                if (v.venue_id === venueId) return;
                setServiceId('');
                setError(null);
                setVenueId(v.venue_id);
              }}
            />
          ))}
        </View>
      </View>
      {services === null && !loadError ? (
        <Text variant="bodySmall" tone="muted" accessibilityRole="progressbar">
          Loading...
        </Text>
      ) : !services || services.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          {areaCopy('svc.addFrom.empty', { venue: venueName })}
        </Text>
      ) : (
        <View style={styles.section} accessibilityRole="radiogroup" accessibilityLabel="Service">
          {services.map((s) => {
            const facts = [
              s.duration_minutes != null ? `${s.duration_minutes} min` : null,
              s.price_pence != null ? priceWords(s.price_pence, currencySymbol) : null,
            ].filter(Boolean);
            return (
              <ChoiceRow
                key={s.id}
                selected={serviceId === s.id}
                title={s.name}
                summary={facts.length > 0 ? facts.join(', ') : null}
                disabled={busy}
                onPress={() => setServiceId(s.id)}
              />
            );
          })}
        </View>
      )}
      {chosen ? (
        <Text variant="caption" tone="secondary">
          {areaCopy('svc.addFrom.adoptNote', { venue: venueName, service: chosen.name })}
        </Text>
      ) : null}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
