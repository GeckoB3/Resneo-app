/**
 * Whether a signed-in user is a platform superuser, from the session's
 * `app_metadata` (the web's `platform-auth.ts`: `platform_role === 'superuser'`,
 * set when a superuser is provisioned). The web additionally checks an email
 * allowlist held in server env, which the app cannot see; the role key alone
 * is enough to OFFER the platform surface, and the web's `/super` is what
 * decides whether the door opens.
 *
 * The app has no platform-admin screens: the superuser surface is the web's
 * `/super`, opened in the browser from the account chooser.
 */

export const PLATFORM_ROLE_KEY = 'platform_role';
export const PLATFORM_ROLE_VALUE = 'superuser';

export function isPlatformSuperuserMetadata(
  appMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return !!appMetadata && appMetadata[PLATFORM_ROLE_KEY] === PLATFORM_ROLE_VALUE;
}
