/**
 * "Add card now" from a booking (web Docs/card-on-file-plan.md §6.3, §6.7): the desk screen for the
 * booking's client, with the reach read from the client record's Card on file section (the
 * business, or every member of its collective). Mounted only while open, so the booking detail
 * itself asks the server for nothing extra.
 */
import { useQueryClient } from '@tanstack/react-query';

import { AddCardSheet } from '@/components/cards/AddCardSheet';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuestCardOnFile } from '@/lib/queries/useCardsOnFile';

export function BookingAddCardSheet({
  onClose,
  guestId,
  bookingId,
  clientName,
  hasContact,
  businessName,
  isAdmin = false,
}: {
  onClose: () => void;
  guestId: string;
  bookingId: string;
  clientName: string;
  hasContact: boolean;
  /** The venue's own name: where the card is kept until the server says otherwise. */
  businessName: string | null;
  /** iOS: only an admin may accept Apple's Tap to Pay terms. */
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const section = useGuestCardOnFile(guestId);
  const savesWith = section.data?.add_saves_with ?? null;
  return (
    <AddCardSheet
      visible
      onClose={onClose}
      guestId={guestId}
      bookingId={bookingId}
      clientFirstName={clientName.trim().split(/\s+/)[0] ?? ''}
      hasContact={hasContact}
      savedWith={savesWith?.name ?? businessName ?? 'this business'}
      scope={savesWith?.scope ?? 'business'}
      businessName={businessName}
      isAdmin={isAdmin}
      onSaved={() => invalidateBookingCaches(queryClient, accessToken, bookingId)}
    />
  );
}
