import { AppState } from 'react-native';

import { formatPence } from '@/lib/format';
import { cardOutcomeHeading, type CardOutcome } from '@/lib/payments/card-outcome';
import { Notifications } from '@/lib/push/notificationsModule';

/**
 * Tell staff about a card payment that was NOT approved when the app is no
 * longer on screen to show it (Apple's checklist 5.12).
 *
 * The payment sheet shows the outcome itself whenever it can. This covers the
 * case where staff (or the phone) left the app between the card being read and
 * the answer arriving: without it, a declined payment would look taken to a
 * client who has already walked off. A local notification, posted from this
 * device, because this device is the one that knows the answer first.
 *
 * Never throws — it runs on a path that is already failing — and only posts
 * when the app is not active, so it never duplicates what is on screen.
 */
export async function notifyCardPaymentNotApproved(args: {
  outcome: CardOutcome;
  amountPence: number | null;
  guestName: string;
  appState?: string;
}): Promise<boolean> {
  const state = args.appState ?? AppState.currentState;
  if (state === 'active' || !Notifications) return false;
  const amount = formatPence(args.amountPence);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: cardOutcomeHeading(args.outcome),
        body: `${amount ? `${amount} from ` : 'The card payment from '}${args.guestName} was not approved. Open Resneo to take the payment another way.`,
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
