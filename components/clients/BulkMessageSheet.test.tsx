/**
 * Clients-05 (Low): bulk-Message semantics — DECISION & divergence pinned.
 *
 * The web directory's bulk "Message" fans out a per-guest transactional message
 * (`POST /api/venue/guests/[id]/message`, one per selected id). The app keeps a
 * single CONSENT-GATED marketing broadcast (`POST /api/venue/contacts/bulk`
 * {action:'marketing_message'}) — an intentional, documented divergence (see the
 * comment block on `BulkMessageSheet`). These tests guarantee the app behaviour
 * does NOT silently drift into the web fan-out:
 *   - exactly ONE broadcast mutation is sent (not N per-guest calls), carrying
 *     the subject/body/channel for the whole selection;
 *   - the in-sheet note tells the user the broadcast is consent-gated and
 *     reflects the chosen channel — the safeguard that makes the divergence safe.
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

// The consent-gated broadcast mutation. Spy on it to prove a SINGLE call with the
// whole selection — the opposite of the web per-guest fan-out.
const mockBroadcast = jest.fn(() => Promise.resolve({ sent: 2, skipped: 1 }));
const mockAddTag = jest.fn(() => Promise.resolve({}));
const mockRemoveTag = jest.fn(() => Promise.resolve({}));
jest.mock('@/lib/queries/useContactsBulk', () => ({
  useBulkAddTag: () => ({ mutateAsync: mockAddTag, isPending: false }),
  useBulkRemoveTag: () => ({ mutateAsync: mockRemoveTag, isPending: false }),
  useBulkMarketingMessage: () => ({ mutateAsync: mockBroadcast, isPending: false }),
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

beforeEach(() => {
  mockBroadcast.mockClear();
  mockToast.success.mockClear();
});

describe('BulkMessageSheet — consent-gated broadcast (intentional web divergence)', () => {
  it('sends ONE broadcast for the whole selection, not a per-guest fan-out', async () => {
    await render(
      <BulkMessageSheet guestIds={GUEST_IDS} open onClose={jest.fn()} onDone={jest.fn()} />,
    );

    await changeText(screen.getByTestId('bulk-msg-subject'), 'Spring offer');
    await changeText(screen.getByTestId('bulk-msg-body'), 'Book now and save.');

    await press(() => screen.getByText('Send'));

    // Exactly ONE broadcast — NOT three per-guest calls.
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledWith({
      guest_ids: GUEST_IDS,
      subject: 'Spring offer',
      body: 'Book now and save.',
      channel: 'email',
    });
    // Reports the consent-gated sent/skipped result.
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
    );
  });

  it('blocks the broadcast until subject AND body are filled', async () => {
    await render(
      <BulkMessageSheet guestIds={GUEST_IDS} open onClose={jest.fn()} onDone={jest.fn()} />,
    );

    // Press Send with empty fields → inline error, no mutation.
    await press(() => screen.getByText('Send'));
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(screen.getByText('Subject and message are both required.')).toBeTruthy();
  });

  it('surfaces the consent-gating note, reflecting the selected channel', async () => {
    await render(
      <BulkMessageSheet guestIds={GUEST_IDS} open onClose={jest.fn()} onDone={jest.fn()} />,
    );

    // Default channel is email → the note names the email reachability gate.
    expect(screen.getByText(/marketing consent/i)).toBeTruthy();
    expect(screen.getByText(/email on file/i)).toBeTruthy();

    // Switch to SMS → the note follows the channel.
    await press(() => screen.getByText('SMS'));
    expect(screen.getByText(/sms on file/i)).toBeTruthy();
  });
});
