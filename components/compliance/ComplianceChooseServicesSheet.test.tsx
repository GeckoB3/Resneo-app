/**
 * ComplianceChooseServicesSheet: "Choose services" for one form (spec 2026-11-07 §13, web
 * `ChooseServicesDialog`).
 *
 * The ticks start from the form's saved requirements; Select all and Clear act on the services;
 * the terms box shows only while something is newly ticked; Save posts one add per newly ticked
 * row and one delete per unticked one, through the Requirements routes; a failure is named in the
 * sheet, which stays open; and just after a create the title says the form is ready.
 */
import type { ComponentProps } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { ComplianceChooseServicesSheet } from '@/components/compliance/ComplianceChooseServicesSheet';
import type { ComplianceRequirementRow } from '@/lib/queries/useComplianceRequirements';
import type { ManagedService } from '@/types/services-manage';

jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockServices: { rows: Partial<ManagedService>[]; loading: boolean } = { rows: [], loading: false };
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    data: mockServices.loading ? undefined : { services: mockServices.rows },
    isLoading: mockServices.loading,
  }),
}));

const mockReqs: { rows: ComplianceRequirementRow[] } = { rows: [] };
const mockAdd = jest.fn();
const mockDelete = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/lib/queries/useComplianceRequirements', () => ({
  ...jest.requireActual('@/lib/queries/useComplianceRequirements'),
  useAllComplianceRequirements: () => ({
    data: { requirements: mockReqs.rows },
    isLoading: false,
    refetch: mockRefetch,
  }),
  useAddComplianceRequirement: () => ({ mutateAsync: mockAdd, isPending: false }),
  useDeleteComplianceRequirement: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

const req = (id: string, typeId: string, serviceId: string | null): ComplianceRequirementRow => ({
  id,
  scope: serviceId ? 'service' : 'venue',
  compliance_type_id: typeId,
  enforcement: 'warn_staff',
  lock_period_hours: null,
  online_collection: 'confirmation_link',
  appointment_service_id: null,
  service_item_id: serviceId,
  compliance_type_name: typeId,
  compliance_type_category: 'test',
  compliance_type_is_active: true,
});

const FORM = { id: 'patch', name: 'PPD Patch Test', clientOnline: true };

beforeEach(() => {
  mockServices.loading = false;
  mockServices.rows = [
    { id: 'cut', name: 'Cut' },
    { id: 'colour', name: 'Colour', is_active: true },
    { id: 'old', name: 'Old perm', is_active: false },
  ];
  // The form is asked for on Cut; another form is asked for on Colour and on every booking.
  mockReqs.rows = [req('r-cut', 'patch', 'cut'), req('r-other', 'consent', 'colour'), req('r-all', 'consent', null)];
  for (const fn of [mockAdd, mockDelete, mockRefetch]) fn.mockReset();
  mockAdd.mockResolvedValue({ requirement: {} });
  mockDelete.mockResolvedValue({ success: true });
  mockRefetch.mockResolvedValue({});
});

async function open(props: Partial<ComponentProps<typeof ComplianceChooseServicesSheet>> = {}) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  await render(
    <ComplianceChooseServicesSheet visible form={FORM} onClose={onClose} onSaved={onSaved} {...props} />,
  );
  return { onClose, onSaved };
}

const tick = (name: string) => screen.getByRole('checkbox', { name });
const save = () => screen.getByRole('button', { name: 'Save' });

describe('ComplianceChooseServicesSheet: what it shows', () => {
  it('ticks where this form is asked for now, and lists active services only', async () => {
    await open();
    expect(screen.getByText('Which services ask for PPD Patch Test?')).toBeTruthy();
    expect(
      screen.getByText('Tick where this form is asked for. Unticking stops it being asked for there.'),
    ).toBeTruthy();
    expect(tick('All bookings')).not.toBeChecked();
    expect(screen.getByText('Every appointment booking asks for it.')).toBeTruthy();
    expect(screen.getByText('Services')).toBeTruthy();
    expect(tick('Cut')).toBeChecked();
    // Another form's rows are not this form's.
    expect(tick('Colour')).not.toBeChecked();
    expect(screen.queryByText('Old perm')).toBeNull();
    // Nothing changed yet: no terms, and nothing to save.
    expect(screen.queryByTestId('choose-services-terms')).toBeNull();
    expect(save()).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('ticks All bookings when the form is asked for on every booking', async () => {
    await open({ form: { id: 'consent', name: 'Consent', clientOnline: false } });
    expect(tick('All bookings')).toBeChecked();
    expect(tick('Colour')).toBeChecked();
    expect(tick('Cut')).not.toBeChecked();
  });

  it('says it is loading', async () => {
    mockServices.loading = true;
    await open();
    expect(screen.getByText('Loading services…')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'All bookings' })).toBeNull();
    expect(save()).toBeDisabled();
  });

  it('says what to do when there are no services', async () => {
    mockServices.rows = [];
    await open();
    expect(screen.getByText('No services yet. Add services first, then come back.')).toBeTruthy();
    expect(screen.queryByText('Select all')).toBeNull();
    expect(tick('All bookings')).toBeTruthy();
  });

  it('says the form is ready just after it was created, and Not now closes', async () => {
    const { onClose } = await open({ justCreated: true });
    expect(screen.getByText('PPD Patch Test is ready. Which services need it?')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
    await fireEvent.press(screen.getByText('Not now'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe('ComplianceChooseServicesSheet: Select all and Clear', () => {
  it('ticks every service, then none, leaving All bookings alone', async () => {
    await open();
    await fireEvent.press(screen.getByText('Select all'));
    expect(tick('Cut')).toBeChecked();
    expect(tick('Colour')).toBeChecked();
    expect(tick('All bookings')).not.toBeChecked();

    await fireEvent.press(screen.getByText('Clear'));
    expect(tick('Cut')).not.toBeChecked();
    expect(tick('Colour')).not.toBeChecked();
    // Clearing removes Cut: something to save, but nothing new, so no terms.
    expect(screen.queryByTestId('choose-services-terms')).toBeNull();
    expect(save()).not.toBeDisabled();
  });
});

describe('ComplianceChooseServicesSheet: the terms for what is added', () => {
  it('shows only while something is newly ticked', async () => {
    await open();
    await fireEvent.press(tick('Cut'));
    expect(screen.queryByTestId('choose-services-terms')).toBeNull();

    await fireEvent.press(tick('Colour'));
    const terms = within(screen.getByTestId('choose-services-terms'));
    expect(terms.getByText('For the services you add')).toBeTruthy();
    expect(terms.getByText('When unmet')).toBeTruthy();
    expect(terms.getByText('Warn staff')).toBeTruthy();
    expect(
      terms.getByText(/^The booking still goes through\. Your team sees an outstanding-form flag/),
    ).toBeTruthy();
    expect(terms.getByText('Lead time (optional)')).toBeTruthy();
    expect(terms.getByText('hours before the appointment')).toBeTruthy();
    expect(terms.getByPlaceholderText('None')).toBeTruthy();
    expect(terms.getByText('Online booking')).toBeTruthy();
    expect(terms.getByText('Email a link in the confirmation')).toBeTruthy();
    // The form is already asked for on Cut, which keeps its own terms.
    expect(
      terms.getByText('Services that already ask for it keep their own settings. Change them in Requirements.'),
    ).toBeTruthy();

    await fireEvent.press(tick('Colour'));
    expect(screen.queryByTestId('choose-services-terms')).toBeNull();
  });

  it('asks nothing about online booking for a form clients cannot fill in online', async () => {
    await open({ form: { ...FORM, clientOnline: false } });
    await fireEvent.press(tick('Colour'));
    expect(screen.getByTestId('choose-services-terms')).toBeTruthy();
    expect(screen.queryByText('Online booking')).toBeNull();
  });

  it('has no note when the form is asked for nowhere yet', async () => {
    mockReqs.rows = [];
    await open();
    await fireEvent.press(tick('Colour'));
    expect(screen.getByTestId('choose-services-terms')).toBeTruthy();
    expect(screen.queryByText(/^Services that already ask for it/)).toBeNull();
  });
});

describe('ComplianceChooseServicesSheet: saving', () => {
  it('adds what is newly ticked and removes what is unticked, one request each', async () => {
    const { onClose, onSaved } = await open();
    await fireEvent.press(tick('All bookings'));
    await fireEvent.press(tick('Colour'));
    await fireEvent.press(tick('Cut'));
    await fireEvent.press(screen.getByText('Block online booking'));
    await fireEvent.changeText(screen.getByPlaceholderText('None'), '48');
    await fireEvent.press(screen.getByText('Show in the booking flow'));
    await fireEvent.press(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const terms = {
      compliance_type_id: 'patch',
      enforcement: 'block_online',
      online_collection: 'inline',
      lock_period_hours: 48,
    };
    expect(mockAdd.mock.calls.map((c) => c[0])).toEqual([
      { scope: 'venue', ...terms },
      { scope: 'service', service_id: 'colour', ...terms },
    ]);
    expect(mockDelete.mock.calls.map((c) => c[0])).toEqual(['r-cut']);
    expect(mockRefetch).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('sends the defaults, and none for online booking when clients cannot fill the form in online', async () => {
    const { onClose } = await open({ form: { ...FORM, clientOnline: false } });
    await fireEvent.press(tick('Colour'));
    await fireEvent.press(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockAdd.mock.calls.map((c) => c[0])).toEqual([
      {
        scope: 'service',
        service_id: 'colour',
        compliance_type_id: 'patch',
        enforcement: 'warn_staff',
        online_collection: 'none',
        lock_period_hours: null,
      },
    ]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('removes the All bookings requirement when it is unticked', async () => {
    const { onClose } = await open({ form: { id: 'consent', name: 'Consent', clientOnline: true } });
    await fireEvent.press(tick('All bookings'));
    await fireEvent.press(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockDelete.mock.calls.map((c) => c[0])).toEqual(['r-all']);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('names what failed, keeps the sheet open, and starts again from what is saved', async () => {
    mockAdd.mockImplementation((body: { service_id?: string }) =>
      body.service_id === 'colour' ? Promise.reject(new Error('nope')) : Promise.resolve({}),
    );
    mockDelete.mockRejectedValue(new Error('nope'));
    const { onClose, onSaved } = await open();
    await fireEvent.press(tick('All bookings'));
    await fireEvent.press(tick('Colour'));
    await fireEvent.press(tick('Cut'));
    await fireEvent.press(save());

    expect(await screen.findByTestId('choose-services-error')).toHaveTextContent(
      'Some changes could not be saved: Colour, Cut. Try again.',
    );
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    // The list still refreshes its counts for what did save.
    expect(onSaved).toHaveBeenCalledTimes(1);
    // The ticks go back to the saved rows (unchanged in this mock), so nothing is left to save.
    expect(tick('Cut')).toBeChecked();
    expect(tick('Colour')).not.toBeChecked();
    expect(save()).toBeDisabled();
  });

  it('says All bookings when that is what failed', async () => {
    mockAdd.mockRejectedValue(new Error('nope'));
    await open();
    await fireEvent.press(tick('All bookings'));
    await fireEvent.press(save());
    expect(await screen.findByTestId('choose-services-error')).toHaveTextContent(
      'Some changes could not be saved: All bookings. Try again.',
    );
  });
});
