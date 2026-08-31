/**
 * C4: what a customer has agreed to receive.
 *
 * Two things here are worth more than the rest. The defaults are asymmetrical,
 * and reading marketing the wrong way opts somebody in silently. And a patch
 * carries ONE key, because the column it merges into is shared with the staff
 * app.
 */
import {
  CONTROLLABLE,
  MARKETING_ELSEWHERE_NOTE,
  preferenceKey,
  preferenceLabel,
  preferencePatch,
  readPreferences,
} from '@/lib/notifications/customer-preferences';

const rowFor = (
  rows: ReturnType<typeof readPreferences>,
  category: string,
  channel: string,
) => rows.find((r) => r.category === category && r.channel === channel);

describe('the defaults, which are deliberately not symmetrical', () => {
  it('turns reminders ON for somebody who has never chosen', async () => {
    // A customer who has expressed nothing still expects to be told about their
    // own booking.
    const rows = readPreferences({});
    expect(rowFor(rows, 'reminders', 'email')?.enabled).toBe(true);
    expect(rowFor(rows, 'reminders', 'sms')?.enabled).toBe(true);
  });

  it('leaves MARKETING off for somebody who has never chosen', async () => {
    /*
      The asymmetry that matters. Consent to be marketed at is given, not
      assumed, and defaulting this to true would opt every existing customer in
      the moment the matrix shipped.
    */
    const rows = readPreferences({});
    expect(rowFor(rows, 'marketing', 'email')?.enabled).toBe(false);
    expect(rowFor(rows, 'marketing', 'sms')?.enabled).toBe(false);
  });

  it('honours the pre-matrix marketing flag when the matrix is silent', async () => {
    // Somebody who opted in before the matrix existed must not be silently
    // opted back out by the new keys being absent.
    const rows = readPreferences({ marketing_email: true });
    expect(rowFor(rows, 'marketing', 'email')?.enabled).toBe(true);
  });

  it('lets an explicit choice beat both the default and the old flag', async () => {
    const rows = readPreferences({ marketing_email: true, marketing_sms: false });
    expect(rowFor(rows, 'marketing', 'sms')?.enabled).toBe(false);
  });

  it('reads an explicit false as false, not as absent', async () => {
    // The trap in any `stored || default` reading: false is falsy, and treating
    // it as unset turns every opt-out back on.
    const rows = readPreferences({ reminders_email: false });
    expect(rowFor(rows, 'reminders', 'email')?.enabled).toBe(false);
  });

  it('survives a null bag', async () => {
    expect(readPreferences(null)).toHaveLength(CONTROLLABLE.length);
  });
});

describe('what a customer is NOT offered', () => {
  it('gives no switch for booking-change emails', async () => {
    /*
      Transactional. A venue that moved an appointment has to be able to say so,
      and a switch here would promise a silence ResNeo cannot honour.
    */
    expect(CONTROLLABLE).not.toContain('changes:email');
  });

  it('gives no push switches at all, because nothing sends customer push yet', async () => {
    // A toggle that changes nothing is worse than no toggle: it is a promise.
    expect(CONTROLLABLE.filter((p) => p.endsWith(':push'))).toEqual([]);
  });

  it('offers exactly the five pairs the server controls', async () => {
    // Pinned as a set, because a pair added here without a server that honours
    // it is a switch that does nothing.
    expect([...CONTROLLABLE].sort()).toEqual(
      ['changes:sms', 'marketing:email', 'marketing:sms', 'reminders:email', 'reminders:sms'].sort(),
    );
  });
});

describe('the patch body', () => {
  it('carries ONE key, never the whole matrix', async () => {
    /*
      The route merges into a free-form column the staff app also writes to.
      Sending the full bag would write back defaults the customer never chose;
      the web already had a bug where a client sending its own keys erased every
      staff push preference on the row.
    */
    const patch = preferencePatch('reminders', 'sms', false);
    expect(Object.keys(patch)).toEqual(['reminders_sms']);
    expect(patch.reminders_sms).toBe(false);
  });

  it('uses the key shape the server stores', async () => {
    expect(preferenceKey('marketing', 'email')).toBe('marketing_email');
  });
});

describe('each row is named for what it actually governs', () => {
  /*
    A real defect, found by a reader asking what the toggles did.

    The `marketing` category contains exactly one message,
    `post_visit_thankyou`. Labelling it "Offers and news" told a customer they
    were switching off marketing, when actual venue marketing is gated by the
    PER-VENUE consent lower down the same screen. Somebody wanting to stop
    receiving offers would reasonably have used this switch, and it would not
    have stopped them.

    That is worse than a vague label: it is a control that appears to do
    something it does not, about consent, which is the one area where appearing
    to work is not good enough.
  */
  it('does not call the thank-you row "offers"', async () => {
    const label = preferenceLabel('marketing');
    expect(label).not.toMatch(/offer/i);
    expect(label).not.toMatch(/news/i);
    expect(label).toMatch(/thank/i);
  });

  it('names the two rows that do govern a category of messages', async () => {
    expect(preferenceLabel('reminders')).toMatch(/reminder/i);
    expect(preferenceLabel('changes')).toMatch(/change/i);
  });

  it('points at where offers are actually controlled', async () => {
    // Without this the screen has two things a customer could read as
    // marketing, one narrow and one broad, and nothing saying which is which.
    expect(MARKETING_ELSEWHERE_NOTE).toMatch(/offers/i);
    expect(MARKETING_ELSEWHERE_NOTE).toMatch(/venue/i);
  });

  it('uses no em-dashes', async () => {
    const all = [
      preferenceLabel('reminders'),
      preferenceLabel('changes'),
      preferenceLabel('marketing'),
      MARKETING_ELSEWHERE_NOTE,
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
