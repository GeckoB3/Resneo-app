import type { AppointmentCatalogPractitioner } from '@/types/appointment-catalog';

/**
 * On a collective catalogue, the business a person works for, as staff tell look-alike businesses
 * apart (`owning_venue_label`, web 2026-11-05: "Aura Hair Studio (/book/light-3)"). The web's staff
 * New appointment names it under every person; the app's practitioner list named nobody's business,
 * so staff booked, and created clients, at a partner business without knowing (QA 2026-11-08
 * DEVICE-F4). Null on a venue's own catalogue, or when the name already carries the business (two
 * people of one name read "Andrew · Light 16").
 */
export function practitionerBusinessLine(
  practitioner: Pick<
    AppointmentCatalogPractitioner,
    'name' | 'owning_venue_id' | 'owning_venue_name' | 'owning_venue_label'
  >,
): string | null {
  if (!practitioner.owning_venue_id) return null;
  const where = practitioner.owning_venue_label?.trim() || practitioner.owning_venue_name?.trim();
  if (!where || practitioner.name.endsWith(`· ${where}`)) return null;
  return where;
}

/**
 * The people grouped by business, businesses in the order they first appear and people in their
 * own order within each, so a business's team reads together. A list with no businesses (a venue's
 * own catalogue) comes back as it was.
 */
export function groupedByBusiness<T>(rows: readonly T[], businessOf: (row: T) => string | null | undefined): T[] {
  const order: string[] = [];
  const byBusiness = new Map<string, T[]>();
  for (const row of rows) {
    const key = businessOf(row) ?? '';
    if (!byBusiness.has(key)) {
      byBusiness.set(key, []);
      order.push(key);
    }
    byBusiness.get(key)!.push(row);
  }
  return order.flatMap((key) => byBusiness.get(key)!);
}
