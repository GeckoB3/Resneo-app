/**
 * What this device tells the web it can do with a card (plan §4.36 "Who is told"), on Android: an
 * Android tablet without NFC must never say `tap_to_pay`, or the web till lists it as a phone that
 * can take cards and sends "Any phone" requests to it. The answer comes from the launch probe or an
 * earlier launch (`tap-to-pay-device-support.ts`), and nothing is reported until the stored answer
 * has been read.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockReport = jest.fn(async () => undefined);
jest.mock('@/lib/push/registerDevice', () => ({ reportDeviceCardCapability: (...args: unknown[]) => mockReport(...(args as [])) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({
    data: { capabilities: { take_payment: true }, card_methods: { card_app: true } },
    isLoading: false,
  }),
}));
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => ({ applies: false, supported: null, termsAccepted: null }) }));
jest.mock('@/providers/LinkedVenueProvider', () => ({ useLinkedVenueContext: () => ({ ownerVenueId: null }) }));
let mockWisepad = false;
jest.mock('@/lib/payments/bluetoothReader', () => ({ hasRememberedBluetoothReader: async () => mockWisepad }));
jest.mock('@/lib/payments/terminal-sdk', () => ({ isTerminalSdkAvailable: () => true }));
jest.mock('@/lib/env', () => ({ getStripePublishableKey: () => 'pk_test' }));
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => true }));
let mockAnswer: boolean | null = null;
let mockLoaded = false;
const mockLoad = jest.fn(async () => mockAnswer);
jest.mock('@/lib/payments/tap-to-pay-device-support', () => ({
  loadTapToPayDeviceSupport: () => mockLoad(),
  useTapToPayDeviceSupport: () => mockAnswer,
  useTapToPayDeviceSupportLoaded: () => mockLoaded,
}));

import { CardCapabilityReporter } from '@/components/pos/CardCapabilityReporter';

const originalOS = Platform.OS;

async function mount() {
  await render(<CardCapabilityReporter />);
  await act(async () => {});
}

beforeEach(() => {
  mockReport.mockClear();
  mockLoad.mockClear();
  mockAnswer = null;
  mockLoaded = true;
  mockWisepad = false;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
});

describe('CardCapabilityReporter on Android', () => {
  it('reports nothing until the remembered answer has been read, and asks for it', async () => {
    mockLoaded = false;
    await mount();
    expect(mockLoad).toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('says a tablet without NFC can take no card, so the web never sends it one', async () => {
    mockAnswer = false;
    await mount();
    expect(mockReport).toHaveBeenLastCalledWith('tok', { card_capability: 'none', tap_to_pay_terms_accepted: null });
  });

  it('says a tablet without NFC can take a card on its paired reader', async () => {
    mockAnswer = false;
    mockWisepad = true;
    await mount();
    expect(mockReport).toHaveBeenLastCalledWith('tok', { card_capability: 'wisepad', tap_to_pay_terms_accepted: null });
  });

  it.each([
    ['a phone that can', true],
    ['a phone not asked yet', null],
  ])('reports Tap to Pay for %s, as before', async (_name, answer) => {
    mockAnswer = answer;
    await mount();
    expect(mockReport).toHaveBeenLastCalledWith('tok', { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true });
  });
});
