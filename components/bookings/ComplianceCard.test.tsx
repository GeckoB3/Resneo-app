/**
 * ComplianceCard: expired form links (web QA FD-7 / FD-8, 2026-09-23).
 *
 * The guest's form links now list an old pending link as `expired`. The row says so
 * in the web's words and offers Send link, which sends a fresh one. A resend of a
 * link that expired meanwhile comes back `reissued: true`, and the toast says a
 * fresh link went out.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ComplianceCard, expiredLinkHint } from './ComplianceCard';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/compliance/ComplianceCaptureSheet', () => ({
  ComplianceCaptureSheet: () => null,
}));
jest.mock('@/components/compliance/ComplianceRecordSheet', () => ({
  ComplianceRecordSheet: () => null,
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const REQUIREMENT = {
  requirement: {
    id: 'req-1',
    compliance_type_id: 'type-1',
    compliance_type_name: 'Patch test',
    enforcement: 'block',
    lock_period_hours: null,
    type_is_active: true,
  },
  state: 'missing',
  lock_blocked: false,
  matching_record: null,
  latest_record: null,
};

jest.mock('@/lib/queries/useBookingCompliance', () => ({
  useBookingCompliance: () => ({
    data: { applicable: true, requirements: [REQUIREMENT], records: [] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSendComplianceFormLink: () => ({ mutate: jest.fn(), isPending: false }),
}));

let mockFormLinks: Record<string, unknown>[] = [];
const mockResend = jest.fn();
jest.mock('@/lib/queries/useCompliance', () => ({
  useGuestCompliance: () => ({
    data: { records: [], audit_events: [], form_links: mockFormLinks },
    refetch: jest.fn(),
  }),
  useResendFormLink: () => ({ mutate: mockResend, isPending: false, variables: undefined }),
}));

async function renderExpanded() {
  await render(<ComplianceCard bookingId="b1" guestId="g1" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Compliance'));
  });
}

beforeEach(() => {
  mockFormLinks = [];
  mockResend.mockReset();
  mockToast.success.mockReset();
});

describe('ComplianceCard: expired form links', () => {
  it('says the last link expired and offers Send link', async () => {
    mockFormLinks = [
      {
        id: 'link-1',
        guest_id: 'g1',
        compliance_type_id: 'type-1',
        status: 'expired',
        sent_via: 'email',
        sent_at: '2026-09-04',
      },
    ];
    await renderExpanded();

    expect(
      screen.getByText('The last form link (sent 04/09/2026) has expired. Send link sends a fresh one.'),
    ).toBeTruthy();
    expect(screen.getByText('Send link')).toBeTruthy();
    expect(screen.queryByText('Resend link')).toBeNull();
  });

  it('prefers the pending link over an older expired one', async () => {
    mockFormLinks = [
      { id: 'link-2', guest_id: 'g1', compliance_type_id: 'type-1', status: 'pending', sent_via: 'sms' },
      { id: 'link-1', guest_id: 'g1', compliance_type_id: 'type-1', status: 'expired', sent_at: '2026-09-04' },
    ];
    await renderExpanded();

    expect(screen.queryByText(/has expired/)).toBeNull();
    expect(screen.getByText('Resend link')).toBeTruthy();
  });

  it('toasts a fresh link when the resend was reissued', async () => {
    mockFormLinks = [
      { id: 'link-2', guest_id: 'g1', compliance_type_id: 'type-1', status: 'pending', sent_via: 'email' },
    ];
    mockResend.mockImplementationOnce((_input, options) =>
      options.onSuccess({ dispatched: true, reissued: true, link: { id: 'link-3' } }),
    );
    await renderExpanded();

    await act(async () => {
      fireEvent.press(screen.getByText('Resend link'));
    });

    expect(mockResend).toHaveBeenCalledWith(
      { id: 'link-2', send_via: 'email' },
      expect.any(Object),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Sent a fresh link by email.');
  });

  it('keeps the usual toast for an ordinary resend', async () => {
    mockFormLinks = [
      { id: 'link-2', guest_id: 'g1', compliance_type_id: 'type-1', status: 'pending', sent_via: 'email' },
    ];
    mockResend.mockImplementationOnce((_input, options) => options.onSuccess({ dispatched: true }));
    await renderExpanded();

    await act(async () => {
      fireEvent.press(screen.getByText('Resend link'));
    });

    expect(mockToast.success).toHaveBeenCalledWith('Form link resent by email.');
  });

  it('says nothing was sent when the client has no email, and does not claim success', async () => {
    mockFormLinks = [
      { id: 'link-2', guest_id: 'g1', compliance_type_id: 'type-1', status: 'pending', sent_via: 'email' },
    ];
    mockResend.mockImplementationOnce((_input, options) =>
      options.onSuccess({ dispatched: false, sent_via: null, reissued: true, public_url: 'https://x.test/f/abc' }),
    );
    await renderExpanded();

    await act(async () => {
      fireEvent.press(screen.getByText('Resend link'));
    });

    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      'Made a fresh link, but could not send it. Check the client has an email address on file. The link is copied, so you can share it another way.',
    );
  });
});

describe('expiredLinkHint', () => {
  it('leaves out the date when the link was never sent', () => {
    expect(expiredLinkHint(null)).toBe('The last form link has expired. Send link sends a fresh one.');
  });

  it("names the client page's own buttons, which are Email and SMS", () => {
    expect(expiredLinkHint(null, 'Email or SMS')).toBe(
      'The last form link has expired. Email or SMS sends a fresh one.',
    );
  });
});
