/**
 * Choose services for a form: the same cases as the web `choose-services.test.ts`, so the app
 * sheet and the web dialog plan the same writes.
 */
import { currentChoice, planServiceChanges, type RequirementListRow } from '@/lib/compliance/choose-services';

const row = (id: string, typeId: string, serviceId: string | null, scope = serviceId ? 'service' : 'venue'): RequirementListRow => ({
  id,
  scope,
  compliance_type_id: typeId,
  service_item_id: serviceId,
  appointment_service_id: null,
});

describe('choose services for a form', () => {
  const rows = [row('r-cut', 'patch', 'cut'), row('r-colour', 'patch', 'colour'), row('r-other', 'consent', 'cut'), row('r-all', 'consent', null)];

  it('reads where the form is asked for, ignoring other forms', () => {
    const now = currentChoice(rows, 'patch');
    expect(now.allBookings).toBe(false);
    expect([...now.serviceIds].sort()).toEqual(['colour', 'cut']);
    expect(currentChoice(rows, 'consent')).toMatchObject({ allBookings: true, venueRequirementId: 'r-all' });
  });

  it('adds what is newly ticked and removes what is unticked, leaving the rest alone', () => {
    const now = currentChoice(rows, 'patch');
    const plan = planServiceChanges(now, { allBookings: true, serviceIds: new Set(['cut', 'toner']) });
    expect(plan.add).toEqual([{ scope: 'venue' }, { scope: 'service', serviceId: 'toner' }]);
    expect(plan.remove).toEqual(['r-colour']);
  });

  it('removes the All bookings requirement when it is unticked', () => {
    const plan = planServiceChanges(currentChoice(rows, 'consent'), { allBookings: false, serviceIds: new Set(['cut']) });
    expect(plan).toEqual({ add: [], remove: ['r-all'] });
  });

  it('never removes the form from a service the checklist does not show (inactive or deleted)', () => {
    const now = currentChoice(rows, 'patch');
    const plan = planServiceChanges(now, { allBookings: false, serviceIds: new Set() }, new Set(['cut']));
    expect(plan.remove).toEqual(['r-cut']);
  });

  it('plans nothing when nothing changed', () => {
    const now = currentChoice(rows, 'patch');
    expect(planServiceChanges(now, now)).toEqual({ add: [], remove: [] });
  });

  it('reads a row with no scope (an older server) by its service columns', () => {
    const legacy: RequirementListRow[] = [
      { id: 'r-old-all', compliance_type_id: 'patch', appointment_service_id: null, service_item_id: null },
      { id: 'r-old-cut', compliance_type_id: 'patch', appointment_service_id: 'cut', service_item_id: null },
    ];
    const now = currentChoice(legacy, 'patch');
    expect(now).toMatchObject({ allBookings: true, venueRequirementId: 'r-old-all' });
    expect(now.requirementIdByService.get('cut')).toBe('r-old-cut');
  });
});
