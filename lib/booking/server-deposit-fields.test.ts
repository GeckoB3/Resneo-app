/**
 * The deposit fields the server now works out (web codebase standards plan P4.3): shown when the
 * server sends them, and worked out locally only when it does not (an older server).
 */
import { ApiError } from '@/lib/api/client';
import {
  keepWithoutDepositView,
  owedLineFrom,
  serverAcceptUnpaidCopy,
  serverKeepFrom,
} from '@/lib/booking/server-deposit-fields';

const local = {
  status: 'Pending',
  depositStatus: 'Pending',
  amountPence: 2000,
  linkedVisitId: null,
  word: 'deposit' as const,
  guestName: 'Jo Bloggs',
};

describe('owedLineFrom', () => {
  it("shows the server's line, and its null (nothing owed), without working it out", () => {
    const localLine = jest.fn(() => 'local line');
    expect(owedLineFrom({ deposit_owed_line: 'Deposit £20.00 owed.' }, localLine)).toBe('Deposit £20.00 owed.');
    expect(owedLineFrom({ deposit_owed_line: null }, localLine)).toBeNull();
    expect(localLine).not.toHaveBeenCalled();
  });

  it('works it out for an older server that sends no line', () => {
    expect(owedLineFrom({}, () => 'local line')).toBe('local line');
  });
});

describe('Keep without deposit', () => {
  it("the server's answer and words win", () => {
    const server = serverKeepFrom({
      can_keep_without_deposit: true,
      keep_without_deposit: { label: 'Keep without payment', title: 'T', message: 'M', confirm_label: 'Keep booking' },
    });
    expect(keepWithoutDepositView({ server, local })).toEqual({
      show: true,
      label: 'Keep without payment',
      question: { title: 'T', message: 'M', confirmLabel: 'Keep booking' },
    });
    // The server says no: no button, whatever the local rule would say.
    expect(keepWithoutDepositView({ server: serverKeepFrom({ can_keep_without_deposit: false }), local }).show).toBe(false);
  });

  it('an older server: the local rule and words', () => {
    expect(serverKeepFrom({})).toBeNull();
    const view = keepWithoutDepositView({ server: null, local });
    expect(view.show).toBe(true);
    expect(view.label).toBe('Keep without deposit');
    expect(view.question.title).toBe('Keep without the deposit?');
    expect(keepWithoutDepositView({ server: null, local: { ...local, status: 'Booked' } }).show).toBe(false);
  });
});

describe('serverAcceptUnpaidCopy', () => {
  it("reads the 409's words, and null from an older server", () => {
    const body = {
      code: 'DEPOSIT_UNPAID',
      accept_unpaid: { title: 'Deposit not paid', body: 'The £20.00 deposit for this booking has not been paid yet.', explainer: 'E' },
    };
    expect(serverAcceptUnpaidCopy(new ApiError('x', 409, body).body)).toEqual(body.accept_unpaid);
    expect(serverAcceptUnpaidCopy({ code: 'DEPOSIT_UNPAID' })).toBeNull();
    expect(serverAcceptUnpaidCopy({ accept_unpaid: { title: 'T' } })).toBeNull();
    expect(serverAcceptUnpaidCopy(null)).toBeNull();
  });
});
