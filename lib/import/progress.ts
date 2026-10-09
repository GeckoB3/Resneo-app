/**
 * The Import step's clock and wording. Port of the web's `ImportingStepClient` helpers.
 */
import type { ImportProgress } from '@/lib/import/types';
import type { ImportStepKey } from '@/lib/import/session-status';

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `about ${Math.max(1, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `about ${m}m ${s}s`;
}

export function formatElapsed(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Time left at the rate so far, or null while there is not enough to go on. */
export function etaLabel(progress: ImportProgress | null, startMs: number | null, nowMs: number): string | null {
  if (!progress || progress.status !== 'importing' || !startMs) return null;
  const done = progress.progress_processed;
  const total = progress.progress_total;
  if (!total || done <= 0 || done >= total) return null;
  const elapsedSec = (nowMs - startMs) / 1000;
  if (elapsedSec < 2) return null;
  const rate = done / elapsedSec;
  if (rate <= 0) return null;
  return formatEta((total - done) / rate) || null;
}

export function elapsedLabel(progress: ImportProgress | null, startMs: number | null, nowMs: number): string | null {
  if (!progress || progress.status !== 'importing' || !startMs) return null;
  return formatElapsed((nowMs - startMs) / 1000) || null;
}

/** The step to go back to when an import was opened here without being approved. */
export function notStartedStep(status: string | undefined): { step: ImportStepKey; label: string } {
  if (status === 'uploading') return { step: 'upload', label: 'Back to Upload' };
  if (status === 'mapping') return { step: 'map', label: 'Back to Map' };
  return { step: 'validate', label: 'Back to Validate' };
}

/** A batch can take the server up to 300 seconds; wait a little less before giving up. */
export const EXECUTE_TIMEOUT_MS = 280_000;
/** Progress checks that may fail in a row before the screen says updates have paused. */
export const POLL_FAILURE_THRESHOLD = 8;
