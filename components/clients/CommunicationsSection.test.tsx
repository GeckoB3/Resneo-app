/**
 * CommunicationsSection: the contact's message log (web QA FD-4, 2026-09-23).
 *
 * The guest detail's `communications[]` now comes from `communication_logs` as well
 * as the legacy table, so rows carry raw log types (`booking_confirmation_email`),
 * the recipient, the failure reason and which table they came from. The rows read
 * as the web's: a friendly label, "To {recipient}", and the error on a failed send.
 */
import { render, screen } from '@testing-library/react-native';

import { CommunicationsSection } from './CommunicationsSection';
import type { CommunicationRow } from '@/types/guest-detail';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

function row(over: Partial<CommunicationRow>): CommunicationRow {
  return {
    id: 'c1',
    message_type: 'booking_confirmation_email',
    channel: 'email',
    status: 'sent',
    created_at: '2026-09-20T10:00:00.000Z',
    booking_id: 'b1',
    guest_id: null,
    ...over,
  };
}

describe('CommunicationsSection', () => {
  it('labels raw log types and names the recipient', async () => {
    await render(
      <CommunicationsSection
        communications={[
          row({ recipient: 'ada@example.com', source: 'communication_logs' }),
          row({ id: 'c2', message_type: 'pre_visit_reminder_sms', channel: 'sms', recipient: '+447700900000' }),
        ]}
      />,
    );

    expect(screen.getByText('Booking confirmation')).toBeTruthy();
    expect(screen.getByText('Pre-visit reminder')).toBeTruthy();
    expect(screen.getByText('To ada@example.com')).toBeTruthy();
    expect(screen.getByText('To +447700900000')).toBeTruthy();
    expect(screen.queryByText('booking confirmation email')).toBeNull();
  });

  it('shows the error message on a failed send only', async () => {
    await render(
      <CommunicationsSection
        communications={[
          row({ status: 'failed', error_message: 'Mailbox does not exist' }),
          row({ id: 'c2', status: 'sent', error_message: 'Retried after a timeout' }),
        ]}
      />,
    );

    expect(screen.getByText('Mailbox does not exist')).toBeTruthy();
    expect(screen.queryByText('Retried after a timeout')).toBeNull();
  });

  it('renders rows from both tables that share an id', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await render(
      <CommunicationsSection
        collapsible
        communications={[
          row({ id: 'same', source: 'communication_logs', message_type: 'custom_message_email' }),
          row({ id: 'same', source: 'communications', message_type: 'marketing_bulk' }),
        ]}
      />,
    );

    expect(screen.getByText('Custom message')).toBeTruthy();
    expect(screen.getByText('Marketing message')).toBeTruthy();
    expect(screen.getByText('2 messages')).toBeTruthy();
    // Keyed by source and id, so React sees two distinct rows.
    const keyWarnings = consoleError.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('same key')),
    );
    expect(keyWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });
});
