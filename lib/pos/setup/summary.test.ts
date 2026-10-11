/**
 * W12's "Here's what's set up:" (design 6.3, drawn as B14), line for line the web's `summaryLines`:
 * how cards are taken (the first ready phone by name), cash, tips by how they are shared, then each
 * other step that is done; nothing for a step not done.
 */
import { summaryLines } from '@/lib/pos/setup/summary';
import { setupStatus, setupSteps } from '@/lib/pos/setup/test-fixtures';

const allDone = setupSteps({
  cards: { state: 'done' },
  tips: { state: 'done' },
  details: { state: 'done' },
  products: { state: 'done' },
  vouchers: { applies: true, state: 'done' },
  practice: { state: 'done' },
});

describe('summaryLines', () => {
  it("names the phone, the cash and how tips are shared, as the design's B14 does", () => {
    const status = setupStatus({ steps: allDone, phones: { ready: [{ name: 'Sam', device: 'iPhone' }], needs_update: [] } });
    expect(
      summaryLines(
        status,
        { cards: 'phone', tips: 'yes', pay: { card: true, cash: true, transfer: false, other_machine: false, count_cash: false, float_pence: null } },
        'pro_rata_services',
      ),
    ).toEqual([
      "Cards on Sam's iPhone",
      'Cash',
      'Tips, shared by how much each person did',
      'Your receipt details',
      'Your products',
      'Gift vouchers',
      'A practice sale',
    ]);
  });

  it('says how else cards are taken, cash counted, and no tips', () => {
    const status = setupStatus({ steps: allDone });
    const pay = { card: true, cash: true, transfer: false, other_machine: false, count_cash: true, float_pence: 5000 };
    expect(summaryLines(status, { cards: 'phone', pay, tips: 'no' }, 'operator').slice(0, 3)).toEqual([
      'Cards in person',
      'Cash, counted at the end of the day',
      'No tips for now',
    ]);
    expect(summaryLines(status, { cards: 'reader' }, 'operator')[0]).toBe('Cards on your card reader');
    expect(summaryLines(status, { cards: 'links' }, 'operator')[0]).toBe('Cards by payment link');
    expect(summaryLines(status, { pay: { ...pay, card: false, other_machine: true, cash: false } }, 'operator')[0]).toBe(
      'Cards on your other card machine',
    );
  });

  it('leaves out what is not done', () => {
    expect(summaryLines(setupStatus(), {}, 'operator')).toEqual([]);
  });
});
