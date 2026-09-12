import {
  APPOINTMENT_WIZARD_PHASES,
  appointmentWizardPhase,
} from '@/lib/booking/appointment-wizard-phase';

describe('appointmentWizardPhase', () => {
  it('folds every choosing step into the first phase', () => {
    for (const step of ['staff_pick', 'service', 'practitioner', 'variant', 'addons', 'chain_options']) {
      expect(appointmentWizardPhase(step)).toBe(0);
    }
  });

  it('puts the dates, times and the visit review in the second', () => {
    for (const step of ['date', 'time', 'multi_service']) {
      expect(appointmentWizardPhase(step)).toBe(1);
    }
  });

  it('puts the guest and the confirmation in the third', () => {
    expect(appointmentWizardPhase('guest')).toBe(2);
    expect(appointmentWizardPhase('confirm')).toBe(2);
  });

  it('holds still while the step list grows', () => {
    // The device case: picking a service with options and add-ons used to take
    // the header from "1 of 5" to "2 of 6" to "5 of 7". The phase does not move
    // until the reader does.
    expect(appointmentWizardPhase('service')).toBe(appointmentWizardPhase('variant'));
    expect(appointmentWizardPhase('service')).toBe(appointmentWizardPhase('addons'));
    expect(APPOINTMENT_WIZARD_PHASES).toHaveLength(3);
  });

  it('reads an unknown step as a question about what is being booked', () => {
    expect(appointmentWizardPhase(null)).toBe(0);
    expect(appointmentWizardPhase(undefined)).toBe(0);
  });
});
