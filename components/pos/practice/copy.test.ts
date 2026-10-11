/**
 * The practice sale's words follow the house rules (CLAUDE.md; design section 6.3 is the source of
 * truth for wording): no em-dash anywhere, straight apostrophes, no currency symbol before a money
 * placeholder, no country or competitor named, every placeholder filled by its caller, and the
 * design's W11 lines word for word.
 */
import { PRACTICE_COPY, practiceT } from './copy';
import { coachText, PRACTICE_COACH_STEPS } from './model';

describe('the practice copy deck', () => {
  const entries = Object.entries(PRACTICE_COPY);

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    expect(entries.filter(([, text]) => text.includes(EM_DASH)).map(([id]) => id)).toEqual([]);
  });

  it('uses straight apostrophes and quotes', () => {
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    expect(entries.filter(([, text]) => curly.some((c) => text.includes(c))).map(([id]) => id)).toEqual([]);
  });

  it('never writes a currency symbol next to a money placeholder', () => {
    expect(entries.filter(([, text]) => /[£€]\{/.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('never names a country or a competitor', () => {
    const banned = /northern ireland|great britain|\bGB\b|england|scotland|wales|fresha|phorest|booksy|square|vagaro|shopify|sumup|zettle/i;
    expect(entries.filter(([, text]) => banned.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('leaves no placeholder unfilled where the screens use one', () => {
    const vars: Record<string, Record<string, string | number>> = {
      'setup.practice.coach.discount': { limit: 10 },
      'setup.practice.coach.step': { n: 2, total: 5 },
    };
    const unfilled = (Object.keys(PRACTICE_COPY) as (keyof typeof PRACTICE_COPY)[]).filter((id) =>
      /\{\w+\}/.test(practiceT(id, vars[id] ?? {})),
    );
    expect(unfilled).toEqual([]);
    for (const step of PRACTICE_COACH_STEPS) expect(coachText(step, 15)).not.toMatch(/\{\w+\}/);
  });

  it("keeps the design's W11 lines word for word", () => {
    expect(PRACTICE_COPY['setup.practice.banner']).toBe('Practice sale. Nothing here is real, and no money moves.');
    expect(PRACTICE_COPY['setup.practice.coach.basket']).toBe(
      'This is the bill. When you check out a booking, everything the client had is already here.',
    );
    expect(PRACTICE_COPY['setup.practice.coach.add']).toBe("Add a product, or anything else they're buying, here.");
    expect(practiceT('setup.practice.coach.discount', { limit: 10 })).toBe('Give a discount here. Your team can take off up to 10%.');
    expect(PRACTICE_COPY['setup.practice.coach.credit']).toBe(
      'Each line shows who gets the credit, for tips and commission. Tap it to change.',
    );
    expect(PRACTICE_COPY['setup.practice.coach.pay']).toBe("When they're ready to pay, choose how. Try one: it's only practice.");
    expect(PRACTICE_COPY['setup.practice.sim.reader']).toBe(
      'In a real sale, the reader on your desk asks your client to tap or insert their card.',
    );
    expect(PRACTICE_COPY['setup.practice.sim.cash']).toBe('Type what they gave you, and Checkout works out the change.');
    expect(PRACTICE_COPY['setup.practice.sim.link']).toBe('Your client gets a link by text or email and pays on their own phone.');
    expect(PRACTICE_COPY['setup.practice.sim.done']).toBe('Paid. This is the moment the receipt goes out.');
    expect(PRACTICE_COPY['setup.practice.receipt']).toBe("This is what your client's receipt looks like.");
    expect(PRACTICE_COPY['setup.practice.finish']).toBe('Finish practice');
    expect(PRACTICE_COPY['setup.practice.finished']).toBe("That's it. Your practice sale has been cleared away.");
  });

  it("keeps the web till's added lines word for word", () => {
    expect(PRACTICE_COPY['setup.practice.saleTitle']).toBe('Practice sale');
    expect(PRACTICE_COPY['setup.practice.back']).toBe('Back to set-up');
    expect(practiceT('setup.practice.coach.step', { n: 2, total: 5 })).toBe('Tip 2 of 5');
    expect(PRACTICE_COPY['setup.practice.coach.done']).toBe('Got it');
    expect(PRACTICE_COPY['setup.practice.coach.skip']).toBe('Skip the tips');
    expect(PRACTICE_COPY['setup.practice.item']).toBe('Practice item');
    expect(PRACTICE_COPY['setup.practice.services']).toBe(
      'In a real checkout, the services from the booking come with it, so a practice sale leaves the diary alone.',
    );
    expect(PRACTICE_COPY['setup.practice.watermark']).toBe('Practice');
  });

  it('explains services in one sentence', () => {
    const line = PRACTICE_COPY['setup.practice.services'];
    expect(line.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length).toBe(1);
  });
});
