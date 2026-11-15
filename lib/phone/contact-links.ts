/**
 * Call, text and email links that never fail silently.
 *
 * `Linking.openURL` rejects when the device has nothing to handle the link: no mail app set up on an
 * iPhone (Sentry, 2026-11-15: "Unable to open URL: mailto:…" after tapping a client's email on a
 * booking), an iPad or a phone without a SIM for calls and texts. The tap then did nothing and the
 * rejection went unhandled. Here the address or number is copied instead, and the person is told.
 */
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import { useToast } from '@/providers/ToastProvider';

/** The screen's toast, or null outside a ToastProvider: a link must never break a screen. */
function useToastIfAny(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
}

export type ContactLinkKind = 'call' | 'text' | 'email';

const SCHEME: Record<ContactLinkKind, string> = { call: 'tel:', text: 'sms:', email: 'mailto:' };

/** What the person is told when the link cannot open: the value is on the clipboard instead. */
export const CONTACT_LINK_COPIED: Record<ContactLinkKind, string> = {
  call: 'Calls cannot be made from this device. The number is copied.',
  text: 'Texts cannot be sent from this device. The number is copied.',
  email: 'Could not open your mail app. The email address is copied.',
};

/** When even copying fails. */
export const CONTACT_LINK_FAILED: Record<ContactLinkKind, string> = {
  call: 'Could not start a call.',
  text: 'Could not start a text.',
  email: 'Could not open your mail app.',
};

/** The link for a value: spaces are dropped from numbers, an email is kept as written. */
export function contactLinkUrl(kind: ContactLinkKind, value: string): string {
  const v = kind === 'email' ? value.trim() : value.replace(/\s+/g, '');
  return `${SCHEME[kind]}${v}`;
}

type Notify = { success: (m: string) => void; error: (m: string) => void } | null;

/** Open the link; when the device cannot, copy the value and say so. Never throws. */
export async function openContactLink(kind: ContactLinkKind, value: string | null | undefined, notify: Notify): Promise<void> {
  const v = (value ?? '').trim();
  if (!v) return;
  try {
    await Linking.openURL(contactLinkUrl(kind, v));
  } catch {
    try {
      await Clipboard.setStringAsync(v);
      notify?.success(CONTACT_LINK_COPIED[kind]);
    } catch {
      notify?.error(CONTACT_LINK_FAILED[kind]);
    }
  }
}

/** The same, bound to the screen's toast: `const contact = useContactLinks(); contact.email(address)`. */
export function useContactLinks(): Record<ContactLinkKind, (value: string | null | undefined) => void> {
  const toast = useToastIfAny();
  const open = useCallback(
    (kind: ContactLinkKind, value: string | null | undefined) => void openContactLink(kind, value, toast),
    [toast],
  );
  return useMemo(
    () => ({
      call: (value) => open('call', value),
      text: (value) => open('text', value),
      email: (value) => open('email', value),
    }),
    [open],
  );
}
