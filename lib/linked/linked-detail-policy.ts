/**
 * What the full booking panel may do with a booking reached through a link
 * (web `ExpandedBookingContent`, its `linkedAct` gating, §5.3).
 *
 * The panel is the same one an own booking opens; the grant the partner gave us
 * decides which of its actions stay. The server applies the same grant to every
 * write, so this is about not offering what would be refused, not about
 * enforcing anything.
 */
import type { LinkActionLevel } from '@/types/linked-venues';

/** A booking's link context, carried from the diary into the panel. */
export interface LinkedBookingContext {
  /** The grant the partner gave us over this booking's venue. */
  act: LinkActionLevel;
  venueId: string;
  venueName: string;
  /** Whether the link shares the client's personal details (the compliance read needs it). */
  pii: boolean;
  /**
   * The calendar's name from the linked feed, for the hero's "with …" line:
   * the detail route names the practitioner for an own booking, and this is
   * the fallback the diary already hands the panel for its own columns.
   */
  practitionerName?: string | null;
}

export interface LinkedDetailPolicy {
  /** The booking belongs to a linked venue. */
  linked: boolean;
  /** A full-details link without an edit grant: everything is read only. */
  viewOnly: boolean;
  /** `edit_existing`: the booking may change, but not be created or cancelled. */
  limitedEdit: boolean;
  /**
   * Status changes, attendance, Modify and Reschedule, notes, messaging the
   * guest, deposit actions and resending the confirmation.
   */
  canEdit: boolean;
  /** Cancelling, and permanently deleting a cancelled booking. */
  canCancel: boolean;
  /** Rebooking the guest, into the booking's own venue. */
  canRebook: boolean;
  /**
   * Things that are ours and not the partner's: the guest's Records, "Open in
   * Contacts", "New for guest" and the guest's history, which the app reads from
   * our own venue's routes.
   */
  ownVenueOnly: boolean;
  /** The banner over the panel, or null for an own booking or a full grant. */
  banner: string | null;
}

/** The web's banner copy, verbatim. */
export const LINKED_VIEW_ONLY_BANNER =
  'Linked booking, view only. You can see full details here but cannot edit, reschedule or cancel this booking.';
export const LINKED_LIMITED_EDIT_BANNER =
  'Linked booking. You can edit existing bookings but cannot create new ones or cancel.';

export function linkedDetailPolicy(act: LinkActionLevel | null | undefined): LinkedDetailPolicy {
  if (act == null) {
    return {
      linked: false,
      viewOnly: false,
      limitedEdit: false,
      canEdit: true,
      canCancel: true,
      canRebook: true,
      ownVenueOnly: true,
      banner: null,
    };
  }
  const viewOnly = act === 'none';
  const limitedEdit = act === 'edit_existing';
  const full = act === 'create_edit_cancel';
  return {
    linked: true,
    viewOnly,
    limitedEdit,
    canEdit: !viewOnly,
    canCancel: full,
    canRebook: full,
    ownVenueOnly: false,
    banner: viewOnly ? LINKED_VIEW_ONLY_BANNER : limitedEdit ? LINKED_LIMITED_EDIT_BANNER : null,
  };
}
