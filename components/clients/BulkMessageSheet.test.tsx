/**
 * Bulk "Message" — web parity (`ContactsDashboard.tsx` `runBulkContactMessage`
 * + `BulkGuestMessageModal`). The app used to send ONE consent-gated marketing
 * broadcast with a staff-typed Subject; it now fans the web's per-contact
 * message out and reports the result in the web's words.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
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

const mockSendBulk = jest.fn();
const mockAddTag = jest.fn(() => Promise.resolve({}));
const mockRemoveTag = jest.fn(() => Promise.resolve({}));
jest.mock('@/lib/queries/useContactsBulk', () => ({
  useBulkAddTag: () => ({ mutateAsync: mockAddTag, isPending: false }),
  useBulkRemoveTag: () => ({ mutateAsync: mockRemoveTag, isPending: false }),
  useBulkGuestMessage: () => ({ mutateAsync: mockSendBulk, isPending: false }),
}));

import { BulkMessageSheet } from '@/components/clients/BulkActionSheets';

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

const GUEST_IDS = ['g1', 'g2', 'g3'];
const CONTACTS = [
  { id: 'g1', first_name: 'Ada', last_name: 'Lovelace' },
  { id: 'g2', first_name: 'Bob', last_name: 'Vance' },
  { id: 'g3', first_name: null, last_name: null, identifiability_tier: 'anonymous' },
];

const sent = (guestId: string) => ({ guestId, sent: true, skipped: false, issues: null });
const skipped = (guestId: string) => ({ guestId, sent: false, skipped: true, issues: null });
const failed = (guestId: string, issues: string) => ({ guestId, sent: false, skipped: false, issues });

async function renderSheet(overrides: { onDone?: jest.Mock; guestIds?: string[] } = {}) {
  const onDone = overrides.onDone ?? jest.fn();
  await render(
    <BulkMessageSheet
      guestIds={overrides.guestIds ?? GUEST_IDS}
      open
      onClose={jest.fn()}
      onDone={onDone}
      clientWord="Client"
      contacts={CONTACTS}
    />,
  );
  return { onDone };
}

async function compose(text = 'Book now and save.') {
  await changeText(screen.getByTestId('bulk-msg-body'), text);
  await press(() => screen.getByText('Send'));
}

beforeEach(() => {
  mockSendBulk.mockReset();
  mockSendBulk.mockResolvedValue(GUEST_IDS.map(sent));
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('BulkMessageSheet — the web bulk message', () => {
  it('has no Subject field, and carries the web title, description and channel', async () => {
    await renderSheet();

    expect(screen.queryByTestId('bulk-msg-subject')).toBeNull();
    expect(screen.getByText('Message 3 Clients')).toBeTruthy();
    expect(
      screen.getByText(
        'The same message goes to each selected client who has given marketing permission. Anyone opted out, or without a recorded consent, is skipped, as are contacts without email or SMS on file for the chosen channel.',
      ),
    ).toBeTruthy();
    // The web's channel select, defaulted to both.
    expect(screen.getByText('Email & SMS (if available)')).toBeTruthy();
    expect(screen.getByText('Email only')).toBeTruthy();
    expect(screen.getByText('SMS only')).toBeTruthy();
    // The route's own cap.
    expect(screen.getByTestId('bulk-msg-body').props.maxLength).toBe(2000);
  });

  it('sends the whole selection on the default channel and reports it the web’s way', async () => {
    const { onDone } = await renderSheet();

    await compose();

    expect(mockSendBulk).toHaveBeenCalledTimes(1);
    expect(mockSendBulk).toHaveBeenCalledWith({
      guest_ids: GUEST_IDS,
      message: 'Book now and save.',
      channel: 'both',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Message sent to 3 clients');
    expect(onDone).toHaveBeenCalled();
  });

  it('counts contacts without marketing permission as skipped, not as failures', async () => {
    mockSendBulk.mockResolvedValue([sent('g1'), sent('g2'), skipped('g3')]);
    await renderSheet();

    await compose();

    expect(mockToast.success).toHaveBeenCalledWith(
      'Message sent to 2 clients, 1 skipped (no marketing permission)',
    );
  });

  it('keeps the sheet on a partial send, naming the contact, until Done', async () => {
    mockSendBulk.mockResolvedValue([
      sent('g1'),
      failed('g2', 'Guest has no email on file'),
      skipped('g3'),
    ]);
    const { onDone } = await renderSheet();

    await compose();

    expect(mockToast.error).toHaveBeenCalledWith('Sent to 1/3');
    expect(
      screen.getByText(
        'Sent to 1/3. 1 skipped (no marketing permission). Bob Vance: Guest has no email on file',
      ),
    ).toBeTruthy();
    // The selection is spent — sending again would double-message g1.
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText('Send')).toBeNull();

    await press(() => screen.getByText('Done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('explains a selection where nobody had given permission', async () => {
    mockSendBulk.mockResolvedValue(GUEST_IDS.map(skipped));
    await renderSheet();

    await compose();

    const msg = 'No messages sent: none of the selected clients has given marketing permission.';
    expect(mockToast.error).toHaveBeenCalledWith(msg);
    expect(screen.getByText(msg)).toBeTruthy();
  });

  it('sends nothing until there is a message', async () => {
    await renderSheet();

    await press(() => screen.getByText('Send'));

    expect(mockSendBulk).not.toHaveBeenCalled();
  });
});
