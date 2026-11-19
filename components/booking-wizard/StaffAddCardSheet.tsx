/**
 * "Add card now" from a staff booking form or its confirmation (web card-on-file-plan §6.2, §6.7):
 * the desk screen for the chosen client. Mounted only while open, so the forms need no query
 * client until staff actually use it.
 */
import { AddCardSheet } from '@/components/cards/AddCardSheet';

export function StaffAddCardSheet({
  open,
  onClose,
  guestId,
  bookingId = null,
  bookingVenueId = null,
  clientFirstName,
  hasContact,
  savesWith,
  businessName = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  guestId: string | null | undefined;
  bookingId?: string | null;
  /** Before the booking exists: the business it will be at, named to the desk session. */
  bookingVenueId?: string | null;
  clientFirstName: string;
  hasContact: boolean;
  /** Where a card added now is kept (the client record's `add_saves_with`), when known. */
  savesWith: { scope: 'business' | 'collective'; name: string } | null;
  businessName?: string | null;
  onSaved?: () => void;
}) {
  if (!open || !guestId) return null;
  return (
    <AddCardSheet
      visible
      onClose={onClose}
      guestId={guestId}
      bookingId={bookingId}
      bookingVenueId={bookingVenueId}
      clientFirstName={clientFirstName}
      hasContact={hasContact}
      savedWith={savesWith?.name || businessName?.trim() || 'this business'}
      scope={savesWith?.scope ?? 'business'}
      businessName={businessName}
      onSaved={onSaved}
    />
  );
}
