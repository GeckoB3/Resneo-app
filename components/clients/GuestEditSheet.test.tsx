/**
 * GuestEditSheet — the "Edit" form behind a contact's detail screen.
 *
 * Pinned here is the layout, because it shipped broken: the Sheet was not
 * `fill` and its ScrollView was `flexGrow: 0`, so the body sized to its content
 * — the form could not be scrolled and its pinned Save/Cancel row was pushed
 * off the bottom of the sheet. Reported from an iPhone as "unable to scroll and
 * cannot see the bottom of the form". The Event, Resource, ClassType and Modify
 * editors were all fixed for this same pattern; this one was missed.
 *
 * `fill` also means the Sheet supplies no horizontal padding, so the body must
 * carry the standard inset itself or the form renders edge-to-edge.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { GuestEditSheet, readGuestSaveErrors, type GuestEditTarget } from './GuestEditSheet';
import { ApiError } from '@/lib/api/client';
import { spacing } from '@/theme/index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockSheetProps: { fill?: boolean }[] = [];
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({
      visible,
      fill,
      children,
    }: {
      visible: boolean;
      fill?: boolean;
      children: React.ReactNode;
    }) => {
      mockSheetProps.push({ fill });
      return visible ? React.createElement(View, null, children) : null;
    },
  };
});

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const TARGET: GuestEditTarget = {
  id: 'guest-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '07700900000',
  email: 'ada@example.com',
  notes: '',
  tags: '',
  marketingConsent: false,
  marketingOptOut: false,
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  addressPostcode: '',
};

type TreeNode = {
  parent: TreeNode | null;
  props: { style?: unknown; contentContainerStyle?: unknown };
};

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

beforeEach(() => {
  mockSheetProps.length = 0;
  mockMutateAsync.mockReset();
});

describe('GuestEditSheet', () => {
  it('fills the sheet so the form scrolls and the actions stay reachable', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    expect(mockSheetProps.every((p) => p.fill === true)).toBe(true);
    // The pinned actions render alongside the scrolling form, not below it.
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('gives the ScrollView room to flex, so a long form can scroll', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    // Walk up from a field inside the scroll body to the ScrollView itself,
    // identified by the contentContainerStyle prop only it carries.
    let node = screen.getByText('First name') as unknown as TreeNode | null;
    let style: Record<string, unknown> | null = null;
    for (let i = 0; node && i < 10; i += 1) {
      if (node.props?.contentContainerStyle !== undefined) {
        style = flatten(node.props.style);
        break;
      }
      node = node.parent;
    }

    expect(style).not.toBeNull();
    // The regression was `flexGrow: 0` — the body sized to content and froze.
    expect(style?.flex).toBe(1);
    expect(style?.flexGrow).toBeUndefined();
  });

  it('pads itself horizontally, since a fill Sheet supplies none', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    let node = screen.getByText('Edit guest') as unknown as TreeNode | null;
    let inset: unknown;
    for (let i = 0; node && i < 6; i += 1) {
      const pad = flatten(node.props?.style).paddingHorizontal;
      if (typeof pad === 'number') {
        inset = pad;
        break;
      }
      node = node.parent;
    }
    expect(inset).toBe(spacing.lg);
  });

  it('renders nothing without a target', async () => {
    await render(<GuestEditSheet target={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Edit guest')).toBeNull();
  });
});

/**
 * Web QA FD-2 / FD-10 (2026-09-23): the guest PATCH answers a duplicate email with a
 * 409 `{ error, field_errors: { email }, conflict }` and a rejected field with a 400
 * carrying `field_errors`. Each message belongs under its input, not at the foot.
 */
describe('GuestEditSheet: field errors from the server', () => {
  const DUPLICATE =
    'That email already belongs to Grace Hopper. To combine the two, use Merge on this contact.';

  async function changeText(current: string, value: string) {
    const input = screen.getByDisplayValue(current);
    await act(async () => {
      fireEvent.changeText(input, value);
    });
  }

  async function save() {
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
  }

  it('shows a duplicate email under the Email field, and clears it on edit', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(DUPLICATE, 409, {
        error: DUPLICATE,
        field_errors: { email: DUPLICATE },
        conflict: { field: 'email', guest_id: 'guest-2' },
      }),
    );
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    await changeText('ada@example.com', 'grace@example.com');
    await save();

    // Once, under the field: the foot of the form does not repeat it.
    expect(screen.getAllByText(DUPLICATE)).toHaveLength(1);

    await changeText('grace@example.com', 'ada.l@example.com');
    expect(screen.queryByText(DUPLICATE)).toBeNull();
  });

  it('puts each 400 field message under its own input', async () => {
    const phoneMessage =
      'Enter a phone number we can call or text, like 07911 123456 or +44 7911 123456.';
    const nameMessage = 'Keep the first name to 100 characters or fewer.';
    const summary = 'Please check the first name and phone number.';
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(summary, 400, {
        error: summary,
        field_errors: { phone: phoneMessage, first_name: nameMessage },
      }),
    );
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    await changeText('07700900000', '12');
    await save();

    expect(screen.getByText(phoneMessage)).toBeTruthy();
    expect(screen.getByText(nameMessage)).toBeTruthy();
    expect(screen.queryByText(summary)).toBeNull();

    // Editing the phone clears only the phone's message.
    await changeText('12', '07911 123456');
    expect(screen.queryByText(phoneMessage)).toBeNull();
    expect(screen.getByText(nameMessage)).toBeTruthy();
  });

  it('keeps a form-level message for an error with no field', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError('Failed to update guest', 500, { error: 'Failed to update guest' }),
    );
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    await changeText('Ada', 'Augusta');
    await save();

    expect(screen.getByText('Failed to update guest')).toBeTruthy();
  });

  it('caps the contact fields at the API lengths', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);
    expect(screen.getByDisplayValue('Ada').props.maxLength).toBe(100);
    expect(screen.getByDisplayValue('Lovelace').props.maxLength).toBe(100);
    expect(screen.getByDisplayValue('07700900000').props.maxLength).toBe(24);
    expect(screen.getByDisplayValue('ada@example.com').props.maxLength).toBe(255);
  });
});

describe('readGuestSaveErrors', () => {
  it('sends messages for fields the form lacks to the form level', () => {
    const e = new ApiError('Please check the custom fields and email address.', 400, {
      error: 'Please check the custom fields and email address.',
      field_errors: { custom_fields: 'Check the custom fields and try again.', email: 'Bad email' },
    });
    expect(readGuestSaveErrors(e, 'fallback', ['email'])).toEqual({
      form: 'Check the custom fields and try again.',
      fields: { email: 'Bad email' },
    });
  });

  it('falls back when the error is not from the API', () => {
    expect(readGuestSaveErrors(new Error('boom'), 'Could not save changes.', ['email'])).toEqual({
      form: 'Could not save changes.',
      fields: {},
    });
  });
});
