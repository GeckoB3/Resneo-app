/**
 * Collective client sharing: the shapes the server sends
 * (web Docs/collective-client-sharing-plan.md §1A.3 rule 1: the server decides, the screens draw).
 *
 * @see (web repo) src/lib/linked-accounts/client-sharing/types.ts (the web's copy). Fields are
 * only ever added there; an older server simply has no client-sharing routes.
 */

/** What a venue has said (P2 choice 1). */
export type ClientSharingState = 'undecided' | 'on' | 'not_now' | 'ended';

/** How another venue stands with the viewing venue, in one word for the venue list (§1A.4). */
export type ClientSharingVenueStatus =
  | 'sharing'
  | 'waiting'
  /** They said yes and have not brought their list together yet. */
  | 'waiting_start'
  /** They share; this venue said yes and has not brought its list together yet. */
  | 'waiting_you'
  | 'not_sharing'
  | 'paused'
  | 'left_out';

export interface ClientSharingVenue {
  venueId: string;
  name: string;
  status: ClientSharingVenueStatus;
  /** The viewing venue has left this one out (P2 choice 2). */
  excluded: boolean;
  isHost: boolean;
}

export interface ClientSharingStatusResponse {
  collective: { id: string; name: string; isHost: boolean };
  /** The collective offers shared client lists (the host's switch). */
  offered: boolean;
  me: {
    venueId: string;
    name: string;
    state: ClientSharingState;
    /** The lists were brought together; a venue that said yes exchanges nothing until then. */
    started: boolean;
    askFirst: boolean;
    excludedVenueIds: string[];
    /** Another venue asked this one to share and it has not answered or dismissed it. */
    request: { byVenueName: string; at: string } | null;
    nudgeDismissed: boolean;
  };
  venues: ClientSharingVenue[];
  counts: { here: number; fromOthers: number; inBoth: number; shared: number };
  /** Bringing lists together, with a rough time left. Null when nothing is running. */
  progress: { done: number; total: number; minutesLeft: number } | null;
  /** Changes recorded and not yet passed on; 0 reads "Up to date". */
  arriving: number;
  todo: { toCheck: number; changes: number };
  /** Host only: members that have not answered and could be asked. */
  undecidedCount: number;
  /**
   * Venues whose clients pass to another venue now (active or paused pair): the Remove and End
   * wording says "sharing stops" only about these. Added 2026-11-15; missing from an older server.
   */
  sharingVenueIds?: string[];
}

/** POST .../client-sharing/preview: the Bring together numbers (§1A.2 step 4). */
export interface ClientSharingPreviewResponse {
  here: number;
  venueName: string;
  others: Array<{ venueId: string; name: string; clients: number }>;
  othersTotal: number;
  inBoth: number;
  toAdd: number;
  toCheck: number;
  /** Nobody else shares yet: saying yes needs no Bring together. */
  nobody: boolean;
}

/** One card in Clients to check (§1A.2 step 6). */
export interface ClientSharingPerson {
  guestId: string;
  name: string;
  email: string | null;
  phone: string | null;
  venueId: string;
  venueName: string;
}

export type ClientSharingCard =
  | {
      kind: 'match';
      id: string;
      reason:
        | 'same_email'
        | 'same_login'
        | 'same_phone_name'
        | 'same_phone'
        | 'same_name_email'
        | 'same_before'
        /** The same phone and name, but a different email on each record (added 2026-11-15). */
        | 'same_phone_name_other_email';
      certainty: 'certain' | 'likely';
      mine: ClientSharingPerson;
      theirs: ClientSharingPerson;
    }
  | {
      kind: 'merge_first';
      id: string;
      /**
       * Two of the viewing venue's own records that match one person elsewhere. The venue says which
       * one is that person (decision 'link_to' with its guest id) or neither ('keep_separate')
       * (added 2026-11-15).
       */
      mine: [ClientSharingPerson, ClientSharingPerson];
      theirs: ClientSharingPerson | null;
    }
  | {
      kind: 'change';
      id: string;
      reason: 'changed_here' | 'ask_first' | 'email_taken';
      field: string;
      newValue: string | null;
      currentValue: string | null;
      guest: ClientSharingPerson;
      fromVenueName: string;
    };

export interface ClientSharingCheckResponse {
  cards: ClientSharingCard[];
  total: number;
  likelyCount: number;
  /** A "Link all likely matches" that can still be undone. */
  undo: { batchId: string; count: number; until: string } | null;
}

/** GET /api/venue/guests/[guestId]/shared (§1A.2 step 5). */
export interface SharedGuestResponse {
  /** Other venues sharing this client with the viewing venue. */
  alsoAt: Array<{ venueId: string; name: string }>;
  across: Array<{
    venueId: string;
    name: string;
    visits: number;
    lastVisit: string | null;
    noShows: number;
    services: string[];
  }>;
  /** A copy kept after sharing ended: "Shared while in X until date". */
  sharedUntil: { collectiveName: string; date: string } | null;
  /** Owners and admins may separate this record from the others. */
  canSeparate: boolean;
}

/** GET /api/venue/client-sharing: what the Clients list needs (nudge and banner). */
export interface VenueClientSharingSummary {
  collectiveId: string | null;
  offered: boolean;
  state: ClientSharingState | null;
  started: boolean;
  showNudge: boolean;
  toCheck: number;
  canManage: boolean;
  /**
   * Another venue asked this one to share and nobody here answered (P7 "What needs you" row).
   * Owners and admins only, while offered and undecided. Added 2026-11-15; missing from an older server.
   */
  request?: { byVenueName: string; at: string } | null;
  /** Venues whose clients pass to another venue now. Added 2026-11-15; missing from an older server. */
  sharingVenueIds?: string[];
}

/** PUT .../client-sharing answers the status plus whether Bring together is needed. */
export type ClientSharingPutResponse = ClientSharingStatusResponse & { needsBringTogether?: boolean };

export type ClientSharingDecision =
  | 'same_person'
  | 'different_people'
  | 'skip'
  | 'use_new'
  | 'keep_mine'
  /** A merge_first card: this one of the venue's two records is that person (send its `guest_id`). Added 2026-11-15. */
  | 'link_to'
  /** A merge_first card: neither of the venue's two records is that person. Added 2026-11-15. */
  | 'keep_separate';
