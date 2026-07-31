/**
 * Surfacing the WHICH of a rejected schema parse.
 *
 * The API answers a failed zod parse with a bare `{ error: 'Invalid request',
 * details: error.flatten() }`. The app showed only `error`, so a service whose
 * price was blank failed every save with "Invalid request" whatever had been
 * edited — the field at fault was on the wire the whole time and simply never
 * read. These pin that it now reaches the user, and that nothing else regresses
 * into a worse message.
 */
import { getApiErrorMessage, zodDetailMessage } from '@/lib/api/client';

describe('zodDetailMessage', () => {
  it('names the first offending field, in readable words', () => {
    expect(
      zodDetailMessage({
        formErrors: [],
        fieldErrors: { price_pence: ['Expected number, received null'] },
      }),
    ).toBe('price pence: Expected number, received null');
  });

  it('falls back to a form-level error when no field is named', () => {
    expect(
      zodDetailMessage({ formErrors: ['Set a price when charging full payment'], fieldErrors: {} }),
    ).toBe('Set a price when charging full payment');
  });

  it('returns null when there is nothing usable to say', () => {
    expect(zodDetailMessage(undefined)).toBeNull();
    expect(zodDetailMessage(null)).toBeNull();
    expect(zodDetailMessage('nope')).toBeNull();
    expect(zodDetailMessage({ formErrors: [], fieldErrors: {} })).toBeNull();
    // A field key present but carrying no message must not produce "price pence: undefined".
    expect(zodDetailMessage({ fieldErrors: { price_pence: [] } })).toBeNull();
    expect(zodDetailMessage({ fieldErrors: { price_pence: ['   '] } })).toBeNull();
  });
});

describe('getApiErrorMessage', () => {
  it('appends the field detail to a 400', () => {
    expect(
      getApiErrorMessage(
        {
          error: 'Invalid request',
          details: { fieldErrors: { duration_minutes: ['Number must be less than or equal to 480'] } },
        },
        400,
      ),
    ).toBe('Invalid request — duration minutes: Number must be less than or equal to 480');
  });

  it('leaves a 400 without details exactly as the server phrased it', () => {
    expect(getApiErrorMessage({ error: 'Missing id' }, 400)).toBe('Missing id');
  });

  it('does not touch other statuses', () => {
    // A 409's own message is already specific; appending zod noise would bury it.
    expect(getApiErrorMessage({ error: 'This payment cannot be refunded' }, 409)).toBe(
      'This payment cannot be refunded',
    );
    expect(getApiErrorMessage({ error: 'Only venue admins can do that' }, 403)).toBe(
      'Only venue admins can do that',
    );
  });

  it('still prefers the billing codes over any detail', () => {
    expect(
      getApiErrorMessage(
        { error: 'Invalid request', code: 'VENUE_PAST_DUE', details: { fieldErrors: { x: ['y'] } } },
        400,
      ),
    ).toMatch(/Billing is past due/);
  });
});
