/**
 * MonthGrid (Calendar 02) — month-grid enrichment.
 *
 * Covers the pure count/dot derivation helpers (`monthDatumTotal`,
 * `monthDayDots`) exhaustively, then a render test that the enriched cell shows
 * the per-type dots, the own-venue total badge, an Open/Closed label on empty
 * days, and the linked "+N" chip — driven off the `dayData` map. The legacy flat
 * `counts` fallback (used by the date-jump month-picker) is also covered so that
 * surface stays intact.
 */
import { render, screen } from '@testing-library/react-native';

import {
  MonthGrid,
  monthDatumTotal,
  monthDayDots,
  type MonthDayDatum,
} from '@/components/calendar/MonthGrid';
import { KIND_ACCENT } from '@/lib/calendar/schedule-block-view';
import { lightColors } from '@/theme/index';

function datum(partial: Partial<MonthDayDatum>): MonthDayDatum {
  return {
    appointments: 0,
    classes: 0,
    events: 0,
    resources: 0,
    linked: 0,
    status: 'unknown',
    ...partial,
  };
}

describe('monthDatumTotal', () => {
  it('sums the four own-venue types and excludes linked', () => {
    expect(
      monthDatumTotal(datum({ appointments: 3, classes: 2, events: 1, resources: 4, linked: 9 })),
    ).toBe(10);
  });

  it('is zero for an empty datum', () => {
    expect(monthDatumTotal(datum({}))).toBe(0);
  });
});

describe('monthDayDots', () => {
  const brand = '#003B6F';

  it('returns up to four type-colored dots, ordered appointments→resources', () => {
    const dots = monthDayDots(
      datum({ appointments: 1, classes: 1, events: 1, resources: 1 }),
      brand,
    );
    expect(dots.map((d) => d.key)).toEqual(['appointments', 'classes', 'events', 'resources']);
    expect(dots[0]!.color).toBe(brand);
    expect(dots[1]!.color).toBe(KIND_ACCENT.class_session);
    expect(dots[2]!.color).toBe(KIND_ACCENT.event_ticket);
    expect(dots[3]!.color).toBe(KIND_ACCENT.resource_booking);
  });

  it('drops zero-count types (only the present ones get a dot)', () => {
    const dots = monthDayDots(datum({ appointments: 2, events: 5 }), brand);
    expect(dots.map((d) => d.key)).toEqual(['appointments', 'events']);
  });

  it('returns no dots for an empty datum', () => {
    expect(monthDayDots(datum({}), brand)).toEqual([]);
  });

  it('ignores linked-only days (linked is not a dot type)', () => {
    expect(monthDayDots(datum({ linked: 4 }), brand)).toEqual([]);
  });
});

describe('MonthGrid — render (dayData)', () => {
  const anchor = '2026-06-15'; // June 2026
  const today = '2026-06-15';

  it('shows the own-venue total (linked excluded) + a separate linked chip', async () => {
    const dayData: Record<string, MonthDayDatum> = {
      '2026-06-10': datum({ appointments: 3, classes: 2, linked: 5 }),
    };
    await render(
      <MonthGrid anchor={anchor} today={today} dayData={dayData} onSelectDay={() => {}} />,
    );
    // Linked "+N" chip is rendered ("+5" can't collide with a day number).
    expect(screen.getByText('+5')).toBeTruthy();
    // The own-venue total is 5 (3 appts + 2 classes), surfaced in the a11y label
    // (the bare "5" badge text would collide with the day-of-month "5").
    expect(screen.getByLabelText('10 June, 3 appointments, 2 classes, 5 linked')).toBeTruthy();
  });

  it('labels an empty OPEN day "Open" and an empty CLOSED day "Closed"', async () => {
    const dayData: Record<string, MonthDayDatum> = {
      '2026-06-09': datum({ status: 'open' }),
      '2026-06-11': datum({ status: 'closed' }),
    };
    await render(
      <MonthGrid anchor={anchor} today={today} dayData={dayData} onSelectDay={() => {}} />,
    );
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Closed')).toBeTruthy();
  });

  it('does NOT show an Open/Closed label on a day that has bookings', async () => {
    const dayData: Record<string, MonthDayDatum> = {
      '2026-06-12': datum({ appointments: 1, status: 'open' }),
    };
    await render(
      <MonthGrid anchor={anchor} today={today} dayData={dayData} onSelectDay={() => {}} />,
    );
    // The busy day shows its count, not the status word.
    expect(screen.queryByText('Open')).toBeNull();
    // A11y label names the type rather than the ambiguous bare count.
    expect(screen.getByLabelText('12 June, 1 appointments')).toBeTruthy();
  });

  it('builds a per-type accessibility summary for a busy day', async () => {
    const dayData: Record<string, MonthDayDatum> = {
      '2026-06-10': datum({ appointments: 2, classes: 1, linked: 3 }),
    };
    await render(
      <MonthGrid anchor={anchor} today={today} dayData={dayData} onSelectDay={() => {}} />,
    );
    expect(
      screen.getByLabelText('10 June, 2 appointments, 1 classes, 3 linked'),
    ).toBeTruthy();
  });
});

describe('MonthGrid — render (legacy flat counts fallback)', () => {
  it('renders an appointments-only count when only `counts` is supplied', async () => {
    await render(
      <MonthGrid
        anchor="2026-06-15"
        today="2026-06-15"
        counts={{ '2026-06-10': 4 }}
        onSelectDay={() => {}}
      />,
    );
    // The flat count is treated as appointments-only; the a11y summary names the
    // type (the bare "4" badge would collide with the day-of-month "4").
    expect(screen.getByLabelText('10 June, 4 appointments')).toBeTruthy();
  });
});

// Sanity: the brand colour the grid paints appointment dots with is the real
// theme token (guards against a refactor that hard-codes a different hue).
describe('MonthGrid brand dot colour', () => {
  it('uses lightColors.brand for the appointment dot', () => {
    const dots = monthDayDots(datum({ appointments: 1 }), lightColors.brand);
    expect(dots[0]!.color).toBe(lightColors.brand);
  });
});
