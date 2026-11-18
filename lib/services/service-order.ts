/**
 * The services in their booking-page order, split under their category headings,
 * for the drag-to-reorder sheet (The Beauty Parlour, 2026-11-18). A drag moves a
 * service within its own heading only, as on the web, because the category decides
 * where a heading sits and the service order decides the order inside it.
 */
export type ServiceOrderItem = {
  id: string;
  name: string;
  durationMinutes: number | null;
};

export type ServiceOrderGroup = {
  /** Stable key for the heading: its name, or '' for a flat list. */
  key: string;
  /** The heading text, or null when the venue uses no categories. */
  heading: string | null;
  services: ServiceOrderItem[];
};

/**
 * Bucket an already-sorted list under consecutive headings. The input is sorted by
 * category first, so every heading's services already sit together.
 */
export function groupServicesForOrdering<T extends { id: string; name: string; duration_minutes?: number | null }>(
  sorted: readonly T[],
  headingFor: (service: T) => string | null,
): ServiceOrderGroup[] {
  const groups: ServiceOrderGroup[] = [];
  for (const service of sorted) {
    const heading = headingFor(service);
    const key = heading ?? '';
    const last = groups[groups.length - 1];
    const item: ServiceOrderItem = {
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes ?? null,
    };
    if (last && last.key === key) {
      last.services.push(item);
    } else {
      groups.push({ key, heading, services: [item] });
    }
  }
  return groups;
}

/** Replace one heading's services with their new order, keeping every other heading. */
export function withGroupOrder(
  groups: readonly ServiceOrderGroup[],
  key: string,
  services: readonly ServiceOrderItem[],
): ServiceOrderGroup[] {
  return groups.map((group) => (group.key === key ? { ...group, services: [...services] } : group));
}

/** The full id order the reorder route saves (`sort_order = index`). */
export function serviceOrderIds(groups: readonly ServiceOrderGroup[]): string[] {
  return groups.flatMap((group) => group.services.map((service) => service.id));
}
