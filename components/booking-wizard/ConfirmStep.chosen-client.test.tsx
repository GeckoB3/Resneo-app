/**
 * The chosen client on the review step (web roles plan A2, §5.6): a picked client's id goes as
 * `guest_id` on `POST /api/venue/bookings` and on `POST /api/booking/create-multi-service`, a picked
 * client's phone and email read "Hidden" for someone whose contacts are hidden, and the roles
 * refusals show the server's words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

const mockCreate = jest.fn();
const mockCreateMulti = jest.fn();
jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: mockCreate, isPending: false }),
}));
jest.mock('@/lib/queries/useCreateMultiServiceBooking', () => ({
  useCreateMultiServiceBooking: () => ({ mutate: mockCreateMulti, isPending: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/booking/find-just-created-booking', () => ({ findJustCreatedBooking: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { ApiError } from '@/lib/api/client';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const HIDDEN_VIEWER: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };
const FULL_VIEWER: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

const service: AppointmentServiceOption = {
  serviceId: 'svc-1',
  serviceName: 'Cut',
  durationMinutes: 30,
  pricePence: 2500,
  depositPence: null,
  paymentRequirement: 'none',
  practitionerId: 'prac-1',
  practitionerName: 'Pat',
  addonGroups: [],
  variants: [],
} as unknown as AppointmentServiceOption;

const slot: AppointmentSlot = {
  practitioner_id: 'prac-1',
  practitioner_name: 'Pat',
  service_id: 'svc-1',
  service_name: 'Cut',
  start_time: '10:00',
  duration_minutes: 30,
  price_pence: 2500,
};

function segment(serviceId: string, startTime: string): MultiServiceSegment {
  return {
    serviceId,
    serviceName: serviceId,
    practitionerId: 'prac-1',
    practitionerName: 'Pat',
    startTime,
    durationMinutes: 30,
    naturalDurationMinutes: 30,
    bufferMinutes: 0,
    pricePence: 2500,
  } as MultiServiceSegment;
}

const picked: GuestDetails = { first_name: 'Ana', last_name: 'Lopez', phone: '', email: '', guest_id: 'g-1' };

async function renderStep(
  guest: GuestDetails,
  access: ViewerAccess = FULL_VIEWER,
  extra: Partial<React.ComponentProps<typeof ConfirmStep>> = {},
) {
  await render(
    <ViewerAccessProvider value={access}>
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={guest}
        source="phone"
        venueId="venue-1"
        onSuccess={jest.fn()}
        {...extra}
      />
    </ViewerAccessProvider>,
  );
}

async function create(label = 'Create booking') {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreateMulti.mockReset();
});

describe('guest_id on the create', () => {
  it('sends the picked client as guest_id, with returning_guest for the metrics', async () => {
    await renderStep(picked, FULL_VIEWER, { returningGuest: true });
    await create();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const body = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).toMatchObject({ guest_id: 'g-1', returning_guest: true, first_name: 'Ana', last_name: 'Lopez' });
    // Nothing typed: the server fills the client's stored phone and email from guest_id.
    expect(body.phone || undefined).toBeUndefined();
    expect(body.email).toBeUndefined();
  });

  it('sends no guest_id for a new client', async () => {
    await renderStep({ first_name: 'New', last_name: 'Client', phone: '', email: 'new@example.com' });
    await create();
    const body = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('guest_id');
    expect(body.email).toBe('new@example.com');
  });

  it('sends guest_id on a multi-service visit', async () => {
    await renderStep(picked, FULL_VIEWER, {
      multiServiceSegments: [segment('svc-1', '10:00'), segment('svc-2', '10:30')],
    });
    await create('Create visit');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateMulti).toHaveBeenCalledTimes(1);
    expect(mockCreateMulti.mock.calls[0]![0]).toMatchObject({
      venue_id: 'venue-1',
      first_name: 'Ana',
      last_name: 'Lopez',
      guest_id: 'g-1',
      source: 'phone',
    });
  });
});

describe('the review for someone whose client contacts are hidden', () => {
  it('shows "Hidden" for a picked client', async () => {
    await renderStep(picked, HIDDEN_VIEWER);
    expect(screen.getByLabelText('Phone: Hidden')).toBeTruthy();
    expect(screen.getByLabelText('Email: Hidden')).toBeTruthy();
  });

  it('shows what they typed for a new client', async () => {
    await renderStep({ first_name: 'New', last_name: 'Client', phone: '', email: 'new@example.com' }, HIDDEN_VIEWER);
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('new@example.com')).toBeTruthy();
  });
});

describe('the roles refusals', () => {
  function refuseWith(error: ApiError) {
    mockCreate.mockImplementation((_payload: unknown, options: { onError: (e: unknown) => void }) =>
      options.onError(error),
    );
  }

  it('shows the server words when typed details belong to another client', async () => {
    refuseWith(
      new ApiError('These details belong to another client. Search by name, or ask an admin.', 409, {
        error: 'These details belong to another client. Search by name, or ask an admin.',
        code: 'CONTACT_BELONGS_TO_OTHER_CLIENT',
      }),
    );
    await renderStep({ first_name: 'New', last_name: 'Client', phone: '', email: 'taken@example.com' }, HIDDEN_VIEWER);
    await create();
    expect(screen.getByText('These details belong to another client. Search by name, or ask an admin.')).toBeTruthy();
  });

  it('shows the View only refusal', async () => {
    refuseWith(
      new ApiError('You can see this booking, but you can only change bookings on your own calendar.', 403, {
        error: 'You can see this booking, but you can only change bookings on your own calendar.',
        code: 'DIARY_VIEW_ONLY',
      }),
    );
    await renderStep(picked);
    await create();
    expect(
      screen.getByText('You can see this booking, but you can only change bookings on your own calendar.'),
    ).toBeTruthy();
  });

  it('shows the copy deck words when the refusal carries no sentence', async () => {
    refuseWith(new ApiError('Request failed (409)', 409, { error: '', code: 'CONTACT_BELONGS_TO_OTHER_CLIENT' }));
    await renderStep(picked);
    await create();
    expect(screen.getByText('These details belong to another client. Search by name, or ask an admin.')).toBeTruthy();
  });

  it("shows the server's words for a client that no longer exists", async () => {
    refuseWith(
      new ApiError("We couldn't find that client. Search for them again.", 404, {
        error: "We couldn't find that client. Search for them again.",
        code: 'NOT_FOUND',
      }),
    );
    await renderStep(picked);
    await create();
    expect(screen.getByText("We couldn't find that client. Search for them again.")).toBeTruthy();
  });
});
