/**
 * CreateContactSheet: per-field messages from the create route (web QA FD-10,
 * 2026-09-23). POST /api/venue/guests answers a rejected field with a 400
 * carrying `field_errors`; each message shows under its input and clears when
 * that field is edited. Only errors with no field stay at the foot of the form.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CreateContactSheet } from './CreateContactSheet';
import { ApiError } from '@/lib/api/client';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useCreateGuest', () => ({
  useCreateGuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const EMAIL_MESSAGE = 'Enter the email address in full, like name@example.com.';

async function type(placeholder: string, value: string) {
  const input = screen.getByPlaceholderText(placeholder);
  await act(async () => {
    fireEvent.changeText(input, value);
  });
}

async function save() {
  await act(async () => {
    fireEvent.press(screen.getByText('Add client'));
  });
}

beforeEach(() => {
  mockMutateAsync.mockReset();
});

describe('CreateContactSheet: field errors', () => {
  it('shows a rejected email under the Email field and clears it on edit', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError('Please check the email address.', 400, {
        error: 'Please check the email address.',
        field_errors: { email: EMAIL_MESSAGE },
      }),
    );
    await render(<CreateContactSheet visible onClose={jest.fn()} onCreated={jest.fn()} />);

    await type('name@example.com', 'ada@');
    await save();

    expect(screen.getByText(EMAIL_MESSAGE)).toBeTruthy();
    // The summary sentence is not repeated at the foot of the form.
    expect(screen.queryByText('Please check the email address.')).toBeNull();

    await type('name@example.com', 'ada@example.com');
    expect(screen.queryByText(EMAIL_MESSAGE)).toBeNull();
  });

  it('shows a rejected phone number once, under the Phone field', async () => {
    const phoneMessage =
      'Enter a phone number we can call or text, like 07911 123456 or +44 7911 123456.';
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(phoneMessage, 400, { error: phoneMessage, field_errors: { phone: phoneMessage } }),
    );
    await render(<CreateContactSheet visible onClose={jest.fn()} onCreated={jest.fn()} />);

    await type('07911 123456', '12');
    await save();

    expect(screen.getAllByText(phoneMessage)).toHaveLength(1);
  });

  it('keeps a form-level message for an error with no field', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError('Failed to create guest', 500, { error: 'Failed to create guest' }),
    );
    await render(<CreateContactSheet visible onClose={jest.fn()} onCreated={jest.fn()} />);

    await type('name@example.com', 'ada@example.com');
    await save();

    expect(screen.getByText('Failed to create guest')).toBeTruthy();
  });
});
