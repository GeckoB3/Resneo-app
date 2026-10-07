import {
  MAX_MESSAGE_LENGTH,
  SNOOZE_MS,
  compareVersions,
  decideUpdate,
  parseVersionPolicy,
  type AppVersionPolicy,
} from '@/lib/app-update/version-policy';

const POLICY: AppVersionPolicy = {
  ios: { latest: '1.2.0', minimum: '1.1.0', message: 'Tap to Pay on iPhone is here.' },
  android: { latest: '1.1.2', minimum: '1.1.0', message: null },
};

describe('compareVersions', () => {
  it('orders numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.2', '1.2.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0);
  });
});

describe('parseVersionPolicy', () => {
  it('reads a well-formed file', () => {
    expect(
      parseVersionPolicy({
        ios: { latest: '1.2.0', minimum: '1.1.0', message: ' New. ' },
        android: { latest: '1.1.2' },
      }),
    ).toEqual({
      ios: { latest: '1.2.0', minimum: '1.1.0', message: 'New.' },
      android: { latest: '1.1.2', minimum: null, message: null },
    });
  });

  it('drops fields that are not versions, and platforms left with nothing', () => {
    expect(
      parseVersionPolicy({ ios: { latest: 'v1.2', minimum: 120 }, android: { latest: '1.1.2' } }),
    ).toEqual({ ios: null, android: { latest: '1.1.2', minimum: null, message: null } });
  });

  it('ignores an over-long message rather than showing it', () => {
    const long = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(parseVersionPolicy({ ios: { latest: '1.2.0', message: long } })?.ios?.message).toBeNull();
  });

  it('is null for anything unusable', () => {
    expect(parseVersionPolicy(null)).toBeNull();
    expect(parseVersionPolicy('<html>Not found</html>')).toBeNull();
    expect(parseVersionPolicy({})).toBeNull();
    expect(parseVersionPolicy({ ios: { message: 'hi' } })).toBeNull();
  });
});

describe('decideUpdate', () => {
  it('offers the update below latest', () => {
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: '1.1.2' })).toEqual({
      kind: 'recommended',
      latest: '1.2.0',
      message: 'Tap to Pay on iPhone is here.',
    });
  });

  it('says nothing at or above latest', () => {
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: '1.2.0' }).kind).toBe('none');
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: '1.3.0' }).kind).toBe('none');
  });

  it('keeps each platform to its own rules', () => {
    // iOS 1.2.0 being out must not prompt Android, which stays on 1.1.2.
    expect(decideUpdate({ policy: POLICY, platform: 'android', installed: '1.1.2' }).kind).toBe(
      'none',
    );
    expect(decideUpdate({ policy: POLICY, platform: 'web', installed: '1.0.0' }).kind).toBe('none');
  });

  it('requires the update below minimum', () => {
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: '1.0.9' })).toEqual({
      kind: 'required',
      latest: '1.2.0',
      message: 'Tap to Pay on iPhone is here.',
    });
  });

  it('never requires an update the store does not have', () => {
    const typo: AppVersionPolicy = {
      ios: { latest: '1.2.0', minimum: '1.3.0', message: null },
      android: null,
    };
    expect(decideUpdate({ policy: typo, platform: 'ios', installed: '1.2.0' }).kind).toBe('none');
    // Below latest it is still offered, just not forced.
    expect(decideUpdate({ policy: typo, platform: 'ios', installed: '1.1.2' }).kind).toBe(
      'recommended',
    );
  });

  it('says nothing when the installed version is unknown or there is no policy', () => {
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: null }).kind).toBe('none');
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: 'abc' }).kind).toBe('none');
    expect(decideUpdate({ policy: null, platform: 'ios', installed: '1.0.0' }).kind).toBe('none');
  });

  it('honours Not now for that version, for the snooze window only', () => {
    const now = 1_000_000_000_000;
    const snoozed = { version: '1.2.0', at: now - 1000 };
    expect(decideUpdate({ policy: POLICY, platform: 'ios', installed: '1.1.2', snoozed, now }).kind).toBe(
      'none',
    );
    expect(
      decideUpdate({
        policy: POLICY,
        platform: 'ios',
        installed: '1.1.2',
        snoozed: { version: '1.2.0', at: now - SNOOZE_MS },
        now,
      }).kind,
    ).toBe('recommended');
  });

  it('asks again when a newer version comes out during a snooze', () => {
    const now = 1_000_000_000_000;
    expect(
      decideUpdate({
        policy: POLICY,
        platform: 'ios',
        installed: '1.1.2',
        snoozed: { version: '1.1.9', at: now },
        now,
      }).kind,
    ).toBe('recommended');
  });

  it('cannot snooze a required update', () => {
    const now = 1_000_000_000_000;
    expect(
      decideUpdate({
        policy: POLICY,
        platform: 'ios',
        installed: '1.0.0',
        snoozed: { version: '1.2.0', at: now },
        now,
      }).kind,
    ).toBe('required');
  });
});
