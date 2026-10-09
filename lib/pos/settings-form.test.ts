/**
 * One settings section's draft (web `useSectionForm`): it sends only the keys it changed, keeps
 * the edits through a stale save, and shows the server's field errors.
 */
import { act, renderHook } from '@testing-library/react-native';

import {
  changedKeys,
  fieldErrorFor,
  formatMoney,
  penceToText,
  pickKeys,
  textToPence,
  useSectionForm,
} from '@/lib/pos/settings-form';
import type { SaveResult } from '@/lib/queries/useCheckoutSettings';
import type { PosCheckoutSettings } from '@/types/pos-settings';

const settings = {
  receipt_prefix: 'R-',
  receipt_footer: null,
  receipt_auto_send: 'ask',
  tipping_enabled: true,
  version: 3,
} as unknown as PosCheckoutSettings;

const KEYS = ['receipt_prefix', 'receipt_footer', 'receipt_auto_send'] as const;

describe('pure helpers', () => {
  it('picks keys and works out only what changed', () => {
    const source = pickKeys(settings, KEYS);
    expect(source).toEqual({ receipt_prefix: 'R-', receipt_footer: null, receipt_auto_send: 'ask' });
    expect(changedKeys({ receipt_prefix: 'R-', receipt_footer: 'Thanks' }, source, KEYS)).toEqual({ receipt_footer: 'Thanks' });
  });

  it('reads money text both ways', () => {
    expect(penceToText(1250)).toBe('12.50');
    expect(penceToText(null)).toBe('');
    expect(textToPence('£12.5')).toBe(1250);
    expect(textToPence('12.345')).toBeNull();
    expect(formatMoney(500, 'GBP')).toBe('£5.00');
  });

  it('finds a field error under a path', () => {
    const fields = [{ path: 'business_address.postcode', message: 'Postcode can be up to 12 characters.' }];
    expect(fieldErrorFor(fields, 'business_address')).toBe('Postcode can be up to 12 characters.');
    expect(fieldErrorFor(fields, 'business_address.postcode')).toBe('Postcode can be up to 12 characters.');
    expect(fieldErrorFor(fields, 'business_address.town')).toBeNull();
  });
});

describe('useSectionForm', () => {
  it('saves only the changed keys and clears the draft', async () => {
    const save = jest.fn(async (): Promise<SaveResult> => ({ ok: true }));
    const { result } = await renderHook(() => useSectionForm(settings, KEYS, save));
    expect(result.current.dirty).toBe(false);
    await act(async () => result.current.set('receipt_footer', 'Thank you'));
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(save).toHaveBeenCalledWith({ receipt_footer: 'Thank you' });
    expect(result.current.dirty).toBe(false);
  });

  it('keeps the edits through a stale save and says so', async () => {
    const save = jest.fn(
      async (): Promise<SaveResult> => ({ ok: false, stale: true, message: 'Someone else changed these settings.', fields: [] }),
    );
    const { result } = await renderHook(() => useSectionForm(settings, KEYS, save));
    await act(async () => result.current.set('receipt_prefix', 'S-'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBe('Someone else changed these settings.');
    expect(result.current.value.receipt_prefix).toBe('S-');
    expect(result.current.dirty).toBe(true);
  });

  it('shows the server field errors and clears one when its field changes', async () => {
    const save = jest.fn(
      async (): Promise<SaveResult> => ({
        ok: false,
        stale: false,
        message: 'Some details need checking.',
        fields: [{ path: 'receipt_prefix', message: 'The receipt number prefix can be up to 8 characters.' }],
      }),
    );
    const { result } = await renderHook(() => useSectionForm(settings, KEYS, save));
    await act(async () => result.current.set('receipt_prefix', 'TOOLONGPREFIX'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.fieldError('receipt_prefix')).toBe('The receipt number prefix can be up to 8 characters.');
    await act(async () => result.current.set('receipt_prefix', 'OK'));
    expect(result.current.fieldError('receipt_prefix')).toBeNull();
  });
});
