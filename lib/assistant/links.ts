/**
 * Where a link inside an Ask ResNeo answer actually goes.
 *
 * Answers link three things and nothing else (`isRenderableHref`): a help
 * centre page, a dashboard page, or a YouTube video. The first two are web
 * paths, so they resolve against the WEB origin — never the API origin, which
 * is the same mistake the More tab's `webDashboardUrl` exists to avoid.
 *
 * A dashboard path is left as a dashboard path on purpose. When the model
 * gives an app client a dashboard link it is saying "this one is a web job"
 * (the prompt tells it to), so opening the web dashboard is the answer, not a
 * guess at the equivalent app screen.
 */
import { getWebUrl } from '@/lib/env';

import { isRenderableHref } from './markdown';

/** Fallback origin, matching `webDashboardUrl` on the More tab. */
const FALLBACK_WEB_ORIGIN = 'https://reserve-ni.vercel.app';

/** Absolute URL for a link we allow, or null for one we do not. */
export function assistantLinkUrl(href: string): string | null {
  const target = href.trim();
  if (!isRenderableHref(target)) return null;
  if (target.startsWith('http')) return target;
  const base = getWebUrl() || FALLBACK_WEB_ORIGIN;
  return `${base}${target}`;
}

/** True for a video link, which is better handed to the YouTube app. */
export function isVideoLink(href: string): boolean {
  return /^https:\/\/(www\.)?(youtu\.be|youtube\.com)\//.test(href.trim());
}
