/**
 * Call, text and email links never fail silently (Sentry, 2026-11-15: "Unable to open URL:
 * mailto:…" on an iPhone with no mail app set up).
 */
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import {
  CONTACT_LINK_COPIED,
  CONTACT_LINK_FAILED,
  contactLinkUrl,
  openContactLink,
} from './contact-links';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const notify = () => ({ success: jest.fn(), error: jest.fn() });

describe('contactLinkUrl', () => {
  it('drops spaces from numbers and keeps an email as written', () => {
    expect(contactLinkUrl('call', '+44 7700 900123')).toBe('tel:+447700900123');
    expect(contactLinkUrl('text', '07700 900123')).toBe('sms:07700900123');
    expect(contactLinkUrl('email', ' Jane@Example.com ')).toBe('mailto:Jane@Example.com');
  });
});

describe('openContactLink', () => {
  let open: jest.SpyInstance;
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL');
    (Clipboard.setStringAsync as jest.Mock).mockReset();
  });
  afterEach(() => open.mockRestore());

  it('opens the link and says nothing when the device can', async () => {
    open.mockResolvedValue(true);
    const n = notify();
    await openContactLink('email', 'jane@example.com', n);
    expect(open).toHaveBeenCalledWith('mailto:jane@example.com');
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(n.success).not.toHaveBeenCalled();
    expect(n.error).not.toHaveBeenCalled();
  });

  it('copies the address and says so when no mail app can open it', async () => {
    open.mockRejectedValue(new Error('Unable to open URL: mailto:jane@example.com'));
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true);
    const n = notify();
    await openContactLink('email', 'jane@example.com', n);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('jane@example.com');
    expect(n.success).toHaveBeenCalledWith(CONTACT_LINK_COPIED.email);
  });

  it('copies the number for a call on a device that cannot call', async () => {
    open.mockRejectedValue(new Error('Unable to open URL: tel:+447700900123'));
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true);
    const n = notify();
    await openContactLink('call', '+44 7700 900123', n);
    expect(open).toHaveBeenCalledWith('tel:+447700900123');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('+44 7700 900123');
    expect(n.success).toHaveBeenCalledWith(CONTACT_LINK_COPIED.call);
  });

  it('says it could not when copying fails too, and never throws', async () => {
    open.mockRejectedValue(new Error('Unable to open URL'));
    (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error('no clipboard'));
    const n = notify();
    await expect(openContactLink('text', '07700 900123', n)).resolves.toBeUndefined();
    expect(n.error).toHaveBeenCalledWith(CONTACT_LINK_FAILED.text);
  });

  it('does nothing for an empty value, and works with no toast', async () => {
    const n = notify();
    await openContactLink('email', '  ', n);
    await openContactLink('call', null, n);
    expect(open).not.toHaveBeenCalled();
    open.mockRejectedValue(new Error('Unable to open URL'));
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true);
    await expect(openContactLink('email', 'jane@example.com', null)).resolves.toBeUndefined();
  });
});
