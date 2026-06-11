/**
 * Client-side URL validation helpers for venue profile.
 * Mirrors isValidWebsiteUrlInput + normalizeWebsiteUrlForStorage from the web reference.
 */

/**
 * Returns true if the user-entered URL string is valid enough to submit.
 * Allows bare domains without a scheme (e.g. "example.com").
 * Empty string is considered valid (optional field).
 */
export function isValidWebsiteUrlInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    // Try with scheme first
    new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalises a user-entered URL to a stored https:// URL.
 * Returns null if the input is invalid or empty.
 */
export function normalizeWebsiteUrlForStorage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    return url.toString();
  } catch {
    return null;
  }
}
