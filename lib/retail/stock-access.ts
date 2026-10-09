import type { PosBootstrap } from '@/types/pos';

/**
 * A capability from the POS bootstrap's map, by the web's key (`src/lib/pos/capabilities.ts`). The
 * map carries every key the web knows, including ones the app's `PosCapability` type does not
 * name yet (`import_products`); a key the server leaves out reads as not allowed, as `canPos` does.
 */
export function canRetail(bootstrap: Pick<PosBootstrap, 'capabilities'> | null | undefined, key: string): boolean {
  return bootstrap?.capabilities?.[key] === true;
}

/** The venue's admins (the bootstrap's `role`), for the first-product Track stock prompt. */
export function isPosAdmin(bootstrap: Pick<PosBootstrap, 'role'> | null | undefined): boolean {
  return bootstrap?.role === 'admin';
}
