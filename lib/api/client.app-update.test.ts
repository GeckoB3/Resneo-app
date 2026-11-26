/**
 * apiFetch and the server's "update the app" answer (web codebase standards plan P4.9).
 *
 * A write from a build below the server's write minimum answers 426 `APP_UPDATE_REQUIRED` with a
 * sentence in `error`. apiFetch shows that sentence with a button to the store, once however many
 * writes were refused together, and still fails the request so the screen does not think it saved.
 */
import { Alert } from 'react-native';

import { ApiError, apiFetch } from '@/lib/api/client';
import { openStoreListing } from '@/lib/app-update/app-update-runtime';
import {
  APP_UPDATE_REQUIRED_FALLBACK,
  resetAppUpdateRequiredAlert,
} from '@/lib/app-update/update-required-alert';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test', getWebUrl: () => 'https://web.test' }));
jest.mock('@/lib/app-update/app-update-runtime', () => ({
  ...jest.requireActual('@/lib/app-update/app-update-runtime'),
  openStoreListing: jest.fn(() => Promise.resolve()),
}));

const SENTENCE =
  'This version of the ResNeo app is too old to save changes. Please update the app from the App Store or Google Play, then try again.';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

type AlertButton = { text?: string; onPress?: () => void };

describe('apiFetch: 426 APP_UPDATE_REQUIRED', () => {
  const fetchMock = jest.fn();
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (openStoreListing as jest.Mock).mockClear();
    resetAppUpdateRequiredAlert();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows the server's sentence with a store button, and still fails the write", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(426, { error: SENTENCE, code: 'APP_UPDATE_REQUIRED', minimum_version: '1.4.0' }),
    );

    const err = await apiFetch('/api/venue/bookings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Booked' }),
      accessToken: 'token',
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(426);
    expect((err as ApiError).message).toBe(SENTENCE);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('Update the app');
    expect(message).toBe(SENTENCE);
    expect(buttons.map((b) => b.text)).toEqual(['Not now', 'Update']);

    buttons.find((b) => b.text === 'Update')!.onPress!();
    expect(openStoreListing).toHaveBeenCalledTimes(1);
  });

  it('shows one alert for several refused writes, and again once it is closed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(426, { error: SENTENCE, code: 'APP_UPDATE_REQUIRED' }));
    const write = () => apiFetch('/api/venue/notes', { method: 'POST', body: '{}', accessToken: 't' }).catch(() => null);

    await Promise.all([write(), write(), write()]);
    expect(alertSpy).toHaveBeenCalledTimes(1);

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.text === 'Not now')!.onPress!();
    await write();
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to its own sentence when the server sends none', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(426, { code: 'APP_UPDATE_REQUIRED' }));
    await apiFetch('/api/venue/notes', { method: 'POST', body: '{}', accessToken: 't' }).catch(() => null);
    expect(alertSpy.mock.calls[0][1]).toBe(APP_UPDATE_REQUIRED_FALLBACK);
  });

  it('shows nothing for other refusals', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(426, { error: 'Upgrade Required' }))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'Bad', code: 'APP_UPDATE_REQUIRED' }));
    await apiFetch('/api/venue/notes', { method: 'POST', body: '{}', accessToken: 't' }).catch(() => null);
    await apiFetch('/api/venue/notes', { method: 'POST', body: '{}', accessToken: 't' }).catch(() => null);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
