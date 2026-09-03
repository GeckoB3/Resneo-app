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
    naturalDurationMinutes: 30,
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
    naturalDurationMinutes: 60,
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
        onChangeServices={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.getByText('Colour')).toBeTruthy();
    // First segment starts at 9:00, second chained to 9:30.
    expect(screen.getByText(/9:00am–9:30am/)).toBeTruthy();
    expect(screen.getByText(/9:30am–10:30am/)).toBeTruthy();
  });

  it('offers "Change services" back to the picker instead of appending here', async () => {
    const onChangeServices = jest.fn();
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onChangeServices={onChangeServices}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
      />,
    );
    // The services are chosen first and the times found for the whole visit, so
    // there is no "add another" here — appending would offer a start the chain
    // may not fit (web 2026-09-02).
    expect(screen.queryByText('+ Add another service')).toBeNull();
    await press(() => screen.getByText('Change services'));
    expect(onChangeServices).toHaveBeenCalledTimes(1);
  });

  it('fires onRemoveSegment for an extra segment', async () => {
    const onRemoveSegment = jest.fn();
    await render(
      <MultiServiceReviewStep
        segments={segments}
        visitPractitioner={visitPractitioner}
        onChangeServices={jest.fn()}
        onRemoveSegment={onRemoveSegment}
        onContinue={jest.fn()}
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
        onChangeServices={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={onContinue}
      />,
    );
    await press(() => screen.getByText('Continue to details'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('states the visit cap', async () => {
    const fourSegments: MultiServiceSegment[] = [0, 1, 2, 3].map((i) => ({
      serviceId: `s${i}`,
      serviceName: `Service ${i}`,
      practitionerId: 'prac-1',
      practitionerName: 'Pat',
      startTime: '09:00',
      durationMinutes: 30,
      naturalDurationMinutes: 30,
      bufferMinutes: 0,
      pricePence: 1000,
    }));
    await render(
      <MultiServiceReviewStep
        segments={fourSegments}
        visitPractitioner={visitPractitioner}
        onChangeServices={jest.fn()}
        onRemoveSegment={jest.fn()}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByText(/Up to 4 services in one visit/)).toBeTruthy();
  });
});
