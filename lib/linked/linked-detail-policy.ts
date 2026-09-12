/**
 * What the full booking panel may do with a booking reached through a link
 * (web `ExpandedBookingContent`, its `linkedAct` gating, §5.3).
 *
 * The panel is the same one an own booking opens; the grant the partner gave us
 * decides which of its actions stay. The server applies the same grant to every
 * write, so this is about not offering what would be refused, not about
 * enforcing anything. The sections a partner's guest brings with them (the
 * guest's history and Records) are read from the partner's venue instead of
 * ours, through the owner-venue scope the routes take, and stay in the panel.
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
  /**
   * The service's name from the linked feed. Our own services catalogue cannot
   * name a partner's service, so without this the panel fell back to the bare
   * word "Service" for every partner booking (device test, 2026-09-12). The
   * feed only carries it on a `full_details` link — and only where the partner's
   * own server could resolve it — so it stays optional.
   */
  serviceName?: string | null;
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
   * guest, deposit actions, resending the confirmation, and adding to the
   * guest's Records. REMOVING one of their files is not here: it follows
   * `canCancel`, because web gates that DELETE with the cancel-level grant.
   */
  canEdit: boolean;
  /**
   * Cancelling, permanently deleting a cancelled booking, and removing a file
   * from the guest's Records.
   */
  canCancel: boolean;
  /** Rebooking the guest, or a new booking for them, at the booking's own venue. */
  canRebook: boolean;
  /** "Open in Contacts": a partner's guest is not in our Contacts. */
  showContactsLink: boolean;
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
      showContactsLink: true,
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
    showContactsLink: false,
    banner: viewOnly ? LINKED_VIEW_ONLY_BANNER : limitedEdit ? LINKED_LIMITED_EDIT_BANNER : null,
  };
}

/**
 * Whether the panel offers Start / Undo start / Complete / Undo complete on
 * each service of a multi-service visit.
 *
 * The edit grant decides, for a partner's visit exactly as for our own. These
 * buttons used to be withheld from every linked booking on the belief that the
 * per-service status PATCH was own-venue only — it is not: web's
 * `PATCH /api/venue/bookings/[id]` takes a partner's row under
 * `linkedGrantAllowsMutation`, the diary's own bars on a partner's column
 * already Start and Complete those services through that same route, and web's
 * panel shows the row buttons on every service visit (`segmentLifecycleActions`
 * in `ExpandedBookingContent`). So a partner's visit read as a regression: the
 * bars offered what the panel had lost (owner, 2026-09-12).
 *
 * A view-only link still gets none (`canEdit` is false), and neither does a
 * table reservation, whose rows are not services.
 */
export function canChangeVisitServiceStatus(policy: LinkedDetailPolicy, isTable: boolean): boolean {
  return policy.canEdit && !isTable;
}
