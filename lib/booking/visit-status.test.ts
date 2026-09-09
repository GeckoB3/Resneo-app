import {
  isServiceLevelStatus,
  statusChangeCascadesAcrossVisit,
  visitLifecycleStatus,
} from '@/lib/booking/visit-status';

describe('statusChangeCascadesAcrossVisit', () => {
  it('cascades visit-wide facts', () => {
    expect(statusChangeCascadesAcrossVisit('Booked', 'Confirmed')).toBe(true);
    expect(statusChangeCascadesAcrossVisit('Confirmed', 'Booked')).toBe(true);
    expect(statusChangeCascadesAcrossVisit('Booked', 'Cancelled')).toBe(true);
    expect(statusChangeCascadesAcrossVisit('Confirmed', 'No-Show')).toBe(true);
  });

  it('keeps Start, Complete and their undos to one service', () => {
    expect(statusChangeCascadesAcrossVisit('Confirmed', 'Seated')).toBe(false);
    expect(statusChangeCascadesAcrossVisit('Seated', 'Completed')).toBe(false);
    expect(statusChangeCascadesAcrossVisit('Seated', 'Booked')).toBe(false);
    expect(statusChangeCascadesAcrossVisit('Completed', 'Seated')).toBe(false);
  });

  it('names the service-level statuses', () => {
    expect(isServiceLevelStatus('Seated')).toBe(true);
    expect(isServiceLevelStatus('Completed')).toBe(true);
    expect(isServiceLevelStatus('Confirmed')).toBe(false);
    expect(isServiceLevelStatus(null)).toBe(false);
  });
});

describe('visitLifecycleStatus', () => {
  it('is Completed only when every live service is', () => {
    expect(visitLifecycleStatus([{ status: 'Completed' }, { status: 'Completed' }])).toBe('Completed');
    expect(
      visitLifecycleStatus([{ status: 'Completed' }, { status: 'Cancelled' }]),
    ).toBe('Completed');
  });

  it('is Seated as soon as any service is in progress', () => {
    expect(visitLifecycleStatus([{ status: 'Completed' }, { status: 'Seated' }])).toBe('Seated');
    expect(visitLifecycleStatus([{ status: 'Seated' }, { status: 'Booked' }])).toBe('Seated');
  });

  it('is otherwise the earliest stage, ignoring finished services', () => {
    expect(visitLifecycleStatus([{ status: 'Confirmed' }, { status: 'Booked' }])).toBe('Booked');
    expect(visitLifecycleStatus([{ status: 'Completed' }, { status: 'Confirmed' }])).toBe('Confirmed');
    expect(visitLifecycleStatus([{ status: 'Pending' }, { status: 'Confirmed' }])).toBe('Pending');
  });

  it('falls back to the anchor when nothing is live', () => {
    expect(visitLifecycleStatus([{ status: 'Cancelled' }, { status: 'No-Show' }], 'Cancelled')).toBe(
      'Cancelled',
    );
    expect(visitLifecycleStatus([{ status: 'Cancelled' }])).toBe('Cancelled');
  });
});
