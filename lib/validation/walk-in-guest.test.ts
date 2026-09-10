import { buildGuestSchema, splitGuestName } from '@/lib/validation/walk-in-guest';

describe('buildGuestSchema', () => {
  // Web #190 (2026-09-10): every contact field is optional for every staff
  // source, so a desk or phone booking never waits on a number staff do not have.
  it('accepts a phone booking with no phone, name or email', () => {
    const parsed = buildGuestSchema(false).safeParse({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a walk-in with nothing filled in', () => {
    expect(buildGuestSchema(true).safeParse({}).success).toBe(true);
  });

  it('still rejects a malformed email and an over-long phone', () => {
    const bad = buildGuestSchema(false).safeParse({ email: 'not-an-email', phone: '1'.repeat(25) });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const fields = bad.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(expect.arrayContaining(['email', 'phone']));
    }
  });

  it('ignores unknown keys', () => {
    expect(
      buildGuestSchema(false).safeParse({ phone: '07725 123456', special_requests: 'x' }).success,
    ).toBe(true);
  });
});

describe('splitGuestName', () => {
  it('splits on the first space', () => {
    expect(splitGuestName('Ada Lovelace King')).toEqual({ first_name: 'Ada', last_name: 'Lovelace King' });
    expect(splitGuestName('Ada')).toEqual({ first_name: 'Ada', last_name: '' });
  });
});
