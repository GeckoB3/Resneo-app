/**
 * The client record's "Card on file" section (web Docs/card-on-file-plan.md §6.6; web
 * `ContactCardOnFileSection` and `SeeMembers`), always shown:
 * - "Visa ending 4242, expires 08/28, cardholder A Smith." "Saved with The Beauty Parlour on
 *   16 November." with "See members" for a collective, and this business's till cards under it;
 * - "Protects 3 upcoming bookings.";
 * - "Add card" (the desk sheet) and, for admins, "Remove card" with a reason;
 * - the card's history, collapsed;
 * - none: "No card on file." with "Add card".
 *
 * Hidden only on an older server without the route (the hook answers null).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddCardSheet } from '@/components/cards/AddCardSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
import {
  removeGuestCardMessage,
  useGuestCardOnFile,
  useRemoveGuestCard,
  type CardRemoveReason,
} from '@/lib/queries/useCardsOnFile';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export const CARD_REMOVE_REASONS: { value: CardRemoveReason; label: string }[] = [
  { value: 'client_asked', label: 'Client asked' },
  { value: 'lost_or_stolen', label: 'Card lost or stolen' },
  { value: 'other', label: 'Other' },
];

/** "16 November". */
export function formatCardDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** "16 Nov, 14:30". */
export function formatCardWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** "Protects 3 upcoming bookings." / "Protects no upcoming bookings here yet." */
export function protectsLine(n: number): string {
  return n === 0
    ? 'Protects no upcoming bookings here yet.'
    : `Protects ${n} upcoming booking${n === 1 ? '' : 's'}.`;
}

export function ClientCardOnFileSection({
  guestId,
  clientName,
  hasContact,
}: {
  guestId: string;
  clientName: string;
  /** The client has an email or mobile number (for "Send by email or text"). */
  hasContact: boolean;
}) {
  const { colors } = useTheme();
  const query = useGuestCardOnFile(guestId);
  const remove = useRemoveGuestCard(guestId);
  const [deskOpen, setDeskOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reason, setReason] = useState<CardRemoveReason | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const first = clientName.trim().split(/\s+/)[0] || '';

  // An older server has no such route: nothing to show.
  if (query.isSuccess && query.data === null) return null;

  const data = query.data ?? null;
  const card = data?.card ?? null;
  const savedWith = data?.add_saves_with?.name ?? card?.saved_with ?? 'this business';
  const scope = data?.add_saves_with?.scope ?? card?.scope ?? 'business';

  const closeRemove = () => {
    setRemoveOpen(false);
    setReason(null);
    setRemoveError(null);
  };

  const confirmRemove = () => {
    if (!reason || remove.isPending) return;
    setRemoveError(null);
    remove.mutate(
      { reason },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setMessage(removeGuestCardMessage(result, first));
          closeRemove();
        },
        onError: (e) =>
          setRemoveError(e instanceof Error && e.message ? e.message : "We couldn't remove the card. Try again."),
      },
    );
  };

  return (
    <Card>
      <View style={styles.stack} testID="client-card-on-file">
        <View style={styles.titleRow}>
          <Text variant="label" accessibilityRole="header">
            Card on file
          </Text>
          {card ? <Badge label="Protected" tone="success" /> : null}
        </View>

        {query.isError ? (
          <View style={styles.stack}>
            <Text variant="bodySmall" tone="secondary" accessibilityRole="alert">
              {"We couldn't load the card on file."}
            </Text>
            <Button label="Try again" variant="secondary" size="sm" onPress={() => void query.refetch()} />
          </View>
        ) : !data ? (
          <Text variant="bodySmall" tone="muted">
            Loading card on file...
          </Text>
        ) : (
          <>
            {card ? (
              <View style={styles.lines}>
                <Text variant="bodySmall">
                  <Text variant="bodyMedium">{card.label}</Text>
                  {`${card.expiry ? `, expires ${card.expiry}` : ''}${card.cardholder_name ? `, cardholder ${card.cardholder_name}` : ''}.`}
                </Text>
                <Text variant="bodySmall">
                  {`Saved with ${card.saved_with} on ${formatCardDay(card.saved_at)}.${card.scope === 'collective' ? ' Protects bookings with every member.' : ''}`}
                </Text>
                {card.scope === 'collective' && card.members.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`See members of ${card.saved_with}`}
                    onPress={() => {
                      hapticSelect();
                      setMembersOpen(true);
                    }}
                    style={styles.linkButton}
                    hitSlop={8}>
                    <Text variant="bodySmall" tone="brand">
                      See members
                    </Text>
                  </Pressable>
                ) : null}
                {card.linked_by ? (
                  <Text variant="caption" tone="muted">
                    {`${card.linked_by}.`}
                  </Text>
                ) : null}
                <Text variant="bodySmall">{protectsLine(card.protects_upcoming)}</Text>
              </View>
            ) : (
              <Text variant="bodySmall" tone="secondary">
                No card on file.
              </Text>
            )}

            {data.till_cards.length > 0 ? (
              <View style={styles.lines}>
                <Text variant="overline" tone="muted">
                  Till cards here
                </Text>
                {data.till_cards.map((t) => (
                  <Text key={t.id} variant="bodySmall">
                    {`${t.label}${t.expiry ? `, expires ${t.expiry}` : ''}${t.protects_bookings ? '. Also protects bookings here.' : '. For payments only.'}`}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              {data.can_take_cards ? (
                <Button
                  label={card ? 'Add a new card' : 'Add card'}
                  variant={card ? 'secondary' : 'primary'}
                  onPress={() => setDeskOpen(true)}
                  fullWidth
                />
              ) : (
                <Text variant="bodySmall" tone="secondary">
                  {"Card not possible: this business can't take card payments yet."}
                </Text>
              )}
              {card && data.can_remove ? (
                <Button
                  label="Remove card"
                  variant="secondary"
                  onPress={() => {
                    setMessage(null);
                    setRemoveOpen(true);
                  }}
                  fullWidth
                />
              ) : null}
            </View>

            {message ? (
              <Text variant="bodySmall" accessibilityLiveRegion="polite" testID="client-card-message">
                {message}
              </Text>
            ) : null}

            {data.history.length > 0 ? (
              <View style={styles.lines}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: historyOpen }}
                  accessibilityLabel={historyOpen ? 'Hide history' : 'Show history'}
                  onPress={() => setHistoryOpen((v) => !v)}
                  style={styles.linkButton}>
                  <Text variant="bodySmall" tone="brand">
                    {historyOpen ? 'Hide history' : `History (${data.history.length})`}
                  </Text>
                </Pressable>
                {historyOpen
                  ? data.history.map((h) => (
                      <Text key={h.id} variant="caption" tone="secondary">
                        {`${formatCardWhen(h.at)}: ${h.text}`}
                      </Text>
                    ))
                  : null}
              </View>
            ) : null}
          </>
        )}
      </View>

      <AddCardSheet
        visible={deskOpen}
        onClose={() => setDeskOpen(false)}
        guestId={guestId}
        clientFirstName={first}
        hasContact={hasContact}
        savedWith={savedWith}
        scope={scope}
        // Removing cards is for admins, the same people who may accept Apple's Tap to Pay terms.
        isAdmin={query.data?.can_remove === true}
        onSaved={() => void query.refetch()}
      />

      <Sheet visible={membersOpen} onClose={() => setMembersOpen(false)}>
        <View style={styles.stack} testID="card-members-sheet">
          <Text variant="title" accessibilityRole="header">
            {card ? `Members of ${card.saved_with}` : 'Members'}
          </Text>
          <Text variant="bodySmall" tone="muted">
            The card protects bookings with every member, including businesses that join later.
          </Text>
          {(card?.members ?? []).map((m) => (
            <Text key={m.venue_id} variant="body">
              {m.name}
            </Text>
          ))}
          <Button label="Close" variant="secondary" onPress={() => setMembersOpen(false)} fullWidth />
        </View>
      </Sheet>

      <Sheet visible={removeOpen} onClose={closeRemove}>
        <View style={styles.stack} testID="card-remove-sheet">
          <Text variant="title" accessibilityRole="header">
            Remove card?
          </Text>
          {data?.removal_text ? (
            <Text variant="bodySmall" tone="secondary">
              {data.removal_text}
            </Text>
          ) : null}
          <Text variant="label">Why is it being removed?</Text>
          <View accessibilityRole="radiogroup" style={styles.reasons}>
            {CARD_REMOVE_REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={r.label}
                  onPress={() => {
                    hapticSelect();
                    setReason(r.value);
                  }}
                  style={[
                    styles.reason,
                    {
                      borderColor: selected ? colors.brand : colors.border,
                      backgroundColor: selected ? colors.surfaceRaised : colors.surface,
                    },
                  ]}>
                  <Text variant="bodyMedium">{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {reason === 'lost_or_stolen' ? (
            <Text variant="bodySmall" tone="secondary">
              The card is stopped. It protects nothing from now on, its future bookings go back to Waiting for card, and the client is sent a card request.
            </Text>
          ) : null}
          {removeError ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {removeError}
            </Text>
          ) : null}
          <Button
            label="Remove card"
            variant="danger"
            onPress={confirmRemove}
            disabled={!reason}
            loading={remove.isPending}
            fullWidth
          />
          <Button label="Keep card" variant="ghost" onPress={closeRemove} disabled={remove.isPending} fullWidth />
        </View>
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  lines: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  actions: { gap: spacing.sm },
  linkButton: { minHeight: minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  reasons: { gap: spacing.sm },
  reason: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
  },
});
