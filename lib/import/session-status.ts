/**
 * How the import hub shows each past import, as the web's `ImportHub` does: the status pill,
 * the counts line, which actions apply, and the wizard's step routes.
 */
import type { Href } from 'expo-router';

import type { BadgeTone } from '@/components/ui/Badge';

export type ImportStepKey = 'upload' | 'map' | 'review' | 'references' | 'validate' | 'importing';

/** The six steps, in the web's order and with its labels. */
export const IMPORT_STEPS: { key: ImportStepKey; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map' },
  { key: 'review', label: 'Review' },
  { key: 'references', label: 'Services and staff' },
  { key: 'validate', label: 'Validate' },
  { key: 'importing', label: 'Import' },
];

export const IMPORT_HUB_ROUTE = '/import' as Href;

export function importStepRoute(sessionId: string, step: ImportStepKey): Href {
  return `/import/${encodeURIComponent(sessionId)}/${step}` as Href;
}

/** The fields of a session row the hub reads. */
export interface HubSession {
  status: string;
  undone_at: string | null;
  undo_available_until?: string | null;
  undo_incomplete?: boolean;
}

/** Statuses still being set up: Continue opens the Upload step. */
const IN_PROGRESS = ['uploading', 'mapping', 'validating', 'ready'];

export function statusTone(session: HubSession): BadgeTone {
  if (session.undone_at) return 'danger';
  if (session.status === 'complete') return 'success';
  if (session.status === 'failed') return 'danger';
  if ([...IN_PROGRESS, 'importing'].includes(session.status)) return 'brand';
  return 'neutral';
}

/** The pill's words: "Undone" wins, else the status in plain words. */
export function statusLabel(session: HubSession): string {
  if (session.undone_at) return 'Undone';
  const words: Record<string, string> = {
    uploading: 'Uploading',
    mapping: 'Mapping',
    validating: 'Checking',
    ready: 'Ready',
    importing: 'Importing',
    complete: 'Complete',
    failed: 'Failed',
    undone: 'Undone',
  };
  return words[session.status] ?? session.status.replace(/_/g, ' ');
}

export function canContinue(session: HubSession): boolean {
  return IN_PROGRESS.includes(session.status);
}

export function canResume(session: HubSession): boolean {
  return session.status === 'importing';
}

/** Report and Undo are offered on every complete import, as the web does. */
export function isComplete(session: HubSession): boolean {
  return session.status === 'complete';
}

/** "12 Jun 2026, 14:30", as the web formats these dates. */
export function formatImportDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 clients, 5 bookings" for a finished import, in the venue's own word for a client. */
export function importedCountsLine(
  session: { imported_clients?: number | null; imported_bookings?: number | null },
  clientLabel: string,
): string {
  const clients = session.imported_clients ?? 0;
  const bookings = session.imported_bookings ?? 0;
  const word = clientLabel.trim().toLowerCase() || 'client';
  return `${clients} ${clients === 1 ? word : `${word}s`}, ${bookings} ${bookings === 1 ? 'booking' : 'bookings'}`;
}
