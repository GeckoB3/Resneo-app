import * as planConstants from '@/components/plan/planConstants';
import { APPOINTMENTS_PLAN_DETAILS } from '@/components/plan/planConstants';

/**
 * Team logins are unlimited on every plan; only bookable calendars are capped (web roles plan
 * UR7, A0b). The app no longer has a seat cap to mirror, and every plan card says so.
 */
describe('team logins', () => {
  it('have no per-plan cap in the app', () => {
    expect('planStaffLimit' in planConstants).toBe(false);
  });

  it('read as unlimited on every Appointments plan', () => {
    expect(APPOINTMENTS_PLAN_DETAILS.light.team).toBe('Unlimited team logins');
    expect(APPOINTMENTS_PLAN_DETAILS.plus.team).toBe('Unlimited team logins');
    expect(APPOINTMENTS_PLAN_DETAILS.appointments.team).toBe('Unlimited team logins');
  });
});
