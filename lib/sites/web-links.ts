import { getWebUrl } from '@/lib/env';
import { getActingVenueId } from '@/lib/sites/active-site';

/**
 * Links from the app into the web dashboard name the business the app is showing (web roles plan
 * §6.2b, "Deep links": Docs/user-roles-and-multi-site-plan.md). One login can work at several
 * businesses ("sites"), and the browser remembers the one it was last on. A dashboard URL carrying
 * `?site=<venue_id>` is a deep link: the web's middleware switches to that business first, then
 * opens the page without the parameter. So a person who works at two never opens the web on the
 * other one's settings.
 *
 * Pure string work, no React (the hook that reads the loaded venue is `useWebDashboardLink`). Any
 * shape this does not recognise is returned unchanged: a public booking page, the help centre, the
 * marketing site, Stripe, a tracking or file URL, `mailto:` and `tel:` all keep their URL.
 */

/** The query parameter the web's middleware reads (`src/middleware.ts`, `src/lib/sites/site-links.ts`). */
export const SITE_PARAM = 'site';

const SITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A venue id the web will switch to (`isSiteId` on the web): a uuid. Anything else is ignored there. */
export function isSiteId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SITE_ID_RE.test(value);
}

/**
 * Pages a `?site=` deep link opens on (the middleware's `acceptsSiteDeepLink`, less the help
 * centre, which is the same for every business): the dashboard, onboarding and POS receipts.
 */
const DEEP_LINK_ROOTS = ['/dashboard', '/onboarding', '/pos-receipt'] as const;

function isDeepLinkPathname(pathname: string): boolean {
  return DEEP_LINK_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/** `scheme://host[:port]`, with nothing after it. */
const ABSOLUTE_RE = /^(https?:\/\/[^/?#\s]+)(.*)$/i;

function originOf(url: string): string | null {
  const match = ABSOLUTE_RE.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

type LinkParts = { head: string; pathname: string; query: string; hash: string };

/**
 * Split a bare path (`/dashboard?tab=plan#x`) or a full URL on the web origin into its parts.
 * Null for anything else: another origin, a protocol-relative `//host`, a relative path, a scheme
 * such as `mailto:`.
 */
function splitWebLink(urlOrPath: string, webOrigin: string | undefined): LinkParts | null {
  let head = '';
  let rest: string;
  if (urlOrPath.startsWith('/') && !urlOrPath.startsWith('//')) {
    rest = urlOrPath;
  } else {
    const match = ABSOLUTE_RE.exec(urlOrPath);
    if (!match) return null;
    // The web origin is read only for a full URL, so a bare path never depends on it.
    const web = originOf(webOrigin ?? getWebUrl());
    if (!web || match[1].toLowerCase() !== web) return null;
    head = match[1];
    rest = match[2];
    if (!rest.startsWith('/')) return null;
  }
  const hashAt = rest.indexOf('#');
  const beforeHash = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
  const hash = hashAt >= 0 ? rest.slice(hashAt) : '';
  const queryAt = beforeHash.indexOf('?');
  return {
    head,
    pathname: queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash,
    query: queryAt >= 0 ? beforeHash.slice(queryAt + 1) : '',
    hash,
  };
}

/**
 * Whether this opens the web dashboard (or onboarding, or a POS receipt): a bare path under one of
 * them, or a full URL on the web origin (`webOrigin`, by default `getWebUrl()`) under one of them.
 */
export function isWebDashboardLink(urlOrPath: string, webOrigin?: string): boolean {
  if (typeof urlOrPath !== 'string') return false;
  const parts = splitWebLink(urlOrPath, webOrigin);
  return parts !== null && isDeepLinkPathname(parts.pathname);
}

/**
 * `urlOrPath` with `site=<venueId>` added after any query it already has (replacing a `site`
 * already there) and before any `#hash`. Unchanged when there is no venue id (the web then uses
 * the person's home site, which is right for a one-site login), the id is not a uuid, or the link
 * is not a dashboard link on the web origin.
 */
export function withSiteParam(
  urlOrPath: string,
  venueId: string | null | undefined,
  webOrigin?: string,
): string {
  if (typeof urlOrPath !== 'string' || !isSiteId(venueId)) return urlOrPath;
  const parts = splitWebLink(urlOrPath, webOrigin);
  if (!parts || !isDeepLinkPathname(parts.pathname)) return urlOrPath;
  const kept = parts.query
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== SITE_PARAM);
  kept.push(`${SITE_PARAM}=${encodeURIComponent(venueId)}`);
  return `${parts.head}${parts.pathname}?${kept.join('&')}${parts.hash}`;
}

/**
 * The venue a dashboard link names: the venue the app has loaded when it is known, else the site
 * this phone acts on (`getActingVenueId`), else none.
 */
export function linkSiteId(loadedVenueId?: string | null): string | null {
  return isSiteId(loadedVenueId) ? loadedVenueId : getActingVenueId();
}

/** `withSiteParam` for code with no React: names the site this phone acts on. */
export function withActingSite(urlOrPath: string, webOrigin?: string): string {
  return withSiteParam(urlOrPath, getActingVenueId(), webOrigin);
}
