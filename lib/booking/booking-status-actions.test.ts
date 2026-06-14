import { bookingDetailActions, type BookingAction } from '@/lib/booking/booking-status-actions';
import { BOOKING_STATUSES, type BookingStatus } from '@/types/booking-detail';

/**
 * Unit tests for the booking lifecycle action model.
 *
 * `bookingDetailActions(status, isTableReservation)` is the only runtime export
 * (the rest are types). It derives the staff action buttons shown on a booking
 * from the lifecycle state machine:
 *
 *   Pending → Booked → (Confirmed) → Seated/Started → Completed
 *   plus No-Show / Cancelled terminals, and non-destructive reverts/reopen.
 *
 * `isTableReservation` only changes wording (restaurant "Seat/Unseat" vs
 * appointment "Start/Undo Start"), never which transitions are offered.
 */

// Compact representation of an action for ergonomic assertions.
type ActionTuple = {
  label: string;
  target: BookingStatus;
  variant: BookingAction['variant'];
  kind: BookingAction['kind'];
  destructive: boolean;
};

function toTuple(a: BookingAction): ActionTuple {
  return {
    label: a.label,
    target: a.target,
    variant: a.variant,
    kind: a.kind,
    destructive: a.destructive === true,
  };
}

function tuples(status: BookingStatus, isTableReservation: boolean): ActionTuple[] {
  return bookingDetailActions(status, isTableReservation).map(toTuple);
}

/** Just the (target, kind) pairs — useful for transition-graph assertions. */
function transitions(status: BookingStatus, isTableReservation: boolean) {
  return bookingDetailActions(status, isTableReservation).map((a) => ({
    target: a.target,
    kind: a.kind,
  }));
}

// ---------------------------------------------------------------------------
// Status enumeration — guards against the enum drifting from these tests.
// ---------------------------------------------------------------------------

describe('BOOKING_STATUSES enumeration', () => {
  it('contains exactly the seven lifecycle statuses', () => {
    expect([...BOOKING_STATUSES]).toEqual([
      'Pending',
      'Booked',
      'Confirmed',
      'Seated',
      'Completed',
      'No-Show',
      'Cancelled',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Full per-status action matrix — table reservation (restaurant) wording.
// ---------------------------------------------------------------------------

describe('bookingDetailActions — table reservation (isTableReservation = true)', () => {
  it('Pending → Confirm (to Booked) + Cancel', () => {
    expect(tuples('Pending', true)).toEqual([
      { label: 'Confirm', target: 'Booked', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
    ]);
  });

  it('Booked → Seat (to Seated) + No-show + Cancel', () => {
    expect(tuples('Booked', true)).toEqual([
      { label: 'Seat', target: 'Seated', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'No-show',
        target: 'No-Show',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
    ]);
  });

  it('Confirmed → Seat + No-show + Cancel + Undo confirm', () => {
    expect(tuples('Confirmed', true)).toEqual([
      { label: 'Seat', target: 'Seated', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'No-show',
        target: 'No-Show',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      { label: 'Undo confirm', target: 'Booked', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('Seated → Complete + Cancel + Unseat (to Booked)', () => {
    expect(tuples('Seated', true)).toEqual([
      {
        label: 'Complete',
        target: 'Completed',
        variant: 'primary',
        kind: 'primary',
        destructive: false,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      { label: 'Unseat', target: 'Booked', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('Completed → only Reopen (to Seated); no primary, no cancel, no no-show', () => {
    expect(tuples('Completed', true)).toEqual([
      { label: 'Reopen', target: 'Seated', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('No-Show → only Undo No-Show (to Booked); no cancel', () => {
    expect(tuples('No-Show', true)).toEqual([
      {
        label: 'Undo No-Show',
        target: 'Booked',
        variant: 'ghost',
        kind: 'revert',
        destructive: false,
      },
    ]);
  });

  it('Cancelled → no actions (terminal, no reopen path)', () => {
    expect(tuples('Cancelled', true)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Full per-status action matrix — appointment (non-table) wording.
// Only the "Seat"/"Unseat" labels change to "Start"/"Undo Start".
// ---------------------------------------------------------------------------

describe('bookingDetailActions — appointment (isTableReservation = false)', () => {
  it('Pending → Confirm (unchanged) + Cancel', () => {
    expect(tuples('Pending', false)).toEqual([
      { label: 'Confirm', target: 'Booked', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
    ]);
  });

  it('Booked → Start (relabelled from Seat) + No-show + Cancel', () => {
    expect(tuples('Booked', false)).toEqual([
      { label: 'Start', target: 'Seated', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'No-show',
        target: 'No-Show',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
    ]);
  });

  it('Confirmed → Start + No-show + Cancel + Undo confirm', () => {
    expect(tuples('Confirmed', false)).toEqual([
      { label: 'Start', target: 'Seated', variant: 'primary', kind: 'primary', destructive: false },
      {
        label: 'No-show',
        target: 'No-Show',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      { label: 'Undo confirm', target: 'Booked', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('Seated → Complete + Cancel + Undo Start (relabelled from Unseat)', () => {
    expect(tuples('Seated', false)).toEqual([
      {
        label: 'Complete',
        target: 'Completed',
        variant: 'primary',
        kind: 'primary',
        destructive: false,
      },
      {
        label: 'Cancel booking',
        target: 'Cancelled',
        variant: 'danger',
        kind: 'destructive',
        destructive: true,
      },
      { label: 'Undo Start', target: 'Booked', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('Completed → Reopen (wording unaffected by reservation type)', () => {
    expect(tuples('Completed', false)).toEqual([
      { label: 'Reopen', target: 'Seated', variant: 'ghost', kind: 'revert', destructive: false },
    ]);
  });

  it('No-Show → Undo No-Show (wording unaffected by reservation type)', () => {
    expect(tuples('No-Show', false)).toEqual([
      {
        label: 'Undo No-Show',
        target: 'Booked',
        variant: 'ghost',
        kind: 'revert',
        destructive: false,
      },
    ]);
  });

  it('Cancelled → no actions', () => {
    expect(tuples('Cancelled', false)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Primary forward transitions (the "happy path" through the lifecycle).
// ---------------------------------------------------------------------------

describe('primary forward action per status', () => {
  it('advances each active status to the next lifecycle state', () => {
    const primaryTarget = (s: BookingStatus, isTable: boolean) =>
      bookingDetailActions(s, isTable).find((a) => a.kind === 'primary')?.target ?? null;

    // Reservation type must not affect the transition target, only the label.
    for (const isTable of [true, false]) {
      expect(primaryTarget('Pending', isTable)).toBe('Booked');
      expect(primaryTarget('Booked', isTable)).toBe('Seated');
      expect(primaryTarget('Confirmed', isTable)).toBe('Seated');
      expect(primaryTarget('Seated', isTable)).toBe('Completed');
    }
  });

  it('offers no primary forward action from terminal/awaiting-undo states', () => {
    for (const status of ['Completed', 'No-Show', 'Cancelled'] as const) {
      for (const isTable of [true, false]) {
        expect(bookingDetailActions(status, isTable).some((a) => a.kind === 'primary')).toBe(false);
      }
    }
  });

  it('exactly one primary action exists when one is offered', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        const primaries = bookingDetailActions(status, isTable).filter((a) => a.kind === 'primary');
        expect(primaries.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Revert / reopen (non-destructive undo) transitions.
// ---------------------------------------------------------------------------

describe('revert / reopen transitions', () => {
  it('maps each revertable status back to the correct prior state', () => {
    const revertTarget = (s: BookingStatus) =>
      bookingDetailActions(s, true).find((a) => a.kind === 'revert')?.target ?? null;

    expect(revertTarget('Confirmed')).toBe('Booked'); // Undo confirm
    expect(revertTarget('Seated')).toBe('Booked'); // Unseat / Undo Start
    expect(revertTarget('Completed')).toBe('Seated'); // Reopen
    expect(revertTarget('No-Show')).toBe('Booked'); // Undo No-Show
  });

  it('offers no revert from Pending, Booked, or Cancelled', () => {
    for (const status of ['Pending', 'Booked', 'Cancelled'] as const) {
      for (const isTable of [true, false]) {
        expect(bookingDetailActions(status, isTable).some((a) => a.kind === 'revert')).toBe(false);
      }
    }
  });

  it('reverts are always non-destructive ghost buttons', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        for (const action of bookingDetailActions(status, isTable)) {
          if (action.kind === 'revert') {
            expect(action.variant).toBe('ghost');
            expect(action.destructive).toBeUndefined();
          }
        }
      }
    }
  });

  it('Completed is reopenable (not a hard terminal) — Reopen → Seated', () => {
    const completed = bookingDetailActions('Completed', true);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ label: 'Reopen', target: 'Seated', kind: 'revert' });
  });
});

// ---------------------------------------------------------------------------
// No-Show availability.
// ---------------------------------------------------------------------------

describe('No-show action availability', () => {
  it('is offered only from Booked and Confirmed', () => {
    const hasNoShow = (s: BookingStatus, isTable: boolean) =>
      bookingDetailActions(s, isTable).some((a) => a.target === 'No-Show');

    for (const isTable of [true, false]) {
      expect(hasNoShow('Booked', isTable)).toBe(true);
      expect(hasNoShow('Confirmed', isTable)).toBe(true);

      for (const status of ['Pending', 'Seated', 'Completed', 'No-Show', 'Cancelled'] as const) {
        expect(hasNoShow(status, isTable)).toBe(false);
      }
    }
  });

  it('the No-show action is destructive with danger variant', () => {
    const noShow = bookingDetailActions('Booked', true).find((a) => a.target === 'No-Show');
    expect(noShow).toMatchObject({
      label: 'No-show',
      variant: 'danger',
      kind: 'destructive',
      destructive: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Cancel availability + terminal-state handling.
// ---------------------------------------------------------------------------

describe('Cancel action availability', () => {
  it('is offered from every non-terminal active status', () => {
    const hasCancel = (s: BookingStatus, isTable: boolean) =>
      bookingDetailActions(s, isTable).some((a) => a.target === 'Cancelled');

    for (const isTable of [true, false]) {
      for (const status of ['Pending', 'Booked', 'Confirmed', 'Seated'] as const) {
        expect(hasCancel(status, isTable)).toBe(true);
      }
    }
  });

  it('is NOT offered from Completed, No-Show, or Cancelled', () => {
    const hasCancel = (s: BookingStatus, isTable: boolean) =>
      bookingDetailActions(s, isTable).some((a) => a.target === 'Cancelled');

    for (const isTable of [true, false]) {
      for (const status of ['Completed', 'No-Show', 'Cancelled'] as const) {
        expect(hasCancel(status, isTable)).toBe(false);
      }
    }
  });

  it('the Cancel action is destructive with danger variant', () => {
    const cancel = bookingDetailActions('Pending', true).find((a) => a.target === 'Cancelled');
    expect(cancel).toMatchObject({
      label: 'Cancel booking',
      variant: 'danger',
      kind: 'destructive',
      destructive: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Terminal-state handling.
// ---------------------------------------------------------------------------

describe('terminal-state handling', () => {
  it('Cancelled is a hard terminal — no actions at all', () => {
    expect(bookingDetailActions('Cancelled', true)).toEqual([]);
    expect(bookingDetailActions('Cancelled', false)).toEqual([]);
  });

  it('Completed and No-Show offer exactly one (undo) action and nothing else', () => {
    for (const status of ['Completed', 'No-Show'] as const) {
      for (const isTable of [true, false]) {
        const actions = bookingDetailActions(status, isTable);
        expect(actions).toHaveLength(1);
        expect(actions[0].kind).toBe('revert');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants over the whole status space.
// ---------------------------------------------------------------------------

describe('cross-cutting invariants', () => {
  it('a status never targets itself (no no-op transitions)', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        for (const action of bookingDetailActions(status, isTable)) {
          expect(action.target).not.toBe(status);
        }
      }
    }
  });

  it('every action targets a valid BookingStatus', () => {
    const valid = new Set<string>(BOOKING_STATUSES);
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        for (const action of bookingDetailActions(status, isTable)) {
          expect(valid.has(action.target)).toBe(true);
        }
      }
    }
  });

  it('only destructive actions carry the danger variant, and vice versa', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        for (const action of bookingDetailActions(status, isTable)) {
          expect(action.variant === 'danger').toBe(action.kind === 'destructive');
          if (action.kind === 'destructive') {
            expect(action.destructive).toBe(true);
          }
        }
      }
    }
  });

  it('no duplicate target+kind pairs within a single status', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        const seen = new Set<string>();
        for (const t of transitions(status, isTable)) {
          const key = `${t.kind}:${t.target}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it('every action has a non-empty label', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        for (const action of bookingDetailActions(status, isTable)) {
          expect(action.label.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('changing reservation type never changes the set of transition targets', () => {
    for (const status of BOOKING_STATUSES) {
      const tableTargets = transitions(status, true)
        .map((t) => `${t.kind}:${t.target}`)
        .sort();
      const apptTargets = transitions(status, false)
        .map((t) => `${t.kind}:${t.target}`)
        .sort();
      expect(tableTargets).toEqual(apptTargets);
    }
  });

  it('only the Seat/Unseat labels differ between reservation types', () => {
    // Across the whole status space, the only label deltas should be
    // Seat→Start and Unseat→Undo Start.
    const deltas: Array<{ status: BookingStatus; table: string; appt: string }> = [];
    for (const status of BOOKING_STATUSES) {
      const tableLabels = bookingDetailActions(status, true).map((a) => a.label);
      const apptLabels = bookingDetailActions(status, false).map((a) => a.label);
      tableLabels.forEach((label, i) => {
        if (label !== apptLabels[i]) {
          deltas.push({ status, table: label, appt: apptLabels[i] });
        }
      });
    }
    expect(deltas).toEqual([
      { status: 'Booked', table: 'Seat', appt: 'Start' },
      { status: 'Confirmed', table: 'Seat', appt: 'Start' },
      { status: 'Seated', table: 'Unseat', appt: 'Undo Start' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Action ordering — buttons render in this order, so it is load-bearing.
// ---------------------------------------------------------------------------

describe('action ordering', () => {
  it('orders actions: primary, no-show, cancel, revert', () => {
    // Confirmed is the only status that exercises all four slots.
    expect(bookingDetailActions('Confirmed', true).map((a) => a.kind)).toEqual([
      'primary',
      'destructive', // No-show
      'destructive', // Cancel
      'revert',
    ]);
  });

  it('places the revert action last when present', () => {
    for (const status of BOOKING_STATUSES) {
      for (const isTable of [true, false]) {
        const actions = bookingDetailActions(status, isTable);
        const revertIdx = actions.findIndex((a) => a.kind === 'revert');
        if (revertIdx !== -1) {
          expect(revertIdx).toBe(actions.length - 1);
        }
      }
    }
  });
});
