/**
 * Treatment records in the app (web plan §9): the booking card, the alerts strip, the client
 * section and the Booking settings switch. The data hooks are stubbed; the editor screen has its
 * own suite.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ClientAlert, TreatmentRecordSummary } from '@/types/treatment-records';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { timezone: 'Europe/London' } }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));

let mockList: { data: { records: TreatmentRecordSummary[]; linked: boolean } | null | undefined; isLoading?: boolean; isError?: boolean };
let mockAlerts: { data: ClientAlert[] | null | undefined };
const mockSwitch = jest.fn();
const mockShare = jest.fn();
const mockAddAlert = jest.fn();
const mockRemoveAlert = jest.fn();
jest.mock('@/lib/queries/useTreatmentRecords', () => ({
  useTreatmentRecordsList: () => mockList,
  useClientAlerts: () => mockAlerts,
  useAddClientAlert: () => ({ mutate: mockAddAlert, isPending: false }),
  useRemoveClientAlert: () => ({ mutate: mockRemoveAlert, isPending: false }),
  useTreatmentRecordsSwitchState: () => ({ data: { linked_venues: [{ venue_id: 'v-2', name: 'Sept 20 Hair' }] } }),
  useSwitchTreatmentRecords: () => ({ mutate: mockSwitch, isPending: false }),
  shareTreatmentPdf: (...args: unknown[]) => mockShare(...args),
}));

import { TreatmentRecordCard } from '@/components/bookings/TreatmentRecordCard';
import { TreatmentRecordsSection } from '@/components/clients/TreatmentRecordsSection';
import { ClientAlertsStrip } from '@/components/treatment-records/ClientAlertsStrip';
import { TreatmentRecordsSwitchCard } from '@/components/treatment-records/TreatmentRecordsSwitchCard';
import { ApiError } from '@/lib/api/client';
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

function summary(overrides: Partial<TreatmentRecordSummary> = {}): TreatmentRecordSummary {
  return {
    id: 'r-1',
    treated_at: '2026-10-22T13:00:00Z',
    created_at: '2026-10-22T13:32:00Z',
    service_item_id: 's-1',
    service_name: 'Lip filler',
    booking_id: 'b-1',
    practitioner_calendar_id: 'c-1',
    practitioner_name: 'Sam',
    author_name: 'Sam',
    author_venue_id: 'v-1',
    author_venue_name: null,
    last_edited_by_name: 'Sam',
    last_edited_at: '2026-10-22T13:32:00Z',
    version_count: 0,
    product_count: 1,
    photo_count: 0,
    first_photo_preview_url: null,
    ...overrides,
  };
}

/** The card's body is inside a collapsed card: open it by its title. */
async function expand(title = 'Treatment records') {
  await act(async () => {
    fireEvent.press(screen.getByText(title));
  });
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockSwitch.mockReset();
  mockShare.mockReset();
  mockAddAlert.mockReset();
  mockRemoveAlert.mockReset();
  mockToast.error.mockClear();
  mockList = { data: { records: [], linked: false } };
  mockAlerts = { data: [] };
});

describe('TreatmentRecordCard', () => {
  it('offers Add record on a visit with none, and opens a new record for this booking', async () => {
    const onNavigate = jest.fn();
    await render(<TreatmentRecordCard bookingId="b-1" guestId="g-1" onNavigate={onNavigate} />);
    expect(screen.getByText('No record yet')).toBeTruthy();
    await expand();
    expect(screen.getByText('No record for this visit yet')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add record'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/treatment-record/[id]',
      params: { id: 'new', guestId: 'g-1', bookingId: 'b-1' },
    });
    expect(onNavigate).toHaveBeenCalled();
  });

  it('names the record on the visit, with View record and Add another record', async () => {
    mockList = { data: { records: [summary()], linked: false } };
    await render(<TreatmentRecordCard bookingId="b-1" guestId="g-1" />);
    await expand();
    expect(screen.getByText('Record by Sam, 22 Oct 2026 at 14:32')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('View record'));
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith(expect.objectContaining({ params: expect.objectContaining({ id: 'r-1' }) }));
    expect(screen.getByText('Add another record')).toBeTruthy();
  });

  it('lists two or more records, each opening its own', async () => {
    mockList = { data: { records: [summary(), summary({ id: 'r-2', service_name: 'Botox' })], linked: false } };
    await render(<TreatmentRecordCard bookingId="b-1" guestId="g-1" />);
    await expand();
    // The card's header hint and its summary line both say so.
    expect(screen.getAllByText('2 records', { exact: true })).toHaveLength(2);
    await act(async () => {
      fireEvent.press(screen.getByText('22 Oct 2026: Botox'));
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith(expect.objectContaining({ params: expect.objectContaining({ id: 'r-2' }) }));
  });

  it('draws nothing when the person has no access, or a linked venue refuses', async () => {
    mockList = { data: null };
    const { toJSON } = await render(<TreatmentRecordCard bookingId="b-1" guestId="g-1" />);
    expect(toJSON()).toBeNull();
    mockList = { data: undefined, isLoading: true };
    const linked = await render(<TreatmentRecordCard bookingId="b-1" guestId="g-1" linked />);
    expect(linked.toJSON()).toBeNull();
  });
});

describe('ClientAlertsStrip', () => {
  it('shows the alerts on one line with Edit alerts', async () => {
    mockAlerts = {
      data: [
        { id: 'a-1', text: 'Allergic to lidocaine', created_by_name: 'Sam', created_at: '2026-10-01T10:00:00Z' },
        { id: 'a-2', text: 'Pregnant', created_by_name: 'Sam', created_at: '2026-10-02T10:00:00Z' },
      ],
    };
    await render(<ClientAlertsStrip guestId="g-1" />);
    expect(screen.getByLabelText('Alerts: Allergic to lidocaine; Pregnant')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Edit alerts'));
    });
    expect(screen.getByText('Add alert')).toBeTruthy();
  });

  it('says in the sheet when an alert cannot be added, where a toast would be hidden behind it', async () => {
    mockAlerts = { data: [{ id: 'a-1', text: 'Pregnant', created_by_name: 'Sam', created_at: '2026-10-02T10:00:00Z' }] };
    mockAddAlert.mockImplementation((_text: string, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new ApiError('A client has at most 10 alerts.', 400)),
    );
    await render(<ClientAlertsStrip guestId="g-1" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Edit alerts'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('For example: Allergic to lidocaine'), 'Allergic to latex');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add alert'));
    });
    expect(screen.getByText('A client has at most 10 alerts.')).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('keeps the sheet open after its last alert is removed', async () => {
    mockAlerts = { data: [{ id: 'a-1', text: 'Pregnant', created_by_name: 'Sam', created_at: '2026-10-02T10:00:00Z' }] };
    mockRemoveAlert.mockImplementation(() => {
      mockAlerts = { data: [] };
    });
    const view = await render(<ClientAlertsStrip guestId="g-1" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Edit alerts'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove Pregnant'));
    });
    await view.rerender(<ClientAlertsStrip guestId="g-1" />);
    expect(screen.queryByLabelText('Alerts: Pregnant')).toBeNull();
    expect(screen.getByText('No alerts.')).toBeTruthy();
  });

  it('shows nothing for a client with no alerts, or for someone without access', async () => {
    const none = await render(<ClientAlertsStrip guestId="g-1" />);
    expect(none.toJSON()).toBeNull();
    mockAlerts = { data: null };
    const refused = await render(<ClientAlertsStrip guestId="g-1" />);
    expect(refused.toJSON()).toBeNull();
  });
});

describe('TreatmentRecordsSection', () => {
  async function renderAs(access: ViewerAccess) {
    await render(
      <ViewerAccessProvider value={access}>
        <TreatmentRecordsSection guestId="g-1" />
      </ViewerAccessProvider>,
    );
    await expand();
  }

  it('lists the client’s records with Add record and Print all records', async () => {
    mockList = { data: { records: [summary()], linked: false } };
    mockShare.mockResolvedValue({ ok: true });
    await renderAs(FULL_VIEWER_ACCESS);
    expect(screen.getByText('22 Oct 2026: Lip filler')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Print all records'));
    });
    expect(mockShare).toHaveBeenCalledWith('tok', { guestId: 'g-1' });
    await act(async () => {
      fireEvent.press(screen.getByText('Add record'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treatment-record/[id]', params: { id: 'new', guestId: 'g-1' } });
  });

  it('offers no printing without "Can export client data"', async () => {
    mockList = { data: { records: [summary()], linked: false } };
    await renderAs({ ...FULL_VIEWER_ACCESS, canExportClients: false });
    expect(screen.queryByText('Print all records')).toBeNull();
  });

  it('says so when there are none', async () => {
    await renderAs(FULL_VIEWER_ACCESS);
    expect(screen.getByText('No treatment records yet.')).toBeTruthy();
  });
});

describe('TreatmentRecordsSwitchCard', () => {
  it('switches on only after the tick, naming the linked venues', async () => {
    const onChanged = jest.fn();
    mockSwitch.mockImplementation((_on: boolean, opts: { onSuccess: () => void }) => opts.onSuccess());
    await render(<TreatmentRecordsSwitchCard enabled={false} onChanged={onChanged} />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Treatment records'), 'valueChange', true);
    });
    expect(screen.getByText('Switch on treatment records?')).toBeTruthy();
    expect(screen.getByText(/Sept 20 Hair/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Switch on'));
    });
    expect(mockSwitch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('I understand that my business is responsible for the health information it keeps in ResNeo.'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on'));
    });
    expect(mockSwitch).toHaveBeenCalledWith(true, expect.anything());
    expect(onChanged).toHaveBeenCalled();
  });

  it('says in the sheet why switching on failed, where a toast would be hidden behind it', async () => {
    mockSwitch.mockImplementation((_on: boolean, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new ApiError('Your plan needs attention.', 409)),
    );
    await render(<TreatmentRecordsSwitchCard enabled={false} onChanged={jest.fn()} />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Treatment records'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('I understand that my business is responsible for the health information it keeps in ResNeo.'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on'));
    });
    expect(screen.getByText('Your plan needs attention.')).toBeTruthy();
    expect(screen.getByText('Switch on treatment records?')).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('closes the switch-off sheet before saying why it failed', async () => {
    mockSwitch.mockImplementation((_on: boolean, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new ApiError('Something went wrong.', 500)),
    );
    await render(<TreatmentRecordsSwitchCard enabled onChanged={jest.fn()} />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Treatment records'), 'valueChange', false);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(screen.queryByText(/Nothing is deleted/)).toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith('Something went wrong.');
  });

  it('asks before switching off, and says nothing is deleted', async () => {
    await render(<TreatmentRecordsSwitchCard enabled onChanged={jest.fn()} />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Treatment records'), 'valueChange', false);
    });
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockSwitch).toHaveBeenCalledWith(false, expect.anything());
  });
});
