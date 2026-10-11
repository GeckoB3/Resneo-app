/**
 * OB5: business details follow the venue profile. The profile's values are edited (and only what
 * changed is sent to `PATCH /api/venue`); a receipt-only value is kept only where one is set, null
 * everywhere else so receipts follow the profile.
 */
import {
  profileAddress,
  profileDraftFrom,
  profileErrors,
  profilePatch,
  profileReady,
  receiptDraftFrom,
  receiptPatch,
} from '@/lib/pos/setup/business';

const venue = { name: 'Bloom Hair Studio', address: 'Bloom Hair Studio, 12 Market Street, Newtown, NT1 2AB', email: 'hello@bloom.example', phone: '+441632960123' };
const noReceipt = { trading_name: null, business_address: null, public_contact_email: null, public_contact_phone: null };

describe('the profile part', () => {
  it('reads the profile into the form', () => {
    expect(profileDraftFrom(venue)).toEqual({
      name: 'Bloom Hair Studio',
      building: 'Bloom Hair Studio',
      street: '12 Market Street',
      town: 'Newtown',
      postcode: 'NT1 2AB',
      email: 'hello@bloom.example',
      phone: '+441632960123',
    });
  });

  it('sends nothing for a form left as it was, even an untidy one', () => {
    expect(profilePatch(profileDraftFrom(venue), venue)).toEqual({});
    const untidy = { name: 'Bloom', address: '12 Market Street, Newtown, NT1 2AB', email: '', phone: '01632 960123' };
    expect(profilePatch(profileDraftFrom(untidy), untidy)).toEqual({});
  });

  it('sends only what changed, the address in the profile\'s own form', () => {
    const draft = { ...profileDraftFrom(venue), street: '14 Market Street', email: 'desk@bloom.example' };
    expect(profilePatch(draft, venue)).toEqual({
      address: 'Bloom Hair Studio, 14 Market Street, Newtown, NT1 2AB',
      email: 'desk@bloom.example',
    });
    const phone = { ...profileDraftFrom(venue), phone: '07700 900123' };
    expect(profilePatch(phone, venue)).toEqual({ phone: '+447700900123' });
  });

  it('fills a blank building name with the business name once there is a street (the profile screen\'s rule)', () => {
    expect(profileAddress({ name: 'Bloom', building: '', street: '1 High St', town: 'Town', postcode: 'T1', email: '', phone: '' })).toBe(
      'Bloom, 1 High St, Town, T1',
    );
    expect(profileAddress({ name: 'Bloom', building: '', street: '', town: '', postcode: '', email: '', phone: '' })).toBe('');
  });

  it('checks the name and the email', () => {
    expect(profileErrors({ ...profileDraftFrom(venue), name: ' ' })).toEqual({ name: 'required' });
    expect(profileErrors({ ...profileDraftFrom(venue), email: 'not-an-email' })).toEqual({ email: 'invalid' });
    expect(profileErrors(profileDraftFrom(venue))).toEqual({});
  });

  it('knows when the profile has what W0 calls ready', () => {
    expect(profileReady(venue)).toBe(true);
    expect(profileReady({ name: 'Bloom', address: '' })).toBe(false);
  });
});

describe('the receipt-only part', () => {
  it('is off while every value follows the profile', () => {
    expect(receiptDraftFrom(noReceipt).on).toBe(false);
    expect(receiptDraftFrom({ ...noReceipt, trading_name: 'Bloom' }).on).toBe(true);
  });

  it('keeps a value only where one is typed, null elsewhere', () => {
    const draft = { ...receiptDraftFrom(noReceipt), on: true, name: 'Bloom Ltd', postcode: 'NT1 2AB' };
    expect(receiptPatch(draft, noReceipt)).toEqual({
      trading_name: 'Bloom Ltd',
      business_address: { line1: null, line2: null, town: null, postcode: 'NT1 2AB' },
    });
  });

  it('clears every receipt-only value when switched off, and sends nothing unchanged', () => {
    const stored = {
      trading_name: 'Bloom Ltd',
      business_address: { line1: '1 High St', line2: null, town: 'Town', postcode: 'T1' },
      public_contact_email: 'r@bloom.example',
      public_contact_phone: null,
    };
    expect(receiptPatch({ ...receiptDraftFrom(stored), on: false }, stored)).toEqual({
      trading_name: null,
      business_address: null,
      public_contact_email: null,
    });
    expect(receiptPatch(receiptDraftFrom(stored), stored)).toEqual({});
    // A stored address in another key order, or with empty strings, is the same address.
    const reordered = { ...stored, business_address: { postcode: 'T1', town: 'Town', line2: '', line1: '1 High St' } };
    expect(receiptPatch(receiptDraftFrom(reordered), reordered)).toEqual({});
  });
});
