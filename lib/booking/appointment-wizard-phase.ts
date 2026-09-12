/**
 * The appointment wizard's progress, in three phases that do not move.
 *
 * The wizard's step list is derived from what has been chosen — a service with
 * options adds an Option step, one with add-ons adds Add-ons, a second service
 * adds the extras walk and the visit review — so the total is unknown until the
 * last choice is made. Counting the steps meant counting a moving target: on a
 * device the header read "Step 1 of 5", then "Step 2 of 6", then "Step 5 of 7"
 * (2026-09-12). A progress indicator whose denominator grows under the reader
 * tells them less than no indicator at all.
 *
 * Web hit this first and answered it the same way: `appointmentProgressPhase`
 * (`src/components/booking/appointment-public-ui.tsx`) folds every step of its
 * own flow into Choose → Schedule → Confirm. Those three exist in every
 * booking, whatever is picked along the way, so the bar fills and never
 * rewrites its own arithmetic. Each step already carries its own heading
 * ("Choose a service", "Pick a time"), so the phase is what the indicator is
 * left to say.
 */

export const APPOINTMENT_WIZARD_PHASES = ['Choose', 'Schedule', 'Confirm'] as const;

/** Steps that settle WHAT is being booked. */
const CHOOSE = new Set(['staff_pick', 'service', 'practitioner', 'variant', 'addons', 'chain_options']);
/** Steps that settle WHEN. `multi_service` reviews the visit's times. */
const SCHEDULE = new Set(['date', 'time', 'multi_service']);

/**
 * 0, 1 or 2 for the phase bar. An unknown step reads as Choose: every flow
 * starts there, and a new step is far likelier to be another question about
 * what is being booked than a fourth phase nobody has drawn.
 */
export function appointmentWizardPhase(step: string | null | undefined): number {
  if (step && SCHEDULE.has(step)) return 1;
  if (step && !CHOOSE.has(step)) return 2;
  return 0;
}
