import type { ContactListRow, GuestListItem } from '@/types/guest-list';

/** Letter bucket used for contacts whose surname initial isn't A–Z. */
export const NON_ALPHA_BUCKET = '#';

/** The A–Z jump rail, with a trailing "#" bucket for non-alphabetic surnames. */
export const AZ_LETTERS: string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  NON_ALPHA_BUCKET,
];

/** True when the active sort buckets rows alphabetically by surname. */
export function isNameSort(sort: string): boolean {
  return sort === 'name_asc' || sort === 'name_desc';
}

/**
 * The letter bucket for a contact. Mirrors the API sort (which orders by
 * last_name then first_name): prefer the surname initial, fall back to the
 * first name, then to the "#" bucket for anonymous/blank/non-alpha rows.
 */
export function bucketLetter(guest: GuestListItem): string {
  const source = (guest.last_name?.trim() || guest.first_name?.trim() || '').toUpperCase();
  const initial = source.charAt(0);
  return initial >= 'A' && initial <= 'Z' ? initial : NON_ALPHA_BUCKET;
}

export interface FlattenedContacts {
  /** The flattened list data: header rows interleaved with contact rows. */
  rows: ContactListRow[];
  /** Indices in `rows` that are letter headers — feed straight to stickyHeaderIndices. */
  stickyHeaderIndices: number[];
  /** For each present letter, the row index of its header (drives the A–Z rail jump). */
  letterIndex: Map<string, number>;
}

/**
 * Flatten the loaded contacts into a single FlatList-friendly array of
 * `header` and `contact` rows, in their already-sorted order. This is the
 * Fabric-safe alternative to a SectionList with sticky headers (which crashes
 * with `addViewAt: child already has a parent` on Android/Fabric). A new
 * `header` row is emitted whenever the surname initial changes; the server
 * already returns rows in the correct order for both name_asc and name_desc.
 */
export function flattenContacts(guests: GuestListItem[]): FlattenedContacts {
  const rows: ContactListRow[] = [];
  const stickyHeaderIndices: number[] = [];
  const letterIndex = new Map<string, number>();

  let currentLetter: string | null = null;
  for (const guest of guests) {
    const letter = bucketLetter(guest);
    if (letter !== currentLetter) {
      currentLetter = letter;
      letterIndex.set(letter, rows.length);
      stickyHeaderIndices.push(rows.length);
      rows.push({ type: 'header', letter, key: `header-${letter}` });
    }
    rows.push({ type: 'contact', guest, key: guest.id });
  }

  return { rows, stickyHeaderIndices, letterIndex };
}
