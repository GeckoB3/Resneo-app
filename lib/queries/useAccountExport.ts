import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { shareTextFile, type ShareFileResult } from '@/lib/share/share-text-file';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Everything ResNeo holds about this customer, as one JSON file.
 *
 * The web serves it as a download, with a `Content-Disposition` a browser knows
 * what to do with. A phone has no downloads folder to speak of, so the app
 * fetches the same body and hands it to the share sheet: the customer chooses
 * where it goes, which is the platform's own answer to "save this file".
 *
 * **A mutation rather than a query, deliberately.** This is an action somebody
 * takes, not state a screen reads. As a query it would re-run on focus and on
 * reconnect, opening a share sheet nobody asked for and pulling the customer's
 * entire account over the network each time.
 */
export function useAccountExport() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<ShareFileResult> => {
      if (!accessToken) throw new Error('Missing access token');

      /*
        Asked for as JSON and re-serialised here rather than passed through as
        text. `apiFetch` parses the body already, and re-printing it with an
        indent is what makes the file readable to the person who asked for it:
        an export nobody can read is a compliance gesture rather than a right
        exercised.
      */
      const payload = await apiFetch<unknown>('/api/v1/me/export', { accessToken });

      return shareTextFile({
        filename: exportFilename(new Date()),
        body: JSON.stringify(payload, null, 2),
        mimeType: 'application/json',
        uti: 'public.json',
        dialogTitle: 'Your ResNeo data',
      });
    },
  });
}

/**
 * A dated filename, so somebody exporting twice can tell the two apart.
 *
 * Deliberately not locale-formatted: this is a filename, not a sentence, and an
 * ISO date sorts correctly in every file browser. It is also the one place a
 * slash would be actively harmful.
 */
export function exportFilename(now: Date): string {
  const iso = now.toISOString().slice(0, 10);
  return `resneo-account-${iso}.json`;
}
