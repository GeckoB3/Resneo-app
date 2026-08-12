/**
 * Whether a schedule change is one the guest needs to hear about.
 *
 * The server sends its "your booking changed" email only when the booking's
 * START moves. A drag-RESIZE keeps the start and changes only how long the
 * practitioner is busy, so there is nothing to tell the guest: they are still
 * due at the same time.
 *
 * The app used to defer the notification on every drag and then offer
 * "Notify {guest}" afterwards, so resizing a booking from 30 to 45 minutes
 * invited staff to tell a guest their appointment had moved when it had not.
 * Web hit the same thing and fixed it the same way ("the resize now sends
 * `skip_` rather than `defer_` and arms nothing").
 *
 * Note the two flags are the SAME to the server: both suppress the immediate
 * send, and neither leaves anything queued. The distinction is the app's own
 * intent, and it is worth keeping honest — `defer` means "I am about to ask the
 * staff member", `skip` means "there is nothing to ask about". The behaviour
 * that actually reaches the guest is decided by whether the prompt offers to
 * notify at all.
 */

export interface ScheduleChangeShape {
  /** Start before the change: "HH:mm" or "HH:mm:ss". */
  previousTime: string;
  /** Start after the change, same forms. */
  nextTime: string;
  /** Date before the change: "YYYY-MM-DD". */
  previousDate: string;
  /** Date after the change. */
  nextDate: string;
}

/**
 * Did the booking's start actually move? Compared on the wall clock to the
 * minute, so `"09:00"` and `"09:00:00"` are the same instant — the two sides of
 * a drag come from different sources and are not always the same width.
 */
export function bookingStartMoved(change: ScheduleChangeShape): boolean {
  const hm = (t: string) => t.trim().slice(0, 5);
  return hm(change.previousTime) !== hm(change.nextTime) ||
    change.previousDate.trim() !== change.nextDate.trim();
}

export interface GuestNotifyPlan {
  /**
   * Tell the server not to send the email at all
   * (`skip_booking_modification_guest_notification`). Otherwise the caller
   * defers it and owns the choice.
   */
  skip: boolean;
  /** Offer the staff member Notify / Don't notify after the change lands. */
  prompt: boolean;
}

/**
 * What to do about the guest email for a staff schedule change.
 *
 * Start moved: defer the email and let the staff member choose, which is the
 * existing Notify / Don't notify / Undo prompt. Start unchanged (a pure
 * resize): skip it, and offer no notify choice. `prompt` is the load-bearing
 * half — it is what stops the app inviting staff to announce a move that never
 * happened.
 */
export function guestNotifyPlanForChange(change: ScheduleChangeShape): GuestNotifyPlan {
  const moved = bookingStartMoved(change);
  return { skip: !moved, prompt: moved };
}
