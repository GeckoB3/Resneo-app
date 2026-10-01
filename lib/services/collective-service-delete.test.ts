/**
 * R44-1 (web QA D-9): a delete that will be refused must not take the service
 * off the collective page first.
 */
import { ApiError } from '@/lib/api/client';
import {
  deletedHalfwayMessage,
  deleteServiceOnCollectivePage,
} from '@/lib/services/collective-service-delete';

function stepsWith(overrides: {
  check?: () => Promise<unknown>;
  takeOff?: () => Promise<unknown>;
  remove?: () => Promise<unknown>;
}) {
  const calls: string[] = [];
  const run = (name: string, fn: () => Promise<unknown>) => () => {
    calls.push(name);
    return fn();
  };
  return {
    calls,
    steps: {
      checkDelete: run(
        'check',
        overrides.check ?? (() => Promise.resolve({ dry_run: true, can_delete: true })),
      ),
      takeOffPage: run('takeOff', overrides.takeOff ?? (() => Promise.resolve({}))),
      deleteService: run('delete', overrides.remove ?? (() => Promise.resolve({ success: true }))),
    },
  };
}

const UPCOMING = 'Cut has 3 upcoming bookings. Move or cancel them before deleting it.';

describe('deleteServiceOnCollectivePage', () => {
  it('asks, takes the service off the page, then deletes, in that order', async () => {
    const { steps, calls } = stepsWith({});
    await expect(deleteServiceOnCollectivePage(steps)).resolves.toEqual({ status: 'deleted' });
    expect(calls).toEqual(['check', 'takeOff', 'delete']);
  });

  it('changes nothing when the server would refuse the delete', async () => {
    const { steps, calls } = stepsWith({
      check: () => Promise.reject(new ApiError(UPCOMING, 409, { error: UPCOMING, booking_count: 3 })),
    });
    await expect(deleteServiceOnCollectivePage(steps)).resolves.toMatchObject({
      status: 'refused',
      message: UPCOMING,
    });
    // The whole point: the service is still on the page.
    expect(calls).toEqual(['check']);
  });

  it('changes nothing when the check itself cannot be made', async () => {
    const { steps, calls } = stepsWith({ check: () => Promise.reject(new Error('Network down')) });
    await expect(deleteServiceOnCollectivePage(steps)).resolves.toMatchObject({
      status: 'refused',
      message: 'We could not check whether this service can be deleted. Please try again.',
    });
    expect(calls).toEqual(['check']);
  });

  it('does not delete when the service cannot come off the page', async () => {
    const { steps, calls } = stepsWith({
      takeOff: () => Promise.reject(new ApiError('Only the host can do that.', 403)),
    });
    await expect(deleteServiceOnCollectivePage(steps)).resolves.toMatchObject({
      status: 'refused',
      message: 'Only the host can do that.',
    });
    expect(calls).toEqual(['check', 'takeOff']);
  });

  it('says so when the delete fails after the service came off the page', async () => {
    const { steps, calls } = stepsWith({
      remove: () => Promise.reject(new ApiError('Failed to delete service', 500)),
    });
    await expect(deleteServiceOnCollectivePage(steps)).resolves.toMatchObject({
      status: 'parked_not_deleted',
      reason: 'Failed to delete service',
    });
    expect(calls).toEqual(['check', 'takeOff', 'delete']);
  });

  describe('against a web release that ignores dry_run', () => {
    it('carries on when the engine refused to delete a service still on the page', async () => {
      // The real delete ran: its own checks passed, and the engine said "on the page".
      const { steps, calls } = stepsWith({
        check: () =>
          Promise.reject(
            new ApiError('Take this service off the page first.', 409, {
              error: 'Take this service off the page first.',
              code: 'COLLECTIVE_OFFERED_SERVICE',
            }),
          ),
      });
      await expect(deleteServiceOnCollectivePage(steps)).resolves.toEqual({ status: 'deleted' });
      expect(calls).toEqual(['check', 'takeOff', 'delete']);
    });

    it('stops when that release refuses for upcoming bookings', async () => {
      const { steps, calls } = stepsWith({
        check: () => Promise.reject(new ApiError(UPCOMING, 409, { error: UPCOMING })),
      });
      await expect(deleteServiceOnCollectivePage(steps)).resolves.toMatchObject({
        status: 'refused',
        message: UPCOMING,
      });
      expect(calls).toEqual(['check']);
    });

    it('treats a plain success as already deleted and asks for nothing more', async () => {
      const { steps, calls } = stepsWith({ check: () => Promise.resolve({ success: true }) });
      await expect(deleteServiceOnCollectivePage(steps)).resolves.toEqual({ status: 'deleted' });
      expect(calls).toEqual(['check']);
    });
  });
});

describe('deletedHalfwayMessage', () => {
  it('says what happened and what to do, in the web wording', () => {
    expect(deletedHalfwayMessage('Cut', 'Aura Collective', 'Failed to delete service')).toBe(
      'Cut has been taken off the Aura Collective page, but it was not deleted. Failed to delete service. It is still in your list as a parked service. To keep taking bookings for it, put it back on the page.',
    );
  });

  it('keeps a reason that already ends its sentence, and copes with no collective name', () => {
    expect(deletedHalfwayMessage('Cut', null, 'Please try again.')).toBe(
      'Cut has been taken off the collective page, but it was not deleted. Please try again. It is still in your list as a parked service. To keep taking bookings for it, put it back on the page.',
    );
  });

  it('carries no em-dash', () => {
    expect(deletedHalfwayMessage('Cut', 'Aura', 'No.')).not.toContain('—');
  });
});
