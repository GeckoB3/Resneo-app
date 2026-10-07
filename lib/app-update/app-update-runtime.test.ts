import { fetchVersionPolicy, storeUrls } from '@/lib/app-update/app-update-runtime';

jest.mock('@/lib/env', () => ({ getWebUrl: () => 'https://www.resneo.com' }));

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token <');
      return body;
    },
  } as unknown as Response;
}

describe('fetchVersionPolicy', () => {
  it('reads the file from the web origin', async () => {
    const fetchImpl = jest.fn(async () => response(200, { ios: { latest: '1.2.0' } }));
    await expect(fetchVersionPolicy(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      ios: { latest: '1.2.0', minimum: null, message: null },
      android: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.resneo.com/app-version.json',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('is null for a missing file, an HTML error page, or no network', async () => {
    await expect(
      fetchVersionPolicy((async () => response(404, {})) as unknown as typeof fetch),
    ).resolves.toBeNull();
    await expect(
      fetchVersionPolicy((async () => response(200, '<html>')) as unknown as typeof fetch),
    ).resolves.toBeNull();
    await expect(
      fetchVersionPolicy((async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch),
    ).resolves.toBeNull();
  });
});

describe('storeUrls', () => {
  it('points at the App Store app, then the web listing', () => {
    expect(storeUrls('ios')).toEqual({
      app: 'itms-apps://apps.apple.com/app/id6780271109',
      web: 'https://apps.apple.com/app/id6780271109',
    });
  });

  it('points at Google Play', () => {
    expect(storeUrls('android').app).toBe('market://details?id=com.resneo.app');
  });
});
