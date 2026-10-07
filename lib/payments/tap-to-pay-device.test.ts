import { deviceCanUseTapToPay } from '@/lib/payments/tap-to-pay-device';

const iphone = (modelId: string | null) => ({ platform: 'ios', isPad: false, modelId });

describe('deviceCanUseTapToPay', () => {
  it('allows the iPhone XS, XS Max and XR, and everything after', () => {
    expect(deviceCanUseTapToPay(iphone('iPhone11,2'))).toBe(true); // XS
    expect(deviceCanUseTapToPay(iphone('iPhone11,6'))).toBe(true); // XS Max
    expect(deviceCanUseTapToPay(iphone('iPhone11,8'))).toBe(true); // XR
    expect(deviceCanUseTapToPay(iphone('iPhone17,1'))).toBe(true);
  });

  it('refuses the iPhone X, 8 and older', () => {
    expect(deviceCanUseTapToPay(iphone('iPhone10,6'))).toBe(false); // X
    expect(deviceCanUseTapToPay(iphone('iPhone10,4'))).toBe(false); // 8
    expect(deviceCanUseTapToPay(iphone('iPhone9,3'))).toBe(false); // 7
  });

  it('refuses every iPad, however it is detected', () => {
    expect(deviceCanUseTapToPay({ platform: 'ios', isPad: true, modelId: 'iPad13,18' })).toBe(false);
    // An iPhone app on an iPad can report isPad false; the model still says iPad.
    expect(deviceCanUseTapToPay(iphone('iPad14,1'))).toBe(false);
    expect(deviceCanUseTapToPay(iphone('iPod9,1'))).toBe(false);
  });

  it('leaves the simulator and unknown models to the SDK', () => {
    expect(deviceCanUseTapToPay(iphone('arm64'))).toBe(true);
    expect(deviceCanUseTapToPay(iphone(null))).toBe(true);
  });

  it('never decides for Android', () => {
    expect(deviceCanUseTapToPay({ platform: 'android', isPad: false, modelId: null })).toBe(true);
  });
});
