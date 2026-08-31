/**
 * The two ResNeo account emails.
 *
 * Two things here carry real weight: the defaults are asymmetrical, and reading
 * marketing the wrong way opts somebody in silently. The third is newer and
 * easier to miss: the column has two shapes mid-migration, and a reader that
 * knows one of them is silently wrong on the other.
 */
import {
  ACCOUNT_EMAIL_KEYS,
  BOOKING_EMAIL_NOTE,
  accountEmailDescription,
  accountEmailLabel,
  accountEmailPatch,
  readAccountEmailPreferences,
} from '@/lib/notifications/account-email-preferences';

describe('the defaults, which are deliberately not symmetrical', () => {
  it('turns account notices ON for somebody who has never chosen', () => {
    // Somebody who has expressed nothing still expects to hear that their own
    // account changed.
    expect(readAccountEmailPreferences({}).operational_email).toBe(true);
  });

  it('leaves MARKETING off for somebody who has never chosen', () => {
    /*
      The asymmetry that matters. Consent is given, not assumed, and a truthy
      default would opt every existing customer in the moment this shipped.
    */
    expect(readAccountEmailPreferences({}).marketing_email).toBe(false);
  });

  it('reads an explicit false as false, not as absent', () => {
    // The trap in any `stored ?? default` reading: false is falsy, and treating
    // it as unset turns a deliberate opt-out back on.
    expect(readAccountEmailPreferences({ operational_email: false }).operational_email).toBe(false);
  });

  it('reads an explicit true as true', () => {
    expect(readAccountEmailPreferences({ marketing_email: true }).marketing_email).toBe(true);
  });

  it('survives null, an array, and a string', () => {
    // Free-form jsonb. None of these should throw, and none should invent an
    // opt-in.
    for (const raw of [null, undefined, [], 'nonsense', 7]) {
      const prefs = readAccountEmailPreferences(raw);
      expect(prefs.operational_email).toBe(true);
      expect(prefs.marketing_email).toBe(false);
    }
  });
});

describe('the column has two shapes, and both are live', () => {
  /*
    The web is mid-migration. Rows written before it are a flat blob holding
    both key sets; rows written after are split into `staff` and `customer`.
    Reading only the flat shape is correct today and silently wrong afterwards:
    no error, just the wrong switches, including marketing.
  */
  it('reads the customer half when the column is namespaced', () => {
    const raw = { customer: { marketing_email: true, operational_email: false }, staff: {} };
    expect(readAccountEmailPreferences(raw)).toEqual({
      operational_email: false,
      marketing_email: true,
    });
  });

  it('does NOT read a staff key as if it were the customer’s', () => {
    // The failure this shape exists to prevent. A staff member who switched
    // something off must not have it read as a customer preference.
    const raw = { staff: { marketing_email: true }, customer: {} };
    expect(readAccountEmailPreferences(raw).marketing_email).toBe(false);
  });

  it('still reads the flat shape, because most rows are still flat', () => {
    expect(readAccountEmailPreferences({ marketing_email: true }).marketing_email).toBe(true);
  });

  it('treats a namespace holding a non-object as absent rather than throwing', () => {
    expect(readAccountEmailPreferences({ customer: 'broken', staff: {} }).operational_email).toBe(
      true,
    );
  });
});

describe('the patch body', () => {
  it('carries ONE key, never the whole bag', () => {
    /*
      The route merges into a column the staff app also writes to. The web had
      exactly this bug: a customer client sending its own keys erased every
      staff push preference on the row.
    */
    const patch = accountEmailPatch('marketing_email', false);
    expect(Object.keys(patch)).toEqual(['marketing_email']);
    expect(patch.marketing_email).toBe(false);
  });

  it('sends the key FLAT, not wrapped in a customer object', () => {
    // The server routes any non-staff key into the customer namespace itself.
    // Wrapping it here would nest it twice.
    expect(accountEmailPatch('operational_email', true)).toEqual({ operational_email: true });
  });

  it('carries both directions faithfully', () => {
    // Getting the direction wrong about consent is the worst way to be wrong.
    expect(accountEmailPatch('marketing_email', true).marketing_email).toBe(true);
    expect(accountEmailPatch('marketing_email', false).marketing_email).toBe(false);
  });
});

describe('what the switches say', () => {
  it('offers exactly the two keys the server honours', () => {
    // Pinned as a set. A third key added here without a server that reads it is
    // a switch that does nothing, which is the mistake this screen just made.
    expect([...ACCOUNT_EMAIL_KEYS]).toEqual(['operational_email', 'marketing_email']);
  });

  it('does not let the ResNeo marketing row claim to govern venue offers', () => {
    /*
      The exact defect that got the previous section removed: a row labelled as
      though it stopped venue marketing, which is controlled per venue further
      down. This one is about ResNeo itself and has to say so.
    */
    const text = `${accountEmailLabel('marketing_email')} ${accountEmailDescription('marketing_email')}`;
    expect(text).toMatch(/ResNeo/);
    expect(accountEmailDescription('marketing_email')).toMatch(/not offers from the venues/i);
  });

  it('says security email is always sent, so the switch is not read as covering it', () => {
    // Somebody switching off account email must not believe they have switched
    // off their own sign-in links.
    expect(accountEmailDescription('operational_email')).toMatch(/always sent/i);
  });

  it('points at where booking messages and venue offers really come from', () => {
    expect(BOOKING_EMAIL_NOTE).toMatch(/venue you booked with/i);
    expect(BOOKING_EMAIL_NOTE).toMatch(/offers from venues/i);
  });

  it('uses no em-dashes', () => {
    const all = [
      ...ACCOUNT_EMAIL_KEYS.map(accountEmailLabel),
      ...ACCOUNT_EMAIL_KEYS.map(accountEmailDescription),
      BOOKING_EMAIL_NOTE,
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
