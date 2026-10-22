/**
 * The chosen client in the booking wizard (web roles plan A2, §5.6): picking a client from search
 * keeps their id (sent as `guest_id`), editing a name, phone or email afterwards drops it, and for
 * someone whose "Can see client phone numbers and emails" is off the search matches names only,
 * the results show no phone, and a picked client's phone and email read "Hidden" (a new client's
 * are typed as usual).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React, { useState } from 'react';

import type { GuestListItem } from '@/types/guest-list';

const mockGuests: GuestListItem[] = [
  {
    id: 'g-1',
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@example.com',
    phone: '+447700900123',
    tags: [],
    visit_count: 3,
    no_show_count: 0,
    last_visit_date: null,
    next_booking_date: null,
    next_booking_time: null,
    total_bookings: 3,
    upcoming_booking_count: 0,
  },
];
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: mockGuests }, isFetching: false }),
}));

import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { ViewerAccess } from '@/lib/roles/roles';

const HIDDEN_VIEWER: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };
const FULL_VIEWER: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };
const EMPTY: GuestDetails = { first_name: '', last_name: '', phone: '', email: '' };

let latest: GuestDetails = EMPTY;
const onContinue = jest.fn();

function Harness({ initial = EMPTY }: { initial?: GuestDetails }) {
  const [value, setValue] = useState<GuestDetails>(initial);
  return (
    <GuestDetailsStep
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
      onContinue={onContinue}
    />
  );
}

async function renderAs(access: ViewerAccess, initial?: GuestDetails) {
  await render(
    <ViewerAccessProvider value={access}>
      <Harness initial={initial} />
    </ViewerAccessProvider>,
  );
}

async function search(placeholder: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText(placeholder), text);
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  latest = EMPTY;
  onContinue.mockClear();
  // A hidden viewer's search results carry no phone or email (the server sends null).
  mockGuests[0] = { ...mockGuests[0]!, phone: '+447700900123', email: 'ana@example.com' };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('someone who can see client contacts', () => {
  it('keeps the picked client id, and shows the phone in the results', async () => {
    await renderAs(FULL_VIEWER);
    await search('Search name or phone', 'Ana');
    expect(screen.getByText('+447700900123 · 3 visits')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Ana Lopez'));
    });
    expect(latest).toMatchObject({ first_name: 'Ana', last_name: 'Lopez', guest_id: 'g-1' });
    // The contact inputs, not "Hidden".
    expect(screen.queryByText('Your business has hidden client phone numbers and emails for you.')).toBeNull();
    expect(screen.getByDisplayValue('ana@example.com')).toBeTruthy();
  });

  it('drops the picked client when a name is edited', async () => {
    await renderAs(FULL_VIEWER, { first_name: 'Ana', last_name: 'Lopez', phone: '', email: 'ana@example.com', guest_id: 'g-1' });
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Ana'), 'Anna');
    });
    expect(latest.guest_id).toBeUndefined();
    expect(latest.first_name).toBe('Anna');
    expect(latest.email).toBe('ana@example.com');
  });

  it('drops the picked client when the email is edited', async () => {
    await renderAs(FULL_VIEWER, { first_name: 'Ana', last_name: 'Lopez', phone: '', email: 'ana@example.com', guest_id: 'g-1' });
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('ana@example.com'), 'ana@new.com');
    });
    expect(latest.guest_id).toBeUndefined();
  });
});

describe('someone whose client contacts are hidden', () => {
  beforeEach(() => {
    mockGuests[0] = { ...mockGuests[0]!, phone: null, email: null };
  });

  it('searches by name only, and the results show no phone', async () => {
    await renderAs(HIDDEN_VIEWER);
    expect(screen.queryByPlaceholderText('Search name or phone')).toBeNull();
    await search('Search by name', 'Ana');
    expect(screen.getByText('Ana Lopez')).toBeTruthy();
    expect(screen.getByText('3 visits')).toBeTruthy();
  });

  it('shows "Hidden" for a picked client, and continues without a phone or email', async () => {
    await renderAs(HIDDEN_VIEWER);
    await search('Search by name', 'Ana');
    await act(async () => {
      fireEvent.press(screen.getByText('Ana Lopez'));
    });
    expect(latest).toMatchObject({ first_name: 'Ana', last_name: 'Lopez', phone: '', email: '', guest_id: 'g-1' });
    expect(screen.getAllByDisplayValue('Hidden')).toHaveLength(2);
    expect(screen.getAllByText('Your business has hidden client phone numbers and emails for you.')).toHaveLength(2);
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('types a new client as usual', async () => {
    await renderAs(HIDDEN_VIEWER);
    expect(screen.queryByDisplayValue('Hidden')).toBeNull();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'new@example.com');
    });
    expect(latest.email).toBe('new@example.com');
    expect(latest.guest_id).toBeUndefined();
  });

  it('leaving a picked client by editing the name gives empty contact inputs back', async () => {
    await renderAs(HIDDEN_VIEWER, { first_name: 'Ana', last_name: 'Lopez', phone: '', email: '', guest_id: 'g-1' });
    expect(screen.getAllByDisplayValue('Hidden')).toHaveLength(2);
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Ana'), 'Anna');
    });
    expect(latest).toMatchObject({ first_name: 'Anna', phone: '', email: '' });
    expect(latest.guest_id).toBeUndefined();
    expect(screen.queryByDisplayValue('Hidden')).toBeNull();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  });
});
