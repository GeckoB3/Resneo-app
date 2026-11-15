/**
 * Collective client sharing: the app's words are the web's words
 * (web Docs/collective-client-sharing-plan.md §1A.3 rule 3).
 *
 * client-sharing-copy.ts is generated from the web table by `npm run copy:client-sharing` in the web
 * repo, which also writes cs-copy.sha256 here. This fails when the table was edited by hand, or
 * regenerated without its hash, so the two products cannot drift.
 */
import { CLIENT_SHARING_COPY, clientSharingCopy, type ClientSharingCopyId } from './client-sharing-copy';

declare const __dirname: string;
declare function require(id: string): unknown;

const { createHash } = require('crypto') as {
  createHash: (alg: string) => { update: (s: string, enc: string) => { digest: (enc: string) => string } };
};
const { readFileSync } = require('fs') as { readFileSync: (path: string, enc: string) => string };
const { join } = require('path') as { join: (...parts: string[]) => string };

const ids = Object.keys(CLIENT_SHARING_COPY) as ClientSharingCopyId[];

describe('client sharing copy (app)', () => {
  it('matches the hash the web generated it with', () => {
    const source = readFileSync(join(__dirname, 'client-sharing-copy.ts'), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('export const CLIENT_SHARING_COPY = {');
    const end = source.indexOf('} as const;', start) + '} as const;'.length;
    const hash = createHash('sha256').update(source.slice(start, end), 'utf8').digest('hex');
    expect(hash).toBe(readFileSync(join(__dirname, 'cs-copy.sha256'), 'utf8').trim());
  });

  it('uses no em-dashes', () => {
    expect(ids.filter((id) => CLIENT_SHARING_COPY[id].includes('—'))).toEqual([]);
  });

  it('fills placeholders', () => {
    expect(clientSharingCopy('cs.state.waiting', { venue: 'Studio 3' })).toBe('Waiting for Studio 3 to say yes');
  });
});
