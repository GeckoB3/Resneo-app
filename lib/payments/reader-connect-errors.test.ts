import type { StripeError } from '@stripe/stripe-terminal-react-native';

import {
  isAlreadyConnectedError,
  isTransientReaderConnectError,
  READER_CONNECT_FAILED_MESSAGE,
  READER_STARTING_UP_MESSAGE,
  readerErrorMessage,
} from '@/lib/payments/reader-connect-errors';

const err = (code: string, message = 'Stripe said something technical.') =>
  ({ code, message }) as unknown as StripeError;

describe('isTransientReaderConnectError', () => {
  it.each(['BLUETOOTH_ERROR', 'BLUETOOTH_DISCONNECTED', 'REQUEST_TIMED_OUT', 'READER_BUSY', 'READER_COMMUNICATION_ERROR'])(
    'retries %s: a reader that is not ready yet',
    (code) => {
      expect(isTransientReaderConnectError(err(code))).toBe(true);
    },
  );

  it('retries a reader object the SDK no longer holds, with a fresh one', () => {
    expect(isTransientReaderConnectError(err('INVALID_REQUIRED_PARAMETER', 'Could not find reader with id WP-1'))).toBe(true);
    expect(isTransientReaderConnectError(err('INVALID_REQUIRED_PARAMETER', 'Could not find a reader with serialNumber WP-1'))).toBe(true);
    expect(isTransientReaderConnectError(err('INVALID_REQUIRED_PARAMETER', 'Location ID is required'))).toBe(false);
  });

  it.each([
    'READER_BATTERY_CRITICALLY_LOW',
    'READER_CONNECTED_TO_ANOTHER_DEVICE',
    'BLUETOOTH_PERMISSION_DENIED',
    'LOCATION_SERVICES_DISABLED',
    'CONNECTION_TOKEN_PROVIDER_ERROR',
    'READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW',
    'CANCELED',
  ])('never retries %s: waiting cannot fix it', (code) => {
    expect(isTransientReaderConnectError(err(code))).toBe(false);
  });

  it('copes with no error or no code', () => {
    expect(isTransientReaderConnectError(undefined)).toBe(false);
    expect(isTransientReaderConnectError({ message: 'x' } as unknown as StripeError)).toBe(false);
  });
});

describe('readerErrorMessage', () => {
  it('says how to fix Bluetooth or location being off', () => {
    expect(readerErrorMessage(err('BLUETOOTH_PERMISSION_DENIED'), 'fallback')).toMatch(/Turn Bluetooth on/);
    expect(readerErrorMessage(err('LOCATION_SERVICES_DISABLED'), 'fallback')).toMatch(/Location is turned off/);
  });

  it('says to charge a flat reader, and how much for an update', () => {
    expect(readerErrorMessage(err('READER_BATTERY_CRITICALLY_LOW'), 'fallback')).toMatch(/Charge it/);
    expect(readerErrorMessage(err('READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW'), 'fallback')).toMatch(/over half/);
  });

  it('names the other device for a reader in use elsewhere', () => {
    expect(readerErrorMessage(err('READER_CONNECTED_TO_ANOTHER_DEVICE'), 'fallback')).toMatch(/another phone or tablet/);
  });

  it('replaces Stripe’s wording for a reader that was not ready, with the caller’s choice for a scan', () => {
    expect(readerErrorMessage(err('BLUETOOTH_ERROR'), 'fallback')).toBe(READER_CONNECT_FAILED_MESSAGE);
    expect(readerErrorMessage(err('BLUETOOTH_ERROR'), 'fallback', 'No card readers found.')).toBe('No card readers found.');
  });

  it('keeps Stripe’s own message for anything else, and the fallback when there is none', () => {
    expect(readerErrorMessage(err('STRIPE_API_ERROR', 'Your account cannot do that.'), 'fallback')).toBe(
      'Your account cannot do that.',
    );
    expect(readerErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('never uses an em-dash', () => {
    const codes = [
      'BLUETOOTH_PERMISSION_DENIED',
      'LOCATION_SERVICES_DISABLED',
      'BLUETOOTH_LOW_ENERGY_UNSUPPORTED',
      'READER_BATTERY_CRITICALLY_LOW',
      'READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW',
      'READER_SOFTWARE_UPDATE_FAILED',
      'READER_CONNECTED_TO_ANOTHER_DEVICE',
      'BLUETOOTH_ERROR',
    ];
    for (const code of codes) expect(readerErrorMessage(err(code), 'fallback')).not.toContain('—');
    expect(READER_STARTING_UP_MESSAGE).not.toContain('—');
  });
});

describe('isAlreadyConnectedError', () => {
  it('matches only the SDK’s already-connected code', () => {
    expect(isAlreadyConnectedError(err('ALREADY_CONNECTED_TO_READER'))).toBe(true);
    expect(isAlreadyConnectedError(err('BLUETOOTH_ERROR'))).toBe(false);
    expect(isAlreadyConnectedError(undefined)).toBe(false);
  });
});
