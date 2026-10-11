/**
 * "Get this phone ready" (design 6.6, drawn as C4): the device check (an iPhone XS or newer, never
 * an iPad, iOS new enough; Android 13 or newer) and the tick once the server lists this phone.
 */
import {
  androidApiLevel,
  phoneCanTakeCards,
  phoneCheck,
  thisPhoneKind,
  thisPhoneRegistered,
  type PhoneFacts,
} from '@/lib/pos/setup/phone';

function facts(over: Partial<PhoneFacts>): PhoneFacts {
  return { platform: 'ios', isPad: false, buildSupports: true, probeSupported: true, updateRequired: false, androidApiLevel: null, ...over };
}

describe('phoneCheck', () => {
  it('passes an iPhone XS or newer', () => {
    expect(phoneCheck(facts({}))).toBe('iphone_ok');
    expect(phoneCheck(facts({ probeSupported: null }))).toBe('iphone_ok');
    expect(phoneCanTakeCards('iphone_ok')).toBe(true);
  });

  it('turns away an older iPhone, an iPad, and says when iOS needs updating', () => {
    expect(phoneCheck(facts({ buildSupports: false }))).toBe('iphone_old');
    expect(phoneCheck(facts({ probeSupported: false }))).toBe('iphone_old');
    expect(phoneCheck(facts({ isPad: true }))).toBe('ipad');
    expect(phoneCheck(facts({ updateRequired: true }))).toBe('ios_update');
    expect(phoneCanTakeCards('ipad')).toBe(false);
  });

  it('passes Android 13 (API 33) or newer, and turns away older Android', () => {
    expect(phoneCheck(facts({ platform: 'android', androidApiLevel: 33 }))).toBe('android_ok');
    expect(phoneCheck(facts({ platform: 'android', androidApiLevel: 35 }))).toBe('android_ok');
    expect(phoneCheck(facts({ platform: 'android', androidApiLevel: 32 }))).toBe('android_old');
    expect(phoneCheck(facts({ platform: 'web' }))).toBe('other');
  });

  it("reads Android's API level from Platform.Version", () => {
    expect(androidApiLevel('android', 34)).toBe(34);
    expect(androidApiLevel('android', '33')).toBe(33);
    expect(androidApiLevel('ios', '18.1')).toBeNull();
  });
});

describe('thisPhoneRegistered', () => {
  const res = {
    can_take_cards: true,
    phones: [
      { staff_id: 'staff-1', name: 'Sam', devices: ['iphone' as const] },
      { staff_id: 'staff-2', name: 'Priya', devices: ['android' as const, 'wisepad' as const] },
    ],
  };

  it('ticks once the server lists this person with a phone of this kind', () => {
    expect(thisPhoneKind('ios')).toBe('iphone');
    expect(thisPhoneKind('android')).toBe('android');
    expect(thisPhoneRegistered(res, 'staff-1', 'ios')).toBe(true);
    expect(thisPhoneRegistered(res, 'staff-2', 'android')).toBe(true);
  });

  it('waits otherwise: another person, another kind, no cards yet, or nothing known', () => {
    expect(thisPhoneRegistered(res, 'staff-1', 'android')).toBe(false);
    expect(thisPhoneRegistered(res, 'staff-3', 'ios')).toBe(false);
    expect(thisPhoneRegistered({ ...res, can_take_cards: false }, 'staff-1', 'ios')).toBe(false);
    expect(thisPhoneRegistered(undefined, 'staff-1', 'ios')).toBe(false);
    expect(thisPhoneRegistered(res, null, 'ios')).toBe(false);
    expect(thisPhoneRegistered(res, 'staff-1', 'web')).toBe(false);
  });
});
