import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setCardAccountOwner } from '@/lib/payments/card-account';
import { getTerminalSdk, isTerminalInitialized } from '@/lib/payments/terminal-sdk';
import { LinkedVenueContext } from '@/providers/LinkedVenueProvider';

/**
 * Points the card reader at the Stripe account of the business that owns the booking being paid.
 *
 * Another business's booking is charged on its own connected account (the server creates the
 * PaymentIntent there), so the phone's reader must be connected through that account's token. Until
 * now the reader followed only the app-wide linked-venue choice, which a booking opened from the
 * signed-in business's own calendar never changes: the reader then sat on the wrong account and
 * failed with "No such payment_intent".
 *
 * While mounted: the reader hooks below see the owner as their venue, the SDK's token provider asks
 * for the owner's token, and any reader connected to another account is let go first. On unmount the
 * reader is let go again, so the next payment at the signed-in business connects to its own account.
 * Children render only once the old reader has been dropped, so a payment started the instant the
 * sheet opens cannot race it. Renders its children untouched when the booking is the business's own,
 * or the app is already scoped to the owner.
 *
 * Must sit inside `TerminalProvider`, as the sections it wraps do.
 */
/** How long to wait for the old reader to let go before showing the card screens anyway. */
const DROP_READER_TIMEOUT_MS = 4000;

export function CardAccountScope({ ownerVenueId, children }: { ownerVenueId: string | null; children: ReactNode }) {
  const linked = useContext(LinkedVenueContext);
  const appScope = linked?.ownerVenueId ?? null;
  const needed = Boolean(ownerVenueId) && ownerVenueId !== appScope;
  const sdk = getTerminalSdk();
  const terminal = sdk ? sdk.useStripeTerminal() : null;
  /** The account the old reader has been dropped for; children wait until it is this one. */
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = !needed || readyFor === ownerVenueId;

  useEffect(() => {
    if (!needed || !ownerVenueId) return undefined;
    let cancelled = false;
    const drop = async () => {
      // An SDK never initialised has nothing connected or cached, and every call would log an error.
      if (!terminal || !isTerminalInitialized()) return;
      await terminal.disconnectReader().catch(() => undefined);
      await terminal.clearCachedCredentials?.().catch(() => undefined);
    };
    setCardAccountOwner(ownerVenueId);
    // A reader that never answers must not leave the sheet blank: carry on after a few seconds
    // (the reader hooks below time out and report their own errors).
    const giveUp = new Promise<void>((resolve) => setTimeout(resolve, DROP_READER_TIMEOUT_MS));
    void Promise.race([drop(), giveUp]).finally(() => {
      if (!cancelled) setReadyFor(ownerVenueId);
    });
    return () => {
      cancelled = true;
      setCardAccountOwner(null);
      void drop();
    };
    // `terminal` is a fresh object every render; the scope changes only with the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, ownerVenueId]);

  const value = useMemo(
    () => (linked && needed ? { ...linked, ownerVenueId, ownerVenueName: null, ownerPractitionerId: null } : linked),
    [linked, needed, ownerVenueId],
  );

  if (!ready) return null;
  if (!needed || !value) return <>{children}</>;
  return <LinkedVenueContext.Provider value={value}>{children}</LinkedVenueContext.Provider>;
}
