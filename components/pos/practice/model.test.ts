/**
 * The practice sale's rules (POS test round 2026-10-11, Part 4, OB4): practice only when the server
 * says so, the practice item, the five tips, each payment method's shown outcome, and the void.
 */
import { makeSale } from '@/lib/pos/test-sale';

import {
  coachText,
  finishPracticeBody,
  isPracticeSale,
  nextCoachStep,
  PRACTICE_COACH_STEPS,
  PRACTICE_ITEM_PENCE,
  practiceItemLine,
  practiceMethodOf,
  practiceOutcome,
  practiceSaleBody,
  simulatedSentence,
} from './model';

describe('isPracticeSale', () => {
  it('is practice only when the server says practice: true', () => {
    expect(isPracticeSale({ ...makeSale(), practice: true } as never)).toBe(true);
    expect(isPracticeSale({ ...makeSale(), practice: false } as never)).toBe(false);
    // A server without the flag: a real sale, exactly as before.
    expect(isPracticeSale(makeSale())).toBe(false);
    expect(isPracticeSale({ ...makeSale(), practice: 'true' } as never)).toBe(false);
    expect(isPracticeSale({ ...makeSale(), practice: null } as never)).toBe(false);
    expect(isPracticeSale(null)).toBe(false);
    expect(isPracticeSale(undefined)).toBe(false);
  });
});

describe('the practice item', () => {
  it('is a £30.00 custom item reported with services, credited to whoever is serving', () => {
    expect(PRACTICE_ITEM_PENCE).toBe(3000);
    expect(practiceItemLine(makeSale({ operator: { staff_id: 'staff-1', calendar_id: null, name: 'Sam' } }))).toEqual({
      kind: 'custom',
      name: 'Practice item',
      unit_price_pence: 3000,
      reporting_group: 'services',
      seller: { staff_id: 'staff-1', name: 'Sam' },
    });
    expect(practiceItemLine(makeSale({ operator: { staff_id: 'staff-1', calendar_id: 'cal-1', name: 'Sam' } })).seller).toEqual({
      calendar_id: 'cal-1',
      name: 'Sam',
    });
    expect(practiceItemLine(makeSale({ operator: { staff_id: null, calendar_id: null, name: null } }))).not.toHaveProperty('seller');
  });
});

describe('the coach marks', () => {
  it('runs the five tips of W11 in order', () => {
    expect(PRACTICE_COACH_STEPS).toEqual(['basket', 'add', 'discount', 'credit', 'pay']);
    expect(nextCoachStep('basket')).toBe('add');
    expect(nextCoachStep('credit')).toBe('pay');
    expect(nextCoachStep('pay')).toBeNull();
  });

  it("names the team's discount limit, or the default 10%", () => {
    expect(coachText('discount', 15)).toBe('Give a discount here. Your team can take off up to 15%.');
    expect(coachText('discount', 12.5)).toBe('Give a discount here. Your team can take off up to 12.5%.');
    expect(coachText('discount', undefined)).toBe('Give a discount here. Your team can take off up to 10%.');
    expect(coachText('pay', 15)).toBe("When they're ready to pay, choose how. Try one: it's only practice.");
  });
});

describe('paying on a practice sale', () => {
  it('maps each method to the outcome the pay sheet reports, and back', () => {
    expect(practiceOutcome('phone')).toEqual({ method: 'card_app', changePence: 0 });
    expect(practiceOutcome('reader', 500)).toEqual({ method: 'card_reader', changePence: 0 });
    expect(practiceOutcome('cash', 450)).toEqual({ method: 'cash', changePence: 450 });
    expect(practiceOutcome('link')).toEqual({ method: 'pay_link', changePence: 0 });
    expect(practiceOutcome('other')).toEqual({ method: 'external', changePence: 0 });
    expect(practiceMethodOf('card_app')).toBe('phone');
    expect(practiceMethodOf('pay_link')).toBe('link');
    expect(practiceMethodOf('external')).toBe('other');
    expect(practiceMethodOf('gift_card')).toBeNull();
  });

  it("says what each method would do, the phone in the app's own words", () => {
    expect(simulatedSentence('phone', 'help')).toBe(
      'In a real sale, your client taps their card, phone or watch on this phone, and the sale finishes by itself.',
    );
    expect(simulatedSentence('reader', 'help')).toContain('the reader on your desk');
    expect(simulatedSentence('cash', 'help')).toBe('Type what they gave you, and Checkout works out the change.');
    expect(simulatedSentence('link', 'help')).toContain('pays on their own phone');
    // The venue's own payment types say what they are for, in the till's words.
    expect(simulatedSentence('other', 'For money taken outside ResNeo.')).toBe('For money taken outside ResNeo.');
  });
});

describe('starting and finishing', () => {
  it('starts a blank practice sale from the app', () => {
    expect(practiceSaleBody('req-12345678')).toEqual({
      client_request_id: 'req-12345678',
      source: { type: 'blank' },
      channel: 'app',
      practice: true,
    });
  });

  it('voids with the reason "Practice" and the sale\'s version', () => {
    expect(finishPracticeBody(makeSale({ version: 7 }))).toEqual({ version: 7, reason: 'Practice' });
  });
});
