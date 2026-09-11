/**
 * The contact composer — web `ContactDetailPanel`'s "Send a message" block.
 *
 * Pins the two things that had drifted: the channel select offers all three
 * options and opens on "Email & SMS (if available)" whatever the contact has on
 * file (web `GuestMessageChannelSelect`), and a 502 says which channel failed
 * rather than "Request failed (502)".
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { GuestMessageSheet } from '@/components/messaging/GuestMessageSheet';
import { ApiError } from '@/lib/api/client';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}
async function changeText(node: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(node, value);
  });
}

/** A contact with an email but no phone — the case that used to hide options. */
const EMAIL_ONLY = { id: 'g1', guestName: 'Ada Lovelace', email: 'ada@example.com', phone: null };

async function compose(onSend: jest.Mock) {
  await render(<GuestMessageSheet target={EMAIL_ONLY} onSend={onSend} onClose={jest.fn()} />);
  await changeText(screen.getByPlaceholderText('Write a short message to the guest…'), 'Running late?');
  await press(() => screen.getByText('Send'));
}

beforeEach(() => {
  mockToast.success.mockClear();
  mockToast.info.mockClear();
});

describe('GuestMessageSheet — web channel parity', () => {
  it('offers all three channels even when only an email is on file', async () => {
    await render(<GuestMessageSheet target={EMAIL_ONLY} onSend={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByText('Email & SMS (if available)')).toBeTruthy();
    expect(screen.getByText('Email only')).toBeTruthy();
    expect(screen.getByText('SMS only')).toBeTruthy();
  });

  it('sends on "both" by default', async () => {
    const onSend = jest.fn(() => Promise.resolve({}));
    await compose(onSend);

    expect(onSend).toHaveBeenCalledWith({ message: 'Running late?', channel: 'both' });
    expect(mockToast.success).toHaveBeenCalledWith('Message sent.');
  });

  it('names the failed channel on a 502 instead of "Request failed (502)"', async () => {
    const onSend = jest.fn(() =>
      Promise.reject(
        new ApiError('Request failed (502)', 502, {
          success: false,
          errors: ['Email: Delivery failed (check provider configuration)'],
        }),
      ),
    );
    await compose(onSend);

    expect(
      screen.getByText('Email: Delivery failed (check provider configuration)'),
    ).toBeTruthy();
  });

  it('flags a partial send that still went out', async () => {
    const onSend = jest.fn(() => Promise.resolve({ errors: ['SMS: Guest has no phone on file'] }));
    await compose(onSend);

    expect(mockToast.info).toHaveBeenCalledWith(
      'Message sent, with warnings: SMS: Guest has no phone on file',
    );
  });
});
