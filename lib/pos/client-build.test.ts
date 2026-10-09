/**
 * The build string the web parses (`src/lib/pos/client-build.ts` on the web): the platform first,
 * then `key=value` parts. From app step 2 it names the POS app step (`pos=2`), which is what the
 * web compares before it sends this phone a sale from the till (plan §4.36, test plan APP-03).
 */
import { clientHeaderValue, POS_APP_STEP } from '@/lib/pos/client-build';

describe('clientHeaderValue', () => {
  it('carries the platform, the store version, the update id and the POS app step', () => {
    expect(clientHeaderValue({ platform: 'ios', storeVersion: '1.2.0', updateId: '0b6f', posStep: POS_APP_STEP })).toBe(
      'ios; store=1.2.0; update=0b6f; pos=5',
    );
  });

  it('leaves out what it does not know', () => {
    expect(clientHeaderValue({ platform: 'android', storeVersion: null, updateId: null, posStep: 2 })).toBe('android; pos=2');
    expect(clientHeaderValue({ platform: 'web', storeVersion: null, updateId: null })).toBe('web');
  });

  it('never exceeds the 200 characters the web stores', () => {
    const value = clientHeaderValue({ platform: 'ios', storeVersion: '1.2.0', updateId: 'x'.repeat(400), posStep: 2 });
    expect(value.length).toBeLessThanOrEqual(200);
  });

  it('is app step 5: the web sends the cash-up reminder from pos=3 and new orders from pos=5', () => {
    expect(POS_APP_STEP).toBe(5);
  });
});
