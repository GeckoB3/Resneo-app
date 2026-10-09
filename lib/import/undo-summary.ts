/**
 * What an Undo kept on purpose, in plain words. Port of the web's `describeImportUndoKept`
 * (`src/lib/import/undo-summary.ts`, QA G-33): the hub says it after an Undo and on every later
 * visit, from the `undo_summary` the sessions list carries.
 */

export interface ImportUndoSummary {
  kept_clients: number;
  kept_client_names: string[];
  kept_items: number;
  kept_item_names: string[];
  kept_bookings?: number;
}

/** Names shown per list; the count always covers everyone. */
export const UNDO_KEPT_NAMES_MAX = 20;

function nameList(names: string[], total: number): string {
  const shown = names.slice(0, UNDO_KEPT_NAMES_MAX);
  const rest = Math.max(0, total - shown.length);
  if (!shown.length) return '';
  if (rest === 0) return shown.join(', ');
  return `${shown.join(', ')} and ${rest} more`;
}

export function describeImportUndoKept(summary: ImportUndoSummary | null | undefined, clientLabel: string): string[] {
  if (!summary) return [];
  const word = clientLabel.trim().toLowerCase() || 'client';
  const lines: string[] = [];

  if (summary.kept_clients > 0) {
    const one = summary.kept_clients === 1;
    const who = nameList(summary.kept_client_names ?? [], summary.kept_clients);
    lines.push(
      `${summary.kept_clients} ${word}${one ? ' was' : 's were'} kept, because ${
        one ? 'they have' : 'they each have'
      } bookings, forms or files that did not come from this import${who ? `: ${who}` : ''}. Their imported bookings and visit history were still removed.`,
    );
  }

  const keptBookings = summary.kept_bookings ?? 0;
  if (keptBookings > 0) {
    const one = keptBookings === 1;
    lines.push(
      `${keptBookings} ${one ? 'booking was' : 'bookings were'} kept, because money was taken for ${
        one ? 'it' : 'them'
      } in ResNeo after the import. Payment records are never deleted. Cancel ${one ? 'it' : 'them'} instead if ${
        one ? 'it is' : 'they are'
      } not needed.`,
    );
  }

  if (summary.kept_items > 0) {
    const one = summary.kept_items === 1;
    const what = nameList(summary.kept_item_names ?? [], summary.kept_items);
    lines.push(
      `${summary.kept_items} ${one ? 'service or calendar was' : 'services or calendars were'} kept, because bookings that did not come from this import use ${
        one ? 'it' : 'them'
      }${what ? `: ${what}` : ''}.`,
    );
  }

  return lines;
}
