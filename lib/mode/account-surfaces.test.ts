import { decideMode, type DecideModeInput } from '@/lib/mode/account-surfaces';

const base: DecideModeInput = {
  role: 'staff',
  storeRead: true,
  storedChoice: null,
  profilePending: false,
  destination: null,
  customerPending: false,
  isAlsoCustomer: false,
  isSuperuser: false,
};

describe('decideMode', () => {
  it('sends plain staff straight to the venue side', () => {
    expect(decideMode(base)).toMatchObject({ mode: 'staff', canSwitch: true, surfaces: { staff: true, customer: false, superuser: false } });
  });

  it('asks when staff is also a customer, whichever way they signed in', () => {
    expect(decideMode({ ...base, isAlsoCustomer: true })).toMatchObject({
      mode: 'choose',
      surfaces: { staff: true, customer: true, superuser: false },
    });
  });

  it('asks when staff is also a superuser', () => {
    expect(decideMode({ ...base, isSuperuser: true }).mode).toBe('choose');
    expect(decideMode({ ...base, isSuperuser: true }).surfaces.superuser).toBe(true);
  });

  it('asks a confirmed customer only when they are also a superuser', () => {
    expect(decideMode({ ...base, role: 'customer' })).toMatchObject({ mode: 'customer', canSwitch: false });
    expect(decideMode({ ...base, role: 'customer', isSuperuser: true }).mode).toBe('choose');
    expect(decideMode({ ...base, role: 'customer', isSuperuser: true, storedChoice: 'customer' }).mode).toBe('customer');
  });

  it('honours a stated preference without asking', () => {
    expect(decideMode({ ...base, isAlsoCustomer: true, destination: 'account' }).mode).toBe('customer');
    expect(decideMode({ ...base, isAlsoCustomer: true, destination: 'dashboard' }).mode).toBe('staff');
    expect(decideMode({ ...base, isAlsoCustomer: true, destination: 'ask' }).mode).toBe('choose');
  });

  it('a choice made this sign-in wins and is never re-asked', () => {
    expect(decideMode({ ...base, isAlsoCustomer: true, storedChoice: 'customer' }).mode).toBe('customer');
    expect(decideMode({ ...base, isAlsoCustomer: true, isSuperuser: true, storedChoice: 'staff' }).mode).toBe('staff');
  });

  it('waits for every input the decision depends on, and never guesses', () => {
    expect(decideMode({ ...base, role: 'loading' }).mode).toBe('resolving');
    expect(decideMode({ ...base, storeRead: false }).mode).toBe('resolving');
    expect(decideMode({ ...base, profilePending: true }).mode).toBe('resolving');
    expect(decideMode({ ...base, customerPending: true }).mode).toBe('resolving');
    // A confirmed customer does not wait on the profile or the customer read.
    expect(decideMode({ ...base, role: 'customer', profilePending: true, customerPending: true }).mode).toBe('customer');
  });

  it('fails soft to staff when the staff check could not answer', () => {
    expect(decideMode({ ...base, role: 'unknown', customerPending: true }).mode).toBe('staff');
  });
});
