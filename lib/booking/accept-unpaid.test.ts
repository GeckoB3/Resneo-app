import { ApiError } from '@/lib/api/client';
import { acceptUnpaidBodyCopy, depositUnpaid409 } from '@/lib/booking/accept-unpaid';

function unpaid409(body: Record<string, unknown>): ApiError {
  return new ApiError('The deposit for this booking has not been paid.', 409, body);
}

describe('depositUnpaid409', () => {
  it('reads the guard 409 off the wire', () => {
    expect(
      depositUnpaid409(
        unpaid409({
          error: 'The deposit for this booking has not been paid.',
          code: 'DEPOSIT_UNPAID',
          deposit_status: 'Failed',
          deposit_amount_pence: 2000,
          card_hold_fee_pence: 0,
        }),
      ),
    ).toEqual({ depositStatus: 'Failed', depositAmountPence: 2000, cardHoldFeePence: 0 });
  });

  it('defaults missing amounts to zero rather than dropping the intercept', () => {
    // A card-hold unit sends a null deposit_status/amount; the guard still fired.
    expect(
      depositUnpaid409(unpaid409({ code: 'DEPOSIT_UNPAID', deposit_status: null })),
    ).toEqual({ depositStatus: null, depositAmountPence: 0, cardHoldFeePence: 0 });
  });

  it('ignores every other failure', () => {
    // Wrong code, wrong status, and the shapes that are not this error at all —
    // an over-eager intercept would swallow a real problem behind a dialog.
    expect(depositUnpaid409(unpaid409({ code: 'VENUE_PAST_DUE' }))).toBeNull();
    expect(
      depositUnpaid409(new ApiError('Invalid transition', 400, { code: 'DEPOSIT_UNPAID' })),
    ).toBeNull();
    expect(depositUnpaid409(new ApiError('Conflict', 409, 'not-json'))).toBeNull();
    expect(depositUnpaid409(new Error('Network request failed'))).toBeNull();
    expect(depositUnpaid409(null)).toBeNull();
  });
});

describe('acceptUnpaidBodyCopy', () => {
  it('names the amount and says the attempt failed', () => {
    expect(
      acceptUnpaidBodyCopy({
        depositStatus: 'Failed',
        depositAmountPence: 2000,
        cardHoldFeePence: 0,
      }),
    ).toBe(
      'The £20.00 deposit for this booking has not been paid. The last payment attempt failed.',
    );
  });

  it('says "not paid yet" when no attempt has failed', () => {
    expect(
      acceptUnpaidBodyCopy({
        depositStatus: 'Pending',
        depositAmountPence: 2000,
        cardHoldFeePence: 0,
      }),
    ).toBe('The £20.00 deposit for this booking has not been paid yet.');
  });

  it('describes a card hold as a card save, not a deposit', () => {
    expect(
      acceptUnpaidBodyCopy({
        depositStatus: 'Pending',
        depositAmountPence: 0,
        cardHoldFeePence: 3500,
      }),
    ).toBe('Card details have not been saved for this booking yet. The no-show fee is £35.00.');
  });

  it('falls back to generic copy when the server sent no amounts', () => {
    expect(
      acceptUnpaidBodyCopy({ depositStatus: 'Failed', depositAmountPence: 0, cardHoldFeePence: 0 }),
    ).toBe('The payment for this booking failed and it is still owed.');
    expect(
      acceptUnpaidBodyCopy({ depositStatus: null, depositAmountPence: 0, cardHoldFeePence: 0 }),
    ).toBe('The payment for this booking has not been completed yet.');
  });
});
