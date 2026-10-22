/**
 * The waitlist with hidden client contacts (web roles plan A2, §5.6). For someone whose "Can see
 * client phone numbers and emails" is off, each entry reads "Hidden" in place of the phone and
 * email (web WaitlistPageClient); everyone else sees them. Refusing to convert an entry shows the
 * server's own sentence (409 CONTACT_BELONGS_TO_OTHER_CLIENT, 403 DIARY_VIEW_ONLY).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => {
  const Screen = () => null;
  return { Stack: { Screen }, useRouter: () => ({ push: jest.fn(), back: jest.fn() }) };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { id: 'v1' } }) }));
jest.mock('@/lib/realtime/useVenueLiveSync', () => ({ useVenueLiveSync: () => ({ status: 'live' }) }));
jest.mock('@/components/waitlist/WaitlistJoinSheet', () => ({ WaitlistJoinSheet: () => null }));

let mockData: unknown = null;
const mockUpdate = jest.fn();
jest.mock('@/lib/queries/useWaitlist', () => ({
  useWaitlist: () => ({
    data: mockData,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateWaitlistEntry: () => ({ mutate: mockUpdate, isPending: false }),
  useDeleteWaitlistEntry: () => ({ mutate: jest.fn(), isPending: false }),
  useWaitlistAlerts: () => ({ data: undefined, refetch: jest.fn() }),
  useActOnWaitlistAlert: () => ({ mutate: jest.fn(), isPending: false }),
}));

import WaitlistScreen from '@/app/(app)/waitlist';
import { ApiError } from '@/lib/api/client';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const HIDDEN: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };
const FULL: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

const entry = {
  id: 'w1',
  status: 'waiting',
  waitlist_kind: 'appointment',
  guest_name: 'Ada Lovelace',
  desired_date: '2030-01-10',
  service_name: 'Cut',
};

async function renderAs(access: ViewerAccess) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(<WaitlistScreen />, { wrapper });
}

beforeEach(() => {
  mockUpdate.mockReset();
  mockToast.error.mockClear();
});

describe('the waitlist and hidden client contacts', () => {
  it('reads "Hidden" in place of the phone and email', async () => {
    mockData = {
      entries: [{ ...entry, guest_phone: null, guest_email: null }],
      waitlist_mode: 'notify_in_order',
      contacts_hidden: true,
    };
    await renderAs(HIDDEN);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it('shows the phone and email to everyone else', async () => {
    mockData = {
      entries: [{ ...entry, guest_phone: '+447700900123', guest_email: 'ada@example.com' }],
      waitlist_mode: 'notify_in_order',
    };
    await renderAs(FULL);
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it("shows the server's sentence when an offer is refused", async () => {
    mockData = { entries: [{ ...entry, guest_phone: null, guest_email: null }], contacts_hidden: true };
    const message = 'These details belong to another client. Search by name, or ask an admin.';
    mockUpdate.mockImplementation((_vars: unknown, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new ApiError(message, 409, { error: message, code: 'CONTACT_BELONGS_TO_OTHER_CLIENT' })),
    );
    await renderAs(HIDDEN);
    await act(async () => {
      fireEvent.press(screen.getByText('Offer'));
    });
    expect(mockToast.error).toHaveBeenCalledWith(message);
  });
});
