import type { ServiceCategoryRef } from '@/lib/booking/service-categories';
import type { ManagedService } from '@/types/services-manage';

/**
 * The service rows the follow-on set-up screens work with, from the services list the Services
 * screen already holds (web `src/components/dashboard/follow-ons/follow-on-services.ts`).
 */
export interface FollowOnServiceOption {
  id: string;
  name: string;
  /** The service's heading, or null when it has none. */
  category: string | null;
  duration_minutes: number | null;
  price_pence: number | null;
  /** The lowest active option price when the service has options; it then reads "From". */
  from_price_pence: number | null;
  is_active: boolean;
  /** False for "staff bookings only" services, which clients never see online. */
  is_bookable_online: boolean;
  /**
   * A member's copy of a service on its collective page. It asks the host's questions only (RN008),
   * so a member's own group cannot be asked after it.
   */
  on_collective_page: boolean;
}

/** Inactive services are kept: a group may still name one. */
export function followOnServiceOptions(
  services: readonly ManagedService[],
  categories: readonly ServiceCategoryRef[] = [],
): FollowOnServiceOption[] {
  const headingName = new Map(categories.map((c) => [c.id, c.name] as const));
  return services.map((s) => {
    const optionPrices = (s.variants ?? [])
      // The services route sends `is_active` on each option although the catalogue type omits it.
      .filter((v) => (v as { is_active?: boolean | null }).is_active !== false && typeof v.price_pence === 'number')
      .map((v) => v.price_pence as number);
    return {
      id: s.id,
      name: s.name,
      category: (s.category_id && headingName.get(s.category_id)) || null,
      duration_minutes: s.duration_minutes ?? null,
      price_pence: s.price_pence ?? null,
      from_price_pence: optionPrices.length > 0 ? Math.min(...optionPrices) : null,
      is_active: s.is_active !== false,
      is_bookable_online: s.is_bookable_online !== false,
      on_collective_page: s.collective?.role === 'replica',
    };
  });
}

export const OTHER_SERVICES_HEADING = 'Other services';

/** Services grouped under their headings, headings and names in alphabetical order (web parity). */
export interface FollowOnServiceHeading {
  category: string;
  services: FollowOnServiceOption[];
}

export function servicesByCategory(services: readonly FollowOnServiceOption[]): FollowOnServiceHeading[] {
  const map = new Map<string, FollowOnServiceOption[]>();
  for (const s of services) {
    const key = s.category ?? OTHER_SERVICES_HEADING;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) =>
      a === OTHER_SERVICES_HEADING ? 1 : b === OTHER_SERVICES_HEADING ? -1 : a.localeCompare(b),
    )
    .map(([category, list]) => ({ category, services: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}
