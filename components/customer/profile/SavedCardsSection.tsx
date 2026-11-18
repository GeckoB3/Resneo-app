import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useRemoveSavedCardFlow } from '@/components/customer/profile/RemoveSavedCardFlow';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  useAccountCards,
  useStartAccountCardSetup,
  type AccountAddTarget,
  type AccountCardMember,
  type AccountCardSetup,
  type AccountCardsView,
} from '@/lib/queries/useAccountCards';
import { useRemoveCard, useSavedCards } from '@/lib/queries/useCustomerAccount';
import { useSaveAccountCard } from '@/lib/queries/useSaveAccountCard';
import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { useCustomerPurchase } from '@/lib/queries/useCustomerPurchase';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Cards saved at a venue, for a server from before card on file (no grouped list).
 *
 * **Per venue, with a picker, because that is how they are stored.** Every
 * venue is its own Stripe connected account, so there is no such thing as "my
 * cards" across ResNeo; a card saved at the salon is invisible to the gym, and
 * a combined list would imply otherwise.
 */
export function LegacySavedCardsSection() {
  const toast = useToast();
  const { data: venuesData } = useCustomerVenueRelationships();
  const venues = venuesData?.venues ?? [];
  const [venueId, setVenueId] = useState<string | null>(null);

  const activeVenueId = venueId ?? venues[0]?.venue_id ?? null;
  const activeVenue = venues.find((v) => v.venue_id === activeVenueId);

  const { data, isLoading } = useSavedCards(activeVenueId);
  const remove = useRemoveCard(activeVenueId);
  const purchase = useCustomerPurchase();

  /** A pending removal, held with the server's own warning once it answers. */
  const [pending, setPending] = useState<{ id: string; message: string } | null>(null);

  if (venues.length === 0) return null;

  const cards = data?.payment_methods ?? [];

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        SAVED CARDS
      </Text>

      {venues.length > 1 ? (
        <Segmented
          options={venues.map((v) => ({ value: v.venue_id, label: v.venue_name ?? 'Venue' }))}
          value={activeVenueId ?? ''}
          onChange={(v) => setVenueId(v)}
          wrapLabels
        />
      ) : null}

      {isLoading ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          Loading…
        </Text>
      ) : cards.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          No card saved with {activeVenue?.venue_name ?? 'this venue'}.
        </Text>
      ) : (
        cards.map((card) => (
          <View key={card.id} style={styles.row}>
            <Text variant="body" style={styles.name}>
              {legacyCardLabel(card.brand, card.last4)}
            </Text>
            <Button
              label="Remove"
              variant="secondary"
              size="sm"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(
                  { paymentMethodId: card.id },
                  {
                    onSuccess: (outcome) => {
                      if (outcome.status === 'removed') {
                        toast.success('Card removed.');
                      } else {
                        /*
                          The server says this card pays for something. Its
                          message names WHAT, so it is shown as sent rather than
                          reworded: a summary here would be guessing at which
                          membership, and getting that wrong about a recurring
                          payment is worse than saying nothing.
                        */
                        setPending({ id: card.id, message: outcome.message });
                      }
                    },
                    onError: () => toast.error('Could not remove that card.'),
                  },
                )
              }
            />
          </View>
        ))
      )}

      {activeVenueId ? (
        <Button
          label="Add a card"
          variant="secondary"
          loading={purchase.isPending}
          onPress={() =>
            purchase.mutate(
              {
                kind: 'save_card',
                venueId: activeVenueId,
                venueName: activeVenue?.venue_name ?? 'this venue',
              },
              {
                onSuccess: (outcome) => {
                  if (outcome.status === 'succeeded') toast.success('Card saved.');
                  else if (outcome.status === 'failed') toast.error(outcome.message);
                },
                onError: () => toast.error('Could not start that. Please try again.'),
              },
            )
          }
          style={styles.gap}
        />
      ) : null}

      <ConfirmSheet
        visible={pending !== null}
        title="Remove this card?"
        message={pending?.message ?? ''}
        confirmLabel="Remove anyway"
        cancelLabel="Keep it"
        loading={remove.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;
          remove.mutate(
            { paymentMethodId: target.id, acknowledge: true },
            {
              onSuccess: () => toast.success('Card removed.'),
              onError: () => toast.error('Could not remove that card.'),
            },
          );
        }}
      />
    </Card>
  );
}

/**
 * One "Saved cards" section (web Docs/card-on-file-plan.md §5.6), grouped by where each card is
 * kept: a business, or a collective ("The Beauty Parlour: Visa ending 4242, expires 08/28. Secures
 * your bookings with every member." with "See members"), and till cards at the business that
 * saved them. Actions "Replace card" and "Remove"; "Add card" picks the business or collective
 * (no picker when there is one). An older server keeps the per-business list.
 */
export function SavedCardsSection() {
  const { data, isLoading, isError, refetch } = useAccountCards();
  if (data && !data.grouped) return <LegacySavedCardsSection />;
  return <GroupedSavedCards view={data ?? null} loading={isLoading} failed={isError} onRetry={() => void refetch()} />;
}

function GroupedSavedCards({
  view,
  loading,
  failed,
  onRetry,
}: {
  view: Extract<AccountCardsView, { grouped: true }> | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const removal = useRemoveSavedCardFlow();
  const [adding, setAdding] = useState<'pick' | { targetKey: string } | null>(null);
  const groups = view?.groups.filter((g) => g.cards.length > 0) ?? [];
  const targets = view?.addTargets ?? [];

  const startAdd = () => {
    if (targets.length === 1) setAdding({ targetKey: targets[0].key });
    else setAdding('pick');
  };

  return (
    <Card>
      <Text variant="overline" tone="secondary" accessibilityRole="header">
        SAVED CARDS
      </Text>

      {loading ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          Loading…
        </Text>
      ) : failed ? (
        <View style={styles.gap}>
          <Text variant="bodySmall" tone="secondary">
            We could not load your saved cards.
          </Text>
          <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} style={styles.gap} />
        </View>
      ) : groups.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          No saved cards.
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group} testID={`saved-card-group-${group.key}`}>
            <Text variant="bodyMedium">{group.name}</Text>
            {group.kind === 'collective' && group.members.length > 0 ? (
              <SeeMembers name={group.name} members={group.members} />
            ) : null}
            {group.cards.map((card) => (
              <View key={card.id} style={styles.cardBlock}>
                <Text variant="body">
                  {card.expiry ? `${card.label}, expires ${card.expiry}` : card.label}
                </Text>
                <Text variant="caption" tone="secondary">
                  {card.description}
                </Text>
                <View style={styles.actions}>
                  {card.kind === 'card_on_file' && targets.some((t) => t.key === group.key) ? (
                    <Button
                      label="Replace card"
                      variant="secondary"
                      size="sm"
                      accessibilityLabel={`Replace ${card.label} saved with ${group.name}`}
                      onPress={() => setAdding({ targetKey: group.key })}
                    />
                  ) : null}
                  <Button
                    label="Remove"
                    variant="secondary"
                    size="sm"
                    accessibilityLabel={`Remove ${card.label} saved with ${group.name}`}
                    onPress={() => removal.start(card)}
                  />
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      {targets.length > 0 ? <Button label="Add card" variant="secondary" onPress={startAdd} style={styles.gap} /> : null}

      <AddTargetPicker
        visible={adding === 'pick'}
        targets={targets}
        onPick={(targetKey) => setAdding({ targetKey })}
        onClose={() => setAdding(null)}
      />
      {adding && adding !== 'pick' ? (
        // Keyed by the target so each opening starts with a fresh card screen.
        <SaveCardSheet key={adding.targetKey} targetKey={adding.targetKey} onClose={() => setAdding(null)} />
      ) : null}
      {removal.sheet}
    </Card>
  );
}

/** "See members": a tap-to-open list of every member's name (plan §5.2: phones have no hover). */
export function SeeMembers({ name, members }: { name: string; members: AccountCardMember[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Button
        label={open ? 'Hide members' : 'See members'}
        variant="ghost"
        size="sm"
        accessibilityLabel={open ? `Hide the members of ${name}` : `See the members of ${name}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <View accessibilityLabel={`Members of ${name}`}>
          {members.map((m) => (
            <Text key={m.venue_id} variant="bodySmall" tone="secondary">
              {m.name}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** "Add card": where should it be saved? One button per business or collective. */
function AddTargetPicker({
  visible,
  targets,
  onPick,
  onClose,
}: {
  visible: boolean;
  targets: AccountAddTarget[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetBody}>
        <Text variant="title" accessibilityRole="header">
          Add card
        </Text>
        <Text variant="bodySmall" tone="secondary">
          Choose where to save your card.
        </Text>
        {targets.map((t) => (
          <Button key={t.key} label={t.name} variant="secondary" fullWidth onPress={() => onPick(t.key)} />
        ))}
        <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </Sheet>
  );
}

/**
 * The card screen (plan §5.2) for the account: "Save a card", the agreement in the server's words,
 * then the card form, then "Card saved." Typed cards only (plan §16.1).
 */
function SaveCardSheet({ targetKey, onClose }: { targetKey: string; onClose: () => void }) {
  const toast = useToast();
  const startSetup = useStartAccountCardSetup();
  const save = useSaveAccountCard();
  const [setup, setSetup] = useState<AccountCardSetup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startMutate = startSetup.mutate;

  useEffect(() => {
    startMutate(targetKey, {
      onSuccess: (s) => setSetup(s),
      onError: (e) => setMessage(e instanceof Error ? e.message : 'We could not start saving your card. Please try again.'),
    });
  }, [targetKey, startMutate]);

  const submit = () => {
    if (!setup) return;
    setMessage(null);
    save.mutate(setup, {
      onSuccess: (outcome) => {
        if (outcome.status === 'saved') {
          toast.success(outcome.label ? `Card saved. ${outcome.label} is saved with ${setup.scope_name}.` : 'Card saved.');
          onClose();
        } else if (outcome.status === 'pending') {
          toast.success('Your card is being saved. It will show here shortly.');
          onClose();
        } else if (outcome.status === 'failed') {
          setMessage(outcome.message || 'Your bank declined this card. Try another card.');
        }
        // Cancelled: the customer closed the card form; nothing to say.
      },
      onError: () => setMessage('We could not save your card. Please try again.'),
    });
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.sheetBody} testID="save-card-sheet">
        <Text variant="title" accessibilityRole="header">
          {setup?.heading ?? 'Save a card'}
        </Text>
        {startSetup.isPending ? (
          <Text variant="bodySmall" tone="secondary">
            Loading…
          </Text>
        ) : null}
        {setup ? (
          <>
            <Text variant="bodySmall">{setup.consent_text}</Text>
            {setup.scope === 'collective' && setup.members.length > 0 ? (
              <SeeMembers name={setup.scope_name} members={setup.members} />
            ) : null}
          </>
        ) : null}
        {message ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        <Button
          label={setup?.button_label ?? 'Save card'}
          onPress={submit}
          loading={save.isPending}
          disabled={!setup || save.isPending}
          fullWidth
        />
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={save.isPending} fullWidth />
      </View>
    </Sheet>
  );
}

/** "Visa ending 4242", or something true when Stripe told us less. */
function legacyCardLabel(brand: string | null, last4: string | null): string {
  const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';
  return last4 ? `${name} ending ${last4}` : name;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  name: { flex: 1 },
  gap: { marginTop: spacing.sm },
  group: { marginTop: spacing.md, gap: spacing.xs },
  cardBlock: { gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  sheetBody: { gap: spacing.md },
});
