import { fillText, type CopyVars } from './copy';

/** Settings, Cards on file, word for word from the web's `CardsOnFileCard` (UX spec §9.10 `set.cof.*`). */
export const CARDS_ON_FILE_COPY = {
  'set.cof.title': 'Cards on file',
  'set.cof.help':
    'A card is only saved when the {client} agrees: on your card reader, or on your phone when you take the payment in the app. You can remove a saved card from their profile.',
  'set.cof.switch': 'Save cards when {clients} agree',
  'set.cof.switch.help':
    'Lets the team ask at the card reader. Charging a saved card later is for admins, unless you let the team do it in Permissions.',
  'set.cof.on': 'Cards on file are on.',
  'set.cof.off': 'Cards on file are off. Cards already saved stay saved until removed.',
  'set.cof.readOnly': 'Only an admin, or someone allowed to change checkout settings, can change this.', // (app)
} as const;

export type CardsOnFileCopyId = keyof typeof CARDS_ON_FILE_COPY;

export function cardsOnFileT(id: CardsOnFileCopyId, vars: CopyVars = {}): string {
  return fillText(CARDS_ON_FILE_COPY[id], vars);
}
