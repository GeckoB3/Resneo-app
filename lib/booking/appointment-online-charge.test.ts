import {
  multiServiceSegmentCharge,
  resolveAppointmentPaymentRequirement,
  resolveAppointmentServiceOnlineCharge,
  resolveVisitChargeTotal,
} from '@/lib/booking/appointment-online-charge';

/**
 * The confirm step used to answer "does this booking want money?" with
 * `deposit_pence > 0` on the SELECTED service. That was wrong twice over:
 *
 *  - it skipped `full_payment` services, whose amount lives in `price_pence`,
 *    so staff were never offered a way to take one without charging; and
 *  - on a multi-service chain it read the first segment only, so a visit whose
 *    deposit sat on a later service showed no control at all.
 *
 * These are the rules that replace it, mirroring the web resolver.
 */

describe('resolveAppointmentPaymentRequirement', () => {
  it.each(['deposit', 'full_payment', 'none', 'card_hold'] as const)(
    'honours an explicit %s',
    (raw) => {
      expect(resolveAppointmentPaymentRequirement({ payment_requirement: raw })).toBe(raw);
    },
  );

  it('infers deposit from a pre-migration row that only had an amount', () => {
    expect(
      resolveAppointmentPaymentRequirement({ payment_requirement: null, deposit_pence: 1000 }),
    ).toBe('deposit');
  });

  it('never infers a card hold the venue did not configure', () => {
    // The legacy inference always yields 'deposit', so an old row cannot turn
    // into a hold that charges a no-show fee nobody set up.
    expect(
      resolveAppointmentPaymentRequirement({ payment_requirement: undefined, deposit_pence: 5000 }),
    ).toBe('deposit');
  });

  it('falls back to none with no requirement and no amount', () => {
    expect(resolveAppointmentPaymentRequirement({ deposit_pence: 0 })).toBe('none');
  });
});

describe('resolveAppointmentServiceOnlineCharge', () => {
  it('charges the deposit for a deposit service', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        price_pence: 4000,
        deposit_pence: 1000,
        payment_requirement: 'deposit',
      }),
    ).toEqual({ amountPence: 1000, chargeLabel: 'deposit' });
  });

  it('charges the full price for a pay-in-full service, which has no deposit', () => {
    // The case the old `deposit_pence > 0` check missed entirely.
    expect(
      resolveAppointmentServiceOnlineCharge({
        price_pence: 6000,
        deposit_pence: null,
        payment_requirement: 'full_payment',
      }),
    ).toEqual({ amountPence: 6000, chargeLabel: 'full_payment' });
  });

  it('reports a card hold as a fee, not as money due', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        price_pence: 4000,
        deposit_pence: 2000,
        payment_requirement: 'card_hold',
      }),
    ).toEqual({ amountPence: 2000, chargeLabel: 'card_hold' });
  });

  it('degrades a zero-fee card hold to no charge', () => {
    // A hold with fee 0 would violate the hold table's CHECK at booking time.
    expect(
      resolveAppointmentServiceOnlineCharge({
        price_pence: 4000,
        deposit_pence: 0,
        payment_requirement: 'card_hold',
      }),
    ).toBeNull();
  });

  it('charges nothing for a free service', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({ price_pence: 3000, payment_requirement: 'none' }),
    ).toBeNull();
  });
});

describe('multiServiceSegmentCharge', () => {
  it('rolls add-on price into a full payment', () => {
    expect(
      multiServiceSegmentCharge({ price_pence: 6000, payment_requirement: 'full_payment' }, 500),
    ).toEqual({ chargePence: 6500, chargeLabel: 'full_payment' });
  });

  it('leaves a deposit at the service amount, since add-ons are paid at the venue', () => {
    expect(
      multiServiceSegmentCharge(
        { price_pence: 4000, deposit_pence: 1000, payment_requirement: 'deposit' },
        500,
      ),
    ).toEqual({ chargePence: 1000, chargeLabel: 'deposit' });
  });

  it('excludes add-ons from a card-hold fee too', () => {
    expect(
      multiServiceSegmentCharge(
        { price_pence: 4000, deposit_pence: 2000, payment_requirement: 'card_hold' },
        500,
      ),
    ).toEqual({ chargePence: 2000, chargeLabel: 'card_hold' });
  });

  it('reports nothing for a free service', () => {
    expect(multiServiceSegmentCharge({ price_pence: 3000 }, 0)).toEqual({
      chargePence: null,
      chargeLabel: null,
    });
  });
});

describe('resolveVisitChargeTotal', () => {
  it('sums every chargeable segment, not just the first', () => {
    // The reported bug: a chain whose deposit sat on the second service showed
    // no control at all, because only the first segment was consulted.
    expect(
      resolveVisitChargeTotal([
        { chargePence: null, chargeLabel: null },
        { chargePence: 1500, chargeLabel: 'deposit' },
      ]),
    ).toEqual({ amountPence: 1500, chargeLabel: 'deposit' });
  });

  it('adds deposits across a chain', () => {
    expect(
      resolveVisitChargeTotal([
        { chargePence: 1000, chargeLabel: 'deposit' },
        { chargePence: 1500, chargeLabel: 'deposit' },
      ]).amountPence,
    ).toBe(2500);
  });

  it('keeps card-hold fees out of the money-now total', () => {
    // No money is due at booking for a hold, and it has its own toggle.
    expect(
      resolveVisitChargeTotal([
        { chargePence: 1000, chargeLabel: 'deposit' },
        { chargePence: 5000, chargeLabel: 'card_hold' },
      ]).amountPence,
    ).toBe(1000);
  });

  it('reads as a payment only when every chargeable segment is pay-in-full', () => {
    expect(
      resolveVisitChargeTotal([
        { chargePence: 6000, chargeLabel: 'full_payment' },
        { chargePence: 4000, chargeLabel: 'full_payment' },
      ]),
    ).toEqual({ amountPence: 10000, chargeLabel: 'full_payment' });

    expect(
      resolveVisitChargeTotal([
        { chargePence: 6000, chargeLabel: 'full_payment' },
        { chargePence: 1000, chargeLabel: 'deposit' },
      ]).chargeLabel,
    ).toBe('deposit');
  });

  it('charges nothing for a visit of free services', () => {
    expect(
      resolveVisitChargeTotal([
        { chargePence: null, chargeLabel: null },
        { chargePence: null, chargeLabel: null },
      ]).amountPence,
    ).toBe(0);
  });
});
