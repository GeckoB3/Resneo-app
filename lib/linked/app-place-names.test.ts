/**
 * The app's place names in the collective sentences (CQ-10.11, R2-29). The decks hold the web's
 * sentences word for word; these swaps are the only difference. Each swap's web phrase must still be
 * in its sentence, so a web rewording is caught here rather than shown with a web place name.
 */
import { AREA_COPY, areaCopy, type AreaCopyId } from '@/lib/collective-area/copy';
import { APP_PLACE_NAMES } from '@/lib/linked/app-place-names';
import { SETUP_COPY, setupCopy, type SetupCopyId } from '@/lib/linked/setup-copy';

const deckText = (id: string): string | undefined =>
  (SETUP_COPY as Record<string, string>)[id] ?? (AREA_COPY as Record<string, string>)[id];
const shown = (id: string): string =>
  id in SETUP_COPY ? setupCopy(id as SetupCopyId) : areaCopy(id as AreaCopyId);

describe('app place names', () => {
  it.each(Object.entries(APP_PLACE_NAMES))('%s still has the web phrase it swaps, and shows the app one', (id, swaps) => {
    const text = deckText(id);
    expect(text).toBeDefined();
    for (const [web, app] of swaps) {
      expect(text).toContain(web);
      expect(shown(id)).toContain(app);
      expect(shown(id)).not.toContain(web);
    }
  });

  it('leaves no web screen named in a sentence the app shows', () => {
    // The refusal an older app shows names the web on purpose; nothing else may.
    const allowed = new Set(['linkBreak.refused']);
    const web = /Linked Accounts|Linked accounts|Settings, Payments|Settings, Booking Page|Settings, Profile|Active links|Go to Collective|on this tab|from this tab|on your dashboard|in your dashboard/;
    const offenders = [
      ...Object.keys(SETUP_COPY).map((id) => [id, setupCopy(id as SetupCopyId)] as const),
      ...Object.keys(AREA_COPY).map((id) => [id, areaCopy(id as AreaCopyId)] as const),
    ].filter(([id, text]) => !allowed.has(id) && web.test(text));
    expect(offenders).toEqual([]);
  });

  it('reads the same as before for a sentence with no swap', () => {
    expect(setupCopy('setup.venue.onPage', { collective: 'Plus 1' })).toBe('On the Plus 1 page');
    expect(setupCopy('join.links.openLinked')).toBe('Change it in Linked venues');
    expect(setupCopy('respond.done.joinFailed', { venue: 'Aura', collective: 'Plus 1', error: 'Nope.' })).toBe(
      'The link with Aura is active, but joining Plus 1 did not finish: Nope. You can join from the Venue collectives screen.',
    );
  });
});
