import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { MultiServiceReviewStep } from '@/components/booking-wizard/MultiServiceReviewStep';
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import type { AppointmentCatalogPractitioner } from '@/types/appointment-catalog';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const segments: MultiServiceSegment[] = [
  {
    serviceId: 'a',
    serviceName: 'Cut',
    practitionerId: 'prac-1',
    practitionerName: 'Pat',
    startTime: '09:00',
    durationMinutes: 30,
    bufferMinutes: 0,
    pricePence: 2500,
  },
  {
    serviceId: 'b',
    serviceName: 'Colour',
    practitionerId: 'prac-1',
    practitionerName: 'Pat',
    startTime: '09:30',
    durationMinutes: 60,
    bufferMinutes: 0,
    pricePence: 5000,
  },
];

const visitPractitioner: AppointmentCatalogPractitioner = {
  id: 'prac-1',
  name: 'Pat',
  services: [
    { id: 'a', name: 'Cut', duration_minutes: 30, buffer_minutes: 0, price_pence: 2500, deposit_pence: null },
    { id: 'c', name: 'Blow-dry', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null },
  ],
};

describe('MultiServiceReviewStep', () => {
  it('lists each segment with its computed start time', async () => {
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onAddService={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.getByText('Colour')).toBeTruthy();
    // First segment starts at 9:00, second chained to 9:30.
    expect(screen.getByText(/9:00am–9:30am/)).toBeTruthy();
    expect(screen.getByText(/9:30am–10:30am/)).toBeTruthy();
  });

  it('opens the service list and appends a chosen service', async () => {
    const onAddService = jest.fn();
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onAddService={onAddService}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await press(() => screen.getByText('+ Add another service'));
    // The practitioner's service appears in the list.
    await press(() => screen.getByText('Blow-dry'));
    expect(onAddService).toHaveBeenCalledWith('c');
  });

  it('fires onRemoveSegment for an extra segment', async () => {
    const onRemoveSegment = jest.fn();
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onAddService={jest.fn()}
        onRemoveSegment={onRemoveSegment}
        onContinue={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await press(() => screen.getByLabelText('Remove Colour'));
    expect(onRemoveSegment).toHaveBeenCalledWith(1);
  });

  it('continues to details', async () => {
    const onContinue = jest.fn();
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onAddService={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={onContinue}
        onBack={jest.fn()}
      />,
    );
    await press(() => screen.getByText('Continue to details'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('hides the remove control and add-service toggle limits at the cap', async () => {
    const fourSegments: MultiServiceSegment[] = [0, 1, 2, 3].map((i) => ({
      serviceId: `s${i}`,
      serviceName: `Service ${i}`,
      practitionerId: 'prac-1',
      practitionerName: 'Pat',
      startTime: '09:00',
      durationMinutes: 30,
      bufferMinutes: 0,
      pricePence: 1000,
    }));
    await render(
      <MultiServiceReviewStep
        segments={fourSegments}
        visitPractitioner={visitPractitioner}
        onAddService={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    // At 4 segments the "add another" affordance is replaced by the cap hint.
    expect(screen.queryByText('+ Add another service')).toBeNull();
    expect(screen.getByText(/up to 4 services/)).toBeTruthy();
  });
});
