import type { Membership } from '@/lib/queries/useCustomerPasses';

/**
 * The sentences that carry a consequence, kept as functions so they can be
 * tested as strings.
 *
 * A dialog that opens and says the wrong thing passes any test that only asks
 * whether a dialog opened. The web made the same call for the same reason.
 */

/** When a period ends, in words a person would use. */
function periodEndPhrase(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * What is true about this membership right now.
 *
 * A pending cancellation NAMES THE DATE. "Cancellation scheduled at period end"
 * names no period and no end, and a customer reading it cannot tell whether
 * they have just lost the classes they already paid for.
 */
export function membershipStateLine(membership: Membership): string {
  const end = periodEndPhrase(membership.current_period_end);

  if (membership.cancel_at_period_end) {
    return end
      ? `Ending on ${end}. You can still use it until then.`
      : 'Ending at the end of this period. You can still use it until then.';
  }

  if (membership.status === 'past_due') {
    // Named plainly, because the venue may suspend it and the customer can fix
    // it only if they know.
    return 'A payment did not go through. Please check with the venue.';
  }

  if (membership.status === 'trialing') {
    return end ? `Trial, running until ${end}.` : 'Trial.';
  }

  return end ? `Renews on ${end}.` : 'Active.';
}

/**
 * What cancelling actually does, said before the customer commits.
 *
 * The date is the point. Without it, "cancel" reads as "stop now", and somebody
 * who believes they have already lost what they paid for will not book the
 * sessions they are still entitled to.
 */
export function membershipCancelConsequence(membership: Membership): string {
  const end = periodEndPhrase(membership.current_period_end);
  const stays = end
    ? `Your membership stays active until ${end}, and it stops after that.`
    : 'Your membership stays active until the end of the period you have paid for, and it stops after that.';
  return `${stays} You will not be charged again. You can change your mind here at any time before then.`;
}

/**
 * What leaving a course does.
 *
 * Names the refund WITHOUT naming a figure. The amount is prorated server-side
 * at cancel time and depends on how many sessions have already run, so a number
 * printed here would sometimes disagree with the one the customer is given, and
 * a wrong number about money is worse than no number.
 */
export function courseCancelConsequence(): string {
  return 'Your place on the remaining sessions is given up. Any refund due is worked out by the venue from the sessions still to come, and it may depend on how much notice you have given.';
}

/** Day names, indexed as the timetable stores them. */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * When a standing weekly reservation happens.
 *
 * Degrades rather than guessing. A rule with no day is described as weekly,
 * which is true, instead of being labelled Sunday because zero is falsy: the
 * day check is on the TYPE, not on truthiness, and Sunday is day zero.
 */
export function recurringLine(
  dayOfWeek: number | null | undefined,
  startTime: string | null | undefined,
): string {
  const day = typeof dayOfWeek === 'number' ? DAYS[dayOfWeek] : null;
  const time = startTime ? startTime.slice(0, 5) : null;
  if (day && time) return `Every ${day} at ${time}.`;
  if (day) return `Every ${day}.`;
  if (time) return `Every week at ${time}.`;
  return 'Repeats weekly.';
}
