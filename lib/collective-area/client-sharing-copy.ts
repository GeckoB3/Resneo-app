/**
 * Collective client sharing: every word a person reads, the same as the web's
 * (Docs/collective-client-sharing-plan.md §1A.3 rule 3).
 *
 * GENERATED from the web's src/lib/linked-accounts/client-sharing-copy.ts by
 * `npm run copy:client-sharing` in the web repo. Do not edit by hand: change the web table and run
 * the script, which also updates cs-copy.sha256 here, which client-sharing-copy.test.ts checks.
 */
export const CLIENT_SHARING_COPY = {
  // The one reassurance (P4), said once per screen that changes lists.
  'cs.safe': 'Nothing is deleted. Every venue keeps its own record of each client.',
  'cs.whatShared':
    'Shared: contact details, marketing choices, tags, alerts and notes. Never shared: treatment records, forms, documents, payments or loyalty.',

  // Creating a collective (§1A.2 step 1).
  'cs.create.label': 'Share client lists',
  'cs.create.help': 'Your venues see one client list. Nothing is deleted.',

  // Joining (§1A.2 step 2).
  'cs.join.title': 'Share client lists?',
  'cs.join.body1': 'Clients of the venues here would be one list for you too.',
  'cs.join.body2':
    'Your clients are shared with them, and theirs with you: contact details, tags and alerts. It keeps itself up to date.',
  'cs.join.share': 'Share now',
  'cs.join.notNow': 'Not now',
  'cs.join.required': 'Choose Share now or Not now to carry on.',

  // The Clients tab on Manage Collective (§1A.2 step 3).
  'cs.tab.label': 'Clients',
  'cs.tab.switch': 'Share clients with this collective',
  'cs.tab.switchHelp': 'Your venues see one client list. Nothing is deleted.',
  'cs.tab.sharingWith': 'Sharing with',
  'cs.tab.changeWho': 'Change who you share with',
  'cs.tab.changeWhoHelp': 'Untick a venue to stop sharing with it. You both keep every client you already have.',
  'cs.tab.askFirst': 'Ask me before clients are matched',
  'cs.tab.askFirstHelp':
    'Off: records with the same email, client account, or phone and name are joined for you. On: every match waits for you in Clients to check.',
  'cs.tab.counts': '{here} clients here, {fromOthers} from the other venues, {inBoth} in both.',
  'cs.tab.upToDate': 'Up to date.',
  'cs.tab.arriving': '{count} changes still arriving.',
  'cs.tab.progress': 'Bringing your lists together, about {minutes} minutes.',
  'cs.tab.progressSoon': 'Bringing your lists together, almost done.',
  'cs.tab.progressLabel': 'Bringing lists together: {done} of {total}',
  'cs.tab.offer': 'Offer shared client lists',
  'cs.tab.offerHelp': 'Each venue decides for itself. Nobody shares until they say yes.',
  'cs.tab.askEveryone': 'Ask everyone to share',
  'cs.tab.asked': 'We asked {count} venues. Each one says yes for itself.',
  'cs.tab.askedOne': 'We asked 1 venue. It says yes for itself.',
  'cs.tab.notOffered': 'Your collective does not share client lists yet. Your host can offer it here.',
  'cs.tab.notOfferedHost': 'Switch on Offer shared client lists, and each venue can choose to share one client list.',
  'cs.tab.youAreOff': 'You are not sharing your clients. Switch on to see one client list.',
  'cs.tab.bringTogether': 'Bring together',
  'cs.tab.help': 'How shared clients work',
  'cs.tab.offerOff.title': 'Stop shared client lists for everyone?',
  'cs.tab.offerOff.body': 'Every venue stops sharing. Each venue keeps every client it has today.',
  'cs.tab.offerOff.confirm': 'Stop for everyone',
  'cs.tab.hostHeading': 'Host',
  'cs.tab.askConfirm.title': 'Ask every venue to share clients?',
  'cs.tab.askConfirm.body': 'Each venue that has not answered gets a notice. Nobody shares until they say yes.',
  'cs.tab.askConfirm.confirm': 'Ask them',
  'cs.state.sharing': 'Sharing',
  'cs.state.waiting': 'Waiting for {venue} to say yes',
  'cs.state.waitingYou': 'Waiting for you',
  'cs.state.waitingStart': 'Waiting for {venue} to bring their list together',
  'cs.state.notSharing': 'Not sharing',
  'cs.state.paused': 'Paused for now. It starts again by itself.',
  'cs.state.leftOut': 'Not sharing (left out)',

  // Bringing the lists together (§1A.2 step 4).
  'cs.start.title': 'Bring your client lists together?',
  'cs.start.yours': '{venue} has {count} clients.',
  'cs.start.other': '{venue} has {count}.',
  'cs.start.inBoth': '{count} people are clients of both, so we will join their records.',
  'cs.start.inBothOne': '1 person is a client of both, so we will join their records.',
  'cs.start.toAdd': 'The other {count} will be added to your list.',
  'cs.start.toAddOne': 'The other 1 will be added to your list.',
  'cs.start.toCheck': '{count} need a quick check first.',
  'cs.start.toCheckOne': '1 needs a quick check first.',
  'cs.start.confirm': 'Bring together',
  'cs.start.cancel': 'Cancel',
  'cs.start.nobody': 'Nobody else is sharing yet. Your clients are shared as soon as another venue says yes.',
  'cs.start.counting': 'Counting your clients',
  'cs.progress.done': 'Done. Your list now has {count} clients.',

  // "What needs you" and the bell (§1A.2 step 0, P7).
  'cs.todo.asked': '{venue} asked your collective to share clients.',
  'cs.todo.check': '{count} clients to check',
  'cs.todo.checkOne': '1 client to check',
  'cs.todo.share': 'Share now',
  'cs.todo.notNow': 'Not now',
  'cs.todo.open': 'Check them',

  // Clients list and a client's screen (§1A.2 step 5).
  'cs.contact.nudge': 'Your collective can share one client list, so everyone sees every client.',
  'cs.contact.nudgeAction': 'Turn it on',
  'cs.contact.nudgeDismiss': 'Not now',
  'cs.contact.banner': '{count} clients to check',
  'cs.contact.bannerOne': '1 client to check',
  'cs.contact.alsoAt': 'Also a client of {venues}',
  'cs.contact.sharedUntil': 'Shared while in {collective} until {date}',
  'cs.contact.across': 'Across the collective',
  'cs.contact.acrossVisits': '{count} visits',
  'cs.contact.acrossVisitOne': '1 visit',
  'cs.contact.acrossLast': 'Last visit {date}',
  'cs.contact.acrossNever': 'No visits yet',
  'cs.contact.acrossServices': 'Had: {services}',
  'cs.contact.acrossNoShows': '{count} no-shows',
  'cs.contact.acrossNoShowOne': '1 no-show',
  'cs.contact.alertFrom': 'Added at {venue}',
  'cs.contact.different': 'Not the same person',
  'cs.contact.differentHelp': 'Separates this client from the record at {venues}. Nothing is deleted.',
  'cs.contact.separated': 'Separated. Nothing was deleted.',

  // Clients to check (§1A.2 step 6).
  'cs.check.title': 'Clients to check',
  'cs.check.question': 'Is this the same person?',
  'cs.check.position': '{n} of {total}',
  'cs.check.reason.same_email': 'Same email.',
  'cs.check.reason.same_login': 'Same client account.',
  'cs.check.reason.same_phone_name': 'Same phone number and name.',
  'cs.check.reason.same_phone': 'Same phone number.',
  'cs.check.reason.same_name_email': 'Same name and a similar email.',
  'cs.check.reason.same_before': 'The same person when you shared before.',
  'cs.check.same': 'Same person',
  'cs.check.different': 'Different people',
  'cs.check.skip': 'Not sure, skip',
  'cs.check.twoHere': 'Two of your records look like the same person as {name} at {venue}. Merge them first.',
  'cs.check.mergeFirst': 'Merge these two first',
  'cs.check.change': '{venue} changed {name}’s {field} to {value}. Yours is {current}.',
  'cs.check.useNew': 'Use new',
  'cs.check.keepMine': 'Keep mine',
  'cs.check.emailTaken': '{venue} gave {name} the email {value}, but another of your clients already has it.',
  'cs.check.mergeThem': 'Merge them',
  'cs.check.joinAll': 'Join all likely matches ({count})',
  'cs.check.joinAll.title': 'Join {count} likely matches?',
  'cs.check.joinAll.body': 'Each pair becomes one client across your venues. You can undo this for 24 hours.',
  'cs.check.joinAll.confirm': 'Join them',
  'cs.check.joinAll.done': 'Joined {count} matches.',
  'cs.check.joinAll.partial':
    'Joined {count} matches. {left} more could not be joined in one go, because one record would match two people. Answer those one at a time.',
  'cs.check.undo': 'Undo',
  'cs.check.undone': 'Separated them again. Nothing was deleted.',
  'cs.check.empty': 'No clients to check. Everything is joined.',
  'cs.check.blank': 'blank',
  'cs.check.field.first_name': 'first name',
  'cs.check.field.last_name': 'last name',
  'cs.check.field.email': 'email',
  'cs.check.field.phone': 'phone',
  'cs.check.field.address_line1': 'address',
  'cs.check.field.customer_profile_notes': 'notes',
  'cs.check.field.dietary_preferences': 'dietary notes',
  'cs.check.decided': 'Someone at your collective already answered this one.',
  'cs.check.adminOnly': 'Only owners and admins can check shared clients.',
  'cs.check.back': 'Back to your clients',
  'cs.check.paused': 'Sharing with this venue is paused, so this one can wait. It comes back when sharing starts again.',

  // Leaving, removing, ending, stopping (§1A.2 step 7).
  'cs.leave.paragraph':
    'Your bookings, payments and everything else stay yours. You will keep all {count} shared clients, with their details and marketing choices exactly as they are today.',
  'cs.leave.othersKeep': '{venues} keep the clients you shared.',
  'cs.leave.othersKeepOne': '{venue} keeps the clients you shared.',
  'cs.leave.remove': '{venue} keeps every client it holds today, and so do you. Sharing between you stops.',
  'cs.leave.end': 'Every venue keeps every client it holds today. Sharing stops.',
  'cs.stop.title': 'Stop sharing clients?',
  'cs.stop.body':
    'You will keep all {count} shared clients, with their details and marketing choices exactly as they are today. The other venues keep the clients you shared. From now on, changes stop travelling between you.',
  'cs.stop.confirm': 'Stop sharing',
  'cs.stop.excludeTitle': 'Stop sharing with {venue}?',
  'cs.stop.excludeBody':
    'You both keep every client you already have. From now on, new clients and changes stop travelling between you.',
  'cs.stop.done': 'Sharing stopped. You kept every client.',

  // Erasure (§1A.2 step 8, §10).
  'cs.erase.also': 'Also held by {venues}.',
  'cs.erase.alsoHelp': 'They keep their own records. We will tell them this client asked to be erased here.',

  // Bell notices.
  'cs.notice.erased.title': 'A shared client was erased at {venue}',
  'cs.notice.erased.body':
    '{name} asked {venue} to erase their details. Your own record is unchanged. If they asked you too, erase it from their client screen.',
  'cs.notice.asked.title': '{venue} asked your collective to share clients',
  'cs.notice.asked.body':
    'One client list for every venue, kept up to date for you. Nothing is deleted. Open Manage Collective, then Clients, to answer.',
  'cs.notice.joined.title': '{venue} joined and now shares clients with you',
  'cs.notice.joined.body':
    'Their clients are arriving in your list. To change who you share with, open Manage Collective, then Clients.',
  'cs.notice.started.title': '{venue} now shares clients with you',
  'cs.notice.started.body': 'Their clients are arriving in your list now.',
  'cs.notice.stopped.title': '{venue} stopped sharing clients with you',
  'cs.notice.stopped.body': 'You keep every client you already had.',
  'cs.notice.ended.title': 'Shared client lists ended in {collective}',
  'cs.notice.ended.body': 'You keep every client you already had.',

  'cs.error.generic': 'We could not save that. Please try again.',
  'cs.error.retry': 'Try again',
} as const;

export type ClientSharingCopyId = keyof typeof CLIENT_SHARING_COPY;

export function clientSharingCopy(
  id: ClientSharingCopyId,
  params: Record<string, string | number | null | undefined> = {},
): string {
  return CLIENT_SHARING_COPY[id].replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined || value === null || value === '' ? whole : String(value);
  });
}

/** "1,240": counts read the way people say them. */
export function formatClientCount(n: number): string {
  return new Intl.NumberFormat('en-GB').format(Math.max(0, Math.round(n)));
}
