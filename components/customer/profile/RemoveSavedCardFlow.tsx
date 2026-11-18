import { useCallback, useState, type ReactNode } from 'react';

import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import {
  useCardRemovalText,
  useRemoveAccountCard,
  type AccountCard,
} from '@/lib/queries/useAccountCards';
import { useToast } from '@/providers/ToastProvider';

/**
 * "Remove your saved card?" (web Docs/card-on-file-plan.md §5.5), shared by the profile's Saved
 * cards and a booking's "Remove my saved card".
 *
 * The second line says what happens to the bookings the card protects, in the server's words:
 * "It won't be used for new bookings. It stays saved for your 2 upcoming bookings while their
 * no-show terms apply, until 23 December, and is then deleted." or "It will be deleted now." It is
 * read fresh when the question opens. A till card that pays for a membership is asked about again
 * with the server's own message, as before.
 */
export function useRemoveSavedCardFlow(): { start: (card: AccountCard) => void; sheet: ReactNode } {
  const toast = useToast();
  const removalText = useCardRemovalText();
  const remove = useRemoveAccountCard();
  const [pending, setPending] = useState<{ card: AccountCard; message: string; acknowledge: boolean } | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const start = useCallback(
    (card: AccountCard) => {
      setLoadingText(true);
      setPending({ card, message: card.removal_text, acknowledge: false });
      void removalText(card).then((message) => {
        setPending((current) => (current && current.card.id === card.id ? { ...current, message } : current));
        setLoadingText(false);
      });
    },
    [removalText],
  );

  const confirm = () => {
    const target = pending;
    if (!target) return;
    remove.mutate(
      { card: target.card, acknowledge: target.acknowledge },
      {
        onSuccess: (outcome) => {
          if (outcome.status === 'needs_confirmation') {
            setPending({ card: target.card, message: outcome.message, acknowledge: true });
            return;
          }
          setPending(null);
          toast.success('Card removed.');
        },
        onError: () => toast.error('We could not remove that card. Please try again.'),
      },
    );
  };

  const sheet = (
    <ConfirmSheet
      visible={pending !== null}
      title={pending?.acknowledge ? 'Remove this card anyway?' : 'Remove your saved card?'}
      message={pending?.message ?? ''}
      confirmLabel={pending?.acknowledge ? 'Remove anyway' : 'Remove card'}
      cancelLabel="Keep card"
      destructive
      loading={remove.isPending || loadingText}
      onClose={() => setPending(null)}
      onConfirm={confirm}
    />
  );

  return { start, sheet };
}
